import Anthropic from "@anthropic-ai/sdk";
import * as cheerio from "cheerio";
import { prisma } from "./db";
import driver from "./neo4j";
import { normalizeCompany } from "./graph-sync";
import { taxonomyForPrompt, validateSector, validateSubsector } from "./taxonomy";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EnrichProgress = {
  stage: "articles" | "website" | "llm" | "save" | "done" | "error";
  message: string;
  fieldsUpdated?: string[];
  detail?: string;
};

type ArticleRow = { url: string; content: string | null; title: string };

type EnrichedFields = {
  description?: string | null;
  website?: string | null;
  foundedYear?: number | null;
  employeeRange?: string | null;
  linkedinUrl?: string | null;
  country?: string | null;
  status?: string | null;
  location?: string | null;
  sector?: string | null;
  subsector?: string | null;
};

type LLMResult = EnrichedFields & {
  fieldConfidence: Record<string, number>;
};

// ---------------------------------------------------------------------------
// Anthropic client (singleton)
// ---------------------------------------------------------------------------

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

// ---------------------------------------------------------------------------
// Stage 1: Load linked articles from Neo4j + Prisma
// ---------------------------------------------------------------------------

async function loadArticles(normalizedName: string): Promise<ArticleRow[]> {
  const session = driver().session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(
      `MATCH (c:Company {normalizedName: $norm})-[:RAISED]->(fr:FundingRound)-[:SOURCED_FROM]->(a:Article)
       RETURN DISTINCT a.url AS url, a.title AS title`,
      { norm: normalizedName }
    );

    const urls = result.records.map((r) => ({
      url: r.get("url") as string,
      title: r.get("title") as string,
    }));

    if (urls.length === 0) return [];

    // Lookup full content from Prisma
    const articles = await prisma.article.findMany({
      where: { url: { in: urls.map((u) => u.url) } },
      select: { url: true, content: true, title: true },
    });

    return articles.map((a) => ({
      url: a.url,
      title: a.title,
      content: a.content,
    }));
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Stage 2: Scrape company website
// ---------------------------------------------------------------------------

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export type ScrapeResult = { text: string; logoUrl: string | null; logoCandidates: LogoCandidate[] };

function resolveUrl(base: string, href: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

// ---------------------------------------------------------------------------
// Logo extraction — tiered pipeline with validation
// ---------------------------------------------------------------------------

export type LogoCandidate = { url: string; score: number; source: string };

const LOGO_PATTERN = /logo/i;
const BRAND_PATTERN = /brand|mark|symbol/i;
const ICON_SIZE_RE = /(\d+)[x×](\d+)/;

function parseSize(sizes: string | undefined): number {
  if (!sizes) return 0;
  const m = sizes.match(ICON_SIZE_RE);
  return m ? Math.max(Number(m[1]), Number(m[2])) : 0;
}

function looksLikeImage(href: string): boolean {
  if (!href || href.startsWith("data:")) return false;
  if (href.includes("pixel") || href.includes("tracking") || href.includes("spacer")) return false;
  return true;
}

/** Detect URLs that look like person headshots / portraits rather than logos */
const HEADSHOT_PATTERN = /headshot|portrait|avatar|profile[-_]?pic|team[-_]?member|about[-_]?us|people|staff|\bhs[-_]\d|[-_]ceo|[-_]founder|[-_]face|mugshot|person/i;

function looksLikeHeadshot(url: string): boolean {
  // Check the filename/path part of the URL
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (HEADSHOT_PATTERN.test(pathname)) return true;
    // "crop" + person-related signals
    if (pathname.includes("crop") && /hs|head|face|portrait/i.test(pathname)) return true;
  } catch {
    if (HEADSHOT_PATTERN.test(url.toLowerCase())) return true;
  }
  return false;
}

/** Validate a logo URL: must be reachable, must be an image, must not be tiny */
export async function validateLogoUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(4000),
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
    });
    if (!res.ok) return false;
    const ct = res.headers.get("content-type") || "";
    // Must be an image content type OR have an image extension
    if (!ct.startsWith("image/") && !url.match(/\.(png|jpg|jpeg|svg|webp|gif|ico)(\?|$)/i)) return false;
    // Reject tiny files (< 200 bytes = likely a 1px tracking pixel)
    const cl = parseInt(res.headers.get("content-length") || "0", 10);
    if (cl > 0 && cl < 200 && !ct.includes("svg")) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract logo from HTML using a tiered approach.
 * Returns candidates sorted by reliability tier, then by score within tier.
 *
 * Tier 1 (Structural — ~99% reliable):
 *   JSON-LD logo, apple-touch-icon, SVG favicon
 *
 * Tier 2 (Semantic — ~90% reliable):
 *   <img> with "logo" in class/id/alt, inside header home-link
 *
 * Tier 3 (Heuristic — ~70% reliable):
 *   First img in header/nav, og:image, regular favicon
 */
