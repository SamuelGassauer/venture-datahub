import { prisma } from "./db";
import driver from "./neo4j";
import type { Session } from "neo4j-driver";

// ============================================================================
// TYPES
// ============================================================================

export type GraphSyncResult = {
  companies: number;
  investors: number;
  fundingRounds: number;
  articles: number;
  locations: number;
  edges: number;
  durationMs: number;
};

export type GraphSyncSummary = {
  nodes: string[];
  edges: string[];
};

// ============================================================================
// ENTITY RESOLUTION
// ============================================================================

const COMPANY_SUFFIXES =
  /\b(gmbh|ug|ag|se|inc\.?|ltd\.?|llc|corp\.?|sa|sas|bv|ab|plc|co\.?|limited)\b/gi;

export function normalizeCompany(name: string): string {
  return name.toLowerCase().replace(COMPANY_SUFFIXES, "").replace(/[.,]+/g, "").trim().replace(/\s+/g, " ");
}

const INVESTOR_SUFFIXES =
  /\b(ventures|capital|partners|management|advisors|group|fund|investments|holding|holdings)\b/gi;

export function normalizeInvestor(name: string): string {
  return name.toLowerCase().replace(INVESTOR_SUFFIXES, "").replace(/[.,]+/g, "").trim().replace(/\s+/g, " ");
}

// ============================================================================
// CONSTRAINTS (idempotent)
// ============================================================================

async function ensureConstraints(session: Session) {
  const constraints = [
    "CREATE CONSTRAINT company_name IF NOT EXISTS FOR (c:Company) REQUIRE c.normalizedName IS UNIQUE",
    "CREATE CONSTRAINT investor_name IF NOT EXISTS FOR (i:InvestorOrg) REQUIRE i.normalizedName IS UNIQUE",
    "CREATE CONSTRAINT funding_round_key IF NOT EXISTS FOR (f:FundingRound) REQUIRE f.roundKey IS UNIQUE",
    "CREATE CONSTRAINT article_url IF NOT EXISTS FOR (a:Article) REQUIRE a.url IS UNIQUE",
    "CREATE CONSTRAINT location_name IF NOT EXISTS FOR (l:Location) REQUIRE l.name IS UNIQUE",
  ];
  for (const cypher of constraints) {
    await session.run(cypher);
  }
}

// ============================================================================
// BATCH HELPERS
// ============================================================================

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ============================================================================
// SINGLE-ROUND SYNC (for per-round ingest button)
// ============================================================================

export type CompanyMetaInput = {
  description?: string | null;
  website?: string | null;
  foundedYear?: number | null;
  employeeRange?: string | null;
  linkedinUrl?: string | null;
};

export type SingleRoundData = {
  companyName: string;
  amountUsd: number | null;
  currency: string;
  stage: string | null;
  investors: string[];
  leadInvestor: string | null;
  country: string | null;
  confidence: number;
  companyMeta?: CompanyMetaInput;
  articles: {
    id: string;
    url: string;
    title: string;
    publishedAt: string | null;
    author: string | null;
  }[];
};

