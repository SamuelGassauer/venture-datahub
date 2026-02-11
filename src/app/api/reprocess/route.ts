import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { extractFunding } from "@/lib/funding-extractor";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    // Delete all existing funding rounds
    await prisma.fundingRound.deleteMany();

    // Get all articles
    const articles = await prisma.article.findMany({
      select: { id: true, title: true, content: true, summary: true },
    });

    let fundingFound = 0;

    for (const article of articles) {
      const fundingData = await extractFunding(
        article.title,
        article.content || article.summary || ""
      );

      if (fundingData) {
        await prisma.fundingRound.create({
          data: {
            articleId: article.id,
            companyName: fundingData.companyName,
            amount: fundingData.amount,
            currency: fundingData.currency,
            amountUsd: fundingData.amountUsd,
            stage: fundingData.stage,
            investors: fundingData.investors,
            leadInvestor: fundingData.leadInvestor,
            country: fundingData.country,
            confidence: fundingData.confidence,
            rawExcerpt: fundingData.rawExcerpt,
          },
        });
        fundingFound++;
      }
    }

    return NextResponse.json({
      totalArticles: articles.length,
      fundingFound,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Reprocess failed" },
      { status: 500 }
    );
  }
}
