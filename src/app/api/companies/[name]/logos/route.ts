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

    // Fetch the website HTML
    let html: string;
    try {
      const res = await fetch(fullUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,*/*",
        },
        signal: AbortSignal.timeout(5000),
        redirect: "follow",
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: `Website returned ${res.status}` },
          { status: 502 }
        );
      }
      html = await res.text();
    } catch {
      return NextResponse.json(
        { error: "Could not fetch website" },
        { status: 502 }
      );
    }

    // Extract logo candidates from HTML
    const $ = cheerio.load(html);
    const candidates = extractLogoCandidates($, fullUrl);

    // Add favicon fallbacks
    const domain = new URL(fullUrl).origin;
    const fallbacks: LogoCandidate[] = [
      { url: `${domain}/favicon.ico`, score: 50, source: "favicon-fallback" },
      {
        url: `${domain}/apple-touch-icon.png`,
        score: 80,
        source: "apple-touch-icon-fallback",
      },
    ];
    for (const fb of fallbacks) {
      if (!candidates.some((c) => c.url === fb.url)) {
        candidates.push(fb);
      }
    }

    // Validate all candidates in parallel with HEAD requests
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
