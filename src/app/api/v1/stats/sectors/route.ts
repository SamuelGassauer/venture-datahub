import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api-auth";
import { computeSectorCatalog } from "@/lib/v1-stats/sectors";

export const dynamic = "force-dynamic";
export const revalidate = 1800;

export async function GET(request: NextRequest) {
  const authError = await requireApiKey(request, "data-provider", { allowPublic: true });
  if (authError) return authError;

  try {
    const { entries, totalStartups, windowDays } = await computeSectorCatalog();

    return NextResponse.json(
      {
        sectors: entries,
        totalStartups,
        windowDays,
        computedAt: new Date().toISOString(),
      },
      {
        headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=300" },
      },
    );
  } catch (error) {
    console.error("v1/stats/sectors error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
