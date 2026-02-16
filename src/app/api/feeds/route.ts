import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const feeds = await prisma.feed.findMany({
    include: { category: true },
    orderBy: { title: "asc" },
  });
  return NextResponse.json(feeds);
}
