import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import * as cheerio from "cheerio";
import { extractFundingRegex } from "@/lib/funding-extractor";
import { extractFundEvent, isFundEvent } from "@/lib/fund-event-extractor";
import { extractValueIndicators } from "@/lib/value-indicator-extractor";
import { extractArticleContent as extractArticleContentShared } from "@/lib/article-scraper";

const HISTORICAL_FEED_URL = "historical://import";
const DEDUP_WINDOW_DAYS = 30;

function normalizeCompany(name: string): string {
  return name
    .replace(/['']s\s/g, " ")
    .replace(/\b(GmbH|AG|Inc\.?|Ltd\.?|Co\.?|LLC|SE|UG|S\.?A\.?|B\.?V\.?|plc|Corp\.?)\b/gi, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeStage(stage: string | null): string {
  if (!stage) return "";
  return stage.toLowerCase().replace(/[^a-z0-9+]/g, "");
}

async function findDuplicateRound(
  companyName: string,
  stage: string | null,
  amountUsd: number | null,
  publishedAt: Date,
): Promise<string | null> {
  const norm = normalizeCompany(companyName);
  if (!norm) return null;

  const minDate = new Date(publishedAt.getTime() - DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const maxDate = new Date(publishedAt.getTime() + DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // Find funding rounds in the time window
  const candidates = await prisma.fundingRound.findMany({
    where: {
      article: {
        publishedAt: { gte: minDate, lte: maxDate },
      },
    },
    include: { article: { select: { publishedAt: true } } },
  });

  for (const c of candidates) {
    const cNorm = normalizeCompany(c.companyName);
    // Company name must match (exact or substring)
    if (cNorm !== norm && !cNorm.includes(norm) && !norm.includes(cNorm)) continue;

    // Stage must match (if both known)
    const stageA = normalizeStage(stage);
    const stageB = normalizeStage(c.stage);
    if (stageA && stageB && stageA !== stageB) continue;

    // Amount within 20% tolerance (if both known)
    if (amountUsd && c.amountUsd) {
      const ratio = Math.min(amountUsd, c.amountUsd) / Math.max(amountUsd, c.amountUsd);
      if (ratio < 0.8) continue;
    }

    return c.id;
  }

  return null;
}

async function getOrCreateHistoricalFeed(): Promise<string> {
  const existing = await prisma.feed.findUnique({ where: { url: HISTORICAL_FEED_URL } });
  if (existing) return existing.id;

  const feed = await prisma.feed.create({
    data: {
      title: "Historical Import",
      url: HISTORICAL_FEED_URL,
      siteUrl: null,
      isActive: false,
      syncInterval: 0,
    },
  });
  return feed.id;
}

function extractArticleContent($: cheerio.CheerioAPI): string {
  return extractArticleContentShared($);
}

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const entry = await prisma.historicalUrl.findUnique({ where: { id } });
  if (!entry) {
    return NextResponse.json({ error: "URL not found" }, { status: 404 });
  }

  // Skip if already imported or if article with this URL already exists
  const existingArticle = await prisma.article.findUnique({ where: { url: entry.url } });
  if (existingArticle) {
    await prisma.historicalUrl.update({
      where: { id },
      data: { status: "imported", articleId: existingArticle.id },
    });
    return NextResponse.json({ status: "imported", message: "Article already exists", articleId: existingArticle.id });
  }

  try {
    // Full scrape
    const res = await fetch(entry.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Orbit-VC-Bot/1.0)",
        "Accept": "text/html",
      },
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      await prisma.historicalUrl.update({
        where: { id },
        data: { status: "error", errorMessage: `HTTP ${res.status}` },
      });
      return NextResponse.json({ error: `HTTP ${res.status}` }, { status: 502 });
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    const title = $("title").first().text().trim()
      || $('meta[property="og:title"]').attr("content")?.trim()
      || entry.title
      || "Untitled";

    const content = extractArticleContent($);
    const summary = $('meta[name="description"]').attr("content")?.trim()
      || $('meta[property="og:description"]').attr("content")?.trim()
      || content.slice(0, 300);
    const imageUrl = $('meta[property="og:image"]').attr("content")?.trim() || null;

    // Determine publishedAt from meta tags or sitemap lastmod
    const publishedAtStr = $('meta[property="article:published_time"]').attr("content")
      || $('time[datetime]').first().attr("datetime")
      || null;
    const publishedAt = publishedAtStr ? new Date(publishedAtStr)
      : entry.lastmod ? new Date(entry.lastmod)
      : new Date();

    // Create Article
    const feedId = await getOrCreateHistoricalFeed();
    const article = await prisma.article.create({
      data: {
        feedId,
        title,
        url: entry.url,
        content,
        summary,
        imageUrl,
        publishedAt,
        guid: entry.url,
      },
    });

    // Run extraction pipeline (same as sync-engine)
    let fundingCreated = false;
    let fundEventCreated = false;
    let duplicateOfId: string | null = null;
    const articleText = content || summary || "";

    // Fund event check first
    const fundEventData = isFundEvent(title, articleText)
      ? extractFundEvent(title, articleText)
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
      fundEventCreated = true;
    } else {
      // Funding round extraction (regex only — no LLM cost)
      const fundingData = extractFundingRegex(title, articleText);
      if (fundingData) {
        // Dedup: check if this round already exists (same company + stage + timeframe)
        const duplicateId = await findDuplicateRound(
          fundingData.companyName,
          fundingData.stage,
          fundingData.amountUsd,
          publishedAt,
        );

        if (duplicateId) {
          duplicateOfId = duplicateId;
        } else {
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
          fundingCreated = true;
        }
      }
    }

    // Value indicators
    const valueIndicators = extractValueIndicators(title, articleText);
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

    // Update feed article count
    await prisma.feed.update({
      where: { id: feedId },
      data: { articleCount: { increment: 1 } },
    });

    // Update historical URL status
    const finalStatus = duplicateOfId ? "skipped"
      : (fundingCreated || fundEventCreated) ? "imported"
      : "skipped";
    await prisma.historicalUrl.update({
      where: { id },
      data: {
        status: finalStatus,
        articleId: article.id,
        title,
        content: summary,
        scrapedAt: new Date(),
        processedAt: new Date(),
        errorMessage: duplicateOfId ? `Duplikat von FundingRound ${duplicateOfId}` : null,
      },
    });

    return NextResponse.json({
      status: finalStatus,
      articleId: article.id,
      duplicateOfId,
      title,
      fundingCreated,
      fundEventCreated,
      valueIndicators: valueIndicators.length,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await prisma.historicalUrl.update({
      where: { id },
      data: { status: "error", errorMessage: msg },
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
