import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const feeds = await prisma.feed.findMany({
    include: { category: true },
    orderBy: { title: "asc" },
  });
  return NextResponse.json(feeds);
}
