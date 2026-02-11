import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./db";
import driver from "./neo4j";
import { normalizeInvestor } from "./graph-sync";
import {
  stripHtml,
  scrapeWebsite,
  scrapeHtml,
  getDomain,
  validateUrl,
  verifyWebsiteWithLLM,
  isValidWebsiteUrl,
  searchWeb,
  searchLogo,
  findBestLogo,
  type EnrichProgress,
} from "./company-enricher";

export type { EnrichProgress };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ArticleRow = { url: string; content: string | null; title: string };

type InvestorFields = {
  type?: string | null;
  stageFocus?: string[] | null;
  sectorFocus?: string[] | null;
  geoFocus?: string[] | null;
  checkSizeMinUsd?: number | null;
  checkSizeMaxUsd?: number | null;
  aum?: number | null;
  foundedYear?: number | null;
  website?: string | null;
  linkedinUrl?: string | null;
};

type LLMResult = InvestorFields & {
  fieldConfidence: Record<string, number>;
};

// ---------------------------------------------------------------------------
// Anthropic client (singleton)
// ---------------------------------------------------------------------------

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

// ---------------------------------------------------------------------------
// Stage 1: Load articles (only for deal context, not primary data source)
// ---------------------------------------------------------------------------

async function loadArticles(normalizedName: string): Promise<ArticleRow[]> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(
      `MATCH (inv:InvestorOrg {normalizedName: $norm})-[:PARTICIPATED_IN]->(fr:FundingRound)-[:SOURCED_FROM]->(a:Article)
       RETURN DISTINCT a.url AS url, a.title AS title`,
      { norm: normalizedName }
    );

    const urls = result.records.map((r) => ({
      url: r.get("url") as string,
      title: r.get("title") as string,
    }));

    if (urls.length === 0) return [];

    const articles = await prisma.article.findMany({
      where: { url: { in: urls.map((u) => u.url) } },
      select: { url: true, content: true, title: true },
    });

    return articles.map((a) => ({
      url: a.url,
      title: a.title,
      content: a.content,
    }));
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Stage 2: Investor website discovery via Brave Search + LLM verification
// ---------------------------------------------------------------------------

type DiscoveryLog = { url: string; status: "match" | "rejected" | "unreachable" | "filtered"; reason?: string };

