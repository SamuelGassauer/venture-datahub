/**
 * Live enrichment for dedup candidates.
 *
 * Snapshots stored at dedup-run time only carry a handful of fields
 * (name, normalizedName, ...). For Investor that's just 2 fields, which
 * is too little for a human to decide whether two records are the same.
 *
 * This helper queries Neo4j on read, batched by entity type, and returns
 * a richer profile per uuid. The dedup endpoint attaches it to each
 * candidate as `leftEnriched` / `rightEnriched`. Snapshots are kept as
 * fallback if enrichment fails (e.g. node was already merged).
 */

import driver from "../neo4j";

// ── Types ────────────────────────────────────────────────────────────────

export type EnrichedInvestor = {
  uuid: string;
  name: string | null;
  logoUrl: string | null;
  type: string | null;
  hqCity: string | null;
  hqCountry: string | null;
  website: string | null;
  linkedinUrl: string | null;
  foundedYear: number | null;
  aum: string | null;
  stageFocus: string[];
  sectorFocus: string[];
  geoFocus: string[];
  dealCount: number;
  leadCount: number;
  totalDeployedUsd: number | null;
  topPortfolio: string[]; // up to 5 company names
};

export type EnrichedCompany = {
  uuid: string;
  name: string | null;
  logoUrl: string | null;
  country: string | null;
  sector: string | null;
  status: string | null;
  website: string | null;
  linkedinUrl: string | null;
  foundedYear: number | null;
  employeeRange: string | null;
  description: string | null;
  location: string | null;
  roundCount: number;
  totalFundingUsd: number | null;
  firstRoundDate: string | null;
  latestStage: string | null;
  topLeadInvestors: string[]; // up to 3
};

export type EnrichedRound = {
  uuid: string;
  companyName: string | null;
  companyLogoUrl: string | null;
  amountUsd: number | null;
  currency: string | null;
  stage: string | null;
  country: string | null;
  announcedDate: string | null;
  confidence: number | null;
  leadInvestor: string | null;
  investors: string[];
  sourceArticles: { title: string; url: string; publishedAt: string | null }[];
};

// ── Helpers ──────────────────────────────────────────────────────────────

function toNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "toNumber" in v) {
    return (v as { toNumber(): number }).toNumber();
  }
  return null;
}

function toStr(v: unknown): string | null {
  if (v == null) return null;
  return String(v);
}

function toStrArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

// ── Investor ─────────────────────────────────────────────────────────────

export async function enrichInvestors(uuids: string[]): Promise<Map<string, EnrichedInvestor>> {
  const map = new Map<string, EnrichedInvestor>();
  if (uuids.length === 0) return map;
  const session = driver().session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(
      `
      MATCH (inv:InvestorOrg)
      WHERE inv.uuid IN $uuids
      OPTIONAL MATCH (inv)-[p:PARTICIPATED_IN]->(fr:FundingRound)<-[:RAISED]-(c:Company)
      WITH inv,
           count(DISTINCT fr) AS dealCount,
           sum(CASE WHEN p.role = 'lead' THEN 1 ELSE 0 END) AS leadCount,
           sum(fr.amountUsd) AS totalDeployed,
           collect(DISTINCT c.name)[0..5] AS topPortfolio
      RETURN inv.uuid AS uuid,
             inv.name AS name,
             inv.logoUrl AS logoUrl,
             inv.type AS type,
             inv.hqCity AS hqCity,
             inv.hqCountry AS hqCountry,
             inv.website AS website,
             inv.linkedinUrl AS linkedinUrl,
             inv.foundedYear AS foundedYear,
             inv.aum AS aum,
             COALESCE(inv.stageFocus, []) AS stageFocus,
             COALESCE(inv.sectorFocus, []) AS sectorFocus,
             COALESCE(inv.geoFocus, []) AS geoFocus,
             dealCount,
             leadCount,
             totalDeployed,
             topPortfolio
      `,
      { uuids },
    );
    for (const r of result.records) {
      const uuid = toStr(r.get("uuid")) ?? "";
      if (!uuid) continue;
      map.set(uuid, {
        uuid,
        name: toStr(r.get("name")),
        logoUrl: toStr(r.get("logoUrl")),
        type: toStr(r.get("type")),
        hqCity: toStr(r.get("hqCity")),
        hqCountry: toStr(r.get("hqCountry")),
        website: toStr(r.get("website")),
        linkedinUrl: toStr(r.get("linkedinUrl")),
        foundedYear: toNum(r.get("foundedYear")),
        aum: toStr(r.get("aum")),
        stageFocus: toStrArr(r.get("stageFocus")),
        sectorFocus: toStrArr(r.get("sectorFocus")),
        geoFocus: toStrArr(r.get("geoFocus")),
        dealCount: toNum(r.get("dealCount")) ?? 0,
        leadCount: toNum(r.get("leadCount")) ?? 0,
        totalDeployedUsd: toNum(r.get("totalDeployed")),
        topPortfolio: toStrArr(r.get("topPortfolio")),
      });
    }
  } finally {
    await session.close();
  }
  return map;
}

// ── Company ──────────────────────────────────────────────────────────────

