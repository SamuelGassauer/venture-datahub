import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { crawlAllWaybackSources, WAYBACK_SOURCES } from "@/lib/wayback-cdx";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const body = await request.json().catch(() => ({}));
  const minDate = (body.minDate as string) || "2024-01-01";
  const maxDate = (body.maxDate as string) || new Date().toISOString().slice(0, 10);
  const maxPages = typeof body.maxPages === "number" ? body.maxPages : undefined;
  const sourceNames = (body.sources as string[]) || WAYBACK_SOURCES.map((s) => s.name);

  const sources = WAYBACK_SOURCES.filter((s) => sourceNames.includes(s.name));
  if (sources.length === 0) {
    return NextResponse.json({ error: "No valid sources specified" }, { status: 400 });
  }

  const { crawlBatch, results } = await crawlAllWaybackSources(minDate, maxDate, sources, { maxPages });

  return NextResponse.json({
    crawlBatch,
    summary: {
      sourcesScanned: results.length,
      sourcesWithErrors: results.filter((r) => r.error).length,
      totalArticlesFound: results.reduce((sum, r) => sum + r.totalUrls, 0),
      afterKeywordFilter: results.reduce((sum, r) => sum + r.filteredUrls, 0),
      newUrlsSaved: results.reduce((sum, r) => sum + r.newUrls, 0),
      duplicatesSkipped: results.reduce((sum, r) => sum + r.skippedDuplicates, 0),
    },
    results,
  });
}
