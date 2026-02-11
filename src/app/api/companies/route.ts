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
      obj[key] = toNumber(record.get(key));
    });
    return obj;
  });
}

export async function GET() {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(`
      MATCH (c:Company)
      OPTIONAL MATCH (c)-[:RAISED]->(fr:FundingRound)
      WITH c,
           count(fr) AS roundCount,
           collect(fr.stage) AS stages,
           max(fr.amountUsd) AS maxRoundAmount,
           collect(fr) AS allRounds
      OPTIONAL MATCH (c)-[:HQ_IN]->(loc:Location)
      WITH c, roundCount, stages, collect(loc.name)[0] AS location,
           reduce(s = 0, r IN allRounds | s + COALESCE(r.amountUsd, 0)) AS calcTotalFunding
      WITH c, roundCount, stages, location, calcTotalFunding,
           (CASE WHEN c.description IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN c.website IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN c.foundedYear IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN c.employeeRange IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN c.linkedinUrl IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN c.country IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN c.status IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN location IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN c.logoUrl IS NOT NULL THEN 1 ELSE 0 END) AS enrichScore
      RETURN c.name AS name,
             c.country AS country,
             COALESCE(c.totalFundingUsd, calcTotalFunding) AS totalFunding,
             roundCount,
             location,
             stages[-1] AS lastStage,
             c.status AS status,
             c.description AS description,
             c.website AS website,
             c.foundedYear AS foundedYear,
             c.employeeRange AS employeeRange,
             c.linkedinUrl AS linkedinUrl,
             c.logoUrl AS logoUrl,
             enrichScore
      ORDER BY totalFunding DESC
    `);

    return NextResponse.json({ data: parseRecords(result.records) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch companies" },
      { status: 500 }
    );
  } finally {
    await session.close();
  }
}
