import { NextResponse } from "next/server";
import { syncToGraph } from "@/lib/graph-sync";
import { requireAdmin } from "@/lib/api-auth";

export async function POST() {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;
  try {
    const result = await syncToGraph();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Graph sync failed" },
      { status: 500 }
    );
  }
}
