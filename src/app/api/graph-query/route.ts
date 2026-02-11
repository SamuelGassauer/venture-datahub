import { NextRequest, NextResponse } from "next/server";
import driver from "@/lib/neo4j";

const FORBIDDEN_KEYWORDS = /\b(CREATE|DELETE|SET|MERGE|REMOVE|DROP|DETACH|CALL\s*\{)\b/i;

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Missing query" }, { status: 400 });
    }

    if (FORBIDDEN_KEYWORDS.test(query)) {
      return NextResponse.json(
        { error: "Only read queries are allowed (MATCH, RETURN, WITH, WHERE, ORDER BY)" },
        { status: 403 }
      );
    }

    const session = driver.session({ defaultAccessMode: "READ" });
    try {
      const result = await session.run(query);
      const records = result.records.map((record) => {
        const obj: Record<string, unknown> = {};
        (record.keys as string[]).forEach((key) => {
          const value = record.get(key);
          // Convert Neo4j integers to JS numbers
          obj[key] = typeof value === "object" && value !== null && "toNumber" in value
            ? (value as { toNumber(): number }).toNumber()
            : value;
        });
        return obj;
      });
      return NextResponse.json({ records, count: records.length });
    } finally {
      await session.close();
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Query failed" },
      { status: 500 }
    );
  }
}