export function extractLogoCandidates($: cheerio.CheerioAPI, baseUrl: string): LogoCandidate[] {
  const candidates: LogoCandidate[] = [];
  const TIER1 = 1000; // structural sources get massive score boost
  const TIER2 = 500;

  // ===== TIER 1: Structural (deterministic, almost always correct) =====

  // 1a. JSON-LD structured data — explicitly declared logo
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).html() || "";
      const data = JSON.parse(raw);
      const items = Array.isArray(data) ? data : [data];
      for (const obj of items) {
        const logo = obj.logo?.url || obj.logo?.contentUrl || obj.logo;
        if (typeof logo === "string" && looksLikeImage(logo)) {
          const resolved = resolveUrl(baseUrl, logo);
          // Penalize URLs that look like headshots/portraits (not actual logos)
          const penalty = looksLikeHeadshot(resolved) ? 200 : 0;
          candidates.push({ url: resolved, score: TIER1 + 95 - penalty, source: "json-ld-logo" });
        }
        const image = obj.image?.url || obj.image?.contentUrl || obj.image;
        if (typeof image === "string" && looksLikeImage(image) && obj["@type"]?.match?.(/Organization|Corporation/i)) {
          const resolved = resolveUrl(baseUrl, image);
          const penalty = looksLikeHeadshot(resolved) ? 200 : 0;
          candidates.push({ url: resolved, score: TIER1 + 80 - penalty, source: "json-ld-org-image" });
        }
      }
    } catch { /* ignore */ }
  });

  // 1b. apple-touch-icon (180x180 PNG, always the brand logo)
  $('link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const size = parseSize($(el).attr("sizes"));
    candidates.push({ url: resolveUrl(baseUrl, href), score: TIER1 + 75 + Math.min(size / 10, 10), source: "apple-touch-icon" });
  });

  // 1c. SVG favicon (vector, crisp, always the brand mark)
  $('link[rel="icon"][type="image/svg+xml"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    candidates.push({ url: resolveUrl(baseUrl, href), score: TIER1 + 70, source: "svg-favicon" });
  });

  // ===== TIER 1.5: Top-left positional (logo is almost always the first image in header) =====
  // This is the strongest visual signal: the very first <a> in header/nav
  // wrapping an <img> is the logo ~95% of the time.

  const BRAND_LINK_PATTERN = /brand|logo|home|site[-_]?mark/i;

  // 1.5a. First <a> in header/nav that contains an <img> — top-left logo position
  for (const container of ["header", "nav", '[role="banner"]']) {
    const $container = $(container).first();
    if (!$container.length) continue;

    // Find the first <a> in the container (top-left link = logo link)
    const $firstLink = $container.find("a").first();
    if (!$firstLink.length) continue;

    const linkHref = ($firstLink.attr("href") || "").trim();
    const linkCls = ($firstLink.attr("class") || "").toLowerCase();
    const isHomeLink = linkHref === "/" || linkHref === "#" || linkHref === "./"
      || /^https?:\/\/[^/]+\/?$/.test(linkHref) || linkHref === "";
    const isBrandLink = BRAND_LINK_PATTERN.test(linkCls);

    // Look for <img> inside this first link
    const $img = $firstLink.find("img").first();
    if ($img.length) {
      const src = $img.attr("src") || $img.attr("data-src") || $img.attr("srcset")?.split(/[,\s]+/)[0];
      if (src && looksLikeImage(src)) {
        // Top-left + home link = extremely strong logo signal
        let score = TIER1 + 90; // just below JSON-LD
        if (isHomeLink) score += 5;
        if (isBrandLink) score += 5;
        if (looksLikeHeadshot(resolveUrl(baseUrl, src))) score -= 200;
        candidates.push({ url: resolveUrl(baseUrl, src), score, source: "header-first-link-img" });
      }
    }
  }

  // ===== TIER 2: Semantic (strong logo signals in HTML) =====

  // 2a. <img> with explicit "logo" in class, id, alt, or src
  $("img").each((_, el) => {
    const $el = $(el);
    const src = $el.attr("src") || $el.attr("data-src") || $el.attr("srcset")?.split(/[,\s]+/)[0];
    if (!src || !looksLikeImage(src)) return;

    const cls = ($el.attr("class") || "").toLowerCase();
    const id = ($el.attr("id") || "").toLowerCase();
    const alt = ($el.attr("alt") || "").toLowerCase();
    const srcLower = src.toLowerCase();
    const ariaLabel = ($el.attr("aria-label") || "").toLowerCase();

    let score = 0;

    // Direct "logo" keyword signals
    if (LOGO_PATTERN.test(cls)) score += 50;
    if (LOGO_PATTERN.test(id)) score += 50;
    if (LOGO_PATTERN.test(alt)) score += 40;
    if (LOGO_PATTERN.test(srcLower)) score += 35;
    if (LOGO_PATTERN.test(ariaLabel)) score += 40;
    if (BRAND_PATTERN.test(cls)) score += 20;
    if (BRAND_PATTERN.test(id)) score += 20;

    // Parent context signals
    const parents = $el.parents().toArray();
    let inHeader = false;
    let inHomeLink = false;
    let inBrandLink = false;
    let parentHasLogo = false;
    let isFirstImgInHeader = false;
    for (const p of parents) {
      const tag = p.tagName?.toLowerCase();
      const pCls = ($(p).attr("class") || "").toLowerCase();
      const pId = ($(p).attr("id") || "").toLowerCase();
      if (tag === "header" || tag === "nav") {
        inHeader = true;
        // Check if this is the first <img> inside the header/nav
        const $firstImg = $(p).find("img").first();
        if ($firstImg.is($el)) isFirstImgInHeader = true;
      }
      if (LOGO_PATTERN.test(pCls) || LOGO_PATTERN.test(pId)) parentHasLogo = true;
      if (BRAND_LINK_PATTERN.test(pCls)) inBrandLink = true;
      if (tag === "a") {
        const href = $(p).attr("href") || "";
        if (href === "/" || href === "#" || /^https?:\/\/[^/]+\/?$/.test(href)) inHomeLink = true;
      }
    }

    if (parentHasLogo) score += 30;
    if (inHeader) score += 15;
    if (inHomeLink) score += 20;
    if (inBrandLink) score += 25;
    if (isFirstImgInHeader) score += 30; // first image = top-left position
    if (srcLower.endsWith(".svg")) score += 10;

    // Penalize very small images
    const width = parseInt($el.attr("width") || "0", 10);
    const height = parseInt($el.attr("height") || "0", 10);
    if ((width > 0 && width < 16) || (height > 0 && height < 16)) score -= 50;
    // Penalize headshots
    if (looksLikeHeadshot(src)) score -= 80;

    // Only include if there's at least some logo signal
    if (score >= 30) {
      candidates.push({ url: resolveUrl(baseUrl, src), score: TIER2 + score, source: "img-logo" });
    }
  });

  // 2b. <picture> with logo signals
  $("picture source").each((_, el) => {
    const $el = $(el);
    const srcset = $el.attr("srcset");
    if (!srcset) return;
    const firstSrc = srcset.split(/[,\s]+/)[0];
    if (!firstSrc || !looksLikeImage(firstSrc)) return;
    const $img = $el.parent().find("img");
    if (!$img.length) return;
    const cls = ($img.attr("class") || "").toLowerCase();
    const alt = ($img.attr("alt") || "").toLowerCase();
    if (LOGO_PATTERN.test(cls) || LOGO_PATTERN.test(alt)) {
      candidates.push({ url: resolveUrl(baseUrl, firstSrc), score: TIER2 + 60, source: "picture-logo" });
    }
  });

  // 2c. SVG with logo signals (embedded <image> inside)
  $("svg").each((_, el) => {
    const $el = $(el);
    const cls = ($el.attr("class") || "").toLowerCase();
    const ariaLabel = ($el.attr("aria-label") || "").toLowerCase();
    let parentHasLogo = false;
    let inBrandLink = false;
    for (const p of $el.parents().toArray()) {
      const pCls = ($(p).attr("class") || "").toLowerCase();
      const pId = ($(p).attr("id") || "").toLowerCase();
      if (LOGO_PATTERN.test(pCls) || LOGO_PATTERN.test(pId)) parentHasLogo = true;
      if (BRAND_LINK_PATTERN.test(pCls)) inBrandLink = true;
    }
    if (LOGO_PATTERN.test(cls) || LOGO_PATTERN.test(ariaLabel) || parentHasLogo || inBrandLink) {
      const imageHref = $el.find("image").attr("href") || $el.find("image").attr("xlink:href");
      if (imageHref && looksLikeImage(imageHref)) {
        candidates.push({ url: resolveUrl(baseUrl, imageHref), score: TIER2 + 55, source: "svg-embedded" });
      }
    }
  });

  // ===== TIER 3: Heuristic fallbacks =====

  // 3a. First <img> inside <header> home link (even without explicit logo class)
  for (const container of ["header", '[role="banner"]']) {
    const $homeLink = $(container).find('a[href="/"], a[href="./"]').first();
    if ($homeLink.length) {
      const $img = $homeLink.find("img").first();
      if ($img.length) {
        const src = $img.attr("src") || $img.attr("data-src");
        if (src && looksLikeImage(src)) {
          candidates.push({ url: resolveUrl(baseUrl, src), score: 200, source: "header-home-img" });
        }
      }
    }
  }

  // 3b. First <img> in header (any, even without home link)
  for (const container of ["header", "nav"]) {
    const $firstImg = $(container).find("img").first();
    if ($firstImg.length) {
      const src = $firstImg.attr("src") || $firstImg.attr("data-src");
      if (src && looksLikeImage(src)) {
        candidates.push({ url: resolveUrl(baseUrl, src), score: 150, source: "header-first-img" });
      }
    }
  }

  // 3c. Regular favicon (PNG, large sizes preferred)
  $('link[rel="icon"], link[rel="shortcut icon"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const type = $(el).attr("type") || "";
    if (type.includes("svg")) return; // Already captured in Tier 1
    const size = parseSize($(el).attr("sizes"));
    if (size >= 64 || size === 0) { // Only include decent-sized favicons
      candidates.push({ url: resolveUrl(baseUrl, href), score: 100 + Math.min(size / 5, 20), source: "favicon" });
    }
  });

  // 3d. og:image (often a banner, but sometimes the only option)
  const ogImage = $('meta[property="og:image"]').attr("content");
  if (ogImage && looksLikeImage(ogImage)) {
    const resolved = resolveUrl(baseUrl, ogImage);
    const penalty = looksLikeHeadshot(resolved) ? 40 : 0;
    candidates.push({ url: resolved, score: 50 - penalty, source: "og-image" });
  }

  // Deduplicate by URL, keep highest score
  const urlMap = new Map<string, LogoCandidate>();
  for (const c of candidates) {
    const existing = urlMap.get(c.url);
    if (!existing || c.score > existing.score) {
      urlMap.set(c.url, c);
    }
  }

  return Array.from(urlMap.values()).sort((a, b) => b.score - a.score);
}

/**
 * Find the best logo from a list of candidates by validating each one.
 * Tries candidates in score order. First valid one wins.
 * Also tries /apple-touch-icon.png as a direct fallback.
 */
export async function findBestLogo(
  candidates: LogoCandidate[],
  baseUrl: string
): Promise<string | null> {
  // Also try direct /apple-touch-icon.png (many sites have it even without <link> tag)
  const domain = getDomain(baseUrl);
  const directAppleIcon = `https://${domain}/apple-touch-icon.png`;
  const hasAppleInCandidates = candidates.some((c) => c.url === directAppleIcon);
  if (!hasAppleInCandidates) {
    candidates.push({ url: directAppleIcon, score: 900, source: "direct-apple-touch-icon" });
    candidates.sort((a, b) => b.score - a.score);
  }

  // Validate candidates in order, return first valid one
  // Process in small parallel batches for speed
  for (let i = 0; i < Math.min(candidates.length, 8); i += 3) {
    const batch = candidates.slice(i, i + 3);
    const results = await Promise.all(
      batch.map(async (c) => ({ ...c, valid: await validateLogoUrl(c.url) }))
    );

    const valid = results.find((r) => r.valid);
    if (valid) return valid.url;
  }

  return null;
}


