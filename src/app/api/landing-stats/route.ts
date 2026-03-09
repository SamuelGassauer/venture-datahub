import { NextResponse } from "next/server";
import driver from "@/lib/neo4j";
import { EUROPE_CYPHER_LIST } from "@/lib/european-countries";

export const dynamic = "force-dynamic";
export const revalidate = 3600; // cache for 1 hour

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "toNumber" in v) return (v as { toNumber(): number }).toNumber();
  return 0;
}

export async function GET() {
  const session = driver().session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(`
      MATCH (inv:InvestorOrg)-[:PARTICIPATED_IN]->(fr:FundingRound)<-[:RAISED]-(c:Company)
      WHERE c.country IN ${EUROPE_CYPHER_LIST}
      WITH count(DISTINCT inv) AS investors,
           count(DISTINCT c) AS startups,
           count(DISTINCT fr) AS rounds,
           collect(DISTINCT c.country) AS countries,
           REDUCE(acc = [], s IN collect(DISTINCT c.sector) | CASE WHEN s IS NOT NULL THEN acc + s ELSE acc END) AS rawSectors
      RETURN investors, startups, rounds, size(countries) AS regions,
             [s IN rawSectors WHERE s IS NOT NULL | s] AS sectors
    `);

    const row = result.records[0];
    const sectors = (row.get("sectors") as string[])
      .flatMap((s) => (typeof s === "string" ? [s] : []))
      .filter(Boolean);

    // Count sector frequency and get top ones
    const sectorCount: Record<string, number> = {};
    for (const s of sectors) {
      const normalized = s.toUpperCase().trim();
      if (normalized) sectorCount[normalized] = (sectorCount[normalized] || 0) + 1;
    }
    const topSectors = Object.entries(sectorCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name]) => name);

    return NextResponse.json({
      investors: toNum(row.get("investors")),
      startups: toNum(row.get("startups")),
      rounds: toNum(row.get("rounds")),
      regions: toNum(row.get("regions")),
      sectors: topSectors,
    }, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
    });
  } catch (error) {
    console.error("landing-stats error:", error);
    // Fallback values if DB is down
    return NextResponse.json({
      investors: 0,
      startups: 0,
      rounds: 0,
      regions: 0,
      sectors: [],
    });
  } finally {
    await session.close();
  }
}
