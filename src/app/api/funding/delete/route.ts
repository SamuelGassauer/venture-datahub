import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { fundingRoundIds } = (await request.json()) as { fundingRoundIds: string[] };

    if (!fundingRoundIds?.length) {
      return NextResponse.json({ error: "fundingRoundIds required" }, { status: 400 });
    }

    // Delete funding rounds (articles remain — they're still valid references)
    const result = await prisma.fundingRound.deleteMany({
      where: { id: { in: fundingRoundIds } },
    });

    return NextResponse.json({ success: true, deleted: result.count });
  } catch (e) {
    console.error("Delete error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
