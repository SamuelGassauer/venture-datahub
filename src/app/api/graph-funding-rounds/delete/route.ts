import { NextRequest, NextResponse } from "next/server";
import driver from "@/lib/neo4j";
import { requireAdmin } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const { ids } = (await request.json()) as { ids: string[] };
  if (!ids?.length) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }

  const session = driver().session({ defaultAccessMode: "WRITE" });
  try {
    // Delete the FundingRound node and all its relationships
    const result = await session.run(
      `
      UNWIND $ids AS frId
      MATCH (fr:FundingRound) WHERE elementId(fr) = frId
      DETACH DELETE fr
      RETURN count(*) AS deleted
      `,
      { ids },
    );

    const deleted = result.records[0]?.get("deleted")?.toNumber?.() ?? result.records[0]?.get("deleted") ?? 0;

    return NextResponse.json({ success: true, deleted });
  } catch (e) {
    console.error("Neo4j delete error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 },
    );
  } finally {
    await session.close();
  }
}
