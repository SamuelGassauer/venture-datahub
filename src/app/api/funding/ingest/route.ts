import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { extractFundingFromSources } from "@/lib/llm-funding-extractor";
import { syncSingleRoundToGraph } from "@/lib/graph-sync";
import { enrichCompany } from "@/lib/company-enricher";
import { enrichInvestor } from "@/lib/investor-enricher";

export async function POST(request: NextRequest) {
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

    // LLM extraction with all article sources
    const llmResult = await extractFundingFromSources(
      sortedArticles.map((a) => ({
        title: a.title,
        content: a.content || a.summary || a.title,
      }))
    );

    if (!llmResult) {
      return NextResponse.json({ error: "LLM did not identify a funding round" }, { status: 422 });
    }

    // Sync to Neo4j
    const graphSummary = await syncSingleRoundToGraph({
      companyName: llmResult.companyName,
      amountUsd: llmResult.amountUsd,
      currency: llmResult.currency,
      stage: llmResult.stage,
      investors: llmResult.investors,
      leadInvestor: llmResult.leadInvestor,
      country: llmResult.country,
      confidence: llmResult.confidence,
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
    // Deduplicate investor names
    const uniqueInvestors = [...new Set(investorNames)];

    // Run enrichment in background — don't await, don't block the response
    (async () => {
      try {
        // Enrich company first
        await enrichCompany(llmResult.companyName, () => {});
      } catch (e) {
        console.warn(`[auto-enrich] Company "${llmResult.companyName}" failed:`, e);
      }
      // Then enrich investors sequentially (to avoid rate-limit issues)
      for (const inv of uniqueInvestors) {
        try {
          await enrichInvestor(inv, () => {});
        } catch (e) {
          console.warn(`[auto-enrich] Investor "${inv}" failed:`, e);
        }
      }
      console.log(`[auto-enrich] Done: ${llmResult.companyName} + ${uniqueInvestors.length} investors`);
    })();

    // Build pipeline input from the best article's funding round (regex extraction data from DB)
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
