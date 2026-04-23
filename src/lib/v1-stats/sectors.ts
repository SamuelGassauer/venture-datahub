import driver from "@/lib/neo4j";
import { EUROPE_CYPHER_LIST } from "@/lib/european-countries";

export type SubsectorEntry = {
  label: string;
  startupCount: number;
  recentRoundCount: number;
};

export type SectorEntry = {
  primary: string;
  startupCount: number;
  recentRoundCount: number;
  recentAmountUsd: number;
  subsectors: SubsectorEntry[];
};

export type SectorCatalog = {
  entries: SectorEntry[];
  totalStartups: number;
  windowDays: number;
};

export type SectorCatalogOptions = {
  windowDays?: number;
  country?: string | null;
  /**
   * When set, restricts the recent-activity subquery to these FundingRound
   * Neo4j internal IDs (i.e. only "posted" rounds). `null` means no restriction;
   * `[]` means posted mode but no posts exist yet — caller should handle early
   * return, but we still behave correctly (returns zeros).
   */
  postedRoundIds?: number[] | null;
};

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "toNumber" in v) return (v as { toNumber(): number }).toNumber();
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toStr(v: unknown): string | null {
  if (v == null) return null;
  return String(v);
}

/**
 * Compute the sector catalog (primary sectors with subsector breakdown, recent
 * activity window) directly from Neo4j. Shared by /api/v1/sectors/catalog and
 * /api/v1/stats/sectors so both paths return identical numbers.
 */
export async function computeSectorCatalog(
  opts: SectorCatalogOptions = {},
): Promise<SectorCatalog> {
  const windowDaysRaw = opts.windowDays ?? 90;
  const windowDays = Number.isFinite(windowDaysRaw) && windowDaysRaw > 0
    ? Math.min(windowDaysRaw, 365 * 5)
    : 90;
  const country = opts.country ?? null;
  const postedRoundIds = opts.postedRoundIds ?? null;

  // Early out when posted-mode is active but there's nothing posted yet.
  if (postedRoundIds && postedRoundIds.length === 0) {
    return { entries: [], totalStartups: 0, windowDays };
  }

  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const sinceYmd = since.toISOString().slice(0, 10);

  let countryClause = "";
  const params: Record<string, unknown> = { sinceYmd };
  if (country && country.toLowerCase() !== "all") {
    countryClause = "AND c.country = $country";
    params.country = country;
  } else if (!country) {
    countryClause = `AND c.country IN ${EUROPE_CYPHER_LIST}`;
  }

  const postedFrFilter = postedRoundIds ? `AND id(fr) IN $postedRoundIds` : "";
  if (postedRoundIds) params.postedRoundIds = postedRoundIds;

  const normalizeSectorArr = `
    WITH c,
         CASE WHEN c.sector IS NULL THEN [] ELSE [] + c.sector END AS _baseSector
    WITH c, _baseSector +
         CASE WHEN c.subsector IS NOT NULL AND NOT c.subsector IN _baseSector
              THEN [c.subsector] ELSE [] END AS sectorArr
  `;

  // One session per concurrent query — a single Neo4j session serializes
  // transactions, so Promise.all on one session throws 50N42.
  const runRead = async (cypher: string) => {
    const s = driver().session({ defaultAccessMode: "READ" });
    try {
      return await s.run(cypher, params);
    } finally {
      await s.close();
    }
  };

  const recentRoundsSubquery = `
    CALL {
      WITH c
      OPTIONAL MATCH (c)-[:RAISED]->(fr:FundingRound)
      OPTIONAL MATCH (fr)-[:SOURCED_FROM]->(a:Article)
      WITH fr, COALESCE(fr.announcedDate, min(a.publishedAt)) AS effDate
      WITH fr, effDate
      WHERE fr IS NOT NULL AND effDate IS NOT NULL AND effDate >= $sinceYmd ${postedFrFilter}
      RETURN count(fr) AS rrc, sum(COALESCE(fr.amountUsd, 0.0)) AS rra
    }
  `;

  const [primaryRes, subRes, totalsRes] = await Promise.all([
    runRead(`
      MATCH (c:Company)
      WHERE c.sector IS NOT NULL ${countryClause}
      ${normalizeSectorArr}
      WITH c, sectorArr
      WHERE size(sectorArr) > 0
      WITH c, sectorArr[0] AS primary
      ${recentRoundsSubquery}
      RETURN primary,
             count(DISTINCT c) AS startupCount,
             sum(rrc) AS recentRoundCount,
             sum(rra) AS recentAmountUsd
      ORDER BY recentRoundCount DESC, startupCount DESC
    `),
    runRead(`
      MATCH (c:Company)
      WHERE c.sector IS NOT NULL ${countryClause}
      ${normalizeSectorArr}
      WITH c, sectorArr
      WHERE size(sectorArr) >= 2
      WITH c, sectorArr[0] AS primary, sectorArr[1..] AS subs
      UNWIND subs AS sub
      WITH primary, sub, c
      ${recentRoundsSubquery}
      RETURN primary, sub AS label,
             count(DISTINCT c) AS startupCount,
             sum(rrc) AS recentRoundCount
    `),
    runRead(`
      MATCH (c:Company) ${countryClause ? `WHERE 1=1 ${countryClause}` : ""}
      RETURN count(c) AS total
    `),
  ]);

  const entriesMap = new Map<string, SectorEntry>();
  for (const rec of primaryRes.records) {
    const primary = toStr(rec.get("primary"));
    if (!primary) continue;
    entriesMap.set(primary, {
      primary,
      startupCount: toNum(rec.get("startupCount")),
      recentRoundCount: toNum(rec.get("recentRoundCount")),
      recentAmountUsd: toNum(rec.get("recentAmountUsd")),
      subsectors: [],
    });
  }

  for (const rec of subRes.records) {
    const primary = toStr(rec.get("primary"));
    const label = toStr(rec.get("label"));
    if (!primary || !label) continue;
    const entry = entriesMap.get(primary);
    if (!entry) continue;
    entry.subsectors.push({
      label,
      startupCount: toNum(rec.get("startupCount")),
      recentRoundCount: toNum(rec.get("recentRoundCount")),
    });
  }

  const entries = Array.from(entriesMap.values())
    .sort((a, b) => b.recentRoundCount - a.recentRoundCount || b.startupCount - a.startupCount);
  for (const entry of entries) {
    entry.subsectors.sort(
      (a, b) => b.recentRoundCount - a.recentRoundCount || b.startupCount - a.startupCount,
    );
  }

  return {
    entries,
    totalStartups: toNum(totalsRes.records[0]?.get("total")),
    windowDays,
  };
}
