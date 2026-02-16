import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { syncSingleValueToGraph } from "@/lib/graph-sync";
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

    // Load indicators + articles
    const articles = await prisma.article.findMany({
      where: { id: { in: articleIds } },
      include: { companyValueIndicators: true },
    });

    if (!articles.length) {
      return NextResponse.json({ error: "No articles found" }, { status: 404 });
    }

    // Collect all indicators from these articles
    const allIndicators = articles.flatMap((a) => a.companyValueIndicators);
    if (!allIndicators.length) {
      return NextResponse.json({ error: "No value indicators on these articles" }, { status: 422 });
    }

    // Pick best indicator (highest confidence)
    allIndicators.sort((a, b) => b.confidence - a.confidence);
    const primary = allIndicators[0];

    // Sync to Neo4j
    const graphSummary = await syncSingleValueToGraph({
      companyName: primary.companyName,
      metricType: primary.metricType,
      valueUsd: primary.valueUsd,
      unit: primary.unit,
      period: primary.period,
      confidence: primary.confidence,
      articles: articles.map((a) => ({
        id: a.id,
        url: a.url,
        title: a.title,
        publishedAt: a.publishedAt?.toISOString() ?? null,
        author: a.author,
      })),
    });

    // Mark indicators as ingested — do NOT mark articles as read
    const indicatorIds = allIndicators.map((i) => i.id);
    await prisma.companyValueIndicator.updateMany({
      where: { id: { in: indicatorIds } },
      data: { ingestedAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      data: {
        companyName: primary.companyName,
        metricType: primary.metricType,
        valueUsd: primary.valueUsd,
        articlesIngested: articles.length,
      },
      graph: graphSummary,
    });
  } catch (e) {
    console.error("Value indicator ingest error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
