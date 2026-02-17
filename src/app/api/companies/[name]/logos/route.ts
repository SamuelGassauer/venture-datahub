import { NextRequest } from "next/server";
import * as cheerio from "cheerio";
import { requireAdmin } from "@/lib/api-auth";
import { NextResponse } from "next/server";
import {
  extractLogoCandidates,
  validateLogoUrl,
  type LogoCandidate,
} from "@/lib/company-enricher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function POST(request: NextRequest, _ctx: { params: Promise<{ name: string }> }) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { website } = await request.json();
    if (!website || typeof website !== "string") {
      return NextResponse.json(
        { error: "Missing website URL" },
        { status: 400 }
      );
    }

    const fullUrl = website.startsWith("http") ? website : `https://${website}`;

    // Fetch the website HTML — non-fatal if it fails
    let candidates: LogoCandidate[] = [];
    try {
      const res = await fetch(fullUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,*/*",
        },
        signal: AbortSignal.timeout(8000),
        redirect: "follow",
      });
      if (res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);
        candidates = extractLogoCandidates($, fullUrl);
      }
    } catch {
      // Website fetch failed — continue with external fallbacks
    }

    // Add favicon fallbacks
    const domain = new URL(fullUrl).origin;
    const hostname = new URL(fullUrl).hostname;
    const fallbacks: LogoCandidate[] = [
      { url: `${domain}/favicon.ico`, score: 50, source: "favicon-fallback" },
      {
        url: `${domain}/apple-touch-icon.png`,
        score: 80,
        source: "apple-touch-icon-fallback",
      },
      // External logo APIs — very reliable even when website scraping fails
      {
        url: `https://logo.clearbit.com/${hostname}`,
        score: 900,
        source: "clearbit",
      },
      {
        url: `https://img.logo.dev/${hostname}?token=pk_a]3gpOmhR3-UhME-5Goyg&size=200&format=png`,
        score: 850,
        source: "logo.dev",
      },
      {
        url: `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`,
        score: 100,
        source: "google-favicon",
      },
    ];
    for (const fb of fallbacks) {
      if (!candidates.some((c) => c.url === fb.url)) {
        candidates.push(fb);
      }
    }

    // Validate all candidates in parallel
    const validated = await Promise.all(
      candidates.map(async (c) => ({
        ...c,
        valid: await validateLogoUrl(c.url),
      }))
    );

    const validCandidates = validated
      .filter((c) => c.valid)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .map(({ valid, ...rest }) => rest)
      .sort((a, b) => b.score - a.score);

    return NextResponse.json({ candidates: validCandidates });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