export async function syncSingleRoundToGraph(data: SingleRoundData): Promise<GraphSyncSummary> {
  const session = driver.session();
  const nodes: string[] = [];
  const edgeLabels: string[] = [];

  try {
    await ensureConstraints(session);

    const compNorm = normalizeCompany(data.companyName);
    const stageKey = data.stage?.toLowerCase().replace(/[^a-z0-9+]/g, "") ?? "unknown";
    // Unique key for a funding round: company + stage (one round per company per stage)
    const roundKey = `${compNorm}::${stageKey}`;

    // Company
    const meta = data.companyMeta ?? {};
    await session.run(
      `MERGE (c:Company {normalizedName: $compNorm})
       SET c.name = $name, c.country = $country,
           c.status = COALESCE(c.status, 'active')
       SET c.description = COALESCE($description, c.description)
       SET c.website = COALESCE($website, c.website)
       SET c.foundedYear = COALESCE($foundedYear, c.foundedYear)
       SET c.employeeRange = COALESCE($employeeRange, c.employeeRange)
       SET c.linkedinUrl = COALESCE($linkedinUrl, c.linkedinUrl)`,
      {
        compNorm,
        name: data.companyName,
        country: data.country ?? "",
        description: meta.description ?? null,
        website: meta.website ?? null,
        foundedYear: meta.foundedYear ?? null,
        employeeRange: meta.employeeRange ?? null,
        linkedinUrl: meta.linkedinUrl ?? null,
      }
    );
    nodes.push(`Company: ${data.companyName}`);

    // Location
    if (data.country) {
      await session.run(
        `MERGE (l:Location {name: $name}) SET l.type = 'country'`,
        { name: data.country }
      );
      nodes.push(`Location: ${data.country}`);
      await session.run(
        `MATCH (c:Company {normalizedName: $compNorm})
         MATCH (l:Location {name: $country})
         MERGE (c)-[:HQ_IN]->(l)`,
        { compNorm, country: data.country }
      );
      edgeLabels.push("HQ_IN");
    }

    // Investors
    const allInvestorNames = [...data.investors];
    if (data.leadInvestor && !allInvestorNames.includes(data.leadInvestor)) {
      allInvestorNames.push(data.leadInvestor);
    }
    for (const inv of allInvestorNames) {
      const invNorm = normalizeInvestor(inv);
      await session.run(
        `MERGE (i:InvestorOrg {normalizedName: $invNorm}) SET i.name = $name`,
        { invNorm, name: inv }
      );
      nodes.push(`InvestorOrg: ${inv}`);
    }

    // Single FundingRound node per company+stage
    await session.run(
      `MERGE (fr:FundingRound {roundKey: $roundKey})
       SET fr.amountUsd = $amountUsd, fr.currency = $currency,
           fr.stage = $stage, fr.confidence = $confidence,
           fr.articleId = $articleId`,
      {
        roundKey,
        amountUsd: data.amountUsd,
        currency: data.currency,
        stage: data.stage,
        confidence: data.confidence,
        articleId: data.articles[0]?.id ?? roundKey,
      }
    );
    nodes.push(`FundingRound: ${data.companyName} ${data.stage ?? ""}`);

    // RAISED: Company → FundingRound
    await session.run(
      `MATCH (c:Company {normalizedName: $compNorm})
       MATCH (f:FundingRound {roundKey: $roundKey})
       MERGE (c)-[:RAISED]->(f)`,
      { compNorm, roundKey }
    );
    edgeLabels.push("RAISED");

    // Articles + SOURCED_FROM edges
    for (const article of data.articles) {
      await session.run(
        `MERGE (a:Article {url: $url})
         SET a.title = $title, a.publishedAt = $publishedAt, a.author = $author`,
        { url: article.url, title: article.title, publishedAt: article.publishedAt, author: article.author }
      );
      nodes.push(`Article: ${article.title}`);

      await session.run(
        `MATCH (f:FundingRound {roundKey: $roundKey})
         MATCH (a:Article {url: $url})
         MERGE (f)-[rel:SOURCED_FROM]->(a)
         SET rel.confidence = $confidence`,
        { roundKey, url: article.url, confidence: data.confidence }
      );
      edgeLabels.push("SOURCED_FROM");
    }

    // PARTICIPATED_IN: InvestorOrg → FundingRound
    let participatedCount = 0;
    const leadNorm = data.leadInvestor ? normalizeInvestor(data.leadInvestor) : null;
    for (const inv of allInvestorNames) {
      const invNorm = normalizeInvestor(inv);
      const role = leadNorm && invNorm === leadNorm ? "lead" : "participant";
      await session.run(
        `MATCH (i:InvestorOrg {normalizedName: $invNorm})
         MATCH (f:FundingRound {roundKey: $roundKey})
         MERGE (i)-[rel:PARTICIPATED_IN]->(f)
         SET rel.role = $role`,
        { invNorm, roundKey, role }
      );
      participatedCount++;
    }

    if (participatedCount > 0) {
      edgeLabels.push(`PARTICIPATED_IN x${participatedCount}`);
    }
  } finally {
    await session.close();
  }

  return { nodes, edges: edgeLabels };
}

// ============================================================================
// MAIN SYNC
// ============================================================================

