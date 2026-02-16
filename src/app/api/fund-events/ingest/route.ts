import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { syncSingleFundEventToGraph } from "@/lib/graph-sync";
import { requireAdmin } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;
  try {
    const body = await request.json();
    const { key, articleIds } = body as { key: string; articleIds: string[] };

    if (!key || !articleIds?.length) {
      return NextResponse.json({ error: "key and articleIds required" }, { status: 400 });
    }

    // Load fund events + articles
    const articles = await prisma.article.findMany({
      where: { id: { in: articleIds } },
      include: { fundEvent: true },
    });

    if (!articles.length) {
      return NextResponse.json({ error: "No articles found" }, { status: 404 });
    }

    // Pick best fund event (highest confidence)
    const withEvent = articles.filter((a) => a.fundEvent);
    if (!withEvent.length) {
      return NextResponse.json({ error: "No fund events on these articles" }, { status: 422 });
    }

    withEvent.sort((a, b) => (b.fundEvent!.confidence) - (a.fundEvent!.confidence));
    const primary = withEvent[0].fundEvent!;

    // Sync to Neo4j
    const graphSummary = await syncSingleFundEventToGraph({
      firmName: primary.firmName,
      fundName: primary.fundName,
      amountUsd: primary.amountUsd,
      fundType: primary.fundType,
      vintage: primary.vintage,
      country: primary.country,
      confidence: primary.confidence,
      articles: articles.map((a) => ({
        id: a.id,
        url: a.url,
        title: a.title,
        publishedAt: a.publishedAt?.toISOString() ?? null,
        author: a.author,
      })),
    });

    // Mark fund events as ingested + articles as read
    const eventIds = withEvent
      .map((a) => a.fundEvent!.id)
      .filter((id): id is string => !!id);

    await Promise.all([
      prisma.fundEvent.updateMany({
        where: { id: { in: eventIds } },
        data: { ingestedAt: new Date() },
      }),
      prisma.article.updateMany({
        where: { id: { in: articleIds } },
        data: { isRead: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        firmName: primary.firmName,
        fundName: primary.fundName,
        amountUsd: primary.amountUsd,
        fundType: primary.fundType,
        articlesIngested: articles.length,
      },
      graph: graphSummary,
    });
  } catch (e) {
    console.error("Fund event ingest error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
