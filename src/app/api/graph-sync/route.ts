import { NextResponse } from "next/server";
import { syncToGraph } from "@/lib/graph-sync";

export async function POST() {
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
