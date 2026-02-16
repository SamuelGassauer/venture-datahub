import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

type ValueIndicatorEntry = {
  id: string;
  companyName: string;
  metricType: string;
  value: number | null;
  currency: string;
  valueUsd: number | null;
  unit: string | null;
  period: string | null;
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

export type GroupedValueIndicator = {
  key: string;
  companyName: string;
  metricType: string;
  value: number | null;
  valueUsd: number | null;
  currency: string;
  unit: string | null;
  period: string | null;
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
// Company name normalization
// ---------------------------------------------------------------------------

function normalizeCompany(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ---------------------------------------------------------------------------
// Grouping: company + metricType + 30-day window
// ---------------------------------------------------------------------------

const DEDUP_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function entryDate(e: ValueIndicatorEntry): number {
  return e.article.publishedAt
    ? new Date(e.article.publishedAt).getTime()
    : e.createdAt.getTime();
}

function groupIndicators(entries: ValueIndicatorEntry[]): Map<string, ValueIndicatorEntry[]> {
  const groups: ValueIndicatorEntry[][] = [];

  for (const entry of entries) {
    let matched = false;
    const normCompany = normalizeCompany(entry.companyName);

    for (const group of groups) {
      const rep = group[0];
      const repNorm = normalizeCompany(rep.companyName);

      // Company names must match
      const companyMatch =
        normCompany === repNorm ||
        normCompany.includes(repNorm) ||
        repNorm.includes(normCompany);

      if (!companyMatch) continue;

      // Same metric type
      if (entry.metricType !== rep.metricType) continue;

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

  const result = new Map<string, ValueIndicatorEntry[]>();
  for (const group of groups) {
    group.sort((a, b) => b.confidence - a.confidence);
    const primary = group[0];
    const key = `${normalizeCompany(primary.companyName)}_${primary.metricType}_${entryDate(primary)}`;
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
  const metricType = params.get("metricType");
  const search = params.get("search");
  const sortBy = params.get("sortBy") || "lastSeen";
  const sortOrder = params.get("sortOrder") || "desc";

  const showDismissed = params.get("showDismissed") === "true";
  const where: Record<string, unknown> = {
    confidence: { gte: 0.5 },
    ...(!showDismissed && { dismissedAt: null }),
  };
  if (metricType) where.metricType = metricType;
  if (search) {
    where.OR = [
      { companyName: { contains: search, mode: "insensitive" } },
      { article: { title: { contains: search, mode: "insensitive" } } },
    ];
  }

  const allIndicators = (await prisma.companyValueIndicator.findMany({
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
  })) as unknown as ValueIndicatorEntry[];

  const groups = groupIndicators(allIndicators);

  const grouped: GroupedValueIndicator[] = [];
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
      companyName: primary.companyName,
      metricType: primary.metricType,
      value: primary.value ?? entries.find((e) => e.value !== null)?.value ?? null,
      valueUsd: primary.valueUsd ?? entries.find((e) => e.valueUsd !== null)?.valueUsd ?? null,
      currency: primary.currency,
      unit: primary.unit ?? entries.find((e) => e.unit)?.unit ?? null,
      period: primary.period ?? entries.find((e) => e.period)?.period ?? null,
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
    if (sortBy === "value") {
      cmp = (a.valueUsd || a.value || 0) - (b.valueUsd || b.value || 0);
    } else if (sortBy === "confidence") {
      cmp = a.maxConfidence - b.maxConfidence;
    } else if (sortBy === "sources") {
      cmp = a.sourceCount - b.sourceCount;
    } else if (sortBy === "company") {
      cmp = a.companyName.localeCompare(b.companyName);
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
