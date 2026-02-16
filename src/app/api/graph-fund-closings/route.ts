import { NextResponse } from "next/server";
import driver from "@/lib/neo4j";
import { requireAuth } from "@/lib/api-auth";

function toNumber(value: unknown): unknown {
  return typeof value === "object" && value !== null && "toNumber" in value
    ? (value as { toNumber(): number }).toNumber()
    : value;
}

function parseRecords(records: import("neo4j-driver").Record[]) {
  return records.map((record) => {
    const obj: Record<string, unknown> = {};
    (record.keys as string[]).forEach((key) => {
      const val = record.get(key);
      obj[key] = Array.isArray(val) ? val.map(toNumber) : toNumber(val);
    });
    return obj;
  });
}

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(`
      MATCH (i:InvestorOrg)-[:MANAGES]->(f:Fund)
      OPTIONAL MATCH (i)-[:HQ_IN]->(l:Location)
      OPTIONAL MATCH (f)-[:SOURCED_FROM]->(a:Article)
      OPTIONAL MATCH (i)-[:PARTICIPATED_IN]->(fr:FundingRound)
      OPTIONAL MATCH (pc:Company)-[:RAISED]->(fr)
      WITH i, f,
           collect(DISTINCT l.name)[0] AS country,
           count(DISTINCT a) AS sourceCount,
           collect(DISTINCT a.publishedAt) AS dates,
           count(DISTINCT fr) AS dealCount,
           collect(DISTINCT pc.name) AS portfolioCompanies
      RETURN f.fundKey AS fundKey,
             i.name AS firm,
             f.name AS fundName,
             f.sizeUsd AS sizeUsd,
             f.type AS fundType,
             f.vintage AS vintage,
             f.status AS status,
             country,
             sourceCount,
             dates[0] AS publishedAt,
             i.logoUrl AS logoUrl,
             i.website AS website,
             COALESCE(i.stageFocus, []) AS stageFocus,
             COALESCE(i.sectorFocus, []) AS sectorFocus,
             COALESCE(i.geoFocus, []) AS geoFocus,
             i.hq AS hq,
             dealCount,
             portfolioCompanies[0..5] AS portfolioCompanies
      ORDER BY f.sizeUsd DESC
    `);

    return NextResponse.json({ data: parseRecords(result.records) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch fund closings" },
      { status: 500 }
    );
  } finally {
    await session.close();
  }
}
