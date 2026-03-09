import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { generateCypherQueries, executeCypherQueries } from "@/lib/graph-rag";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { question } = await request.json();

    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    // Step 1: Generate Cypher queries with Sonnet
    const genStart = Date.now();
    const { queries, reasoning } = await generateCypherQueries(question, {
      today: new Date().toISOString().substring(0, 10),
    });
    const genMs = Date.now() - genStart;

    // Step 2: Execute queries against Neo4j
    const execStart = Date.now();
    const results = await executeCypherQueries(queries);
    const execMs = Date.now() - execStart;

    return NextResponse.json({
      reasoning,
      queries: queries.map((q, i) => ({
        label: q.label,
        cypher: q.cypher,
        params: q.params,
        rowCount: results[i].data.length,
        error: results[i].error,
      })),
      results,
      timing: { cypherGenerationMs: genMs, queryExecutionMs: execMs },
    });
  } catch (error) {
    console.error("linkedin query error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Query failed" },
      { status: 500 }
    );
  }
}
