import Parser from "rss-parser";
import { prisma } from "./db";
import { extractFunding } from "./funding-extractor";


const parser = new Parser({
  timeout: 15000,
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
    const items = parsed.items || [];

    for (const item of items) {
      if (!item.link) continue;

      const existingArticle = await prisma.article.findUnique({
        where: { url: item.link },
      });

      if (existingArticle) continue;

      const article = await prisma.article.create({
        data: {
          feedId: feed.id,
          title: item.title || "Untitled",
          url: item.link,
          author: item.creator || item["dc:creator"] || null,
          content: item["content:encoded"] || item.content || null,
          summary: item.contentSnippet || item.summary || null,
          imageUrl: extractImageUrl(item),
          publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
          guid: item.guid || item.link,
        },
      });

      articlesNew++;

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

export async function syncAllFeeds(): Promise<SyncResult[]> {
  const feeds = await prisma.feed.findMany({
    where: { isActive: true },
    orderBy: { lastSyncAt: "asc" },
  });

  const results: SyncResult[] = [];

  for (const feed of feeds) {
    const result = await syncFeed(feed.id);
    results.push(result);
    await new Promise((r) => setTimeout(r, 1000));
  }

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
