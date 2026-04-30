import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { enrichCompanies, enrichInvestors, enrichRounds } from "@/lib/dedup/enrich";

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

  // Live-enrich each side with rich profile data from Neo4j so the user
  // can actually decide whether two records are the same. Snapshots stay
  // as fallback if the node was already merged or removed.
  const companyUuids: string[] = [];
  const investorUuids: string[] = [];
  const roundUuids: string[] = [];
  for (const i of items) {
    if (i.entityType === "company") {
      companyUuids.push(i.leftKey, i.rightKey);
    } else if (i.entityType === "investor") {
      investorUuids.push(i.leftKey, i.rightKey);
    } else if (i.entityType === "round") {
      roundUuids.push(i.leftKey, i.rightKey);
    }
  }

  const [companyMap, investorMap, roundMap] = await Promise.all([
    enrichCompanies(companyUuids).catch((err) => {
      console.error("dedup enrichCompanies failed:", err);
      return new Map<string, ReturnType<typeof JSON.parse>>();
    }),
    enrichInvestors(investorUuids).catch((err) => {
      console.error("dedup enrichInvestors failed:", err);
      return new Map<string, ReturnType<typeof JSON.parse>>();
    }),
    enrichRounds(roundUuids).catch((err) => {
      console.error("dedup enrichRounds failed:", err);
      return new Map<string, ReturnType<typeof JSON.parse>>();
    }),
  ]);

  const enrichedFor = (entityType: string, key: string) => {
    if (entityType === "company") return companyMap.get(key) ?? null;
    if (entityType === "investor") return investorMap.get(key) ?? null;
    if (entityType === "round") return roundMap.get(key) ?? null;
    return null;
  };

  return NextResponse.json({
    items: items.map((i) => ({
      ...i,
      createdAt: i.createdAt.toISOString(),
      updatedAt: i.updatedAt.toISOString(),
      decidedAt: i.decidedAt?.toISOString() ?? null,
      leftEnriched: enrichedFor(i.entityType, i.leftKey),
      rightEnriched: enrichedFor(i.entityType, i.rightKey),
    })),
    total,
    limit,
    offset,
    summary,
  });
}
