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
      MATCH (c:Company)-[:RAISED]->(fr:FundingRound)
      OPTIONAL MATCH (lead:InvestorOrg)-[:PARTICIPATED_IN {role: 'lead'}]->(fr)
      OPTIONAL MATCH (participant:InvestorOrg)-[:PARTICIPATED_IN]->(fr)
      OPTIONAL MATCH (fr)-[:SOURCED_FROM]->(a:Article)
      WITH c, fr,
           collect(DISTINCT lead.name)[0] AS leadInvestor,
           count(DISTINCT participant) AS investorCount,
           collect(DISTINCT a.publishedAt) AS dates
      RETURN c.name AS company,
             c.country AS country,
             fr.amountUsd AS amount,
             fr.stage AS stage,
             leadInvestor,
             investorCount,
             dates[0] AS publishedAt
      ORDER BY fr.amountUsd DESC
    `);

    return NextResponse.json({ data: parseRecords(result.records) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch funding rounds" },
      { status: 500 }
    );
  } finally {
    await session.close();
  }
}
