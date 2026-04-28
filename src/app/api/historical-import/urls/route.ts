import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import type { HistoricalUrlStatus } from "@prisma/client";

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status") as HistoricalUrlStatus | null;
  const source = searchParams.get("source");
  const search = searchParams.get("search");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(500, parseInt(searchParams.get("limit") || "50"));
  const idsOnly = searchParams.get("idsOnly") === "1";

  const minDate = searchParams.get("minDate");
  const maxDate = searchParams.get("maxDate");

  const where = {
    ...(status && { status }),
    ...(source && { source }),
    ...(search && {
      url: { contains: search, mode: "insensitive" as const },
    }),
    ...((minDate || maxDate) && {
      lastmod: {
        ...(minDate && { gte: new Date(minDate) }),
        ...(maxDate && { lte: new Date(maxDate + "T23:59:59.999Z") }),
      },
    }),
  };

  if (idsOnly) {
    const matching = await prisma.historicalUrl.findMany({
      where,
      orderBy: { lastmod: "desc" },
      take: 10000,
      select: { id: true, status: true },
    });
    return NextResponse.json({ ids: matching, total: matching.length });
  }

  const [urls, total, statusCounts] = await Promise.all([
    prisma.historicalUrl.findMany({
      where,
      orderBy: { lastmod: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.historicalUrl.count({ where }),
    prisma.historicalUrl.groupBy({
      by: ["status"],
      _count: true,
    }),
  ]);

  const sourceCounts = await prisma.historicalUrl.groupBy({
    by: ["source"],
    _count: true,
  });

  return NextResponse.json({
    urls,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count])),
    sourceCounts: Object.fromEntries(sourceCounts.map((s) => [s.source, s._count])),
  });
}
