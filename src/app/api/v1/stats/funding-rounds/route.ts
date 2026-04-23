import { NextRequest, NextResponse } from "next/server";
import driver from "@/lib/neo4j";
import { requireApiKey } from "@/lib/api-auth";
import { EUROPE_CYPHER_LIST } from "@/lib/european-countries";

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
  const stage = searchParams.get("stage");
  const hqCountry = searchParams.get("hq_country") || searchParams.get("country");
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");

  // Effective date matches /v1/funding-rounds: COALESCE(fr.announcedDate, min(article.publishedAt))
  // Filters that only touch FundingRound / Company props go into the base WHERE.
  // Filters that depend on `effDate` go into a follow-up WITH ... WHERE block.
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (stage) { conditions.push(`toLower(fr.stage) = toLower($stage)`); params.stage = stage; }
  if (sectorFocus) {
    conditions.push(`(
      ANY(s IN COALESCE(c.sector, []) WHERE toLower(s) = toLower($sectorFocus))
      OR toLower(COALESCE(c.subsector, '')) = toLower($sectorFocus)
    )`);
    params.sectorFocus = sectorFocus;
  }

  if (hqCountry && hqCountry.toLowerCase() !== "all") {
    conditions.push(`c.country = $hqCountry`);
    params.hqCountry = hqCountry;
  } else if (!hqCountry) {
    conditions.push(`c.country IN ${EUROPE_CYPHER_LIST}`);
  }

  const baseWhere = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const dateConditions: string[] = ["effDate IS NOT NULL"];
  if (dateFrom) { dateConditions.push(`effDate >= $dateFrom`); params.dateFrom = dateFrom; }
  if (dateTo) { dateConditions.push(`effDate <= $dateTo`); params.dateTo = dateTo; }
  const dateWhere = `WHERE ${dateConditions.join(" AND ")}`;

  const runRead = async (cypher: string) => {
    const s = driver().session({ defaultAccessMode: "READ" });
    try {
      return await s.run(cypher, params);
    } finally {
      await s.close();
    }
  };

  // Reusable subquery that resolves the effective date, applied after base filters.
  const effDateBlock = `
    OPTIONAL MATCH (fr)-[:SOURCED_FROM]->(a:Article)
    WITH fr, c, COALESCE(fr.announcedDate, min(a.publishedAt)) AS effDate
    ${dateWhere}
  `;

  try {
    const [totalsRes, stageRes, geoRes, dateRangeRes] = await Promise.all([
      runRead(`
        MATCH (fr:FundingRound)<-[:RAISED]-(c:Company)
        ${baseWhere}
        ${effDateBlock}
        WITH fr
        RETURN count(fr) AS roundCount,
               sum(COALESCE(fr.amountUsd, 0.0)) AS totalCapitalUsd,
               percentileCont(fr.amountUsd, 0.5) AS medianRoundUsd,
               percentileCont(fr.amountUsd, 0.25) AS p25RoundUsd,
               percentileCont(fr.amountUsd, 0.75) AS p75RoundUsd,
               sum(CASE WHEN fr.amountUsd IS NOT NULL THEN 1 ELSE 0 END) AS amountSampleSize
      `),
      runRead(`
        MATCH (fr:FundingRound)<-[:RAISED]-(c:Company)
        ${baseWhere}
        ${effDateBlock}
        WITH fr
        WHERE fr.stage IS NOT NULL
        RETURN fr.stage AS stage,
               count(fr) AS roundCount,
               percentileCont(fr.amountUsd, 0.5) AS medianUsd
        ORDER BY roundCount DESC
      `),
      runRead(`
        MATCH (fr:FundingRound)<-[:RAISED]-(c:Company)
        ${baseWhere}
        ${effDateBlock}
        WITH c, fr
        WHERE c.country IS NOT NULL
        RETURN c.country AS country, count(fr) AS roundCount
        ORDER BY roundCount DESC
      `),
      runRead(`
        MATCH (fr:FundingRound)<-[:RAISED]-(c:Company)
        ${baseWhere}
        ${effDateBlock}
        RETURN min(effDate) AS earliestDate, max(effDate) AS latestDate
      `),
    ]);

    const summaryRow = totalsRes.records[0];

    const stageMix = stageRes.records.map((r) => ({
      stage: toStr(r.get("stage")),
      roundCount: toNumOrZero(r.get("roundCount")),
      medianUsd: toNum(r.get("medianUsd")),
    }));

    const geoMix = geoRes.records.map((r) => ({
      country: toStr(r.get("country")),
      roundCount: toNumOrZero(r.get("roundCount")),
    }));

    const dateRow = dateRangeRes.records[0];

    return NextResponse.json(
      {
        roundCount: toNumOrZero(summaryRow?.get("roundCount")),
        totalCapitalUsd: toNumOrZero(summaryRow?.get("totalCapitalUsd")),
        medianRoundUsd: toNum(summaryRow?.get("medianRoundUsd")),
        p25RoundUsd: toNum(summaryRow?.get("p25RoundUsd")),
        p75RoundUsd: toNum(summaryRow?.get("p75RoundUsd")),
        amountSampleSize: toNumOrZero(summaryRow?.get("amountSampleSize")),
        stageMix,
        geoMix,
        earliestDate: toStr(dateRow?.get("earliestDate")),
        latestDate: toStr(dateRow?.get("latestDate")),
        computedAt: new Date().toISOString(),
      },
      {
        headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=300" },
      },
    );
  } catch (error) {
    console.error("v1/stats/funding-rounds error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
