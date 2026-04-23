import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { clearPostedRoundsCache } from "@/lib/posted-rounds";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;

  try {
    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const updated = await prisma.post.update({
      where: { id },
      data: { publishedAt: new Date(), publishError: null },
    });

    // Invalidate v1-API posted-rounds cache so new posts appear on next hit.
    clearPostedRoundsCache();

    return NextResponse.json({
      success: true,
      publishedAt: updated.publishedAt,
    });
  } catch (error) {
    console.error("Publish error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to publish post",
      },
      { status: 500 }
    );
  }
}