export async function syncToGraph(): Promise<GraphSyncResult> {
  const start = Date.now();

  // 1. Load all FundingRounds with Article from Prisma
  const rounds = await prisma.fundingRound.findMany({
    include: {
      article: {
        include: { feed: true },
      },
    },
  });

  // 2. Build denormalized data
  const companyMap = new Map<string, { name: string; normalizedName: string; country: string; totalFundingUsd: number }>();
  const investorMap = new Map<string, { name: string; normalizedName: string }>();
  const locationSet = new Set<string>();
  const articleMap = new Map<string, { url: string; title: string; publishedAt: string | null; author: string | null }>();

  for (const r of rounds) {
    // Company
    const compNorm = normalizeCompany(r.companyName);
    const existing = companyMap.get(compNorm);
    companyMap.set(compNorm, {
      name: existing?.name ?? r.companyName,
      normalizedName: compNorm,
      country: r.country ?? "",
      totalFundingUsd: (existing?.totalFundingUsd ?? 0) + (r.amountUsd ?? 0),
    });

    // Investors
    for (const inv of r.investors) {
      const invNorm = normalizeInvestor(inv);
      if (!investorMap.has(invNorm)) {
        investorMap.set(invNorm, { name: inv, normalizedName: invNorm });
      }
    }
    if (r.leadInvestor) {
      const leadNorm = normalizeInvestor(r.leadInvestor);
      if (!investorMap.has(leadNorm)) {
        investorMap.set(leadNorm, { name: r.leadInvestor, normalizedName: leadNorm });
      }
    }

    // Location
    if (r.country) locationSet.add(r.country);

    // Article
    if (r.article && !articleMap.has(r.article.url)) {
      articleMap.set(r.article.url, {
        url: r.article.url,
        title: r.article.title,
        publishedAt: r.article.publishedAt?.toISOString() ?? null,
        author: r.article.author,
      });
    }
  }

  const session = driver.session();
  let edgeCount = 0;

  try {
    // 3. Ensure constraints
    await ensureConstraints(session);

    // 4. MERGE nodes in batches

    // Companies
    const companies = Array.from(companyMap.values());
    for (const batch of chunk(companies, 100)) {
      await session.run(
        `UNWIND $batch AS c
         MERGE (comp:Company {normalizedName: c.normalizedName})
         SET comp.name = c.name, comp.country = c.country, comp.totalFundingUsd = c.totalFundingUsd`,
        { batch }
      );
    }

    // Investors
    const investors = Array.from(investorMap.values());
    for (const batch of chunk(investors, 100)) {
      await session.run(
        `UNWIND $batch AS i
         MERGE (inv:InvestorOrg {normalizedName: i.normalizedName})
         SET inv.name = i.name`,
        { batch }
      );
    }

    // Locations
    const locations = Array.from(locationSet).map((name) => ({ name, type: "country" }));
    for (const batch of chunk(locations, 100)) {
      await session.run(
        `UNWIND $batch AS l
         MERGE (loc:Location {name: l.name})
         SET loc.type = l.type`,
        { batch }
      );
    }

    // Articles
    const articles = Array.from(articleMap.values());
    for (const batch of chunk(articles, 100)) {
      await session.run(
        `UNWIND $batch AS a
         MERGE (art:Article {url: a.url})
         SET art.title = a.title, art.publishedAt = a.publishedAt, art.author = a.author`,
        { batch }
      );
    }

    // FundingRounds — deduplicate by company+stage, merge into single node per round
    const roundKeyMap = new Map<string, { roundKey: string; amountUsd: number | null; currency: string; stage: string | null; confidence: number; articleId: string }>();
    for (const r of rounds) {
      const compNorm = normalizeCompany(r.companyName);
      const stageKey = r.stage?.toLowerCase().replace(/[^a-z0-9+]/g, "") ?? "unknown";
      const roundKey = `${compNorm}::${stageKey}`;
      const existing = roundKeyMap.get(roundKey);
      // Keep highest confidence / largest amount
      if (!existing || (r.confidence > existing.confidence) || (r.amountUsd && (!existing.amountUsd || r.amountUsd > existing.amountUsd))) {
        roundKeyMap.set(roundKey, {
          roundKey,
          amountUsd: r.amountUsd ?? existing?.amountUsd ?? null,
          currency: r.currency,
          stage: r.stage ?? existing?.stage ?? null,
          confidence: Math.max(r.confidence, existing?.confidence ?? 0),
          articleId: r.articleId,
        });
      }
    }
    const fundingRoundData = Array.from(roundKeyMap.values());
    for (const batch of chunk(fundingRoundData, 100)) {
      await session.run(
        `UNWIND $batch AS f
         MERGE (fr:FundingRound {roundKey: f.roundKey})
         SET fr.amountUsd = f.amountUsd, fr.currency = f.currency, fr.stage = f.stage,
             fr.confidence = f.confidence, fr.articleId = f.articleId`,
        { batch }
      );
    }

    // Build a lookup: articleId → roundKey for edge creation
    const articleToRoundKey = new Map<string, string>();
    for (const r of rounds) {
      const compNorm = normalizeCompany(r.companyName);
      const stageKey = r.stage?.toLowerCase().replace(/[^a-z0-9+]/g, "") ?? "unknown";
      articleToRoundKey.set(r.articleId, `${compNorm}::${stageKey}`);
    }

    // 5. Create edges

    // RAISED: Company → FundingRound
    const raisedData = Array.from(roundKeyMap.values()).map((fr) => {
      const compNorm = fr.roundKey.split("::")[0];
      return { companyNorm: compNorm, roundKey: fr.roundKey };
    });
    for (const batch of chunk(raisedData, 100)) {
      const result = await session.run(
        `UNWIND $batch AS e
         MATCH (c:Company {normalizedName: e.companyNorm})
         MATCH (f:FundingRound {roundKey: e.roundKey})
         MERGE (c)-[:RAISED]->(f)`,
        { batch }
      );
      edgeCount += result.summary.counters.updates().relationshipsCreated;
    }

    // PARTICIPATED_IN: InvestorOrg → FundingRound
    const participatedData: { invNorm: string; roundKey: string; role: string }[] = [];
    const seenParticipation = new Set<string>();
    for (const r of rounds) {
      const roundKey = articleToRoundKey.get(r.articleId)!;
      const leadNorm = r.leadInvestor ? normalizeInvestor(r.leadInvestor) : null;
      for (const inv of r.investors) {
        const invNorm = normalizeInvestor(inv);
        const dedupKey = `${invNorm}::${roundKey}`;
        if (seenParticipation.has(dedupKey)) continue;
        seenParticipation.add(dedupKey);
        participatedData.push({
          invNorm,
          roundKey,
          role: leadNorm && invNorm === leadNorm ? "lead" : "participant",
        });
      }
      if (r.leadInvestor && leadNorm) {
        const dedupKey = `${leadNorm}::${roundKey}`;
        if (!seenParticipation.has(dedupKey)) {
          seenParticipation.add(dedupKey);
          participatedData.push({ invNorm: leadNorm, roundKey, role: "lead" });
        }
      }
    }
    for (const batch of chunk(participatedData, 100)) {
      const result = await session.run(
        `UNWIND $batch AS e
         MATCH (i:InvestorOrg {normalizedName: e.invNorm})
         MATCH (f:FundingRound {roundKey: e.roundKey})
         MERGE (i)-[rel:PARTICIPATED_IN]->(f)
         SET rel.role = e.role`,
        { batch }
      );
      edgeCount += result.summary.counters.updates().relationshipsCreated;
    }

    // SOURCED_FROM: FundingRound → Article
    const sourcedData = rounds
      .filter((r) => r.article)
      .map((r) => ({
        roundKey: articleToRoundKey.get(r.articleId)!,
        url: r.article!.url,
        confidence: r.confidence,
        extractedAt: r.createdAt.toISOString(),
      }));
    for (const batch of chunk(sourcedData, 100)) {
      const result = await session.run(
        `UNWIND $batch AS e
         MATCH (f:FundingRound {roundKey: e.roundKey})
         MATCH (a:Article {url: e.url})
         MERGE (f)-[rel:SOURCED_FROM]->(a)
         SET rel.confidence = e.confidence, rel.extractedAt = e.extractedAt`,
        { batch }
      );
      edgeCount += result.summary.counters.updates().relationshipsCreated;
    }

    // HQ_IN: Company → Location
    const hqData = rounds
      .filter((r) => r.country)
      .map((r) => ({
        companyNorm: normalizeCompany(r.companyName),
        country: r.country,
      }));
    // Deduplicate
    const hqUnique = Array.from(
      new Map(hqData.map((h) => [`${h.companyNorm}::${h.country}`, h])).values()
    );
    for (const batch of chunk(hqUnique, 100)) {
      const result = await session.run(
        `UNWIND $batch AS e
         MATCH (c:Company {normalizedName: e.companyNorm})
         MATCH (l:Location {name: e.country})
         MERGE (c)-[:HQ_IN]->(l)`,
        { batch }
      );
      edgeCount += result.summary.counters.updates().relationshipsCreated;
    }
  } finally {
    await session.close();
  }

  return {
    companies: companyMap.size,
    investors: investorMap.size,
    fundingRounds: rounds.length,
    articles: articleMap.size,
    locations: locationSet.size,
    edges: edgeCount,
    durationMs: Date.now() - start,
  };
}