async function discoverInvestorWebsite(
  investorName: string,
  onProgress?: (msg: string, detail?: string) => void
): Promise<{ website: string | null; linkedinUrl: string | null; websiteHtml: string | null; log: DiscoveryLog[] }> {
  let linkedinUrl: string | null = null;
  const allRejectedDomains = new Set<string>();
  const log: DiscoveryLog[] = [];

  // Search queries — try multiple phrasings for best results
  const queries = [
    `"${investorName}" venture capital official website`,
    `"${investorName}" investor fund website`,
  ];

  for (const query of queries) {
    onProgress?.(`Searching: ${query.slice(0, 50)}...`, `Brave Search query: "${query}"`);
    const results = await searchWeb(query, 8);

    if (results.length === 0) {
      onProgress?.("No search results", `Query "${query}" returned 0 results`);
      continue;
    }

    onProgress?.(
      `${results.length} search results`,
      `Results: ${results.map((r) => getDomain(r.url)).join(", ")}`
    );

    // Extract LinkedIn URL from search results
    if (!linkedinUrl) {
      const linkedinResult = results.find((r) =>
        r.url.includes("linkedin.com/company/")
      );
      if (linkedinResult) {
        linkedinUrl = linkedinResult.url;
        onProgress?.(`LinkedIn found`, `LinkedIn: ${linkedinResult.url}`);
      }
    }

    // Filter to valid website candidates (no social media, no news sites, not already rejected)
    const candidates = results
      .map((r) => r.url)
      .filter((url) => {
        if (!isValidWebsiteUrl(url)) {
          log.push({ url, status: "filtered", reason: "Invalid/social media URL" });
          return false;
        }
        if (allRejectedDomains.has(getDomain(url))) {
          log.push({ url, status: "filtered", reason: "Already rejected" });
          return false;
        }
        return true;
      });

    if (candidates.length === 0) continue;

    // Fetch & verify each candidate
    for (const url of candidates) {
      onProgress?.(`Checking ${getDomain(url)}...`);
      const result = await validateUrl(url);

      if (!result.ok || !result.html) {
        log.push({ url, status: "unreachable", reason: "URL unreachable or empty" });
        allRejectedDomains.add(getDomain(url));
        continue;
      }

      // LLM verifies: is this actually the investor's own website?
      const verification = await verifyWebsiteWithLLM(
        investorName,
        "investor",
        url,
        result.html,
        `"${investorName}" is an investment firm / VC / fund / angel investor. This must be their OWN website, not a portfolio company or news article.`
      );

      if (verification.match) {
        log.push({ url, status: "match", reason: "LLM verified as investor website" });
        onProgress?.(`${getDomain(url)} verified`, `LLM confirmed: ${url} belongs to "${investorName}"`);
        return { website: url, linkedinUrl, websiteHtml: result.html, log };
      }

      log.push({ url, status: "rejected", reason: verification.reason });
      onProgress?.(
        `${getDomain(url)} rejected`,
        `Rejected ${getDomain(url)}: ${verification.reason}`
      );
      allRejectedDomains.add(getDomain(url));
    }
  }

  // Also search specifically for LinkedIn if not found yet
  if (!linkedinUrl) {
    const linkedinResults = await searchWeb(
      `"${investorName}" investor linkedin`,
      3
    );
    const match = linkedinResults.find((r) =>
      r.url.includes("linkedin.com/company/")
    );
    if (match) {
      linkedinUrl = match.url;
      onProgress?.("LinkedIn found via search", `LinkedIn: ${match.url}`);
    }
  }

  return { website: null, linkedinUrl, websiteHtml: null, log };
}

// ---------------------------------------------------------------------------
// Stage 3: Extract data from investor's own website (PRIMARY source)
// ---------------------------------------------------------------------------

const WEBSITE_EXTRACT_PROMPT = `You extract structured data about an investment firm from its own website content.

This is the investor's OWN website. All information here is about the investor itself.

Rules:
- For type use one of: "vc", "pe", "cvc", "angel_group", "family_office", "sovereign_wealth", "government", "accelerator", "incubator", "bank", "hedge_fund", "unknown"
- For stageFocus, extract stages like ["Pre-Seed", "Seed", "Series A", "Series B", "Growth"]
- For sectorFocus, extract industries like ["Fintech", "SaaS", "HealthTech", "DeepTech"]
- For geoFocus, extract regions like ["DACH", "Europe", "Nordics", "Global"]
- For checkSizeMinUsd / checkSizeMaxUsd, extract in USD (raw numbers)
- For aum, extract in USD (raw number)
- For foundedYear, the year the firm was established
- For linkedinUrl, the full LinkedIn company URL
- Confidence 0.0-1.0 per field. If unknown, set null with confidence 0.

Respond with ONLY a JSON object, no markdown:
{
  "type": string | null,
  "stageFocus": string[] | null,
  "sectorFocus": string[] | null,
  "geoFocus": string[] | null,
  "checkSizeMinUsd": number | null,
  "checkSizeMaxUsd": number | null,
  "aum": number | null,
  "foundedYear": number | null,
  "linkedinUrl": string | null,
  "fieldConfidence": {
    "type": number, "stageFocus": number, "sectorFocus": number,
    "geoFocus": number, "checkSizeMinUsd": number, "checkSizeMaxUsd": number,
    "aum": number, "foundedYear": number, "linkedinUrl": number
  }
}`;

// ---------------------------------------------------------------------------
// Stage 4: Extract supplementary data from articles (deal activity only)
// ---------------------------------------------------------------------------

