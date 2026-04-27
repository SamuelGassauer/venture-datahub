import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const VALID_TYPES = new Set(["company", "investor", "round"]);
const VALID_STATUSES = new Set(["pending", "confirmed", "rejected", "skipped"]);

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const params = request.nextUrl.searchParams;
  const type = params.get("type");
  const status = params.get("status") ?? "pending";
  const tier = params.get("tier");
  const limit = Math.min(parseInt(params.get("limit") || "50", 10), 200);
  const offset = parseInt(params.get("offset") || "0", 10);

  const where: Prisma.DedupCandidateWhereInput = {};
  if (type && VALID_TYPES.has(type)) {
    where.entityType = type as "company" | "investor" | "round";
  }
  if (status && VALID_STATUSES.has(status)) {
    where.status = status as "pending" | "confirmed" | "rejected" | "skipped";
  } else if (status === "all") {
    // no filter
  }
  if (tier) {
    const t = parseInt(tier, 10);
    if (!Number.isNaN(t)) where.tier = t;
  }

  const [items, total, counts] = await Promise.all([
    prisma.dedupCandidate.findMany({
      where,
      orderBy: [{ tier: "asc" }, { score: "desc" }, { createdAt: "desc" }],
      skip: offset,
      take: limit,
      include: {
        decidedBy: { select: { name: true, email: true } },
      },
    }),
    prisma.dedupCandidate.count({ where }),
    prisma.dedupCandidate.groupBy({
      by: ["entityType", "status"],
      _count: { _all: true },
    }),
  ]);

  const summary: Record<string, Record<string, number>> = {};
  for (const c of counts) {
    const t = c.entityType;
    if (!summary[t]) summary[t] = { pending: 0, confirmed: 0, rejected: 0, skipped: 0 };
    summary[t][c.status] = c._count._all;
  }

  return NextResponse.json({
    items: items.map((i) => ({
      ...i,
      createdAt: i.createdAt.toISOString(),
      updatedAt: i.updatedAt.toISOString(),
      decidedAt: i.decidedAt?.toISOString() ?? null,
    })),
    total,
    limit,
    offset,
    summary,
  });
}
