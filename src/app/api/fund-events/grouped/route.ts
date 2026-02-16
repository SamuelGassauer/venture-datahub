import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

type FundEventEntry = {
  id: string;
  fundName: string;
  firmName: string;
  amountUsd: number | null;
  amount: number | null;
  currency: string;
  fundType: string | null;
  vintage: string | null;
  country: string | null;
  confidence: number;
  ingestedAt: Date | null;
  dismissedAt: Date | null;
  createdAt: Date;
  articleId: string;
  article: {
    id: string;
    title: string;
    url: string;
    publishedAt: Date | null;
    feed: { id: string; title: string };
  };
};

export type GroupedFundEvent = {
  key: string;
  firmName: string;
  fundName: string;
  amountUsd: number | null;
  fundType: string | null;
  vintage: string | null;
  country: string | null;
  maxConfidence: number;
  sourceCount: number;
  sources: {
    articleId: string;
    feedTitle: string;
    articleTitle: string;
    articleUrl: string;
    confidence: number;
    publishedAt: string | null;
  }[];
  firstSeen: string;
  lastSeen: string;
  ingestedAt: string | null;
  dismissedAt: string | null;
};

// ---------------------------------------------------------------------------
// Firm name normalization
// ---------------------------------------------------------------------------

function normalizeFirm(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// ---------------------------------------------------------------------------
// Grouping: simpler than funding rounds — group by firm + fund name
// ---------------------------------------------------------------------------

const DEDUP_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function entryDate(e: FundEventEntry): number {
  return e.article.publishedAt
    ? new Date(e.article.publishedAt).getTime()
    : e.createdAt.getTime();
}

function groupEvents(entries: FundEventEntry[]): Map<string, FundEventEntry[]> {
  const groups: FundEventEntry[][] = [];

  for (const entry of entries) {
    let matched = false;
    const normFirm = normalizeFirm(entry.firmName);

    for (const group of groups) {
      const rep = group[0];
      const repNorm = normalizeFirm(rep.firmName);

      // Firm names must match (exact or substring)
      const firmMatch =
        normFirm === repNorm ||
        normFirm.includes(repNorm) ||
        repNorm.includes(normFirm);

      if (!firmMatch) continue;

      // Time window
      const timeDiff = Math.abs(entryDate(entry) - entryDate(rep));
      if (timeDiff > DEDUP_WINDOW_MS) continue;

      group.push(entry);
      matched = true;
      break;
    }

    if (!matched) {
      groups.push([entry]);
    }
  }

  const result = new Map<string, FundEventEntry[]>();
  for (const group of groups) {
    group.sort((a, b) => b.confidence - a.confidence);
    const primary = group[0];
    const key = `${normalizeFirm(primary.firmName)}_${entryDate(primary)}`;
    result.set(key, group);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const params = request.nextUrl.searchParams;
  const fundType = params.get("fundType");
  const country = params.get("country");
  const search = params.get("search");
  const sortBy = params.get("sortBy") || "lastSeen";
  const sortOrder = params.get("sortOrder") || "desc";

  const showDismissed = params.get("showDismissed") === "true";
  const where: Record<string, unknown> = {
    confidence: { gte: 0.6 },
    ...(!showDismissed && { dismissedAt: null }),
  };
  if (fundType) where.fundType = fundType;
  if (country) where.country = country;
  if (search) {
    where.OR = [
      { firmName: { contains: search, mode: "insensitive" } },
      { fundName: { contains: search, mode: "insensitive" } },
      { article: { title: { contains: search, mode: "insensitive" } } },
    ];
  }

  const allEvents = (await prisma.fundEvent.findMany({
    where,
    include: {
      article: {
        select: {
          id: true,
          title: true,
          url: true,
          publishedAt: true,
          feed: { select: { id: true, title: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })) as unknown as FundEventEntry[];

  const groups = groupEvents(allEvents);

  const grouped: GroupedFundEvent[] = [];
  for (const [key, entries] of groups) {
    const primary = entries[0];

    const seenFeeds = new Set<string>();
    const sources = entries
      .map((e) => ({
        articleId: e.articleId,
        feedTitle: e.article.feed.title,
        articleTitle: e.article.title,
        articleUrl: e.article.url,
        confidence: e.confidence,
        publishedAt: e.article.publishedAt
          ? new Date(e.article.publishedAt).toISOString()
          : null,
      }))
      .filter((s) => {
        if (seenFeeds.has(s.feedTitle)) return false;
        seenFeeds.add(s.feedTitle);
        return true;
      });

    const dates = entries
      .map((e) =>
        e.article.publishedAt
          ? new Date(e.article.publishedAt).getTime()
          : e.createdAt.getTime()
      )
      .sort();

    grouped.push({
      key,
      firmName: primary.firmName,
      fundName: primary.fundName || entries.find((e) => e.fundName)?.fundName || "Fund",
      amountUsd: primary.amountUsd || entries.find((e) => e.amountUsd)?.amountUsd || null,
      fundType: primary.fundType || entries.find((e) => e.fundType)?.fundType || null,
      vintage: primary.vintage || entries.find((e) => e.vintage)?.vintage || null,
      country: primary.country || entries.find((e) => e.country)?.country || null,
      maxConfidence: primary.confidence,
      sourceCount: sources.length,
      sources,
      firstSeen: new Date(dates[0]).toISOString(),
      lastSeen: new Date(dates[dates.length - 1]).toISOString(),
      ingestedAt: entries.find((e) => e.ingestedAt)?.ingestedAt?.toISOString() ?? null,
      dismissedAt: entries.find((e) => e.dismissedAt)?.dismissedAt?.toISOString() ?? null,
    });
  }

  grouped.sort((a, b) => {
    let cmp = 0;
    if (sortBy === "amount") {
      cmp = (a.amountUsd || 0) - (b.amountUsd || 0);
    } else if (sortBy === "confidence") {
      cmp = a.maxConfidence - b.maxConfidence;
    } else if (sortBy === "sources") {
      cmp = a.sourceCount - b.sourceCount;
    } else if (sortBy === "firm") {
      cmp = a.firmName.localeCompare(b.firmName);
    } else {
      cmp = new Date(a.lastSeen).getTime() - new Date(b.lastSeen).getTime();
    }
    return sortOrder === "desc" ? -cmp : cmp;
  });

  return NextResponse.json({
    data: grouped,
    total: grouped.length,
  });
}