const ARTICLE_EXTRACT_PROMPT = `You analyze funding round articles to extract information about an INVESTOR's investment activity.

CRITICAL: The articles describe STARTUPS that raised money. The investor participated in these rounds.
- Do NOT extract the startup's data (website, location, founded year, description)
- ONLY extract information about the INVESTOR's investment patterns:
  - What stages do they invest in? (from the round types)
  - What sectors do they focus on? (from the startups' industries)
  - What geographies do they cover? (from where the startups are based)
  - What is their typical check size? (from round amounts, if their contribution is stated)
  - What type of investor are they? (VC, PE, angel, etc.)

Respond with ONLY a JSON object, no markdown:
{
  "type": string | null,
  "stageFocus": string[] | null,
  "sectorFocus": string[] | null,
  "geoFocus": string[] | null,
  "checkSizeMinUsd": number | null,
  "checkSizeMaxUsd": number | null,
  "fieldConfidence": {
    "type": number, "stageFocus": number, "sectorFocus": number,
    "geoFocus": number, "checkSizeMinUsd": number, "checkSizeMaxUsd": number
  }
}`;

async function extractFromWebsite(
  investorName: string,
  websiteText: string
): Promise<LLMResult> {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system: WEBSITE_EXTRACT_PROMPT,
    messages: [{
      role: "user",
      content: `Investor: ${investorName}\n\n--- Website Content ---\n${websiteText.slice(0, 4000)}`,
    }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  const cleaned = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

  try {
    const p = JSON.parse(cleaned);
    return {
      type: p.type || null,
      stageFocus: Array.isArray(p.stageFocus) ? p.stageFocus : null,
      sectorFocus: Array.isArray(p.sectorFocus) ? p.sectorFocus : null,
      geoFocus: Array.isArray(p.geoFocus) ? p.geoFocus : null,
      checkSizeMinUsd: typeof p.checkSizeMinUsd === "number" ? p.checkSizeMinUsd : null,
      checkSizeMaxUsd: typeof p.checkSizeMaxUsd === "number" ? p.checkSizeMaxUsd : null,
      aum: typeof p.aum === "number" ? p.aum : null,
      foundedYear: typeof p.foundedYear === "number" ? p.foundedYear : null,
      linkedinUrl: p.linkedinUrl || null,
      fieldConfidence: p.fieldConfidence ?? {},
    };
  } catch {
    return { fieldConfidence: {} };
  }
}

async function extractFromArticles(
  investorName: string,
  articleTexts: string[]
): Promise<LLMResult> {
  if (articleTexts.length === 0) return { fieldConfidence: {} };

  const anthropic = getClient();
  const parts: string[] = [];
  const budgetPerArticle = Math.floor(4000 / articleTexts.length);
  for (let i = 0; i < articleTexts.length; i++) {
    parts.push(`--- Article ${i + 1} ---\n${articleTexts[i].slice(0, budgetPerArticle)}`);
  }

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system: ARTICLE_EXTRACT_PROMPT,
    messages: [{
      role: "user",
      content: `Investor: ${investorName}\n\n${parts.join("\n\n")}`,
    }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  const cleaned = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

  try {
    const p = JSON.parse(cleaned);
    return {
      type: p.type || null,
      stageFocus: Array.isArray(p.stageFocus) ? p.stageFocus : null,
      sectorFocus: Array.isArray(p.sectorFocus) ? p.sectorFocus : null,
      geoFocus: Array.isArray(p.geoFocus) ? p.geoFocus : null,
      checkSizeMinUsd: typeof p.checkSizeMinUsd === "number" ? p.checkSizeMinUsd : null,
      checkSizeMaxUsd: typeof p.checkSizeMaxUsd === "number" ? p.checkSizeMaxUsd : null,
      // Articles should NEVER provide these fields for investors:
      aum: null,
      foundedYear: null,
      website: null,
      linkedinUrl: null,
      fieldConfidence: p.fieldConfidence ?? {},
    };
  } catch {
    return { fieldConfidence: {} };
  }
}

// ---------------------------------------------------------------------------
// Merge: website data (high trust) + article data (lower trust, fill gaps)
// ---------------------------------------------------------------------------

function mergeResults(websiteResult: LLMResult, articleResult: LLMResult): LLMResult {
  const merged: LLMResult = { fieldConfidence: {} };

  const allFields: (keyof InvestorFields)[] = [
    "type", "stageFocus", "sectorFocus", "geoFocus",
    "checkSizeMinUsd", "checkSizeMaxUsd", "aum", "foundedYear",
    "website", "linkedinUrl",
  ];

  for (const field of allFields) {
    const webVal = websiteResult[field];
    const webConf = websiteResult.fieldConfidence[field] ?? 0;
    const artVal = articleResult[field];
    const artConf = articleResult.fieldConfidence[field] ?? 0;

    // Website data always wins if present
    if (webVal != null && (webConf > 0 || !isEmpty(webVal))) {
      (merged as Record<string, unknown>)[field] = webVal;
      merged.fieldConfidence[field] = webConf;
    } else if (artVal != null && (artConf > 0 || !isEmpty(artVal))) {
      (merged as Record<string, unknown>)[field] = artVal;
      // Article-derived data gets lower confidence
      merged.fieldConfidence[field] = Math.min(artConf, 0.6);
    }
  }

  return merged;
}

function isEmpty(val: unknown): boolean {
  if (val == null) return true;
  if (Array.isArray(val) && val.length === 0) return true;
  if (val === "") return true;
  return false;
}

// ---------------------------------------------------------------------------
// Stage 5: Update Neo4j
// ---------------------------------------------------------------------------

async function saveToGraph(
  normalizedName: string,
  fields: LLMResult,
  articles: ArticleRow[],
  logoUrl: string | null
): Promise<string[]> {
  const session = driver.session();
  const updated: string[] = [];

  try {
    const current = await session.run(
      `MATCH (inv:InvestorOrg {normalizedName: $norm})
       RETURN inv.type AS type, inv.stageFocus AS stageFocus,
              inv.sectorFocus AS sectorFocus, inv.geoFocus AS geoFocus,
              inv.checkSizeMinUsd AS checkSizeMinUsd, inv.checkSizeMaxUsd AS checkSizeMaxUsd,
              inv.aum AS aum, inv.foundedYear AS foundedYear,
              inv.website AS website, inv.linkedinUrl AS linkedinUrl,
              inv.logoUrl AS logoUrl, inv.lockedFields AS lockedFields
       LIMIT 1`,
      { norm: normalizedName }
    );

    if (current.records.length === 0) return [];

    const rec = current.records[0];
    const lockedFields = new Set<string>(
      Array.isArray(rec.get("lockedFields")) ? rec.get("lockedFields") as string[] : []
    );
    const sets: string[] = [];
    const params: Record<string, unknown> = { norm: normalizedName };
    const confidence = fields.fieldConfidence;

    // Scalar fields
    const scalarFields: [keyof InvestorFields, string][] = [
      ["type", "type"],
      ["checkSizeMinUsd", "checkSizeMinUsd"],
      ["checkSizeMaxUsd", "checkSizeMaxUsd"],
      ["aum", "aum"],
      ["foundedYear", "foundedYear"],
      ["website", "website"],
      ["linkedinUrl", "linkedinUrl"],
    ];

    for (const [field, neo4jProp] of scalarFields) {
      if (lockedFields.has(neo4jProp)) continue;
      const newVal = fields[field];
      if (newVal == null) continue;

      const conf = confidence[field] ?? 0;
      const currentVal = rec.get(neo4jProp);

      if (currentVal == null || conf > 0.6) {
        sets.push(`inv.${neo4jProp} = $${field}`);
        params[field] = newVal;
        updated.push(neo4jProp);
      }
    }

    // Array fields
    const arrayFields: [keyof InvestorFields, string][] = [
      ["stageFocus", "stageFocus"],
      ["sectorFocus", "sectorFocus"],
      ["geoFocus", "geoFocus"],
    ];

    for (const [field, neo4jProp] of arrayFields) {
      if (lockedFields.has(neo4jProp)) continue;
      const newVal = fields[field];
      if (!Array.isArray(newVal) || newVal.length === 0) continue;

      const conf = confidence[field] ?? 0;
      const currentVal = rec.get(neo4jProp);

      if (currentVal == null || (Array.isArray(currentVal) && currentVal.length === 0) || conf > 0.6) {
        sets.push(`inv.${neo4jProp} = $${field}`);
        params[field] = newVal;
        updated.push(neo4jProp);
      }
    }

    // Logo — always update if we found one (unless locked)
    if (logoUrl && !lockedFields.has("logoUrl")) {
      sets.push("inv.logoUrl = $logoUrl");
      params["logoUrl"] = logoUrl;
      if (rec.get("logoUrl") !== logoUrl) updated.push("logoUrl");
    }

    if (sets.length > 0) {
      sets.push("inv.enrichedAt = datetime()");
      await session.run(
        `MATCH (inv:InvestorOrg {normalizedName: $norm}) SET ${sets.join(", ")}`,
        params
      );
    } else {
      await session.run(
        `MATCH (inv:InvestorOrg {normalizedName: $norm}) SET inv.enrichedAt = datetime()`,
        { norm: normalizedName }
      );
    }

    // Store article content in Article nodes
    for (const article of articles) {
      if (article.content) {
        await session.run(
          `MATCH (a:Article {url: $url}) SET a.content = $content`,
          {
            url: article.url,
            content: stripHtml(article.content).slice(0, 5000),
          }
        );
      }
    }
  } finally {
    await session.close();
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

export async function enrichInvestor(
  investorName: string,
  onProgress: (p: EnrichProgress) => void
): Promise<void> {
  const normalizedName = normalizeInvestor(investorName);

  // Stage 1: Load articles (for deal context only)
  onProgress({ stage: "articles", message: "Loading linked articles..." });
  const articles = await loadArticles(normalizedName);
  const articleTexts = articles
    .map((a) => {
      const text = a.content ? stripHtml(a.content) : a.title;
      return text.slice(0, 3000);
    })
    .filter((t) => t.length > 0);
  onProgress({
    stage: "articles",
    message: `${articles.length} article${articles.length !== 1 ? "s" : ""} loaded`,
    detail: articles.length > 0
      ? `Articles: ${articles.map((a) => a.title).join("; ")}`
      : "No linked articles found in database",
  });

  // Stage 2: Find & verify the investor's own website
  onProgress({ stage: "website", message: "Checking investor website..." });

  let websiteUrl: string | null = null;
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(
      `MATCH (inv:InvestorOrg {normalizedName: $norm}) RETURN inv.website AS website LIMIT 1`,
      { norm: normalizedName }
    );
    const storedWebsite = result.records[0]?.get("website") as string | null;
    websiteUrl = isValidWebsiteUrl(storedWebsite) ? storedWebsite : null;
  } finally {
    await session.close();
  }

  let websiteText: string | null = null;
  let logoUrl: string | null = null;
  let logoCandidates: { url: string; score: number; source: string }[] = [];
  let discoveredLinkedinUrl: string | null = null;

  // Verify existing website or discover new one
  if (websiteUrl) {
    onProgress({ stage: "website", message: `Verifying ${getDomain(websiteUrl)}...`, detail: `Stored website in Neo4j: ${websiteUrl}` });
    const fetchResult = await validateUrl(websiteUrl);

    if (fetchResult.ok && fetchResult.html) {
      const verification = await verifyWebsiteWithLLM(
        investorName, "investor", websiteUrl, fetchResult.html,
        `"${investorName}" is an investment firm / VC / fund / angel investor.`
      );

      if (verification.match) {
        const parsed = scrapeHtml(fetchResult.html, websiteUrl);
        websiteText = parsed.text || "(verified but no extractable text)";
        logoCandidates = parsed.logoCandidates;
        onProgress({ stage: "website", message: `${getDomain(websiteUrl)} verified`, detail: `LLM confirmed stored website ${websiteUrl} belongs to "${investorName}"` });
      } else {
        onProgress({ stage: "website", message: `${getDomain(websiteUrl)} doesn't match — re-discovering...`, detail: `Stored website rejected: ${verification.reason}. Clearing from Neo4j.` });
        websiteUrl = null;
        const clearSession = driver.session();
        try {
          await clearSession.run(
            `MATCH (inv:InvestorOrg {normalizedName: $norm})
             SET inv.website = null, inv.logoUrl = null, inv.linkedinUrl = null`,
            { norm: normalizedName }
          );
        } finally {
          await clearSession.close();
        }
      }
    } else {
      onProgress({ stage: "website", message: `${getDomain(websiteUrl)} unreachable — re-discovering...`, detail: `Stored website ${websiteUrl} could not be fetched` });
      websiteUrl = null;
    }
  } else {
    onProgress({ stage: "website", message: "No stored website", detail: "No website stored in Neo4j — starting discovery" });
  }

  // Discover investor website via Brave Search
  if (!websiteUrl) {
    onProgress({ stage: "website", message: "Searching for investor website..." });
    const discovery = await discoverInvestorWebsite(investorName, (msg, detail) =>
      onProgress({ stage: "website", message: msg, detail })
    );
    websiteUrl = discovery.website;
    discoveredLinkedinUrl = discovery.linkedinUrl;

    // Log all discovery attempts
    for (const entry of discovery.log) {
      if (entry.status !== "match") {
        onProgress({ stage: "website", message: `${getDomain(entry.url)} ${entry.status}`, detail: `${entry.url}: ${entry.reason}` });
      }
    }

    if (websiteUrl && discovery.websiteHtml) {
      const parsed = scrapeHtml(discovery.websiteHtml, websiteUrl);
      websiteText = parsed.text || "(verified but no extractable text)";
      logoCandidates = parsed.logoCandidates;
      onProgress({ stage: "website", message: `Found & parsed ${getDomain(websiteUrl)}`, detail: `Website: ${websiteUrl}, Logo candidates: ${logoCandidates.length}, Text: ${(websiteText?.length ?? 0)} chars` });
    } else if (websiteUrl) {
      const scrapeResult = await scrapeWebsite(websiteUrl);
      websiteText = scrapeResult?.text ?? null;
      if (scrapeResult) logoCandidates = scrapeResult.logoCandidates;
      onProgress({
        stage: "website",
        message: websiteText ? `Found & parsed ${getDomain(websiteUrl)}` : `Found ${getDomain(websiteUrl)} (no content)`,
        detail: `Website: ${websiteUrl}, Scraped: ${websiteText ? `${websiteText.length} chars` : "failed"}`,
      });
    } else {
      onProgress({ stage: "website", message: "No investor website found", detail: `Brave Search could not find a verified website for "${investorName}"` });
    }
  }

  if (articleTexts.length === 0 && !websiteText) {
    onProgress({ stage: "error", message: "No sources available for enrichment", detail: "Neither articles nor a website could be found — cannot enrich" });
    return;
  }

  // Stage 3: Extract data — two separate LLM calls with different trust levels
  onProgress({ stage: "llm", message: "Extracting from website...", detail: websiteText ? `Sending ${websiteText.length} chars to LLM (primary source, high trust)` : "No website text — skipping website extraction" });

  // Primary: extract from investor's own website (high trust)
  const websiteResult = websiteText
    ? await extractFromWebsite(investorName, websiteText)
    : { fieldConfidence: {} } as LLMResult;

  if (websiteText) {
    const webFields = Object.entries(websiteResult).filter(([k, v]) => k !== "fieldConfidence" && v != null).map(([k]) => k);
    onProgress({ stage: "llm", message: `Website: ${webFields.length} fields`, detail: `Website extraction: ${webFields.join(", ") || "none"}` });
  }

  onProgress({ stage: "llm", message: "Extracting from articles...", detail: `Sending ${articleTexts.length} articles to LLM (secondary source, capped trust 0.6)` });

  // Secondary: extract deal patterns from articles (lower trust, only activity fields)
  const articleResult = await extractFromArticles(investorName, articleTexts);

  const artFields = Object.entries(articleResult).filter(([k, v]) => k !== "fieldConfidence" && v != null).map(([k]) => k);
  onProgress({ stage: "llm", message: `Articles: ${artFields.length} fields`, detail: `Article extraction: ${artFields.join(", ") || "none"}` });

  // Merge: website wins, articles fill gaps
  const llmResult = mergeResults(websiteResult, articleResult);

  // Add discovered website/linkedin if LLM didn't find them
  if (!llmResult.website && websiteUrl) {
    llmResult.website = websiteUrl;
    llmResult.fieldConfidence["website"] = 0.8;
  }
  if (!llmResult.linkedinUrl && discoveredLinkedinUrl) {
    llmResult.linkedinUrl = discoveredLinkedinUrl;
    llmResult.fieldConfidence["linkedinUrl"] = 0.8;
  }

  const mergedFields = Object.entries(llmResult)
    .filter(([k, v]) => k !== "fieldConfidence" && v != null);
  const extractedCount = mergedFields.length;
  const fieldDetails = mergedFields
    .map(([k, v]) => {
      const conf = llmResult.fieldConfidence[k];
      const src = (websiteResult as Record<string, unknown>)[k] != null ? "website" : "articles";
      return `${k}=${JSON.stringify(v)} (${src}, conf=${conf?.toFixed(2) ?? "?"})`;
    })
    .join("; ");
  onProgress({
    stage: "llm",
    message: `${extractedCount} field${extractedCount !== 1 ? "s" : ""} extracted`,
    detail: `Merged result: ${fieldDetails}`,
  });

  // Logo: validate candidates from HTML, then Brave Image Search fallback
  if (logoCandidates.length > 0 && websiteUrl) {
    onProgress({ stage: "llm", message: "Validating logo candidates...", detail: `${logoCandidates.length} candidates: ${logoCandidates.slice(0, 5).map((c) => `${c.source}(${c.score})`).join(", ")}` });
    logoUrl = await findBestLogo(logoCandidates, websiteUrl);
    if (logoUrl) {
      onProgress({ stage: "llm", message: "Logo validated", detail: `Logo: ${logoUrl}` });
    } else {
      onProgress({ stage: "llm", message: "No valid logo from website", detail: "All HTML logo candidates failed validation" });
    }
  }
  if (!logoUrl) {
    onProgress({ stage: "llm", message: "Searching for logo...", detail: `Brave Image Search: "${investorName} venture capital fund logo"` });
    const domain = websiteUrl ? getDomain(websiteUrl) : null;
    logoUrl = await searchLogo(investorName, "investor", domain);
    onProgress({
      stage: "llm",
      message: logoUrl ? "Logo found via image search" : "No logo found",
      detail: logoUrl ? `Logo URL: ${logoUrl}` : "Brave Image Search returned no suitable logo",
    });
  }

  // Stage 4: Save
  onProgress({ stage: "save", message: "Updating graph...", detail: `Saving to Neo4j node InvestorOrg {normalizedName: "${normalizedName}"}` });
  const fieldsUpdated = await saveToGraph(normalizedName, llmResult, articles, logoUrl);
  onProgress({
    stage: "save",
    message: `Graph updated (${fieldsUpdated.length} field${fieldsUpdated.length !== 1 ? "s" : ""})`,
    detail: fieldsUpdated.length > 0 ? `Updated fields: ${fieldsUpdated.join(", ")}` : "No new fields to update (all already filled)",
  });

  onProgress({
    stage: "done",
    message: "Enrichment complete",
    fieldsUpdated,
  });
}
