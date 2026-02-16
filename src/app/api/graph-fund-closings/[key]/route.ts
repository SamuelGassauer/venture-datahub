import { NextRequest, NextResponse } from "next/server";
import driver from "@/lib/neo4j";
import { requireAdmin } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const { key } = await params;
  const fundKey = decodeURIComponent(key);

  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (f:Fund { fundKey: $key }) DETACH DELETE f RETURN count(f) AS deleted`,
      { key: fundKey }
    );
    const deleted = result.records[0]?.get("deleted")?.toNumber?.() ?? result.records[0]?.get("deleted") ?? 0;

    if (deleted === 0) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, deleted: fundKey });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete fund" },
      { status: 500 }
    );
  } finally {
    await session.close();
  }
}
