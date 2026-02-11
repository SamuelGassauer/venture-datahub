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

// ---------------------------------------------------------------------------
// Company name normalization & cleaning
// ---------------------------------------------------------------------------

// Noise words commonly leaked from article titles into company names
const NOISE_PREFIXES = [
  /^london['']s\s+/i,
  /^france['']s\s+/i,
  /^germany['']s\s+/i,
  /^europe['']s\s+/i,
  /^berlin['']s\s+/i,
  /^uk['']s\s+/i,
  /^can\s+\w+['']s\s+/i,        // "Can Bpifrance's ..."
  /^startup\s+/i,                 // "startup Smart Bricks"
  /^video\s+startup\s+/i,         // "Video Startup Runway"
  /^how\s+this\s+\w+\s+/i,       // "How this fintech"
  /^meet\s+/i,
  /^inside\s+/i,
  /^why\s+/i,
  /^the\s+/i,
];

const NOISE_SUFFIXES = [
  /\s+collects$/i,
  /\s+raises$/i,
  /\s+secures$/i,
  /\s+closes$/i,
  /\s+lands$/i,
  /\s+bags$/i,
  /\s+gets$/i,
  /\s+nabs$/i,
  /\s+snags$/i,
  /\s+grabs$/i,
  /\s+launches\s+.+$/i,           // "Antler launches always-on"
];

function cleanCompanyName(name: string): string {
  let cleaned = name.trim();
  for (const re of NOISE_PREFIXES) {
    cleaned = cleaned.replace(re, "");
  }
  for (const re of NOISE_SUFFIXES) {
    cleaned = cleaned.replace(re, "");
  }
  return cleaned.trim();
}

