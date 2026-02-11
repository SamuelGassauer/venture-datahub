import { NextResponse } from "next/server";
import { syncAllFeeds } from "@/lib/sync-engine";

export async function POST() {
  try {
    const results = await syncAllFeeds();
    const successful = results.filter((r) => r.status === "success").length;
    const newArticles = results.reduce((sum, r) => sum + r.articlesNew, 0);
    const newFunding = results.reduce((sum, r) => sum + r.fundingFound, 0);

    return NextResponse.json({
      total: results.length,
      successful,
      newArticles,
      newFunding,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