export async function enrichCompanies(uuids: string[]): Promise<Map<string, EnrichedCompany>> {
  const map = new Map<string, EnrichedCompany>();
  if (uuids.length === 0) return map;
  const session = driver().session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(
      `
      MATCH (c:Company)
      WHERE c.uuid IN $uuids
      OPTIONAL MATCH (c)-[:RAISED]->(fr:FundingRound)
      WITH c,
           count(DISTINCT fr) AS roundCount,
           sum(COALESCE(fr.amountUsd, 0)) AS totalFunding,
           min(fr.announcedDate) AS firstRoundDate,
           collect({stage: fr.stage, date: fr.announcedDate}) AS stagesByDate
      OPTIONAL MATCH (c)-[:RAISED]->(fr2:FundingRound)<-[lr:PARTICIPATED_IN {role:'lead'}]-(lead:InvestorOrg)
      WITH c, roundCount, totalFunding, firstRoundDate, stagesByDate,
           collect(DISTINCT lead.name)[0..3] AS topLeads
      OPTIONAL MATCH (c)-[:HQ_IN]->(loc:Location)
      WITH c, roundCount, totalFunding, firstRoundDate, stagesByDate, topLeads,
           collect(loc.name)[0] AS location
      RETURN c.uuid AS uuid,
             c.name AS name,
             c.logoUrl AS logoUrl,
             c.country AS country,
             c.sector AS sector,
             c.status AS status,
             c.website AS website,
             c.linkedinUrl AS linkedinUrl,
             c.foundedYear AS foundedYear,
             c.employeeRange AS employeeRange,
             c.description AS description,
             location,
             roundCount,
             totalFunding,
             firstRoundDate,
             stagesByDate,
             topLeads
      `,
      { uuids },
    );
    for (const r of result.records) {
      const uuid = toStr(r.get("uuid")) ?? "";
      if (!uuid) continue;
      const stagesRaw = (r.get("stagesByDate") as { stage: string | null; date: string | null }[] | null) ?? [];
      const stagesSorted = stagesRaw
        .filter((s) => s.stage)
        .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
      const latestStage = stagesSorted[0]?.stage ?? null;
      const description = toStr(r.get("description"));
      map.set(uuid, {
        uuid,
        name: toStr(r.get("name")),
        logoUrl: toStr(r.get("logoUrl")),
        country: toStr(r.get("country")),
        sector: toStr(r.get("sector")),
        status: toStr(r.get("status")),
        website: toStr(r.get("website")),
        linkedinUrl: toStr(r.get("linkedinUrl")),
        foundedYear: toNum(r.get("foundedYear")),
        employeeRange: toStr(r.get("employeeRange")),
        description: description ? description.slice(0, 240) : null,
        location: toStr(r.get("location")),
        roundCount: toNum(r.get("roundCount")) ?? 0,
        totalFundingUsd: toNum(r.get("totalFunding")),
        firstRoundDate: toStr(r.get("firstRoundDate")),
        latestStage,
        topLeadInvestors: toStrArr(r.get("topLeads")),
      });
    }
  } finally {
    await session.close();
  }
  return map;
}

// ── Round ────────────────────────────────────────────────────────────────

export async function enrichRounds(uuids: string[]): Promise<Map<string, EnrichedRound>> {
  const map = new Map<string, EnrichedRound>();
  if (uuids.length === 0) return map;
  const session = driver().session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(
      `
      MATCH (fr:FundingRound)<-[:RAISED]-(c:Company)
      WHERE fr.uuid IN $uuids
      OPTIONAL MATCH (lead:InvestorOrg)-[:PARTICIPATED_IN {role:'lead'}]->(fr)
      OPTIONAL MATCH (allInv:InvestorOrg)-[:PARTICIPATED_IN]->(fr)
      OPTIONAL MATCH (fr)-[:SOURCED_FROM]->(a:Article)
      WITH fr, c,
           collect(DISTINCT lead.name)[0] AS leadName,
           collect(DISTINCT allInv.name) AS investors,
           collect(DISTINCT {title: a.title, url: a.url, publishedAt: a.publishedAt}) AS rawArticles
      RETURN fr.uuid AS uuid,
             c.name AS companyName,
             c.logoUrl AS companyLogoUrl,
             fr.amountUsd AS amountUsd,
             fr.currency AS currency,
             fr.stage AS stage,
             c.country AS country,
             fr.announcedDate AS announcedDate,
             fr.confidence AS confidence,
             leadName,
             investors,
             rawArticles
      `,
      { uuids },
    );
    for (const r of result.records) {
      const uuid = toStr(r.get("uuid")) ?? "";
      if (!uuid) continue;
      const rawArticles = (r.get("rawArticles") as { title: unknown; url: unknown; publishedAt: unknown }[] | null) ?? [];
      const sourceArticles = rawArticles
        .filter((a) => a.url)
        .slice(0, 5)
        .map((a) => ({
          title: toStr(a.title) ?? "",
          url: toStr(a.url) ?? "",
          publishedAt: toStr(a.publishedAt),
        }));
      map.set(uuid, {
        uuid,
        companyName: toStr(r.get("companyName")),
        companyLogoUrl: toStr(r.get("companyLogoUrl")),
        amountUsd: toNum(r.get("amountUsd")),
        currency: toStr(r.get("currency")),
        stage: toStr(r.get("stage")),
        country: toStr(r.get("country")),
        announcedDate: toStr(r.get("announcedDate")),
        confidence: toNum(r.get("confidence")),
        leadInvestor: toStr(r.get("leadName")),
        investors: toStrArr(r.get("investors")),
        sourceArticles,
      });
    }
  } finally {
    await session.close();
  }
  return map;
}