function normalizeCompany(name: string): string {
  return cleanCompanyName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function tokenize(name: string): string[] {
  return cleanCompanyName(name)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

// ---------------------------------------------------------------------------
// Similarity scoring
// ---------------------------------------------------------------------------

const DEDUP_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const MERGE_THRESHOLD = 0.55; // minimum score to merge

function roundDate(entry: FundingEntry): number {
  return entry.article.publishedAt
    ? new Date(entry.article.publishedAt).getTime()
    : entry.createdAt.getTime();
}

function normalizeStage(stage: string | null): string {
  if (!stage) return "";
  return stage.toLowerCase().replace(/[^a-z0-9+]/g, "");
}

/** Score how likely two entries belong to the same funding round (0..1) */
function matchScore(a: FundingEntry, b: FundingEntry): number {
  let score = 0;
  let maxScore = 0;

  // --- Company name similarity (most important: weight 0.40) ---
  const normA = normalizeCompany(a.companyName);
  const normB = normalizeCompany(b.companyName);

  if (normA === normB) {
    score += 0.40;
  } else if (normA.includes(normB) || normB.includes(normA)) {
    // Substring match: "occam" in "occamindustries"
    score += 0.35;
  } else {
    // Token overlap: shared significant words
    const tokA = tokenize(a.companyName);
    const tokB = tokenize(b.companyName);
    if (tokA.length > 0 && tokB.length > 0) {
      const shared = tokA.filter((t) => tokB.includes(t));
      const overlap = shared.length / Math.min(tokA.length, tokB.length);
      if (overlap >= 0.5 && shared.some((t) => t.length >= 3)) {
        score += 0.30 * overlap;
      }
    }
  }
  maxScore += 0.40;

  // --- Time proximity (weight 0.15) ---
  const timeDiff = Math.abs(roundDate(a) - roundDate(b));
  if (timeDiff < DEDUP_WINDOW_MS) {
    // Linear decay: closer = higher score
    score += 0.15 * (1 - timeDiff / DEDUP_WINDOW_MS);
  }
  maxScore += 0.15;

  // --- Amount similarity (weight 0.15) ---
  if (a.amountUsd && b.amountUsd) {
    const ratio = Math.min(a.amountUsd, b.amountUsd) / Math.max(a.amountUsd, b.amountUsd);
    if (ratio >= 0.8) {
      score += 0.15;
    } else if (ratio >= 0.5) {
      score += 0.15 * ((ratio - 0.5) / 0.3);
    }
  } else if (!a.amountUsd || !b.amountUsd) {
    // One missing: neutral, don't penalize
    score += 0.05;
  }
  maxScore += 0.15;

  // --- Stage match (weight 0.10) ---
  const stageA = normalizeStage(a.stage);
  const stageB = normalizeStage(b.stage);
  if (stageA && stageB) {
    if (stageA === stageB) {
      score += 0.10;
    }
    // Different stages strongly penalizes (don't add)
  } else {
    // One unknown: neutral
    score += 0.03;
  }
  maxScore += 0.10;

  // --- Lead investor match (weight 0.10) ---
  if (a.leadInvestor && b.leadInvestor) {
    const leadA = a.leadInvestor.toLowerCase().replace(/[^a-z0-9]/g, "");
    const leadB = b.leadInvestor.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (leadA === leadB) {
      score += 0.10;
    } else if (leadA.includes(leadB) || leadB.includes(leadA)) {
      score += 0.07;
    }
  }
  maxScore += 0.10;

  // --- Country match (weight 0.05) ---
  if (a.country && b.country) {
    if (a.country.toLowerCase() === b.country.toLowerCase()) {
      score += 0.05;
    }
  } else {
    score += 0.02;
  }
  maxScore += 0.05;

  // --- Investor overlap (weight 0.05) ---
  if (a.investors?.length > 0 && b.investors?.length > 0) {
    const setA = new Set(a.investors.map((i) => i.toLowerCase()));
    const overlap = b.investors.filter((i) => setA.has(i.toLowerCase())).length;
    if (overlap > 0) {
      score += 0.05 * Math.min(1, overlap / 2);
    }
  }
  maxScore += 0.05;

  return maxScore > 0 ? score / maxScore : 0;
}

/** Quick pre-filter: can these two entries possibly match? */
function canMatch(a: FundingEntry, b: FundingEntry): boolean {
  // Time window check
  const timeDiff = Math.abs(roundDate(a) - roundDate(b));
  if (timeDiff > DEDUP_WINDOW_MS) return false;

  // At least some company name overlap
  const normA = normalizeCompany(a.companyName);
  const normB = normalizeCompany(b.companyName);

  if (normA === normB) return true;
  if (normA.includes(normB) || normB.includes(normA)) return true;

  // Token overlap
  const tokA = tokenize(a.companyName);
  const tokB = tokenize(b.companyName);
  const shared = tokA.filter((t) => tokB.includes(t) && t.length >= 3);
  return shared.length > 0;
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

function groupRounds(allRounds: FundingEntry[]): Map<string, FundingEntry[]> {
  const groups: FundingEntry[][] = [];

  for (const round of allRounds) {
    let bestGroup: FundingEntry[] | null = null;
    let bestScore = 0;

    for (const group of groups) {
      // Check against the highest-confidence entry in the group
      for (const member of group) {
        if (!canMatch(round, member)) continue;
        const s = matchScore(round, member);
        if (s > bestScore) {
          bestScore = s;
          bestGroup = group;
        }
      }
    }

    if (bestGroup && bestScore >= MERGE_THRESHOLD) {
      bestGroup.push(round);
    } else {
      groups.push([round]);
    }
  }

  // Convert to Map with stable keys
  const result = new Map<string, FundingEntry[]>();
  for (const group of groups) {
    group.sort((a, b) => b.confidence - a.confidence);
    const primary = group[0];
    const norm = normalizeCompany(primary.companyName);
    const stage = normalizeStage(primary.stage) || "unknown";
    const ts = roundDate(primary);
    const key = `${norm}_${stage}_${ts}`;
    result.set(key, group);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const stage = params.get("stage");
  const country = params.get("country");
  const search = params.get("search");
  const sortBy = params.get("sortBy") || "lastSeen";
  const sortOrder = params.get("sortOrder") || "desc";

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

  // Score-based grouping
  const groups = groupRounds(allRounds);

  // Build grouped results
  const grouped: GroupedRound[] = [];
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
        publishedAt: e.article.publishedAt ? new Date(e.article.publishedAt).toISOString() : null,
      }))
      .filter((s) => {
        if (seenFeeds.has(s.feedTitle)) return false;
        seenFeeds.add(s.feedTitle);
        return true;
      });

    const allInvestors = new Set<string>();
    for (const e of entries) {
      if (e.investors) {
        for (const inv of e.investors) allInvestors.add(inv);
      }
    }

    const dates = entries
      .map((e) =>
        e.article.publishedAt
          ? new Date(e.article.publishedAt).getTime()
          : e.createdAt.getTime()
      )
      .sort();

    // Pick the best (cleanest) company name: shortest name from high-confidence entries
    const bestName = entries
      .filter((e) => e.confidence >= primary.confidence * 0.8)
      .map((e) => cleanCompanyName(e.companyName))
      .sort((a, b) => a.length - b.length)[0] || cleanCompanyName(primary.companyName);

    grouped.push({
      key,
      companyName: bestName,
      amountUsd: primary.amountUsd || entries.find((e) => e.amountUsd)?.amountUsd || null,
      stage: primary.stage || entries.find((e) => e.stage)?.stage || null,
      country: primary.country || entries.find((e) => e.country)?.country || null,
      leadInvestor:
        primary.leadInvestor || entries.find((e) => e.leadInvestor)?.leadInvestor || null,
      allInvestors: Array.from(allInvestors),
      maxConfidence: primary.confidence,
      sourceCount: sources.length,
      sources,
      ingestedAt: entries.some((e) => e.ingestedAt)
        ? entries.find((e) => e.ingestedAt)!.ingestedAt!.toISOString()
        : null,
      firstSeen: new Date(dates[0]).toISOString(),
      lastSeen: new Date(dates[dates.length - 1]).toISOString(),
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
