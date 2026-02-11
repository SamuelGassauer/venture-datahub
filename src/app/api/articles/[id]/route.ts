import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  // If id is "all", delete all articles
  if (params.id === "all") {
    await prisma.fundingRound.deleteMany();
    await prisma.article.deleteMany();
    await prisma.feed.updateMany({ data: { articleCount: 0 } });
    return NextResponse.json({ success: true });
  }

  await prisma.article.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
