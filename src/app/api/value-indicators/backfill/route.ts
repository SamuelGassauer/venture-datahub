import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { extractValueIndicators } from "@/lib/value-indicator-extractor";
import { requireAdmin } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;
  try {
    // Find articles that have NOT yet been scanned for value indicators
    const articles = await prisma.article.findMany({
      where: {
        companyValueIndicators: { none: {} },
      },
      select: {
        id: true,
        title: true,
        content: true,
        summary: true,
      },
    });

    let extracted = 0;
    let indicators = 0;

    for (const article of articles) {
      const articleText = article.content || article.summary || "";
      const results = extractValueIndicators(article.title, articleText);

      if (results.length > 0) {
        await prisma.companyValueIndicator.createMany({
          data: results.map((vi) => ({
            articleId: article.id,
            companyName: vi.companyName,
            metricType: vi.metricType,
            value: vi.value,
            currency: vi.currency,
            valueUsd: vi.valueUsd,
            unit: vi.unit,
            period: vi.period,
            confidence: vi.confidence,
            rawExcerpt: vi.rawExcerpt,
          })),
        });
        extracted++;
        indicators += results.length;
      }
    }

    return NextResponse.json({
      success: true,
      articlesScanned: articles.length,
      articlesWithIndicators: extracted,
      indicatorsCreated: indicators,
    });
  } catch (e) {
    console.error("Backfill error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
