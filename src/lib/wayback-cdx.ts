import { prisma } from "./db";

const FUNDING_KEYWORDS = [
  "funding", "raises", "series", "seed", "round", "secures", "million",
  "finanzierung", "investment", "backed", "venture", "capital", "fundrais",
  "mio", "mn", "growth-round", "pre-seed", "series-a", "series-b", "series-c",
  "series-d", "series-e", "bridge", "financing", "closes", "raise",
  "invests", "investiert", "runde", "wachstumsfinanzierung", "kapital",
];

export type WaybackSource = {
  name: string;
  pattern: string;
  filter?: string[];
};

export const WAYBACK_SOURCES: WaybackSource[] = [
  { name: "Sifted", pattern: "sifted.eu/articles/*" },
  { name: "FinSMEs", pattern: "finsmes.com/*" },
  { name: "Berlin Valley", pattern: "berlinvalley.com/*" },
  { name: "Startupticker.ch", pattern: "startupticker.ch/news/*" },
  { name: "TechCrunch", pattern: "techcrunch.com/*" },
  { name: "EU-Startups", pattern: "eu-startups.com/*" },
  { name: "Tech.eu", pattern: "tech.eu/*" },
];

export type WaybackCrawlResult = {
  source: string;
  totalUrls: number;
  filteredUrls: number;
  newUrls: number;
  skippedDuplicates: number;
  pages: number;
  error?: string;
  durationMs: number;
};

function toCdxDate(iso: string): string {
  return iso.replace(/-/g, "").slice(0, 8);
}

function matchesFundingKeywords(url: string): string[] {
  const lower = url.toLowerCase();
  return FUNDING_KEYWORDS.filter((kw) => lower.includes(kw));
}

function timestampToIso(ts: string): string | null {
  const m = ts.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`;
}

type CdxRow = { url: string; timestamp: string };

async function fetchCdxPage(
  pattern: string,
  fromDate: string,
  toDate: string,
  resumeKey: string | null,
): Promise<{ rows: CdxRow[]; nextResumeKey: string | null }> {
  const params = new URLSearchParams({
    url: pattern,
    output: "json",
    from: fromDate,
    to: toDate,
    fl: "original,timestamp",
    filter: "statuscode:200",
    collapse: "urlkey",
    showResumeKey: "true",
    limit: "5000",
  });
  if (resumeKey) params.set("resumeKey", resumeKey);

  const res = await fetch(`https://web.archive.org/cdx/search/cdx?${params}`, {
    headers: { "User-Agent": "Orbit-VC-Bot/1.0 (funding-research)" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`CDX HTTP ${res.status} for ${pattern}`);

  const text = await res.text();
  if (!text.trim()) return { rows: [], nextResumeKey: null };

  let parsed: string[][];
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`CDX returned non-JSON for ${pattern}`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { rows: [], nextResumeKey: null };
  }

  // First row is header [original, timestamp] — skip.
  const data = parsed.slice(1);

  // Trailing resumeKey: an empty row, then the resume key as a single string.
  let nextResumeKey: string | null = null;
  let endIdx = data.length;
  for (let i = data.length - 1; i >= 0; i--) {
    const row = data[i];
    if (Array.isArray(row) && row.length === 1 && typeof row[0] === "string" && row[0]) {
      // Look back: previous row should be empty separator.
      if (i > 0 && Array.isArray(data[i - 1]) && data[i - 1].every((c) => !c)) {
        nextResumeKey = row[0];
        endIdx = i - 1;
        break;
      }
    }
  }

  const rows: CdxRow[] = [];
  for (let i = 0; i < endIdx; i++) {
    const row = data[i];
    if (!Array.isArray(row) || row.length < 2) continue;
    const [url, timestamp] = row;
    if (!url || !timestamp) continue;
    rows.push({ url, timestamp });
  }

  return { rows, nextResumeKey };
}

export async function crawlWaybackSource(
  source: WaybackSource,
  minDate: string,
  maxDate: string,
  crawlBatch: string,
  opts: { maxPages?: number } = {},
): Promise<WaybackCrawlResult> {
  const start = Date.now();
  const maxPages = opts.maxPages ?? 20;
  try {
    const fromDate = toCdxDate(minDate);
    const toDate = toCdxDate(maxDate);

    const allRows: CdxRow[] = [];
    let resumeKey: string | null = null;
    let pages = 0;
    do {
      const { rows, nextResumeKey } = await fetchCdxPage(source.pattern, fromDate, toDate, resumeKey);
      allRows.push(...rows);
      pages++;
      resumeKey = nextResumeKey;
      if (resumeKey) await new Promise((r) => setTimeout(r, 1000));
    } while (resumeKey && pages < maxPages);

    // Dedup by URL (CDX collapse=urlkey already does this within a single page)
    const seen = new Set<string>();
    const deduped: CdxRow[] = [];
    for (const row of allRows) {
      if (seen.has(row.url)) continue;
      seen.add(row.url);
      deduped.push(row);
    }

    // Filter: keep only URLs with funding keywords
    const fundingCandidates = deduped
      .map((r) => ({ ...r, keywords: matchesFundingKeywords(r.url) }))
      .filter((r) => r.keywords.length > 0);

    if (fundingCandidates.length === 0) {
      return {
        source: source.name,
        totalUrls: deduped.length,
        filteredUrls: 0,
        newUrls: 0,
        skippedDuplicates: 0,
        pages,
        durationMs: Date.now() - start,
      };
    }

    // Existing URLs in HistoricalUrl
    const candidateUrls = fundingCandidates.map((r) => r.url);
    const existingHistorical = new Set(
      (
        await prisma.historicalUrl.findMany({
          where: { url: { in: candidateUrls } },
          select: { url: true },
        })
      ).map((r) => r.url),
    );
    const existingArticles = new Set(
      (
        await prisma.article.findMany({
          where: { url: { in: candidateUrls } },
          select: { url: true },
        })
      ).map((r) => r.url),
    );

    const toInsert = fundingCandidates.filter(
      (r) => !existingHistorical.has(r.url) && !existingArticles.has(r.url),
    );

    if (toInsert.length > 0) {
      await prisma.historicalUrl.createMany({
        data: toInsert.map((r) => ({
          url: r.url,
          source: source.name,
          lastmod: timestampToIso(r.timestamp) ? new Date(timestampToIso(r.timestamp) as string) : null,
          matchedKeywords: r.keywords,
          status: "discovered" as const,
          crawlBatch,
        })),
        skipDuplicates: true,
      });
    }

    return {
      source: source.name,
      totalUrls: deduped.length,
      filteredUrls: fundingCandidates.length,
      newUrls: toInsert.length,
      skippedDuplicates: fundingCandidates.length - toInsert.length,
      pages,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      source: source.name,
      totalUrls: 0,
      filteredUrls: 0,
      newUrls: 0,
      skippedDuplicates: 0,
      pages: 0,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - start,
    };
  }
}

export async function crawlAllWaybackSources(
  minDate: string = "2024-01-01",
  maxDate: string = new Date().toISOString().slice(0, 10),
  sources: WaybackSource[] = WAYBACK_SOURCES,
  opts: { maxPages?: number } = {},
): Promise<{ crawlBatch: string; results: WaybackCrawlResult[] }> {
  const crawlBatch = `wayback-${Date.now()}`;
  const results: WaybackCrawlResult[] = [];
  for (const source of sources) {
    const result = await crawlWaybackSource(source, minDate, maxDate, crawlBatch, opts);
    results.push(result);
  }
  return { crawlBatch, results };
}
