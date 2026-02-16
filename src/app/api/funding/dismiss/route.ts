import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;
  try {
    const { articleIds } = (await request.json()) as { articleIds: string[] };

    if (!articleIds?.length) {
      return NextResponse.json({ error: "articleIds required" }, { status: 400 });
    }

    const result = await prisma.fundingRound.updateMany({
      where: { articleId: { in: articleIds }, dismissedAt: null },
      data: { dismissedAt: new Date() },
    });

    return NextResponse.json({ success: true, dismissed: result.count });
  } catch (e) {
    console.error("Dismiss error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
