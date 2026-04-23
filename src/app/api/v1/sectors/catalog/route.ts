import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api-auth";
import { computeSectorCatalog } from "@/lib/v1-stats/sectors";
import { getPostedRoundIds, parsePostedMode } from "@/lib/posted-rounds";

export const dynamic = "force-dynamic";
export const revalidate = 1800;

export async function GET(request: NextRequest) {
  const authError = await requireApiKey(request, "data-provider", { allowPublic: true });
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const windowDaysRaw = parseInt(searchParams.get("window_days") || "90", 10);
  const country = searchParams.get("country");
  const postedRoundIds = parsePostedMode(searchParams) === "posted"
    ? await getPostedRoundIds()
    : null;

  try {
    const { entries, totalStartups, windowDays } = await computeSectorCatalog({
      windowDays: Number.isFinite(windowDaysRaw) ? windowDaysRaw : undefined,
      country,
      postedRoundIds,
    });

    return NextResponse.json(
      {
        entries,
        totalStartups,
        windowDays,
        generatedAt: new Date().toISOString(),
      },
      {
        headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=300" },
      },
    );
  } catch (error) {
    console.error("v1/sectors/catalog error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