/** Parse already-fetched HTML into structured data + logo candidates */
export function scrapeHtml(html: string, baseUrl: string): ScrapeResult {
  const fullUrl = baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;
  const $ = cheerio.load(html);

  // Extract logo candidates (sync — validation happens later via findBestLogo)
  const logoCandidates = extractLogoCandidates($, fullUrl);
  // Use the top candidate as a sync fallback (callers can use findBestLogo for async validation)
  const logoUrl = logoCandidates[0]?.url ?? null;

  const parts: string[] = [];

  const metaDesc =
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content");
  if (metaDesc) parts.push(`Description: ${metaDesc}`);

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || "");
      const obj = Array.isArray(data) ? data[0] : data;
      if (obj.foundingDate) parts.push(`Founded: ${obj.foundingDate}`);
      if (obj.numberOfEmployees?.value)
        parts.push(`Employees: ${obj.numberOfEmployees.value}`);
      if (obj.sameAs) {
        const links = Array.isArray(obj.sameAs) ? obj.sameAs : [obj.sameAs];
        for (const link of links) {
          if (typeof link === "string" && link.includes("linkedin.com"))
            parts.push(`LinkedIn: ${link}`);
        }
      }
    } catch {
      // ignore
    }
  });

  $('a[href*="linkedin.com/company"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href) parts.push(`LinkedIn: ${href}`);
  });

  $("nav, footer, script, style, header, aside, noscript").remove();
  const bodyText = stripHtml($("body").text()).slice(0, 2000);
  if (bodyText) parts.push(`Page content: ${bodyText}`);

  return { text: parts.join("\n\n"), logoUrl, logoCandidates };
}

