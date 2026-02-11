import { NextResponse } from "next/server";
import driver from "@/lib/neo4j";

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
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(`
      MATCH (inv:InvestorOrg)-[p:PARTICIPATED_IN]->(fr:FundingRound)
      OPTIONAL MATCH (c:Company)-[:RAISED]->(fr)
      WITH inv, count(DISTINCT fr) AS dealCount,
           sum(CASE WHEN p.role = 'lead' THEN 1 ELSE 0 END) AS leadCount,
           sum(fr.amountUsd) AS totalDeployed,
           collect(DISTINCT c.name) AS companies,
           (CASE WHEN inv.type IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN inv.website IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN inv.linkedinUrl IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN inv.foundedYear IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN inv.logoUrl IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN inv.aum IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN inv.hq IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN size(COALESCE(inv.stageFocus, [])) > 0 THEN 1 ELSE 0 END +
            CASE WHEN size(COALESCE(inv.sectorFocus, [])) > 0 THEN 1 ELSE 0 END +
            CASE WHEN size(COALESCE(inv.geoFocus, [])) > 0 THEN 1 ELSE 0 END +
            CASE WHEN inv.checkSizeMinUsd IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN inv.checkSizeMaxUsd IS NOT NULL THEN 1 ELSE 0 END) AS enrichScore
      RETURN inv.name AS name, dealCount, leadCount,
             totalDeployed, companies[0..5] AS portfolioCompanies,
             inv.logoUrl AS logoUrl,
             enrichScore
      ORDER BY dealCount DESC
    `);

    return NextResponse.json({ data: parseRecords(result.records) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch investors" },
      { status: 500 }
    );
  } finally {
    await session.close();
  }
}
