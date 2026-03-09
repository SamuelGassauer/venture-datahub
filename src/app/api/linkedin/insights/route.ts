import { NextResponse } from "next/server";
import driver from "@/lib/neo4j";
import { requireAdmin } from "@/lib/api-auth";
import { EUROPE_CYPHER_LIST } from "@/lib/european-countries";

export const dynamic = "force-dynamic";

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "toNumber" in v)
    return (v as { toNumber(): number }).toNumber();
  return 0;
}

function toStr(v: unknown): string | null {
  if (v == null) return null;
  return String(v);
}

export async function GET(request: Request) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const { searchParams } = new URL(request.url);
  const days = Math.min(Math.max(parseInt(searchParams.get("days") || "7", 10), 1), 90);

  // publishedAt is stored as ISO string — use string comparison (works lexicographically)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const db = driver();
  const newSession = () => db.session({ defaultAccessMode: "READ" });

  try {
    const runQuery = async (cypher: string) => {
      const s = newSession();
      try { return await s.run(cypher, { since }); }
      finally { await s.close(); }
    };

    const [recentDeals, topInvestors, stageSummary, countrySummary, sectorTrends] =
      await Promise.all([
        // Recent notable deals (last 30 days, sorted by amount)
        runQuery(`
          MATCH (c:Company)-[:RAISED]->(fr:FundingRound)-[:SOURCED_FROM]->(a:Article)
          WHERE c.country IN ${EUROPE_CYPHER_LIST}
            AND a.publishedAt >= $since
          OPTIONAL MATCH (inv:InvestorOrg)-[rel:PARTICIPATED_IN]->(fr)
          WITH c, fr, a,
               collect(DISTINCT {name: inv.name, role: rel.role}) AS investors
          RETURN c.name AS company, c.country AS country,
                 fr.amountUsd AS amountUsd, fr.stage AS stage,
                 a.publishedAt AS date,
                 [i IN investors WHERE i.name IS NOT NULL | i.name + CASE WHEN i.role = 'lead' THEN ' (Lead)' ELSE '' END] AS investorNames
          ORDER BY fr.amountUsd DESC
          LIMIT 15
        `),

        // Most active investors (last 30 days)
        runQuery(`
          MATCH (inv:InvestorOrg)-[:PARTICIPATED_IN]->(fr:FundingRound)<-[:RAISED]-(c:Company)
          WHERE c.country IN ${EUROPE_CYPHER_LIST}
          MATCH (fr)-[:SOURCED_FROM]->(a:Article)
          WHERE a.publishedAt >= $since
          WITH inv, count(DISTINCT fr) AS deals, collect(DISTINCT c.name)[0..5] AS companies
          WHERE deals > 1
          RETURN inv.name AS investor, deals, companies
          ORDER BY deals DESC
          LIMIT 10
        `),

        // Funding by stage (last 30 days)
        runQuery(`
          MATCH (c:Company)-[:RAISED]->(fr:FundingRound)-[:SOURCED_FROM]->(a:Article)
          WHERE c.country IN ${EUROPE_CYPHER_LIST}
            AND a.publishedAt >= $since
          RETURN fr.stage AS stage, count(fr) AS count, sum(fr.amountUsd) AS totalUsd
          ORDER BY totalUsd DESC
        `),

        // Funding by country (last 30 days)
        runQuery(`
          MATCH (c:Company)-[:RAISED]->(fr:FundingRound)-[:SOURCED_FROM]->(a:Article)
          WHERE c.country IN ${EUROPE_CYPHER_LIST}
            AND a.publishedAt >= $since
          RETURN c.country AS country, count(fr) AS deals, sum(fr.amountUsd) AS totalUsd
          ORDER BY totalUsd DESC
          LIMIT 10
        `),

        // Sector trends (last 30 days)
        runQuery(`
          MATCH (c:Company)-[:RAISED]->(fr:FundingRound)-[:SOURCED_FROM]->(a:Article)
          WHERE c.country IN ${EUROPE_CYPHER_LIST}
            AND a.publishedAt >= $since
            AND c.sector IS NOT NULL
          UNWIND c.sector AS sector
          RETURN sector, count(fr) AS deals, sum(fr.amountUsd) AS totalUsd
          ORDER BY totalUsd DESC
          LIMIT 10
        `),
      ]);

    return NextResponse.json({
      days,
      since: since.substring(0, 10),
      recentDeals: recentDeals.records.map((r) => ({
        company: toStr(r.get("company")),
        country: toStr(r.get("country")),
        amountUsd: toNum(r.get("amountUsd")),
        stage: toStr(r.get("stage")),
        date: toStr(r.get("date"))?.substring(0, 10),
        investors: r.get("investorNames") as string[],
      })),
      topInvestors: topInvestors.records.map((r) => ({
        investor: toStr(r.get("investor")),
        deals: toNum(r.get("deals")),
        companies: r.get("companies") as string[],
      })),
      stageSummary: stageSummary.records.map((r) => ({
        stage: toStr(r.get("stage")),
        count: toNum(r.get("count")),
        totalUsd: toNum(r.get("totalUsd")),
      })),
      countrySummary: countrySummary.records.map((r) => ({
        country: toStr(r.get("country")),
        deals: toNum(r.get("deals")),
        totalUsd: toNum(r.get("totalUsd")),
      })),
      sectorTrends: sectorTrends.records.map((r) => ({
        sector: toStr(r.get("sector")),
        deals: toNum(r.get("deals")),
        totalUsd: toNum(r.get("totalUsd")),
      })),
    });
  } catch (error) {
    console.error("linkedin insights error:", error);
    return NextResponse.json({ error: "Failed to fetch insights" }, { status: 500 });
  }
}
