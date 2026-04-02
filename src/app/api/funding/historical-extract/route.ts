import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { scrapeArticleContent } from "@/lib/article-scraper";
import { extractFundingFromSources } from "@/lib/llm-funding-extractor";
import { getUsdRate } from "@/lib/fx-rates";
import { normalizeCompany } from "@/lib/graph-sync";
import driver from "@/lib/neo4j";

/**
 * POST /api/funding/historical-extract
 *
 * Step 2+3 of the historical funding enrichment flow.
 * Takes selected article URLs, scrapes them, runs LLM extraction per article,
 * and checks each extracted round against existing Neo4j data for dedup.
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  try {
    const body = await request.json();
    const { companyName, articles } = body as {
      companyName: string;
      articles: { url: string; title: string }[];
    };

    if (!companyName?.trim() || !articles?.length) {
      return NextResponse.json(
        { error: "companyName and articles[] required" },
        { status: 400 }
      );
    }

    // 1. Scrape all selected articles in parallel
    const scraped = await Promise.all(
      articles.map(async (a) => {
        const content = await scrapeArticleContent(a.url);
        return {
          url: a.url,
          title: a.title,
          content,
          scraped: !!content,
        };
      })
    );

    const successfulScrapes = scraped.filter((s) => s.content);

    if (successfulScrapes.length === 0) {
      return NextResponse.json(
        { error: "Could not scrape any of the selected articles" },
        { status: 422 }
      );
    }

    // 2. Run LLM extraction on each article individually
    //    (unlike normal ingest which groups by round, here each article
    //     might be about a different round)
    const extractions: {
      url: string;
      title: string;
      extraction: {
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
      } | null;
    }[] = [];

    for (const article of successfulScrapes) {
      try {
        const result = await extractFundingFromSources([
          { title: article.title, content: article.content! },
        ]);

        if (result) {
          // Apply real FX rate
          let fxRate: number | null = null;
          if (result.amount != null && result.currency && result.currency !== "USD") {
            const today = new Date().toISOString().substring(0, 10);
            fxRate = await getUsdRate(result.currency, today);
            result.amountUsd = Math.round(result.amount * fxRate);
          } else if (result.currency === "USD") {
            fxRate = 1;
          }

          extractions.push({
            url: article.url,
            title: article.title,
            extraction: {
              companyName: result.companyName,
              amount: result.amount,
              amountUsd: result.amountUsd,
              currency: result.currency,
              fxRate,
              stage: result.stage,
              investors: result.investors,
              announcedDate: result.announcedDate,
              leadInvestor: result.leadInvestor,
              country: result.country,
              confidence: result.confidence,
            },
          });
        } else {
          extractions.push({
            url: article.url,
            title: article.title,
            extraction: null,
          });
        }
      } catch (e) {
        console.warn(`LLM extraction failed for ${article.url}:`, e);
        extractions.push({
          url: article.url,
          title: article.title,
          extraction: null,
        });
      }
    }

    // 3. Deduplicate: group by stage, then check against Neo4j
    const compNorm = normalizeCompany(companyName);

    // Load existing rounds from Neo4j for this company
    const session = driver().session({ defaultAccessMode: "READ" });
    let existingRounds: { roundKey: string; stage: string | null; amountUsd: number | null }[] = [];
    try {
      const result = await session.run(
        `MATCH (c:Company {normalizedName: $compNorm})-[:RAISED]->(fr:FundingRound)
         RETURN fr.roundKey AS roundKey, fr.stage AS stage, fr.amountUsd AS amountUsd`,
        { compNorm }
      );
      existingRounds = result.records.map((r) => ({
        roundKey: r.get("roundKey") as string,
        stage: r.get("stage") as string | null,
        amountUsd: typeof r.get("amountUsd") === "object" && r.get("amountUsd") !== null
          ? (r.get("amountUsd") as { toNumber(): number }).toNumber()
          : (r.get("amountUsd") as number | null),
      }));
    } finally {
      await session.close();
    }

    const existingStages = new Set(existingRounds.map((r) => r.stage?.toLowerCase()));

    // Build deduplicated rounds from extractions
    const roundMap = new Map<
      string,
      {
        stage: string | null;
        amount: number | null;
        amountUsd: number | null;
        currency: string;
        fxRate: number | null;
        investors: string[];
        leadInvestor: string | null;
        country: string | null;
        confidence: number;
        announcedDate: string | null;
        companyName: string;
        articles: { url: string; title: string }[];
        existsInDb: boolean;
      }
    >();

    for (const ext of extractions) {
      if (!ext.extraction) continue;
      const e = ext.extraction;
      const stageKey = e.stage?.toLowerCase().replace(/[^a-z0-9+]/g, "") ?? "unknown";

      const existing = roundMap.get(stageKey);
      if (existing) {
        // Merge: union investors, keep higher confidence, add article
        const allInvestors = new Set([...existing.investors, ...e.investors]);
        existing.investors = [...allInvestors];
        if (e.confidence > existing.confidence) {
          existing.confidence = e.confidence;
          if (e.amount) {
            existing.amount = e.amount;
            existing.amountUsd = e.amountUsd;
            existing.currency = e.currency;
            existing.fxRate = e.fxRate;
          }
          if (e.leadInvestor) existing.leadInvestor = e.leadInvestor;
          if (e.country) existing.country = e.country;
          if (e.announcedDate) existing.announcedDate = e.announcedDate;
        }
        existing.articles.push({ url: ext.url, title: ext.title });
      } else {
        roundMap.set(stageKey, {
          stage: e.stage,
          amount: e.amount,
          amountUsd: e.amountUsd,
          currency: e.currency,
          fxRate: e.fxRate,
          investors: [...e.investors],
          leadInvestor: e.leadInvestor,
          country: e.country,
          confidence: e.confidence,
          announcedDate: e.announcedDate,
          companyName: e.companyName,
          articles: [{ url: ext.url, title: ext.title }],
          existsInDb: existingStages.has(stageKey),
        });
      }
    }

    const rounds = Array.from(roundMap.values()).sort((a, b) => {
      // Sort by stage order
      const stageOrder = ["pre-seed", "seed", "seriesa", "seriesb", "seriesc", "seriesd", "seriese+", "bridge", "growth", "debt", "grant"];
      const aIdx = stageOrder.indexOf(a.stage?.toLowerCase().replace(/[^a-z0-9+]/g, "") ?? "");
      const bIdx = stageOrder.indexOf(b.stage?.toLowerCase().replace(/[^a-z0-9+]/g, "") ?? "");
      return aIdx - bIdx;
    });

    return NextResponse.json({
      companyName,
      articlesScraped: successfulScrapes.length,
      articlesFailed: scraped.length - successfulScrapes.length,
      extractionsFound: extractions.filter((e) => e.extraction).length,
      extractionsFailed: extractions.filter((e) => !e.extraction).length,
      existingRoundsInDb: existingRounds.length,
      rounds,
    });
  } catch (e) {
    console.error("Historical extract error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
