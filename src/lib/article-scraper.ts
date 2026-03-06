import * as cheerio from "cheerio";

/**
 * Fetch a URL and extract clean article text using cheerio.
 * Returns null if the fetch fails or yields no useful content.
 */
export async function scrapeArticleContent(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Orbit-VC-Bot/1.0)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;

    const html = await res.text();
    return extractArticleContent(cheerio.load(html));
  } catch {
    return null;
  }
}

/** Extract clean article text from a cheerio-loaded document. */
export function extractArticleContent($: cheerio.CheerioAPI): string {
  // Remove noise elements BEFORE content extraction
  $(
    "nav, footer, header, script, style, aside, .ad, .ads, .sidebar, .comments, " +
    ".related-posts, .related, .share, .social, .cookie, .banner, .newsletter, .popup, " +
    ".widget, .author-bio, .author-box, .tag-cloud, .breadcrumb, " +
    "[role='navigation'], [role='banner'], [role='complementary']"
  ).remove();

  // Specific content selectors FIRST (before generic 'article' which often matches cards)
  const specificSelectors = [
    ".entry-content",
    ".post-content",
    ".article-content",
    ".article-body",
    ".story-body",
    "[itemprop='articleBody']",
    ".td-post-content",
    ".tdb_single_content",
    ".post-body",
    ".single-content",
    ".content-area main",
    ".main-content",
    "#content",
  ];

  for (const sel of specificSelectors) {
    const el = $(sel);
    if (el.length && el.text().trim().length > 200) {
      return el.text().replace(/\s+/g, " ").trim();
    }
  }

  // 'article' as fallback — but only if there's exactly 1 (multiple = card layout)
  const articles = $("article");
  if (articles.length === 1 && articles.text().trim().length > 200) {
    return articles.text().replace(/\s+/g, " ").trim();
  }

  // 'main' as fallback
  const main = $("main");
  if (main.length && main.text().trim().length > 200) {
    return main.text().replace(/\s+/g, " ").trim();
  }

  // Fallback: collect all <p> text (works for most sites)
  const paragraphs = $("p")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((t) => t.length > 30 && !/^(function|window\.|var |const |let )/.test(t))
    .join(" ");

  if (paragraphs.length > 200) return paragraphs;

  // Last resort: body text
  return $("body").text().replace(/\s+/g, " ").trim().slice(0, 10000);
}
