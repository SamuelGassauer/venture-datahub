import Anthropic from "@anthropic-ai/sdk";
import driver from "@/lib/neo4j";

// ---------------------------------------------------------------------------
// Neo4j schema description for the LLM
// ---------------------------------------------------------------------------

const GRAPH_SCHEMA = `
## Neo4j Graph Schema

### Node Labels & Properties

**Company**
- name (string), normalizedName (string, unique), uuid (string, unique)
- country (string) — headquarters country
- sector (string[]) — e.g. ["Fintech", "SaaS"]
- subsector (string), description (string), website (string)
- foundedYear (integer), employeeRange (string)
- totalFundingUsd (float) — sum of all funding rounds
- status (string) — "active" by default

**FundingRound**
- roundKey (string, unique) — format: "{companyNormalizedName}::{stageKey}"
- uuid (string, unique)
- amountUsd (float) — funding amount in USD
- stage (string) — e.g. "Seed", "Pre-Seed", "Series A", "Series B", "Series C", "Growth", "Debt", "Grant"
- confidence (float) — extraction confidence 0-1
- date (datetime), announcedDate (datetime)

**InvestorOrg**
- name (string), normalizedName (string, unique), uuid (string, unique)
- country (string), hqCity (string), hqCountry (string)
- description (string), website (string), linkedinUrl (string)
- foundedYear (integer), aum (float) — assets under management in millions USD
- geoFocus (string[]) — e.g. ["Europe", "DACH"]

**Article**
- url (string, unique), uuid (string, unique)
- title (string), author (string)
- publishedAt (string) — ISO 8601 format, e.g. "2026-03-01T12:00:00.000Z"
  IMPORTANT: publishedAt is stored as a STRING, not a datetime. Use string comparison for date filtering (works lexicographically for ISO dates).

**Location**
- name (string, unique) — country name
- type (string) — always "country"

**Fund**
- fundKey (string, unique), uuid (string, unique)
- name (string), sizeUsd (float), type (string), vintage (string), status (string)

**Valuation**
- valuationKey (string, unique), uuid (string, unique)
- valueUsd (float), metricType (string) — e.g. "revenue", "valuation", "arr"
- unit (string), period (string), confidence (float)

### Relationships

- (Company)-[:RAISED]->(FundingRound)
- (InvestorOrg)-[:PARTICIPATED_IN {role: "lead"|"participant"|null}]->(FundingRound)
- (FundingRound)-[:SOURCED_FROM {confidence: float}]->(Article)
- (Company)-[:HQ_IN]->(Location)
- (InvestorOrg)-[:HQ_IN]->(Location)
- (Company)-[:HAS_METRIC]->(Valuation)
- (Valuation)-[:SOURCED_FROM]->(Article)
- (InvestorOrg)-[:MANAGES]->(Fund)
- (Fund)-[:SOURCED_FROM]->(Article)

### Important Notes
- publishedAt on Article is a STRING (ISO 8601). For date filtering use string comparison: \`a.publishedAt >= "2026-03-01T00:00:00.000Z"\`
- To get "last 7 days" data, compare against a parameter: \`a.publishedAt >= $since\`
- European countries include: Germany, France, United Kingdom, UK, Netherlands, Sweden, Switzerland, Spain, Italy, Ireland, Finland, Denmark, Norway, Belgium, Austria, Portugal, Poland, Czech Republic, Estonia, Lithuania, Latvia, Romania, Hungary, Luxembourg, Croatia, Bulgaria, Greece, Slovakia, Slovenia, Iceland
- Amounts are stored in USD. The frontend converts to EUR (multiply by ~0.92).
- FundingRound.roundKey deduplicates: one round per company per stage.
`;

// ---------------------------------------------------------------------------
// Singleton Anthropic client
// ---------------------------------------------------------------------------

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

// ---------------------------------------------------------------------------
// Step 1: Generate Cypher queries from natural language
// ---------------------------------------------------------------------------

