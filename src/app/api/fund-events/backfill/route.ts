import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { extractFundEvent, isFundEvent } from "@/lib/fund-event-extractor";
import { requireAdmin } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/fund-events/backfill
 *
 * Reprocesses all existing articles to extract fund events.
 * Also moves misclassified funding rounds (VC firm fund raises) to fund_events.
 */
export async function POST() {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;
  let created = 0;
  let moved = 0;
  let skipped = 0;

  // Step 1: Find articles that have no fund event yet and no funding round
  const articlesWithoutExtraction = await prisma.article.findMany({
    where: {
      fundEvent: null,
      fundingRound: null,
    },
    select: {
      id: true,
      title: true,
      content: true,
      summary: true,
    },
  });

  for (const article of articlesWithoutExtraction) {
    const text = article.content || article.summary || "";
    if (!isFundEvent(article.title, text)) {
      skipped++;
      continue;
    }
    const result = extractFundEvent(article.title, text);
    if (result) {
      await prisma.fundEvent.create({
        data: {
          articleId: article.id,
          fundName: result.fundName,
          firmName: result.firmName,
          amount: result.amount,
          currency: result.currency,
          amountUsd: result.amountUsd,
          fundType: result.fundType,
          vintage: result.vintage,
          country: result.country,
          confidence: result.confidence,
          rawExcerpt: result.rawExcerpt,
        },
      });
      created++;
    } else {
      skipped++;
    }
  }

  // Step 2: Check existing funding rounds that might actually be fund events
  const fundingRounds = await prisma.fundingRound.findMany({
    include: {
      article: {
        select: { id: true, title: true, content: true, summary: true },
      },
    },
  });

  for (const fr of fundingRounds) {
    const text = fr.article.content || fr.article.summary || "";
    if (!isFundEvent(fr.article.title, text)) continue;

    const result = extractFundEvent(fr.article.title, text);
    if (!result) continue;

    // This is a fund event misclassified as a funding round — move it
    await prisma.$transaction([
      prisma.fundingRound.delete({ where: { id: fr.id } }),
      prisma.fundEvent.create({
        data: {
          articleId: fr.article.id,
          fundName: result.fundName,
          firmName: result.firmName,
          amount: result.amount,
          currency: result.currency,
          amountUsd: result.amountUsd,
          fundType: result.fundType,
          vintage: result.vintage,
          country: result.country,
          confidence: result.confidence,
          rawExcerpt: result.rawExcerpt,
        },
      }),
    ]);
    moved++;
  }

  return NextResponse.json({
    created,
    moved,
    skipped,
    total: created + moved,
    scannedArticles: articlesWithoutExtraction.length,
    scannedFundingRounds: fundingRounds.length,
  });
}
