import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { syncSingleRoundToGraph } from "@/lib/graph-sync";

/**
 * POST /api/funding/historical-ingest
 *
 * Step 4 of the historical funding enrichment flow.
 * Takes confirmed rounds (from the review step) and syncs them to Neo4j.
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  try {
    const body = await request.json();
    const { rounds } = body as {
      rounds: {
        companyName: string;
        amount: number | null;
        amountUsd: number | null;
        currency: string;
        fxRate: number | null;
        stage: string | null;
        investors: string[];
        leadInvestor: string | null;
        country: string | null;
        confidence: number;
        announcedDate: string | null;
        articles: { url: string; title: string }[];
      }[];
    };

    if (!rounds?.length) {
      return NextResponse.json(
        { error: "rounds[] required" },
        { status: 400 }
      );
    }

    const results: {
      stage: string | null;
      companyName: string;
      success: boolean;
      error?: string;
      nodes?: string[];
      edges?: string[];
    }[] = [];

    for (const round of rounds) {
      try {
        const summary = await syncSingleRoundToGraph({
          companyName: round.companyName,
          amount: round.amount,
          amountUsd: round.amountUsd,
          currency: round.currency,
          fxRate: round.fxRate,
          stage: round.stage,
          investors: round.investors,
          leadInvestor: round.leadInvestor,
          country: round.country,
          confidence: round.confidence,
          announcedDate: round.announcedDate,
          articles: round.articles.map((a) => ({
            id: a.url,
            url: a.url,
            title: a.title,
            publishedAt: round.announcedDate ?? null,
            author: null,
          })),
        });

        results.push({
          stage: round.stage,
          companyName: round.companyName,
          success: true,
          nodes: summary.nodes,
          edges: summary.edges,
        });
      } catch (e) {
        console.error(`Historical ingest failed for ${round.stage}:`, e);
        results.push({
          stage: round.stage,
          companyName: round.companyName,
          success: false,
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    return NextResponse.json({
      totalRounds: rounds.length,
      successCount,
      failedCount: rounds.length - successCount,
      results,
    });
  } catch (e) {
    console.error("Historical ingest error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
