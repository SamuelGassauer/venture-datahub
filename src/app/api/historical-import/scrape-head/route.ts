import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import * as cheerio from "cheerio";
import { extractFundingRegex } from "@/lib/funding-extractor";

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

  try {
    // Fetch only enough to get the <head> — most sites send it in the first chunk
    const res = await fetch(entry.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Orbit-VC-Bot/1.0)",
        "Accept": "text/html",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      await prisma.historicalUrl.update({
        where: { id },
        data: { status: "error", errorMessage: `HTTP ${res.status}` },
      });
      return NextResponse.json({ error: `HTTP ${res.status}`, status: "error" });
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // Extract meta info
    const title = $("title").first().text().trim()
      || $('meta[property="og:title"]').attr("content")?.trim()
      || "";
    const description = $('meta[name="description"]').attr("content")?.trim()
      || $('meta[property="og:description"]').attr("content")?.trim()
      || "";

    const combinedText = `${title} ${description}`;

    // Run funding regex extractor
    const extraction = extractFundingRegex(title, description);

    const newStatus = extraction && extraction.confidence >= 0.35 ? "processed" : "skipped";

    await prisma.historicalUrl.update({
      where: { id },
      data: {
        title,
        content: description,
        status: newStatus,
        scrapedAt: new Date(),
        processedAt: new Date(),
        errorMessage: null,
      },
    });

    return NextResponse.json({
      id,
      title,
      description,
      combinedText,
      status: newStatus,
      extraction: extraction ? {
        companyName: extraction.companyName,
        amount: extraction.amount,
        currency: extraction.currency,
        stage: extraction.stage,
        confidence: extraction.confidence,
        investors: extraction.investors,
        country: extraction.country,
      } : null,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await prisma.historicalUrl.update({
      where: { id },
      data: { status: "error", errorMessage: msg },
    });
    return NextResponse.json({ error: msg, status: "error" });
  }
}
