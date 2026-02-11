import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type FundingEntry = {
  id: string;
  companyName: string;
  amountUsd: number | null;
  amount: number | null;
  currency: string;
  stage: string | null;
  country: string | null;
  leadInvestor: string | null;
  investors: string[];
  confidence: number;
  ingestedAt: Date | null;
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

export type GroupedRound = {
  key: string;
  companyName: string;
  amountUsd: number | null;
  stage: string | null;
  country: string | null;
  leadInvestor: string | null;
  allInvestors: string[];
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
  ingestedAt: string | null;
  firstSeen: string;
  lastSeen: string;
};

function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

const DEDUP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function normalizeStage(stage: string | null): string {
  if (!stage) return "unknown";
  return stage.toLowerCase().replace(/[^a-z0-9+]/g, "");
}

function roundDate(entry: FundingEntry): number {
  return entry.article.publishedAt
    ? new Date(entry.article.publishedAt).getTime()
    : entry.createdAt.getTime();
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const stage = params.get("stage");
  const country = params.get("country");
  const search = params.get("search");
  const sortBy = params.get("sortBy") || "lastSeen";
  const sortOrder = params.get("sortOrder") || "desc";

  // Fetch all funding rounds with articles
  const where: Record<string, unknown> = {};
  if (stage) where.stage = stage;
  if (country) where.country = country;
  if (search) {
    where.OR = [
      { companyName: { contains: search, mode: "insensitive" } },
      { article: { title: { contains: search, mode: "insensitive" } } },
    ];
  }

  const allRounds = (await prisma.fundingRound.findMany({
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
  })) as unknown as FundingEntry[];

  // Group by normalized company name + stage, within a 7-day window.
  // Rounds for the same company with the same (or unknown) stage that appear
  // within 7 days of each other are treated as the same funding event.
  const groups = new Map<string, FundingEntry[]>();
  for (const round of allRounds) {
    const companyKey = normalizeCompany(round.companyName);
    const stageKey = normalizeStage(round.stage);
    const ts = roundDate(round);

    // Try to find an existing group for this company+stage within the time window
    let matched = false;
    for (const [key, entries] of groups) {
      if (!key.startsWith(`${companyKey}_`)) continue;
      const groupStage = key.split("_").slice(1, -1).join("_");
      // Stage must match, or one of them is unknown
      if (stageKey !== "unknown" && groupStage !== "unknown" && stageKey !== groupStage) continue;
      // Check time window against any entry in the group
      const withinWindow = entries.some(
        (e) => Math.abs(roundDate(e) - ts) < DEDUP_WINDOW_MS
      );
      if (withinWindow) {
        entries.push(round);
        matched = true;
        break;
      }
    }

    if (!matched) {
      const key = `${companyKey}_${stageKey}_${ts}`;
      groups.set(key, [round]);
    }
  }

  // Build grouped results
  const grouped: GroupedRound[] = [];
  for (const [key, entries] of groups) {
    // Use the highest-confidence entry as the "primary"
    entries.sort((a, b) => b.confidence - a.confidence);
    const primary = entries[0];

    // Collect unique sources (by feed)
    const seenFeeds = new Set<string>();
    const sources = entries
      .map((e) => ({
        articleId: e.articleId,
        feedTitle: e.article.feed.title,
        articleTitle: e.article.title,
        articleUrl: e.article.url,
        confidence: e.confidence,
        publishedAt: e.article.publishedAt ? new Date(e.article.publishedAt).toISOString() : null,
      }))
      .filter((s) => {
        if (seenFeeds.has(s.feedTitle)) return false;
        seenFeeds.add(s.feedTitle);
        return true;
      });

    // Merge investors
    const allInvestors = new Set<string>();
    for (const e of entries) {
      if (e.investors) {
        for (const inv of e.investors) allInvestors.add(inv);
      }
    }

    const dates = entries
      .map((e) => e.article.publishedAt ? new Date(e.article.publishedAt).getTime() : e.createdAt.getTime())
      .sort();

    grouped.push({
      key,
      companyName: primary.companyName,
      amountUsd: primary.amountUsd,
      stage: primary.stage || entries.find((e) => e.stage)?.stage || null,
      country: primary.country || entries.find((e) => e.country)?.country || null,
      leadInvestor: primary.leadInvestor || entries.find((e) => e.leadInvestor)?.leadInvestor || null,
      allInvestors: Array.from(allInvestors),
      maxConfidence: primary.confidence,
      sourceCount: sources.length,
      sources,
      ingestedAt: entries.some((e) => e.ingestedAt) ? entries.find((e) => e.ingestedAt)!.ingestedAt!.toISOString() : null,
      firstSeen: new Date(dates[0]).toISOString(),
      lastSeen: new Date(dates[dates.length - 1]).toISOString(),
    });
  }

  // Sort
  grouped.sort((a, b) => {
    let cmp = 0;
    if (sortBy === "amount") {
      cmp = (a.amountUsd || 0) - (b.amountUsd || 0);
    } else if (sortBy === "confidence") {
      cmp = a.maxConfidence - b.maxConfidence;
    } else if (sortBy === "sources") {
      cmp = a.sourceCount - b.sourceCount;
    } else if (sortBy === "company") {
      cmp = a.companyName.localeCompare(b.companyName);
    } else {
      // lastSeen
      cmp = new Date(a.lastSeen).getTime() - new Date(b.lastSeen).getTime();
    }
    return sortOrder === "desc" ? -cmp : cmp;
  });

  return NextResponse.json({
    data: grouped,
    total: grouped.length,
  });
}
