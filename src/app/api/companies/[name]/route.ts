import { NextRequest, NextResponse } from "next/server";
import driver from "@/lib/neo4j";
import { requireAdmin } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const { name } = await params;
  const companyName = decodeURIComponent(name);

  const session = driver.session();
  try {
    // Delete the company node and all its relationships
    const result = await session.run(
      `MATCH (c:Company { name: $name }) DETACH DELETE c RETURN count(c) AS deleted`,
      { name: companyName }
    );
    const deleted = result.records[0]?.get("deleted")?.toNumber?.() ?? result.records[0]?.get("deleted") ?? 0;

    if (deleted === 0) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, deleted: companyName });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete company" },
      { status: 500 }
    );
  } finally {
    await session.close();
  }
}