export async function generateCypherQueries(
  question: string,
  context?: { today: string }
): Promise<{ queries: { label: string; cypher: string; params: Record<string, unknown> }[]; reasoning: string }> {
  const today = context?.today ?? new Date().toISOString().substring(0, 10);

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: `Du bist ein Neo4j Cypher-Experte. Deine Aufgabe: Generiere 2-4 READ-ONLY Cypher-Queries, die die Frage des Users beantworten.

${GRAPH_SCHEMA}

Heute ist ${today}.

REGELN:
- NUR READ-ONLY Queries (MATCH, RETURN, WITH, ORDER BY, LIMIT). NIEMALS CREATE, SET, DELETE, MERGE, DROP.
- Nutze Parameter ($since, $country, etc.) statt Inline-Werte wo sinnvoll.
- publishedAt ist ein STRING — verwende String-Vergleich fuer Datumsfilter.
- Gib die Queries als JSON zurueck.
- Jede Query braucht ein "label" (kurze Beschreibung), "cypher" (die Query), und "params" (Parameter-Objekt).
- Begrenze Ergebnisse mit LIMIT (max 20 pro Query).
- Sortiere nach Relevanz (z.B. amountUsd DESC fuer groesste Deals).

Antworte NUR mit einem JSON-Objekt in diesem Format:
{
  "reasoning": "Kurze Erklaerung deiner Query-Strategie",
  "queries": [
    {"label": "Top Deals", "cypher": "MATCH ...", "params": {"since": "..."}}
  ]
}`,
    messages: [{ role: "user", content: question }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
  const parsed = JSON.parse(jsonMatch[1]!.trim());

  return {
    queries: parsed.queries,
    reasoning: parsed.reasoning,
  };
}

// ---------------------------------------------------------------------------
// Step 2: Execute Cypher queries safely
// ---------------------------------------------------------------------------

const FORBIDDEN_KEYWORDS = /\b(CREATE|DELETE|DETACH|SET|MERGE|DROP|REMOVE|CALL\s+\{)\b/i;

export async function executeCypherQueries(
  queries: { label: string; cypher: string; params: Record<string, unknown> }[]
): Promise<{ label: string; data: Record<string, unknown>[]; error?: string }[]> {
  const db = driver();
  const results: { label: string; data: Record<string, unknown>[]; error?: string }[] = [];

  for (const q of queries) {
    // Safety check: reject write queries
    if (FORBIDDEN_KEYWORDS.test(q.cypher)) {
      results.push({ label: q.label, data: [], error: "Query rejected: contains write operations" });
      continue;
    }

    const session = db.session({ defaultAccessMode: "READ" });
    try {
      const result = await session.run(q.cypher, q.params || {});
      const data = result.records.map((record) => {
        const obj: Record<string, unknown> = {};
        for (const key of record.keys) {
          const val = record.get(key as string);
          // Convert Neo4j integers to JS numbers
          if (val && typeof val === "object" && "toNumber" in val) {
            obj[key as string] = (val as { toNumber(): number }).toNumber();
          } else {
            obj[key as string] = val;
          }
        }
        return obj;
      });
      results.push({ label: q.label, data });
    } catch (error) {
      results.push({
        label: q.label,
        data: [],
        error: error instanceof Error ? error.message : "Query execution failed",
      });
    } finally {
      await session.close();
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Full GraphRAG pipeline
// ---------------------------------------------------------------------------

export async function graphRAGQuery(question: string): Promise<{
  reasoning: string;
  queries: { label: string; cypher: string; params: Record<string, unknown> }[];
  results: { label: string; data: Record<string, unknown>[]; error?: string }[];
  usage: { inputTokens: number; outputTokens: number };
}> {
  const today = new Date().toISOString().substring(0, 10);

  const { queries, reasoning } = await generateCypherQueries(question, { today });
  const results = await executeCypherQueries(queries);

  // Sum up token usage from the Cypher generation step
  // (we don't have exact tokens here since we extracted from the response,
  //  but we track it in the API route level)

  return { reasoning, queries, results, usage: { inputTokens: 0, outputTokens: 0 } };
}
