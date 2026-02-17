import { NextResponse } from "next/server";
import driver from "@/lib/neo4j";
import { requireAuth } from "@/lib/api-auth";
import { EUROPE_CYPHER_LIST } from "@/lib/european-countries";

export const dynamic = "force-dynamic";

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
  const session = driver().session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(`
      MATCH (c:Company)-[:HAS_METRIC]->(v:Valuation)
      WHERE c.country IN ${EUROPE_CYPHER_LIST}
      OPTIONAL MATCH (v)-[:SOURCED_FROM]->(a:Article)
      WITH c, v,
           count(DISTINCT a) AS sourceCount,
           collect(DISTINCT a.publishedAt) AS dates
      RETURN v.valuationKey AS valuationKey,
             c.name AS company,
             c.normalizedName AS companyNorm,
             v.metricType AS metricType,
             v.valueUsd AS valueUsd,
             v.unit AS unit,
             v.period AS period,
             v.confidence AS confidence,
             sourceCount,
             dates[0] AS publishedAt
      ORDER BY v.valueUsd DESC
    `);

    return NextResponse.json({ data: parseRecords(result.records) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch valuations" },
      { status: 500 }
    );
  } finally {
    await session.close();
  }
}
