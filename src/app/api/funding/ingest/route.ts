import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { extractFundingFromSources } from "@/lib/llm-funding-extractor";
import { syncSingleRoundToGraph } from "@/lib/graph-sync";
import { enrichCompany } from "@/lib/company-enricher";
import { requireAdmin } from "@/lib/api-auth";
import { enrichInvestor } from "@/lib/investor-enricher";
import { scrapeArticleContent } from "@/lib/article-scraper";

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;
  try {
    const body = await request.json();
    const { key, articleIds } = body as { key: string; articleIds: string[] };

    if (!key || !articleIds?.length) {
      return NextResponse.json({ error: "key and articleIds required" }, { status: 400 });
    }

    // Load articles + their funding rounds
    const articles = await prisma.article.findMany({
      where: { id: { in: articleIds } },
      include: { fundingRound: true },
    });

    if (!articles.length) {
      return NextResponse.json({ error: "No articles found" }, { status: 404 });
    }

    // Sort by confidence (best first) for pipeline display, but send all to LLM
    const sortedArticles = [...articles].sort((a, b) =>
      (b.fundingRound?.confidence ?? 0) - (a.fundingRound?.confidence ?? 0)
    );
    const bestArticle = sortedArticles[0];

    // Live-scrape article URLs for fresh, clean content
    // Fall back to stored content if scrape fails
    const freshContents = await Promise.all(
      sortedArticles.map(async (a) => {
        const scraped = await scrapeArticleContent(a.url);
        return {
          title: a.title,
          content: scraped || a.content || a.summary || a.title,
          wasScraped: !!scraped,
        };
      })
    );

    const scrapedCount = freshContents.filter((c) => c.wasScraped).length;
    console.log(`[ingest] ${key}: scraped ${scrapedCount}/${sortedArticles.length} articles live`);

    // Collect existing regex extractions from all FundingRounds
    const existingExtractions = sortedArticles
      .filter((a) => a.fundingRound)
      .map((a) => ({
        companyName: a.fundingRound!.companyName,
        amount: a.fundingRound!.amount,
        currency: a.fundingRound!.currency,
        amountUsd: a.fundingRound!.amountUsd,
        stage: a.fundingRound!.stage,
        investors: a.fundingRound!.investors,
        leadInvestor: a.fundingRound!.leadInvestor,
        country: a.fundingRound!.country,
        confidence: a.fundingRound!.confidence,
      }));

    // LLM extraction with fresh content + existing regex data as context
    const llmResult = await extractFundingFromSources(
      freshContents.map((c) => ({ title: c.title, content: c.content })),
      existingExtractions.length > 0 ? existingExtractions : undefined,
    );

    if (!llmResult) {
      return NextResponse.json({ error: "LLM did not identify a funding round" }, { status: 422 });
    }

    // Re-calculate amountUsd with real FX rate from the article date
    let fxRate: number | null = null;
    if (llmResult.amount != null && llmResult.currency && llmResult.currency !== "USD") {
      const articleDate = bestArticle.publishedAt?.toISOString().substring(0, 10)
        ?? new Date().toISOString().substring(0, 10);
      const { getUsdRate } = await import("@/lib/fx-rates");
      fxRate = await getUsdRate(llmResult.currency, articleDate);
      llmResult.amountUsd = Math.round(llmResult.amount * fxRate);
      console.log(`[ingest] FX: ${llmResult.amount} ${llmResult.currency} × ${fxRate} = ${llmResult.amountUsd} USD (${articleDate})`);
    } else if (llmResult.currency === "USD") {
      fxRate = 1;
    }

    // Sync to Neo4j
    const graphSummary = await syncSingleRoundToGraph({
      companyName: llmResult.companyName,
      amount: llmResult.amount,
      amountUsd: llmResult.amountUsd,
      currency: llmResult.currency,
      fxRate,
      stage: llmResult.stage,
      investors: llmResult.investors,
      leadInvestor: llmResult.leadInvestor,
      country: llmResult.country,
      confidence: llmResult.confidence,
      announcedDate: llmResult.announcedDate,
      companyMeta: llmResult.companyMeta,
      articles: articles.map((a) => ({
        id: a.id,
        url: a.url,
        title: a.title,
        publishedAt: a.publishedAt?.toISOString() ?? null,
        author: a.author,
      })),
    });

    // Mark all related FundingRounds as ingested + articles as read
    const roundIds = articles
      .map((a) => a.fundingRound?.id)
      .filter((id): id is string => !!id);

    await Promise.all([
      roundIds.length
        ? prisma.fundingRound.updateMany({
            where: { id: { in: roundIds } },
            data: { ingestedAt: new Date() },
          })
        : null,
      prisma.article.updateMany({
        where: { id: { in: articleIds } },
        data: { isRead: true },
      }),
    ]);

    // Fire-and-forget: enrich company + investors in the background
    const investorNames = [
      ...(llmResult.investors ?? []),
      ...(llmResult.leadInvestor ? [llmResult.leadInvestor] : []),
    ];
    const uniqueInvestors = [...new Set(investorNames)];

    (async () => {
      try {
        await enrichCompany(llmResult.companyName, () => {});
      } catch (e) {
        console.warn(`[auto-enrich] Company "${llmResult.companyName}" failed:`, e);
      }
      for (const inv of uniqueInvestors) {
        try {
          await enrichInvestor(inv, () => {});
        } catch (e) {
          console.warn(`[auto-enrich] Investor "${inv}" failed:`, e);
        }
      }
      console.log(`[auto-enrich] Done: ${llmResult.companyName} + ${uniqueInvestors.length} investors`);
    })();

    // Build pipeline input from the best article's funding round
    const regexRound = bestArticle.fundingRound;

    return NextResponse.json({
      success: true,
      data: {
        companyName: llmResult.companyName,
        amountUsd: llmResult.amountUsd,
        stage: llmResult.stage,
        investors: llmResult.investors,
        country: llmResult.country,
        confidence: llmResult.confidence,
        articlesIngested: articles.length,
        articlesFreshScraped: scrapedCount,
      },
      pipeline: {
        input: {
          articleTitle: bestArticle.title,
          articleUrl: bestArticle.url,
          rawExcerpt: regexRound?.rawExcerpt ?? null,
          regexExtraction: regexRound
            ? {
                companyName: regexRound.companyName,
                amountUsd: regexRound.amountUsd,
                stage: regexRound.stage,
                confidence: regexRound.confidence,
              }
            : null,
        },
        llmOutput: {
          companyName: llmResult.companyName,
          amountUsd: llmResult.amountUsd,
          currency: llmResult.currency,
          stage: llmResult.stage,
          investors: llmResult.investors,
          leadInvestor: llmResult.leadInvestor,
          country: llmResult.country,
          confidence: llmResult.confidence,
        },
        graph: graphSummary,
      },
    });
  } catch (e) {
    console.error("Ingest route error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
