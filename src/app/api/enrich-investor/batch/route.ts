import { NextRequest, NextResponse } from "next/server";
import neo4j from "neo4j-driver";
import { enrichInvestor } from "@/lib/investor-enricher";
import { requireAdmin } from "@/lib/api-auth";
import driver from "@/lib/neo4j";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  try {
    const body = await request.json();
    const {
      investors,
      filter,
      force = false,
      limit = 50,
    } = body as {
      investors?: string[];
      filter?: "unenriched" | "missing-hq" | "all";
      force?: boolean;
      limit?: number;
    };

    const cap = Math.min(Math.max(limit, 1), 200);
    let names: string[] = [];

    if (investors && Array.isArray(investors) && investors.length > 0) {
      names = investors.slice(0, cap);
    } else {
      // Query Neo4j for investors matching the filter
      const session = driver().session({ defaultAccessMode: "READ" });
      try {
        let cypher: string;
        if (filter === "missing-hq") {
          cypher = `
            MATCH (inv:InvestorOrg)-[:PARTICIPATED_IN]->(:FundingRound)
            WHERE inv.hqCity IS NULL AND inv.hqCountry IS NULL
            WITH inv, count(*) AS deals
            WHERE deals > 0
            RETURN inv.name AS name
            ORDER BY deals DESC
            LIMIT $limit
          `;
        } else if (filter === "all") {
          cypher = `
            MATCH (inv:InvestorOrg)-[:PARTICIPATED_IN]->(:FundingRound)
            WITH inv, count(*) AS deals
            WHERE deals > 0
            RETURN inv.name AS name
            ORDER BY deals DESC
            LIMIT $limit
          `;
        } else {
          // "unenriched" — default
          cypher = `
            MATCH (inv:InvestorOrg)-[:PARTICIPATED_IN]->(:FundingRound)
            WHERE inv.enrichedAt IS NULL
            WITH inv, count(*) AS deals
            WHERE deals > 0
            RETURN inv.name AS name
            ORDER BY deals DESC
            LIMIT $limit
          `;
        }
        const result = await session.run(cypher, { limit: neo4j.int(cap) });
        names = result.records.map((r) => r.get("name") as string);
      } finally {
        await session.close();
      }
    }

    if (names.length === 0) {
      return NextResponse.json({ message: "No investors to enrich", results: [] });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        send({ type: "start", total: names.length });

        const results: { name: string; status: string; fields: number }[] = [];

        for (let i = 0; i < names.length; i++) {
          const name = names[i];
          send({ type: "progress", index: i, name, status: "enriching" });

          try {
            let fieldsUpdated = 0;
            await enrichInvestor(name, (progress) => {
              if (progress.stage === "save" && progress.message?.includes("field")) {
                const match = progress.message.match(/(\d+) field/);
                if (match) fieldsUpdated = parseInt(match[1]);
              }
              send({ type: "detail", index: i, name, ...progress });
            }, force);

            results.push({ name, status: "done", fields: fieldsUpdated });
            send({ type: "progress", index: i, name, status: "done", fields: fieldsUpdated });
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed";
            results.push({ name, status: "error", fields: 0 });
            send({ type: "progress", index: i, name, status: "error", error: msg });
          }
        }

        send({ type: "complete", results });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("batch-enrich error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}
