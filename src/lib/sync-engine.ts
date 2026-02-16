import Parser from "rss-parser";
import { prisma } from "./db";
import { extractFunding } from "./funding-extractor";
import { extractFundEvent, isFundEvent } from "./fund-event-extractor";
import { extractValueIndicators } from "./value-indicator-extractor";


const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent": "RSS-Scraper/1.0",
    Accept: "application/rss+xml, application/xml, text/xml",
  },
});

type SyncResult = {
  feedId: string;
  status: "success" | "error";
  articlesFound: number;
  articlesNew: number;
  fundingFound: number;
  errorMessage?: string;
  durationMs: number;
};

export async function syncFeed(feedId: string): Promise<SyncResult> {
  const start = Date.now();

  try {
    const feed = await prisma.feed.findUniqueOrThrow({ where: { id: feedId } });
    const parsed = await parser.parseURL(feed.url);

    let articlesNew = 0;
    let fundingFound = 0;
    const items = (parsed.items || []).filter((item) => item.link);

    // Batch check: which URLs already exist? (1 query instead of N)
    const urls = items.map((item) => item.link!);
    const existing = await prisma.article.findMany({
      where: { url: { in: urls } },
      select: { url: true },
    });
    const existingUrls = new Set(existing.map((a) => a.url));

    const newItems = items.filter((item) => !existingUrls.has(item.link!));

    for (const item of newItems) {
      const article = await prisma.article.create({
        data: {
          feedId: feed.id,
          title: item.title || "Untitled",
          url: item.link!,
          author: item.creator || item["dc:creator"] || null,
          content: item["content:encoded"] || item.content || null,
          summary: item.contentSnippet || item.summary || null,
          imageUrl: extractImageUrl(item),
          publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
          guid: item.guid || item.link!,
        },
      });

      articlesNew++;

      const articleText = article.content || article.summary || "";

      // Try fund event FIRST — fund closings take priority over funding rounds
      const fundEventData = isFundEvent(article.title, articleText)
        ? extractFundEvent(article.title, articleText)
        : null;

      if (fundEventData) {
        await prisma.fundEvent.create({
          data: {
            articleId: article.id,
            fundName: fundEventData.fundName,
            firmName: fundEventData.firmName,
            amount: fundEventData.amount,
            currency: fundEventData.currency,
            amountUsd: fundEventData.amountUsd,
            fundType: fundEventData.fundType,
            vintage: fundEventData.vintage,
            country: fundEventData.country,
            confidence: fundEventData.confidence,
            rawExcerpt: fundEventData.rawExcerpt,
          },
        });
      } else {
        const fundingData = await extractFunding(article.title, articleText);
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

      // Value indicators run independently
      const valueIndicators = extractValueIndicators(article.title, articleText);
      if (valueIndicators.length > 0) {
        await prisma.companyValueIndicator.createMany({
          data: valueIndicators.map((vi) => ({
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
      }
    }

    await prisma.feed.update({
      where: { id: feed.id },
      data: {
        lastSyncAt: new Date(),
        lastSyncError: null,
        articleCount: { increment: articlesNew },
      },
    });

    const result: SyncResult = {
      feedId: feed.id,
      status: "success",
      articlesFound: items.length,
      articlesNew,
      fundingFound,
      durationMs: Date.now() - start,
    };

    await prisma.syncLog.create({ data: result });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await prisma.feed.update({
      where: { id: feedId },
      data: { lastSyncError: errorMessage },
    }).catch(() => {});

    const result: SyncResult = {
      feedId,
      status: "error",
      articlesFound: 0,
      articlesNew: 0,
      fundingFound: 0,
      errorMessage,
      durationMs: Date.now() - start,
    };

    await prisma.syncLog.create({ data: result }).catch(() => {});

    return result;
  }
}

/**
 * Sync all active feeds with configurable concurrency.
 * Default: 10 feeds in parallel for ~8-10x speedup.
 */
export async function syncAllFeeds(concurrency = 10): Promise<SyncResult[]> {
  const feeds = await prisma.feed.findMany({
    where: { isActive: true },
    orderBy: { lastSyncAt: "asc" },
  });

  const results: SyncResult[] = [];
  const queue = [...feeds];

  async function worker() {
    while (queue.length > 0) {
      const feed = queue.shift();
      if (!feed) break;
      const result = await syncFeed(feed.id);
      results.push(result);
    }
  }

  // Launch N workers in parallel
  const workers = Array.from(
    { length: Math.min(concurrency, feeds.length) },
    () => worker()
  );
  await Promise.all(workers);

  return results;
}

function extractImageUrl(item: Record<string, unknown>): string | null {
  const enclosure = item.enclosure as { url?: string; type?: string } | undefined;
  if (enclosure?.url && enclosure?.type?.startsWith("image/")) {
    return enclosure.url;
  }

  const media = item["media:content"] as { $?: { url?: string } } | undefined;
  if (media?.$?.url) {
    return media.$.url;
  }

  const content = (item["content:encoded"] || item.content || "") as string;
  const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/);
  if (imgMatch) return imgMatch[1];

  return null;
}