export async function scrapeWebsite(url: string): Promise<ScrapeResult | null> {
  try {
    const fullUrl = url.startsWith("http") ? url : `https://${url}`;
    const res = await fetch(fullUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,*/*",
      },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    if (!res.ok) return null;

    const html = await res.text();
    return scrapeHtml(html, fullUrl);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Stage 3: Website discovery — multi-signal AI pipeline
// ---------------------------------------------------------------------------

/** Domains that must never be stored as a company/investor website */
const NOT_A_WEBSITE_DOMAINS = new Set([
  "linkedin.com", "www.linkedin.com",
  "twitter.com", "x.com",
  "facebook.com", "www.facebook.com",
  "instagram.com", "www.instagram.com",
  "youtube.com", "www.youtube.com",
  "tiktok.com", "www.tiktok.com",
  "github.com",
  "medium.com",
  "substack.com",
  "crunchbase.com",
  "pitchbook.com",
  "dealroom.co",
  "wikipedia.org",
]);

/** Check if a URL is a valid company website (not social media, news, etc.) */
export function isValidWebsiteUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const domain = getDomain(url).toLowerCase();
  if (!domain) return false;
  for (const blocked of NOT_A_WEBSITE_DOMAINS) {
    if (domain === blocked || domain.endsWith(`.${blocked}`)) return false;
  }
  return true;
}

/** Known news/RSS/social domains that are NOT company websites */
const NEWS_DOMAINS = new Set([
  // Major tech/business news
  "techcrunch.com", "bloomberg.com", "reuters.com", "cnbc.com", "bbc.com",
  "theguardian.com", "nytimes.com", "wsj.com", "ft.com", "forbes.com",
  "venturebeat.com", "wired.com", "arstechnica.com", "theverge.com",
  "techradar.com", "zdnet.com", "cnet.com", "engadget.com",
  // EU startup/VC news
  "sifted.eu", "eu-startups.com", "tech.eu", "handelsblatt.com",
  "gruenderszene.de", "t3n.de", "businessinsider.com", "businessinsider.de",
  "siliconcanals.com", "arcticstartup.com", "uktech.news",
  "techfundingnews.com", "deutsche-startups.de", "trendingtopics.eu",
  "berlinvalley.com", "maddyness.com", "novobrief.com", "therecursive.com",
  "finsmes.com", "finsider.de", "altfi.com", "fintechfutures.com",
  "cleantechnica.com", "healthtechnordic.com",
  // Data/research platforms
  "pitchbook.com", "crunchbase.com", "dealroom.co", "cbinsights.com",
  "tracxn.com", "owler.com", "craft.co", "zoominfo.com",
  "angel.co", "wellfound.com", "f6s.com",
  // Social / content platforms
  "twitter.com", "x.com", "facebook.com", "instagram.com", "youtube.com",
  "medium.com", "substack.com", "github.com", "wikipedia.org",
  "reddit.com", "news.ycombinator.com",
  // Big tech (never a startup website)
  "google.com", "apple.com", "amazon.com", "microsoft.com",
]);

/** Domains that look like VC/investor sites — penalize when searching for startups */
const VC_DOMAIN_PATTERNS = [
  /ventures?\./, /capital\./, /partners\./, /invest/, /\.vc$/,
  /fund\./, /catalyst/, /accel\./, /greylock/, /sequoia/, /a16z/,
  /andreessen/, /lightspeed/, /benchmark/, /index\.co/, /indexventures/,
];

export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Extract all URLs from article HTML content, filtering out news sites */
function extractUrlsFromArticles(
  articles: { content: string | null; url: string }[]
): string[] {
  const urls = new Set<string>();
  const articleDomains = new Set(articles.map((a) => getDomain(a.url)));

  for (const article of articles) {
    if (!article.content) continue;

    // Parse <a href="..."> from HTML
    const hrefMatches = article.content.matchAll(/href=["']?(https?:\/\/[^"'\s>]+)/gi);
    for (const m of hrefMatches) {
      urls.add(m[1].replace(/['">\s]+$/, ""));
    }

    // Also match bare URLs in text
    const urlMatches = article.content.matchAll(/(https?:\/\/[^\s<"']+)/gi);
    for (const m of urlMatches) {
      urls.add(m[1].replace(/[.,;:)]+$/, ""));
    }
  }

  // Filter out news/social domains + the article source domains themselves
  return Array.from(urls).filter((url) => {
    const domain = getDomain(url);
    if (!domain) return false;
    if (NEWS_DOMAINS.has(domain)) return false;
    // Remove subdomains of news sites too
    for (const nd of NEWS_DOMAINS) {
      if (domain.endsWith(`.${nd}`)) return false;
    }
    // Remove the article's own source domains
    if (articleDomains.has(domain)) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Brave Search API — real web search for website discovery
// ---------------------------------------------------------------------------

export type BraveSearchResult = {
  title: string;
  url: string;
  description: string;
};

export async function searchWeb(
  query: string,
  count: number = 5
): Promise<BraveSearchResult[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    console.warn("BRAVE_SEARCH_API_KEY not set — skipping web search");
    return [];
  }

  try {
    const params = new URLSearchParams({
      q: query,
      count: String(count),
      safesearch: "off",
    });

    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?${params}`,
      {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": apiKey,
        },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!res.ok) {
      console.warn(`Brave Search API error: ${res.status} ${res.statusText}`);
      return [];
    }

    const data = await res.json();
    const results: BraveSearchResult[] = [];

    for (const r of data.web?.results ?? []) {
      results.push({
        title: r.title ?? "",
        url: r.url ?? "",
        description: r.description ?? "",
      });
    }

    return results;
  } catch (e) {
    console.warn("Brave Search error:", e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Logo search via Brave Image Search + validation
// ---------------------------------------------------------------------------

/**
 * Search for an entity's logo using Brave Image Search.
 * Returns the best logo URL or null.
 */
export async function searchLogo(
  entityName: string,
  entityType: "company" | "investor" = "company",
  websiteDomain?: string | null
): Promise<string | null> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return null;

  const typeHint = entityType === "investor" ? "venture capital fund" : "startup company";
  const query = `${entityName} ${typeHint} logo`;

  try {
    const params = new URLSearchParams({
      q: query,
      count: "8",
      safesearch: "off",
    });

    const res = await fetch(
      `https://api.search.brave.com/res/v1/images/search?${params}`,
      {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": apiKey,
        },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!res.ok) {
      console.warn(`Brave Image Search error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const results: { url: string; source: string; width: number; height: number }[] = [];

    for (const r of data.results ?? []) {
      const url = r.properties?.url ?? r.thumbnail?.src;
      if (!url || typeof url !== "string") continue;
      // Skip tiny images, tracking pixels, data URIs
      if (url.startsWith("data:")) continue;
      if (url.includes("pixel") || url.includes("tracking") || url.includes("spacer")) continue;

      results.push({
        url,
        source: r.source ?? "",
        width: r.properties?.width ?? r.width ?? 0,
        height: r.properties?.height ?? r.height ?? 0,
      });
    }

    if (results.length === 0) return null;

    // Score candidates:
    // - Prefer images from the entity's own website domain
    // - Prefer reasonable sizes (not too small, not huge banners)
    // - Prefer PNG/SVG over JPG
    // - Penalize generic stock/placeholder images
    let best: { url: string; score: number } | null = null;

    for (const r of results) {
      let score = 10;
      const urlLower = r.url.toLowerCase();
      const sourceLower = r.source.toLowerCase();

      // From entity's own website = strong signal
      if (websiteDomain && (urlLower.includes(websiteDomain) || sourceLower.includes(websiteDomain))) {
        score += 40;
      }

      // URL or source contains "logo" keyword
      if (urlLower.includes("logo") || sourceLower.includes("logo")) score += 30;

      // Prefer vector/PNG over JPEG
      if (urlLower.endsWith(".svg")) score += 20;
      if (urlLower.endsWith(".png")) score += 10;
      if (urlLower.includes(".webp")) score += 5;

      // Reasonable dimensions (logos are usually squarish, 64-512px)
      const w = r.width;
      const h = r.height;
      if (w > 0 && h > 0) {
        const ratio = Math.max(w, h) / Math.min(w, h);
        if (ratio < 3) score += 10; // roughly square = likely a logo
        if (ratio > 5) score -= 15; // too wide = likely a banner
        if (w >= 64 && w <= 1024 && h >= 64 && h <= 1024) score += 10;
        if (w < 32 || h < 32) score -= 20; // too small
      }

      // Penalize Crunchbase, Dealroom etc. (often show generic data pages, not real logos)
      if (sourceLower.includes("crunchbase") || sourceLower.includes("dealroom") ||
          sourceLower.includes("pitchbook") || sourceLower.includes("cbinsights")) {
        score -= 10;
      }

      if (!best || score > best.score) {
        best = { url: r.url, score };
      }
    }

    if (best && best.score >= 15) {
      // Validate the URL is reachable and is actually an image
      try {
        const check = await fetch(best.url, {
          method: "HEAD",
          signal: AbortSignal.timeout(4000),
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          },
        });
        const contentType = check.headers.get("content-type") || "";
        if (check.ok && (contentType.startsWith("image/") || best.url.match(/\.(png|jpg|jpeg|svg|webp|ico|gif)(\?|$)/i))) {
          return best.url;
        }
      } catch {
        // URL unreachable, skip
      }
    }

    return null;
  } catch (e) {
    console.warn("Logo search error:", e);
    return null;
  }
}

/** Smart URL validation: GET with browser User-Agent (many sites block HEAD) */
export async function validateUrl(url: string): Promise<{ ok: boolean; html?: string }> {
  try {
    const full = url.startsWith("http") ? url : `https://${url}`;
    const res = await fetch(full, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,*/*",
      },
      signal: AbortSignal.timeout(6000),
      redirect: "follow",
    });
    if (!res.ok) return { ok: false };
    // Read a small chunk to verify it's real content
    const html = await res.text();
    if (html.length < 100) return { ok: false };
    return { ok: true, html };
  } catch {
    return { ok: false };
  }
}

const WEBSITE_DISCOVERY_PROMPT = `You are a website identification engine. Given the name of an entity and its type, plus URLs found in news articles, identify the entity's OFFICIAL website and LinkedIn page.

CRITICAL RULES:
- You are looking for the website of the SPECIFIC ENTITY named below — NOT any other company mentioned in the articles
- Articles about funding rounds mention BOTH the startup that raised AND the investors. You must distinguish between them!
- If the entity is an INVESTOR: the articles are about their portfolio companies' funding rounds. URLs to the portfolio companies' websites are NOT the investor's website!
- If the entity is a COMPANY/STARTUP: the articles mention investors too. URLs to investors' websites are NOT the startup's website!
- ONLY return websites that belong to the specific entity being searched for

Your job:
- Identify which of the extracted URLs (if any) is the entity's official website
- If none match, suggest the correct URL from your knowledge (most well-known companies/VCs/startups have known domains)
- Also provide the LinkedIn company page URL
- Return 3-5 website candidates ordered by confidence (most likely first)
- You MUST include the correct domain — use your training knowledge for well-known entities
- Common VC patterns: abbreviations (a16z.com, lsvp.com), initials+suffix (hvcap.com), branded (sequoiacap.com, indexventures.com)
- For the LinkedIn URL, use the format https://www.linkedin.com/company/SLUG/

Respond with ONLY a JSON object, no markdown:
{
  "websiteCandidates": ["https://example.com", ...],
  "linkedinUrl": "https://www.linkedin.com/company/..." | null
}`;

export type VerificationScore = {
  match: boolean;
  score: number;          // 0-100 overall confidence
  reason: string;
  subscores: {
    namePresent: number;      // 0-25: entity name found on page?
    businessMatch: number;    // 0-35: does the business/product match articles?
    ownWebsite: number;       // 0-20: is this the entity's OWN site?
    domainPlausible: number;  // 0-10: does the domain fit the entity?
    entityTypeMatch: number;  // 0-10: correct type (startup vs investor)?
  };
};

const VERIFICATION_THRESHOLD = 60; // minimum total score to accept

/** LLM-based website verification with content scoring.
 *  Compares website content against article context to ensure they describe the SAME business.
 *  Returns a detailed score breakdown — never trusts name/domain match alone. */
export async function verifyWebsiteWithLLM(
  entityName: string,
  entityType: "company" | "investor",
  url: string,
  html: string,
  articleContext: string
): Promise<VerificationScore> {
  const anthropic = getClient();

  const $ = cheerio.load(html);
  const pageTitle = $("title").text().trim();
  const metaDesc = $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content") || "";

  // Extract JSON-LD organization info
  let jsonLdInfo = "";
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || "");
      const items = Array.isArray(data) ? data : [data];
      for (const obj of items) {
        if (obj["@type"] && obj.name) {
          jsonLdInfo += `Structured data: ${obj["@type"]} "${obj.name}"`;
          if (obj.description) jsonLdInfo += ` — ${obj.description}`;
          jsonLdInfo += "\n";
        }
      }
    } catch { /* ignore */ }
  });

  $("nav, footer, script, style, noscript, aside").remove();
  const bodyText = stripHtml($("body").text()).slice(0, 1500);

  // Pre-check: almost no content → reject without LLM
  const totalContent = (pageTitle + metaDesc + bodyText).trim();
  if (totalContent.length < 50) {
    return {
      match: false, score: 0,
      reason: "Page has almost no content (redirect, parked domain, or JS-only SPA)",
      subscores: { namePresent: 0, businessMatch: 0, ownWebsite: 0, domainPlausible: 0, entityTypeMatch: 0 },
    };
  }

  const typeLabel = entityType === "investor" ? "investment firm / VC" : "company / startup";
  const oppositeType = entityType === "investor" ? "startup/portfolio company" : "investor/VC fund";

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 350,
    system: `You verify whether a website belongs to a specific ${typeLabel} by scoring multiple dimensions.

IMPORTANT: A matching name is NOT enough! The website content must describe the SAME BUSINESS as the articles.
Example: "kinderpedia.com" could be an old children's encyclopedia — NOT the edtech startup "Kinderpedia" that was in the funding article. You must check if the PRODUCT/SERVICE described on the website matches the articles.

Score each dimension independently (0 = no match, max = perfect match):

1. namePresent (0-25): Does the entity name "${entityName}" appear on the page?
   - 25: Name appears prominently (title, heading)
   - 15: Name appears in content
   - 0: Name not found

2. businessMatch (0-35): Does the business/product/service described on the website match what the articles describe?
   - 35: Same industry, same product, same description
   - 15-25: Same general industry but details differ
   - 0-10: Different business entirely (even if name matches!)

3. ownWebsite (0-20): Is this the entity's OWN website (not a third-party page ABOUT them)?
   - 20: Clearly the entity's own website (about page, product pages, contact info)
   - 10: Probably own website but unclear
   - 0: Third-party page (news article, database profile, Wikipedia)

4. domainPlausible (0-10): Does the domain make sense for this entity?
   - 10: Domain clearly relates to entity name
   - 5: Domain is plausible but not obvious
   - 0: Domain seems unrelated

5. entityTypeMatch (0-10): Is this a ${typeLabel}'s website, not a ${oppositeType}'s?
   - 10: Correct entity type
   - 0: Wrong type (e.g. investor site when looking for startup)

Answer with ONLY a JSON object, no markdown:
{"score": <total 0-100>, "namePresent": <0-25>, "businessMatch": <0-35>, "ownWebsite": <0-20>, "domainPlausible": <0-10>, "entityTypeMatch": <0-10>, "reason": "brief explanation"}`,
    messages: [{
      role: "user",
      content: `Score this website for "${entityName}" (${typeLabel}):

Website URL: ${url}
Domain: ${getDomain(url)}
Page title: ${pageTitle}
Meta description: ${metaDesc}
${jsonLdInfo ? `Structured data:\n${jsonLdInfo}` : ""}
Page content (excerpt): ${bodyText.slice(0, 1000)}

What we know about "${entityName}" from funding/news articles:
${articleContext.slice(0, 800)}

Score each dimension and provide the total (0-100).`
    }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    const total = typeof parsed.score === "number" ? parsed.score : 0;
    const subscores = {
      namePresent: parsed.namePresent ?? 0,
      businessMatch: parsed.businessMatch ?? 0,
      ownWebsite: parsed.ownWebsite ?? 0,
      domainPlausible: parsed.domainPlausible ?? 0,
      entityTypeMatch: parsed.entityTypeMatch ?? 0,
    };

    return {
      match: total >= VERIFICATION_THRESHOLD,
      score: total,
      reason: parsed.reason || "unknown",
      subscores,
    };
  } catch {
    return {
      match: false, score: 0,
      reason: "Verification failed (unparseable LLM response)",
      subscores: { namePresent: 0, businessMatch: 0, ownWebsite: 0, domainPlausible: 0, entityTypeMatch: 0 },
    };
  }
}

type VerifyResult = {
  found: { url: string; html: string; verification: VerificationScore } | null;
  rejections: { url: string; reason: string; score?: number }[];
};

/** Validate a batch of URL candidates. ALWAYS verifies with LLM content scoring.
 *  Name/domain match alone is never enough — the LLM must confirm that the
 *  website content describes the same business as the articles. */
async function validateAndVerify(
  candidates: string[],
  entityName: string,
  entityType: "company" | "investor",
  articleContext: string,
  searchMeta?: Map<string, { title: string; description: string }>
): Promise<VerifyResult> {
  // Pre-filter: remove social media / non-website URLs
  candidates = candidates.filter((url) => isValidWebsiteUrl(url));

  // Score and sort candidates (most likely correct first → verify best candidates first)
  const scored = candidates.map((url) => {
    const meta = searchMeta?.get(url);
    return scoreCandidate(url, entityName, entityType, meta?.title, meta?.description);
  });
  scored.sort((a, b) => b.score - a.score);

  const rejections: { url: string; reason: string; score?: number }[] = [];

  for (let i = 0; i < scored.length; i += 5) {
    const batch = scored.slice(i, i + 5);
    // Fetch all pages in parallel
    const fetched = await Promise.all(
      batch.map(async (c) => {
        const result = await validateUrl(c.url);
        return { ...c, ...result };
      })
    );

    for (const r of fetched) {
      if (!r.ok || !r.html) {
        rejections.push({ url: r.url, reason: "URL unreachable or empty page" });
        continue;
      }

      // Pre-LLM name check: only used to REJECT obviously wrong pages (save LLM cost)
      const nameScore = quickNameCheck(r.html, entityName);
      if (nameScore < 0.3 && r.score < 50) {
        rejections.push({
          url: r.url,
          reason: `Entity name not found on page (nameScore=${nameScore.toFixed(2)}, domainScore=${r.score})`,
        });
        continue;
      }

      // ALWAYS verify with LLM — name/domain match alone is NOT enough.
      // The LLM checks if the website CONTENT matches the ARTICLES (same business).
      const verification = await verifyWebsiteWithLLM(
        entityName, entityType, r.url, r.html, articleContext
      );

      if (verification.match) {
        return { found: { url: r.url, html: r.html, verification }, rejections };
      }

      const scoreDetail = Object.entries(verification.subscores)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      rejections.push({
        url: r.url,
        reason: `Score ${verification.score}/100 (${scoreDetail}): ${verification.reason}`,
        score: verification.score,
      });
    }
  }

  return { found: null, rejections };
}

// ---------------------------------------------------------------------------
// Domain guessing — try obvious domains before any search/LLM
// ---------------------------------------------------------------------------

const STARTUP_TLDS = [".com", ".io", ".ai", ".co", ".tech", ".de", ".eu", ".app"];

/** Normalize company name into plausible domain slugs */
function companyToSlugs(name: string): string[] {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim();

  const words = cleaned.split(/\s+/).filter(Boolean);
  const slugs = new Set<string>();

  // Single word or joined: "stripe", "deepl", "celonis"
  slugs.add(words.join(""));

  // Hyphenated: "hello-fresh"
  if (words.length > 1 && words.length <= 3) {
    slugs.add(words.join("-"));
  }

  // First word only (for "Klarna AB" → "klarna")
  if (words.length > 1 && words[0].length >= 3) {
    slugs.add(words[0]);
  }

  // Initials for multi-word names: "Boston Consulting Group" → "bcg"
  if (words.length >= 3) {
    slugs.add(words.map((w) => w[0]).join(""));
  }

  return Array.from(slugs).filter((s) => s.length >= 2);
}

/** Try direct domain guesses — cheapest discovery method (no API calls).
 *  Returns candidates that are reachable and mention the entity name.
 *  These still MUST be verified by LLM before acceptance. */
async function guessWebsiteDomains(
  entityName: string,
  entityType: "company" | "investor"
): Promise<{ url: string; html: string }[]> {
  const slugs = companyToSlugs(entityName);
  const tlds = entityType === "investor"
    ? [".com", ".co", ".vc", ".io"]
    : STARTUP_TLDS;

  // Generate all domain candidates
  const candidates: string[] = [];
  for (const slug of slugs) {
    for (const tld of tlds) {
      candidates.push(`https://${slug}${tld}`);
    }
  }

  const hits: { url: string; html: string; nameScore: number }[] = [];

  // Try in batches of 6 (parallel GET requests)
  for (let i = 0; i < candidates.length; i += 6) {
    const batch = candidates.slice(i, i + 6);
    const results = await Promise.all(
      batch.map(async (url) => {
        const result = await validateUrl(url);
        return { url, ...result };
      })
    );

    for (const r of results) {
      if (!r.ok || !r.html) continue;
      const nameScore = quickNameCheck(r.html, entityName);
      if (nameScore >= 0.5) {
        hits.push({ url: r.url, html: r.html, nameScore });
      }
    }

    // If we already have good candidates, stop early
    if (hits.length >= 3) break;
  }

  // Sort by name score (best match first)
  hits.sort((a, b) => b.nameScore - a.nameScore);
  return hits;
}

// ---------------------------------------------------------------------------
// Pre-LLM name matching — fast sanity check before expensive verification
// ---------------------------------------------------------------------------

/** Quick check: does the page mention the entity name? Returns 0..1 score */
function quickNameCheck(html: string, entityName: string): number {
  const $ = cheerio.load(html);
  const title = $("title").text().toLowerCase();
  const metaDesc = (
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content") ||
    ""
  ).toLowerCase();
  const ogTitle = ($('meta[property="og:title"]').attr("content") || "").toLowerCase();

  // Also check JSON-LD for organization name
  let jsonLdName = "";
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || "");
      const items = Array.isArray(data) ? data : [data];
      for (const obj of items) {
        if (obj.name && typeof obj.name === "string") {
          jsonLdName = obj.name.toLowerCase();
        }
      }
    } catch { /* ignore */ }
  });

  const nameLower = entityName.toLowerCase();
  const nameNorm = nameLower.replace(/[^a-z0-9]/g, "");

  // Exact name match in title → very strong
  if (title.includes(nameLower) || ogTitle.includes(nameLower)) return 1.0;

  // Normalized match (ignoring special chars)
  const titleNorm = title.replace(/[^a-z0-9]/g, "");
  if (titleNorm.includes(nameNorm) || nameNorm.includes(titleNorm)) return 0.9;

  // JSON-LD organization name match
  if (jsonLdName && (jsonLdName.includes(nameLower) || nameLower.includes(jsonLdName))) return 0.9;

  // Name in meta description
  if (metaDesc.includes(nameLower)) return 0.7;

  // Partial: first word of company name in title (e.g. "Klarna" in "Klarna | Buy now pay later")
  const firstWord = nameLower.split(/\s+/)[0];
  if (firstWord.length >= 3 && title.includes(firstWord)) return 0.6;

  // Check domain itself
  const domain = $('link[rel="canonical"]').attr("href") || "";
  const domainNorm = getDomain(domain).replace(/[^a-z0-9]/g, "");
  if (domainNorm && (domainNorm.includes(nameNorm) || nameNorm.includes(domainNorm))) return 0.5;

  return 0.0;
}

// ---------------------------------------------------------------------------
// Candidate scoring — rank URLs before expensive LLM verification
// ---------------------------------------------------------------------------

type ScoredCandidate = {
  url: string;
  score: number;
  signals: string[];
};

/** Score a website candidate based on domain, URL structure, and search metadata */
function scoreCandidate(
  url: string,
  entityName: string,
  entityType: "company" | "investor",
  searchTitle?: string,
  searchDescription?: string
): ScoredCandidate {
  let score = 0;
  const signals: string[] = [];

  const domain = getDomain(url);
  const domainNorm = domain.replace(/[^a-z0-9]/g, "");
  const nameNorm = entityName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const nameFirst = entityName.toLowerCase().split(/\s+/)[0];

  // === Domain-name match (strongest signal) ===
  if (domainNorm === nameNorm || domainNorm === nameNorm.replace(/\s/g, "")) {
    score += 100;
    signals.push("exact-domain-match");
  } else if (domainNorm.includes(nameNorm) || nameNorm.includes(domainNorm)) {
    score += 70;
    signals.push("domain-substring-match");
  } else if (nameFirst.length >= 3 && domainNorm.includes(nameFirst)) {
    score += 40;
    signals.push("domain-first-word-match");
  }

  // === Homepage vs deep page ===
  try {
    const pathname = new URL(url).pathname;
    if (pathname === "/" || pathname === "") {
      score += 30;
      signals.push("homepage");
    } else if (pathname.split("/").filter(Boolean).length === 1) {
      score += 15;
      signals.push("shallow-path");
    }
  } catch { /* ignore */ }

  // === TLD quality ===
  if (domain.endsWith(".com")) { score += 10; signals.push("dot-com"); }
  else if (domain.endsWith(".io") || domain.endsWith(".ai") || domain.endsWith(".co")) {
    score += 8; signals.push("startup-tld");
  }

  // === Search result title match ===
  if (searchTitle) {
    const titleLower = searchTitle.toLowerCase();
    if (titleLower.includes(entityName.toLowerCase())) {
      score += 25;
      signals.push("name-in-search-title");
    }
    // Penalize "Crunchbase", "LinkedIn", etc. in title
    if (/crunchbase|pitchbook|dealroom|cbinsights|linkedin|wikipedia/i.test(titleLower)) {
      score -= 30;
      signals.push("aggregator-in-title");
    }
  }

  // === Search description match ===
  if (searchDescription) {
    const descLower = searchDescription.toLowerCase();
    if (descLower.includes(entityName.toLowerCase())) {
      score += 10;
      signals.push("name-in-search-desc");
    }
  }

  // === Penalize VC domains when searching for startups ===
  if (entityType === "company") {
    for (const pattern of VC_DOMAIN_PATTERNS) {
      if (pattern.test(domain)) {
        score -= 40;
        signals.push("vc-domain-penalty");
        break;
      }
    }
  }

  // === Penalize deep paths that look like articles/blog posts ===
  try {
    const pathname = new URL(url).pathname;
    if (/\/(blog|news|press|article|post)\//i.test(pathname)) {
      score -= 25;
      signals.push("blog-path-penalty");
    }
    if (/\/\d{4}\/\d{2}\//i.test(pathname)) {
      score -= 30;
      signals.push("date-path-penalty");
    }
  } catch { /* ignore */ }

  return { url, score, signals };
}

export type DiscoveryResult = {
  website: string | null;
  linkedinUrl: string | null;
  websiteHtml: string | null;
};

export async function discoverWebsite(
  entityName: string,
  articles: { content: string | null; url: string; title: string }[],
  entityType: "company" | "investor" = "company",
  excludeEntityNames: string[] = []
): Promise<DiscoveryResult> {
  const anthropic = getClient();

  const typeLabel = entityType === "investor" ? "Investment Firm / VC" : "Company / Startup";
  let linkedinUrl: string | null = null;
  const allRejectedDomains = new Set<string>();
  const allRejections: { url: string; reason: string }[] = [];

  // Build article snippets (reused across attempts)
  const articleSnippets = articles.length > 0
    ? articles
        .map((a) => {
          const text = a.content ? stripHtml(a.content).slice(0, 400) : a.title;
          return `- ${a.title}: ${text}`;
        })
        .join("\n")
        .slice(0, 2000)
    : "";

  // ---------------------------------------------------------------
  // Phase 0: Domain guessing (cheapest — no API calls for search)
  // Each candidate still gets full LLM content verification.
  // ---------------------------------------------------------------
  const guessedDomains = await guessWebsiteDomains(entityName, entityType);
  for (const guess of guessedDomains) {
    const verification = await verifyWebsiteWithLLM(
      entityName, entityType, guess.url, guess.html, articleSnippets
    );
    if (verification.match) {
      return { website: guess.url, linkedinUrl: null, websiteHtml: guess.html };
    }
    allRejectedDomains.add(getDomain(guess.url));
    const scoreDetail = Object.entries(verification.subscores)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    allRejections.push({
      url: guess.url,
      reason: `Score ${verification.score}/100 (${scoreDetail}): ${verification.reason}`,
    });
  }

  // ---------------------------------------------------------------
  // Phase 1: Brave Search (real web search — most reliable)
  // ---------------------------------------------------------------
  const searchQuery =
    entityType === "investor"
      ? `"${entityName}" venture capital fund official website`
      : `"${entityName}" startup company official website`;

  const searchResults = await searchWeb(searchQuery, 8);

  // Build search metadata map for candidate scoring
  const searchMeta = new Map<string, { title: string; description: string }>();
  for (const r of searchResults) {
    searchMeta.set(r.url, { title: r.title, description: r.description });
  }

  if (searchResults.length > 0) {
    // Extract LinkedIn from search results
    const linkedinResult = searchResults.find((r) =>
      r.url.includes("linkedin.com/company/")
    );
    if (linkedinResult) linkedinUrl = linkedinResult.url;

    // Filter to valid website candidates, excluding already-rejected domains
    const searchCandidates = searchResults
      .map((r) => r.url)
      .filter((url) => isValidWebsiteUrl(url) && !allRejectedDomains.has(getDomain(url)));

    if (searchCandidates.length > 0) {
      const result = await validateAndVerify(
        searchCandidates, entityName, entityType, articleSnippets, searchMeta
      );

      if (result.found) {
        return { website: result.found.url, linkedinUrl, websiteHtml: result.found.html };
      }

      for (const c of searchCandidates) {
        allRejectedDomains.add(getDomain(c));
      }
      allRejections.push(...result.rejections);
    }
  }

  // ---------------------------------------------------------------
  // Phase 2: LLM knowledge + article URLs (fallback)
  // ---------------------------------------------------------------

  // Extract URLs from article HTML
  const extractedUrls = extractUrlsFromArticles(articles);
  const domainToUrl = new Map<string, string>();
  for (const url of extractedUrls) {
    const domain = getDomain(url);
    if (domain && !domainToUrl.has(domain) && !allRejectedDomains.has(domain)) {
      domainToUrl.set(domain, url);
    }
  }
  const uniqueUrls = Array.from(domainToUrl.values()).slice(0, 30);

  const messages: { role: "user" | "assistant"; content: string }[] = [];

  for (let attempt = 0; attempt < 2; attempt++) {
    let userMsg: string;

    if (attempt === 0) {
      userMsg = `Entity: ${entityName}\nEntity Type: ${typeLabel}\n`;

      if (entityType === "investor") {
        userMsg += `\nIMPORTANT: This is an INVESTOR. The articles below are about funding rounds where this investor participated. The URLs in the articles likely point to the PORTFOLIO COMPANIES that received funding — NOT to this investor's website.\n`;
        if (excludeEntityNames.length > 0) {
          userMsg += `\nPortfolio companies (NOT the investor):\n${excludeEntityNames.join(", ")}\n`;
        }
      }

      if (uniqueUrls.length > 0) {
        userMsg += `\nURLs found in articles:\n${uniqueUrls.join("\n")}\n`;
      }
      if (articleSnippets) {
        userMsg += `\nArticle context:\n${articleSnippets}`;
      }
      if (allRejections.length > 0) {
        userMsg += `\n\nAlready rejected (do NOT suggest these):\n${allRejections.map((r) => `- ${getDomain(r.url)}: ${r.reason}`).join("\n")}`;
      }
    } else {
      const rejectionDetails = allRejections
        .map((r) => `- ${getDomain(r.url)}: ${r.reason}`)
        .join("\n");
      userMsg = `NONE of the previous candidates were correct for "${entityName}" (${typeLabel}).

Rejected:\n${rejectionDetails}

Please try DIFFERENT domains. Use your training knowledge about "${entityName}".`;
    }

    messages.push({ role: "user", content: userMsg });

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: WEBSITE_DISCOVERY_PROMPT,
      messages,
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";
    const cleaned = text
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();

    messages.push({ role: "assistant", content: text });

    let candidates: string[] = [];
    try {
      const parsed = JSON.parse(cleaned);
      candidates = Array.isArray(parsed.websiteCandidates)
        ? parsed.websiteCandidates.map((u: string) =>
            u.startsWith("http") ? u : `https://${u}`
          )
        : [];
      if (!linkedinUrl) linkedinUrl = parsed.linkedinUrl || null;
    } catch {
      continue;
    }

    // On first LLM attempt, also add extracted article URLs as fallback
    if (attempt === 0) {
      for (const url of uniqueUrls) {
        const domain = getDomain(url);
        if (!candidates.some((c) => getDomain(c) === domain)) {
          candidates.push(url);
        }
      }
    }

    candidates = candidates.filter(
      (c) => isValidWebsiteUrl(c) && !allRejectedDomains.has(getDomain(c))
    );

    if (candidates.length === 0) continue;

    const result = await validateAndVerify(
      candidates, entityName, entityType, articleSnippets, searchMeta
    );

    if (result.found) {
      return { website: result.found.url, linkedinUrl, websiteHtml: result.found.html };
    }

    for (const c of candidates) {
      allRejectedDomains.add(getDomain(c));
    }
    allRejections.push(...result.rejections);
  }

  return { website: null, linkedinUrl, websiteHtml: null };
}

// ---------------------------------------------------------------------------
// Stage 4: LLM extraction
// ---------------------------------------------------------------------------

const ENRICH_SYSTEM_PROMPT = `You are a company data enrichment engine. Given sources about a company (news articles and/or website content), extract structured metadata.

Rules:
- Extract ONLY information that is clearly stated or strongly implied in the sources
- For employeeRange use one of: "1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"
- For status use one of: "active", "acquired", "closed"
- For country, use the country name (e.g. "Germany", "France", "UK")
- For location, use city name if available
- For linkedinUrl, provide the full URL
- For website, provide the full URL
- For sector and subsector: Pick EXACTLY ONE sector and ONE subsector from the taxonomy below. The PRIMARY MARKET the company serves decides the sector (e.g. "AI Drug Discovery" → "Health & Life Sciences", not "Enterprise Software"). Use the exact strings from the list.
- For each field, provide a confidence score (0.0-1.0) in fieldConfidence
- If a field cannot be determined, set it to null with confidence 0

SECTOR TAXONOMY (sector: subsectors):
${taxonomyForPrompt()}

Respond with ONLY a JSON object, no markdown, no explanation:
{
  "description": string | null,
  "website": string | null,
  "foundedYear": number | null,
  "employeeRange": string | null,
  "linkedinUrl": string | null,
  "country": string | null,
  "status": string | null,
  "location": string | null,
  "sector": string | null,
  "subsector": string | null,
  "fieldConfidence": {
    "description": number,
    "website": number,
    "foundedYear": number,
    "employeeRange": number,
    "linkedinUrl": number,
    "country": number,
    "status": number,
    "location": number,
    "sector": number,
    "subsector": number
  }
}`;

async function extractWithLLM(
  companyName: string,
  articleTexts: string[],
  websiteText: string | null
): Promise<LLMResult> {
  const anthropic = getClient();

  // Budget: ~8000 chars total
  const parts: string[] = [];

  if (articleTexts.length > 0) {
    const budgetPerArticle = Math.floor(4000 / articleTexts.length);
    for (let i = 0; i < articleTexts.length; i++) {
      parts.push(
        `--- Article ${i + 1} ---\n${articleTexts[i].slice(0, budgetPerArticle)}`
      );
    }
  }

  if (websiteText) {
    parts.push(`--- Company Website ---\n${websiteText.slice(0, 3000)}`);
  }

  const userContent = `Company: ${companyName}\n\n${parts.join("\n\n")}`;

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system: ENRICH_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";
  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    // Sanitize: never accept social media URLs as website
    const rawWebsite = parsed.website || null;
    // Validate sector/subsector against taxonomy
    const sector = validateSector(parsed.sector);
    const subsector = validateSubsector(sector, parsed.subsector);
    return {
      description: parsed.description || null,
      website: isValidWebsiteUrl(rawWebsite) ? rawWebsite : null,
      foundedYear:
        typeof parsed.foundedYear === "number" ? parsed.foundedYear : null,
      employeeRange: parsed.employeeRange || null,
      linkedinUrl: parsed.linkedinUrl || null,
      country: parsed.country || null,
      status: parsed.status || null,
      location: parsed.location || null,
      sector,
      subsector,
      fieldConfidence: parsed.fieldConfidence ?? {},
    };
  } catch {
    return { fieldConfidence: {} };
  }
}

// ---------------------------------------------------------------------------
// Stage 5: Update Neo4j
// ---------------------------------------------------------------------------

async function saveToGraph(
  normalizedName: string,
  fields: LLMResult,
  articles: ArticleRow[],
  logoUrl: string | null
): Promise<string[]> {
  const session = driver().session();
  const updated: string[] = [];

  try {
    // Get current company data to decide what to update
    const current = await session.run(
      `MATCH (c:Company {normalizedName: $norm})
       RETURN c.description AS description, c.website AS website,
              c.foundedYear AS foundedYear, c.employeeRange AS employeeRange,
              c.linkedinUrl AS linkedinUrl, c.country AS country,
              c.status AS status, c.logoUrl AS logoUrl,
              c.sector AS sector, c.subsector AS subsector,
              c.lockedFields AS lockedFields
       LIMIT 1`,
      { norm: normalizedName }
    );

    if (current.records.length === 0) return [];

    const rec = current.records[0];
    const lockedFields = new Set<string>(
      Array.isArray(rec.get("lockedFields")) ? rec.get("lockedFields") as string[] : []
    );
    const sets: string[] = [];
    const params: Record<string, unknown> = { norm: normalizedName };
    const confidence = fields.fieldConfidence;

    const fieldMap: [keyof EnrichedFields, string][] = [
      ["description", "description"],
      ["website", "website"],
      ["foundedYear", "foundedYear"],
      ["employeeRange", "employeeRange"],
      ["linkedinUrl", "linkedinUrl"],
      ["country", "country"],
      ["status", "status"],
      ["sector", "sector"],
      ["subsector", "subsector"],
    ];

    for (const [field, neo4jProp] of fieldMap) {
      if (lockedFields.has(neo4jProp)) continue; // Skip locked fields
      const newVal = fields[field];
      if (newVal == null) continue;

      const conf = confidence[field] ?? 0;
      const currentVal = rec.get(neo4jProp);

      if (currentVal == null || conf > 0.6) {
        sets.push(`c.${neo4jProp} = $${field}`);
        params[field] = newVal;
        updated.push(neo4jProp);
      }
    }

    // Logo (not from LLM, directly scraped) — always update if we found one
    if (logoUrl && !lockedFields.has("logoUrl")) {
      sets.push("c.logoUrl = $logoUrl");
      params["logoUrl"] = logoUrl;
      if (rec.get("logoUrl") !== logoUrl) updated.push("logoUrl");
    }

    // Handle location separately (it's a node, not a property)
    if (fields.location && (confidence["location"] ?? 0) > 0.3 && !lockedFields.has("location")) {
      await session.run(
        `MERGE (l:Location {name: $loc}) SET l.type = 'city'
         WITH l
         MATCH (c:Company {normalizedName: $norm})
         MERGE (c)-[:HQ_IN]->(l)`,
        { norm: normalizedName, loc: fields.location }
      );
      updated.push("location");
    }

    if (sets.length > 0) {
      sets.push("c.enrichedAt = datetime()");
      await session.run(
        `MATCH (c:Company {normalizedName: $norm}) SET ${sets.join(", ")}`,
        params
      );
    } else {
      // Still mark as enriched
      await session.run(
        `MATCH (c:Company {normalizedName: $norm}) SET c.enrichedAt = datetime()`,
        { norm: normalizedName }
      );
    }

    // Store article content in Article nodes (for GraphRAG)
    for (const article of articles) {
      if (article.content) {
        await session.run(
          `MATCH (a:Article {url: $url}) SET a.content = $content`,
          {
            url: article.url,
            content: stripHtml(article.content).slice(0, 5000),
          }
        );
      }
    }
  } finally {
    await session.close();
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

// How many days before re-enriching an entity
const ENRICHMENT_COOLDOWN_DAYS = 365;

export async function enrichCompany(
  companyName: string,
  onProgress: (p: EnrichProgress) => void
): Promise<void> {
  const normalizedName = normalizeCompany(companyName);

  // Skip if recently enriched with key fields populated
  {
    const checkSession = driver().session({ defaultAccessMode: "READ" });
    try {
      const result = await checkSession.run(
        `MATCH (c:Company {normalizedName: $norm})
         RETURN c.enrichedAt AS enrichedAt, c.website AS website,
                c.description AS description, c.sector AS sector,
                c.logoUrl AS logoUrl
         LIMIT 1`,
        { norm: normalizedName }
      );
      const rec = result.records[0];
      if (rec) {
        const enrichedAt = rec.get("enrichedAt");
        const website = rec.get("website");
        const description = rec.get("description");
        const sector = rec.get("sector");

        if (enrichedAt && website && description && sector) {
          // Parse Neo4j datetime to JS Date
          const enrichedDate = new Date(enrichedAt.toString());
          const ageMs = Date.now() - enrichedDate.getTime();
          const ageDays = ageMs / (1000 * 60 * 60 * 24);

          if (ageDays < ENRICHMENT_COOLDOWN_DAYS) {
            onProgress({
              stage: "done",
              message: `Skipped — enriched ${Math.floor(ageDays)}d ago`,
            });
            return;
          }
        }
      }
    } finally {
      await checkSession.close();
    }
  }

  // Stage 1: Articles
  onProgress({ stage: "articles", message: "Loading linked articles..." });
  const articles = await loadArticles(normalizedName);
  const articleTexts = articles
    .map((a) => {
      const text = a.content ? stripHtml(a.content) : a.title;
      return text.slice(0, 3000);
    })
    .filter((t) => t.length > 0);
  onProgress({
    stage: "articles",
    message: `${articles.length} article${articles.length !== 1 ? "s" : ""} loaded`,
  });

  // Stage 2: Website
  onProgress({ stage: "website", message: "Checking company website..." });

  // Get current website from Neo4j
  let websiteUrl: string | null = null;
  const session = driver().session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(
      `MATCH (c:Company {normalizedName: $norm}) RETURN c.website AS website LIMIT 1`,
      { norm: normalizedName }
    );
    const storedWebsite = result.records[0]?.get("website") as string | null;
    websiteUrl = isValidWebsiteUrl(storedWebsite) ? storedWebsite : null;
  } finally {
    await session.close();
  }

  // Stage 3: Verify existing website or discover new one
  let discoveredLinkedinUrl: string | null = null;
  let websiteText: string | null = null;
  let logoUrl: string | null = null;
  let logoCandidates: LogoCandidate[] = [];

  // Build article context for verification
  const articleContext = articles
    .map((a) => {
      const text = a.content ? stripHtml(a.content).slice(0, 400) : a.title;
      return `- ${a.title}: ${text}`;
    })
    .join("\n")
    .slice(0, 2000);

  // If a website is already stored, verify it actually belongs to this company
  if (websiteUrl) {
    onProgress({ stage: "website", message: `Verifying ${getDomain(websiteUrl)}...` });
    const fetchResult = await validateUrl(websiteUrl);

    if (fetchResult.ok && fetchResult.html) {
      const verification = await verifyWebsiteWithLLM(
        companyName, "company", websiteUrl, fetchResult.html, articleContext
      );

      if (verification.match) {
        const parsed = scrapeHtml(fetchResult.html, websiteUrl);
        websiteText = parsed.text || "(verified but no extractable text)";
        logoCandidates = parsed.logoCandidates;
        onProgress({
          stage: "website",
          message: `${getDomain(websiteUrl)} verified (score: ${verification.score}/100)`,
          detail: `businessMatch=${verification.subscores.businessMatch}/35, namePresent=${verification.subscores.namePresent}/25`,
        });
      } else {
        // Website doesn't match — clear it and re-discover
        onProgress({
          stage: "website",
          message: `${getDomain(websiteUrl)} rejected (score: ${verification.score}/100) — re-discovering...`,
          detail: verification.reason,
        });
        websiteUrl = null;
        // Clear wrong website from Neo4j
        const clearSession = driver().session();
        try {
          await clearSession.run(
            `MATCH (c:Company {normalizedName: $norm})
             SET c.website = null, c.logoUrl = null, c.linkedinUrl = null`,
            { norm: normalizedName }
          );
        } finally {
          await clearSession.close();
        }
      }
    } else {
      // Website unreachable — clear from Neo4j and re-discover
      onProgress({ stage: "website", message: `${getDomain(websiteUrl)} unreachable — re-discovering...` });
      websiteUrl = null;
      const clearSession = driver().session();
      try {
        await clearSession.run(
          `MATCH (c:Company {normalizedName: $norm})
           SET c.website = null, c.logoUrl = null, c.linkedinUrl = null`,
          { norm: normalizedName }
        );
      } finally {
        await clearSession.close();
      }
    }
  }

  // Discover website if we don't have a verified one
  if (!websiteUrl) {
    onProgress({ stage: "website", message: "Discovering website with AI..." });
    const discovery = await discoverWebsite(companyName, articles);
    websiteUrl = discovery.website;
    discoveredLinkedinUrl = discovery.linkedinUrl;

    // Discovery already fetched + verified HTML — reuse it
    if (websiteUrl && discovery.websiteHtml) {
      const parsed = scrapeHtml(discovery.websiteHtml, websiteUrl);
      websiteText = parsed.text;
      logoCandidates = parsed.logoCandidates;
      onProgress({
        stage: "website",
        message: `Discovered & parsed ${getDomain(websiteUrl)}`,
      });
    } else if (websiteUrl) {
      onProgress({ stage: "website", message: `Discovered ${websiteUrl}` });
    }
  }

  // If we have a URL but haven't scraped yet, scrape now
  if (websiteUrl && !websiteText) {
    const scrapeResult = await scrapeWebsite(websiteUrl);
    websiteText = scrapeResult?.text ?? null;
    if (scrapeResult) logoCandidates = scrapeResult.logoCandidates;
    onProgress({
      stage: "website",
      message: websiteText ? `${getDomain(websiteUrl)} parsed` : `${getDomain(websiteUrl)} could not be scraped`,
    });
  }
  if (!websiteUrl) {
    onProgress({ stage: "website", message: "No website found" });
  }

  // Need at least some data to work with
  if (articleTexts.length === 0 && !websiteText) {
    onProgress({
      stage: "error",
      message: "No sources available for enrichment",
    });
    return;
  }

  // Stage 4: LLM
  onProgress({ stage: "llm", message: "Extracting company data..." });
  const llmResult = await extractWithLLM(companyName, articleTexts, websiteText);

  // Merge discovery results — discovery website was LLM-verified, so it ALWAYS wins
  if (websiteUrl) {
    llmResult.website = websiteUrl;
    // High confidence because the website passed LLM content scoring (≥60/100)
    llmResult.fieldConfidence["website"] = 0.95;
  }
  if (discoveredLinkedinUrl) {
    if (!llmResult.linkedinUrl) {
      llmResult.linkedinUrl = discoveredLinkedinUrl;
    }
    llmResult.fieldConfidence["linkedinUrl"] = 0.8;
  }

  const extractedCount = Object.entries(llmResult)
    .filter(([k, v]) => k !== "fieldConfidence" && v != null).length;
  onProgress({
    stage: "llm",
    message: `${extractedCount} field${extractedCount !== 1 ? "s" : ""} extracted`,
  });

  // Logo: validate candidates from HTML scraping, then Brave Image Search fallback
  if (logoCandidates.length > 0 && websiteUrl) {
    onProgress({ stage: "llm", message: "Validating logo candidates...", detail: `${logoCandidates.length} candidates: ${logoCandidates.slice(0, 5).map((c) => `${c.source}(${c.score})`).join(", ")}` });
    logoUrl = await findBestLogo(logoCandidates, websiteUrl);
    if (logoUrl) {
      onProgress({ stage: "llm", message: "Logo validated", detail: `Logo: ${logoUrl}` });
    } else {
      onProgress({ stage: "llm", message: "No valid logo from website", detail: "All HTML logo candidates failed validation" });
    }
  }
  if (!logoUrl) {
    onProgress({ stage: "llm", message: "Searching for logo..." });
    const domain = websiteUrl ? getDomain(websiteUrl) : null;
    logoUrl = await searchLogo(companyName, "company", domain);
    if (logoUrl) {
      onProgress({ stage: "llm", message: "Logo found via image search", detail: `Logo: ${logoUrl}` });
    }
  }

  // Stage 5: Save
  onProgress({ stage: "save", message: "Updating graph..." });
  const fieldsUpdated = await saveToGraph(normalizedName, llmResult, articles, logoUrl);
  onProgress({
    stage: "save",
    message: `Graph updated (${fieldsUpdated.length} field${fieldsUpdated.length !== 1 ? "s" : ""})`,
  });

  onProgress({
    stage: "done",
    message: "Enrichment complete",
    fieldsUpdated,
  });
}
