import { NextRequest, NextResponse } from "next/server";
import driver from "@/lib/neo4j";
import { requireApiKey } from "@/lib/api-auth";
import { EUROPE_CYPHER_LIST } from "@/lib/european-countries";
import { getPostedRoundIds, parsePostedMode } from "@/lib/posted-rounds";

export const dynamic = "force-dynamic";
export const revalidate = 1800;

function toNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "toNumber" in v) return (v as { toNumber(): number }).toNumber();
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toNumOrZero(v: unknown): number {
  return toNum(v) ?? 0;
}

function toStr(v: unknown): string | null {
  if (v == null) return null;
  return String(v);
}

export async function GET(request: NextRequest) {
  const authError = await requireApiKey(request, "data-provider", { allowPublic: true });
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const sectorFocus = searchParams.get("sector_focus") || searchParams.get("sector");
  const hqCountry = searchParams.get("hq_country");
  const investorType = searchParams.get("investor_type") || searchParams.get("type");
  const activeSince = searchParams.get("active_since");

  // Investor-side filters (applied on inv node directly)
  const invConditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (hqCountry && hqCountry.toLowerCase() !== "all") {
    invConditions.push(`(inv.hqCountry = $hqCountry OR inv.country = $hqCountry)`);
    params.hqCountry = hqCountry;
  }
  if (investorType) {
    invConditions.push(`toLower(inv.type) = toLower($investorType)`);
    params.investorType = investorType;
  }

  const postedMode = parsePostedMode(searchParams);
  const postedIds = postedMode === "posted" ? await getPostedRoundIds() : null;
  if (postedIds && postedIds.length === 0) {
    return NextResponse.json({
      investorCount: 0, activeInvestorCount: 0,
      typeMix: [], topByActivity: [],
      computedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=300" } });
  }

  // Deal-side filters (applied on portfolio company + round). Defaults Europe-only
  // unless caller restricts investor HQ country explicitly.
  const dealConditions: string[] = [];
  if (sectorFocus) {
    dealConditions.push(`(
      ANY(s IN COALESCE(c.sector, []) WHERE toLower(s) = toLower($sectorFocus))
      OR toLower(COALESCE(c.subsector, '')) = toLower($sectorFocus)
    )`);
    params.sectorFocus = sectorFocus;
  }
  if (!hqCountry) {
    dealConditions.push(`c.country IN ${EUROPE_CYPHER_LIST}`);
  }
  if (postedIds) {
    dealConditions.push(`id(fr) IN $postedIds`);
    params.postedIds = postedIds;
  }
  if (activeSince) params.activeSince = activeSince;

  const invWhere = invConditions.length ? `WHERE ${invConditions.join(" AND ")}` : "";
  const dealWhere = dealConditions.length ? `WHERE ${dealConditions.join(" AND ")}` : "";

  // Investors count as "active" when they have ≥1 deal whose effective date
  // (COALESCE(announcedDate, earliest SOURCED_FROM article)) is on/after activeSince.
  const activeDealFilter = activeSince
    ? `effDate IS NOT NULL AND effDate >= $activeSince`
    : "true";

  const runRead = async (cypher: string) => {
    const s = driver().session({ defaultAccessMode: "READ" });
    try {
      return await s.run(cypher, params);
    } finally {
      await s.close();
    }
  };

  try {
    const [countsRes, typeMixRes, topRes] = await Promise.all([
      // investorCount = investors matching invWhere AND ≥1 deal matching dealWhere
      // activeInvestorCount = same pool restricted to ≥1 deal passing activeDealFilter
      runRead(`
        MATCH (inv:InvestorOrg)
        ${invWhere}
        WITH inv
        MATCH (inv)-[rel:PARTICIPATED_IN]->(fr:FundingRound)<-[:RAISED]-(c:Company)
        ${dealWhere}
        OPTIONAL MATCH (fr)-[:SOURCED_FROM]->(a:Article)
        WITH inv, fr, COALESCE(fr.announcedDate, min(a.publishedAt)) AS effDate
        WITH inv,
             count(DISTINCT fr) AS totalDeals,
             count(DISTINCT CASE WHEN ${activeDealFilter} THEN fr END) AS activeDeals
        WHERE totalDeals > 0
        RETURN count(inv) AS investorCount,
               sum(CASE WHEN activeDeals > 0 THEN 1 ELSE 0 END) AS activeInvestorCount
      `),
      // typeMix is independent of deal filters — it describes the investor universe
      // matching invWhere. Consistent with the list endpoint's treatment of type.
      runRead(`
        MATCH (inv:InvestorOrg)
        ${invWhere}
        WITH COALESCE(inv.type, 'unknown') AS type, inv
        RETURN type, count(inv) AS count
        ORDER BY count DESC
      `),
      // topByActivity: top 20 investors by dealCount within the filtered pool
      runRead(`
        MATCH (inv:InvestorOrg)
        ${invWhere}
        WITH inv
        MATCH (inv)-[rel:PARTICIPATED_IN]->(fr:FundingRound)<-[:RAISED]-(c:Company)
        ${dealWhere}
        OPTIONAL MATCH (fr)-[:SOURCED_FROM]->(a:Article)
        WITH inv, rel, fr, COALESCE(fr.announcedDate, min(a.publishedAt)) AS effDate
        WHERE ${activeDealFilter}
        WITH inv,
             count(DISTINCT fr) AS dealCount,
             sum(CASE WHEN toLower(rel.role) = 'lead' THEN 1 ELSE 0 END) AS leadCount
        WHERE dealCount > 0
        OPTIONAL MATCH (inv)-[:HQ_IN]->(loc:Location)
        WITH inv, dealCount, leadCount, collect(DISTINCT loc.name)[0] AS hqLoc
        RETURN inv.uuid AS externalId,
               inv.normalizedName AS normalizedName,
               inv.name AS name,
               inv.hqCity AS hqCity,
               COALESCE(inv.hqCountry, inv.country, hqLoc) AS hqCountry,
               dealCount, leadCount
        ORDER BY dealCount DESC, leadCount DESC, inv.name ASC
        LIMIT 20
      `),
    ]);

    const countsRow = countsRes.records[0];

    const typeMix = typeMixRes.records.map((r) => ({
      type: toStr(r.get("type")),
      count: toNumOrZero(r.get("count")),
    }));

    const topByActivity = topRes.records.map((r) => {
      const city = toStr(r.get("hqCity"));
      const country = toStr(r.get("hqCountry"));
      return {
        externalId: toStr(r.get("externalId")) || toStr(r.get("normalizedName")),
        name: toStr(r.get("name")),
        hq: city && country ? `${city}, ${country}` : city || country,
        dealCount: toNumOrZero(r.get("dealCount")),
        leadCount: toNumOrZero(r.get("leadCount")),
      };
    });

    return NextResponse.json(
      {
        investorCount: toNumOrZero(countsRow?.get("investorCount")),
        activeInvestorCount: toNumOrZero(countsRow?.get("activeInvestorCount")),
        typeMix,
        topByActivity,
        computedAt: new Date().toISOString(),
      },
      {
        headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=300" },
      },
    );
  } catch (error) {
    console.error("v1/stats/investors error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
