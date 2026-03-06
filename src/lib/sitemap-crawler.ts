import { XMLParser } from "fast-xml-parser";
import { prisma } from "./db";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

const FUNDING_KEYWORDS = [
  "funding", "raises", "series", "seed", "round", "secures", "million",
  "finanzierung", "investment", "backed", "venture", "capital", "fundrais",
  "mio", "mn", "growth-round", "pre-seed", "series-a", "series-b", "series-c",
  "series-d", "series-e", "bridge", "financing", "closes", "raise",
  "invests", "investiert", "runde", "wachstumsfinanzierung", "kapital",
];

export type SitemapSource = {
  name: string;
  sitemapUrl: string;
  sitemapType: "yoast-index" | "rankmath-index" | "wp-default" | "custom-index" | "direct";
};

export const EU_SOURCES: SitemapSource[] = [
  { name: "EU-Startups", sitemapUrl: "https://www.eu-startups.com/sitemap_index.xml", sitemapType: "yoast-index" },
  { name: "Silicon Canals", sitemapUrl: "https://siliconcanals.com/sitemap.xml", sitemapType: "rankmath-index" },
  { name: "Tech Funding News", sitemapUrl: "https://techfundingnews.com/sitemap.xml", sitemapType: "yoast-index" },
  { name: "FINSIDER", sitemapUrl: "https://finsider.de/sitemap.xml", sitemapType: "wp-default" },
  { name: "Deutsche Startups", sitemapUrl: "https://www.deutsche-startups.de/sitemap_index.xml", sitemapType: "yoast-index" },
  { name: "Trending Topics", sitemapUrl: "https://www.trendingtopics.eu/sitemap_index.xml", sitemapType: "yoast-index" },
  { name: "The Recursive", sitemapUrl: "https://therecursive.com/sitemap_index.xml", sitemapType: "yoast-index" },
  { name: "Novobrief", sitemapUrl: "https://novobrief.com/sitemap_index.xml", sitemapType: "yoast-index" },
  { name: "ArcticStartup", sitemapUrl: "https://arcticstartup.com/sitemap.xml", sitemapType: "rankmath-index" },
  { name: "UKTN", sitemapUrl: "https://www.uktech.news/sitemap.xml", sitemapType: "yoast-index" },
  { name: "Tech.eu", sitemapUrl: "https://tech.eu/sitemap/index.xml", sitemapType: "custom-index" },
  { name: "Berlin Valley", sitemapUrl: "https://berlinvalley.com/sitemap.xml", sitemapType: "yoast-index" },
];

export type CrawlSourceResult = {
  source: string;
  totalUrls: number;
  filteredUrls: number;
  newUrls: number;
  skippedDuplicates: number;
  error?: string;
  durationMs: number;
};

async function fetchXml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Orbit-VC-Bot/1.0 (funding-research)" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function parseUrls(xml: string): { url: string; lastmod: string | null }[] {
  const parsed = parser.parse(xml);
  const urlset = parsed?.urlset?.url;
  if (!urlset) return [];
  const entries = Array.isArray(urlset) ? urlset : [urlset];
  return entries.map((e: Record<string, string>) => ({
    url: typeof e.loc === "string" ? e.loc : String(e.loc),
    lastmod: e.lastmod ? String(e.lastmod) : null,
  }));
}

function parseSitemapIndex(xml: string): string[] {
  const parsed = parser.parse(xml);
  const sitemaps = parsed?.sitemapindex?.sitemap;
  if (!sitemaps) return [];
  const entries = Array.isArray(sitemaps) ? sitemaps : [sitemaps];
  return entries
    .map((e: Record<string, string>) => (typeof e.loc === "string" ? e.loc : String(e.loc)))
    .filter((loc: string) => /post[-_]?sitemap/i.test(loc) || /posts/i.test(loc) || /wp-sitemap-posts-post/i.test(loc));
}

function matchesFundingKeywords(url: string): string[] {
  const lower = url.toLowerCase();
  return FUNDING_KEYWORDS.filter((kw) => lower.includes(kw));
}

function isAfterDate(lastmod: string | null, minDate: string): boolean {
  if (!lastmod) return true;
  return lastmod >= minDate;
}

export async function crawlSource(
  source: SitemapSource,
  minDate: string,
  crawlBatch: string,
): Promise<CrawlSourceResult> {
  const start = Date.now();
  try {
    let allUrls: { url: string; lastmod: string | null }[] = [];

    if (source.sitemapType === "direct") {
      const xml = await fetchXml(source.sitemapUrl);
      allUrls = parseUrls(xml);
    } else {
      const indexXml = await fetchXml(source.sitemapUrl);
      const subSitemaps = parseSitemapIndex(indexXml);

      if (subSitemaps.length === 0) {
        allUrls = parseUrls(indexXml);
      } else {
        for (const sub of subSitemaps) {
          try {
            const xml = await fetchXml(sub);
            const urls = parseUrls(xml);
            allUrls.push(...urls);
          } catch {
            // Skip failed sub-sitemaps
          }
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    }

    // Filter by date
    const dateFiltered = allUrls.filter((u) => isAfterDate(u.lastmod, minDate));

    // Filter by funding keywords
    const fundingCandidates = dateFiltered
      .map((u) => ({ ...u, keywords: matchesFundingKeywords(u.url) }))
      .filter((u) => u.keywords.length > 0);

    // Batch check which URLs already exist
    const existingUrls = new Set(
      (await prisma.historicalUrl.findMany({
        where: { url: { in: fundingCandidates.map((u) => u.url) } },
        select: { url: true },
      })).map((r) => r.url)
    );

    // Also check articles table (already imported via RSS)
    const existingArticles = new Set(
      (await prisma.article.findMany({
        where: { url: { in: fundingCandidates.map((u) => u.url) } },
        select: { url: true },
      })).map((r) => r.url)
    );

    // Insert new URLs
    const toInsert = fundingCandidates.filter(
      (u) => !existingUrls.has(u.url) && !existingArticles.has(u.url)
    );

    if (toInsert.length > 0) {
      await prisma.historicalUrl.createMany({
        data: toInsert.map((u) => ({
          url: u.url,
          source: source.name,
          lastmod: u.lastmod ? new Date(u.lastmod) : null,
          matchedKeywords: u.keywords,
          status: "discovered" as const,
          crawlBatch,
        })),
        skipDuplicates: true,
      });
    }

    return {
      source: source.name,
      totalUrls: allUrls.length,
      filteredUrls: dateFiltered.length,
      newUrls: toInsert.length,
      skippedDuplicates: fundingCandidates.length - toInsert.length,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      source: source.name,
      totalUrls: 0,
      filteredUrls: 0,
      newUrls: 0,
      skippedDuplicates: 0,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - start,
    };
  }
}

export async function crawlAllSources(
  minDate: string = "2024-01-01",
  sources: SitemapSource[] = EU_SOURCES,
): Promise<{ crawlBatch: string; results: CrawlSourceResult[] }> {
  const crawlBatch = `crawl-${Date.now()}`;
  const results: CrawlSourceResult[] = [];
  for (const source of sources) {
    const result = await crawlSource(source, minDate, crawlBatch);
    results.push(result);
  }
  return { crawlBatch, results };
}
