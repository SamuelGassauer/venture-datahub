import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { unmergeFromSnapshot, type MergeSnapshot } from "@/lib/dedup/merge";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const candidate = await prisma.dedupCandidate.findUnique({ where: { id: params.id } });
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }
  if (candidate.status !== "confirmed") {
    return NextResponse.json(
      { error: "Can only unmerge confirmed candidates." },
      { status: 409 },
    );
  }
  if (!candidate.mergeSnapshot) {
    return NextResponse.json(
      {
        error:
          "No merge snapshot stored. This candidate was confirmed without a real merge (e.g. round candidate). Use reopen instead.",
      },
      { status: 400 },
    );
  }

  const snapshot = candidate.mergeSnapshot as unknown as MergeSnapshot;
  try {
    await unmergeFromSnapshot(snapshot);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Unmerge failed: ${message}` }, { status: 500 });
  }

  const updated = await prisma.dedupCandidate.update({
    where: { id: params.id },
    data: {
      status: "pending",
      winnerKey: null,
      mergeSnapshot: undefined,
      decidedById: null,
      decidedAt: null,
    },
  });

  return NextResponse.json({
    candidate: {
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      decidedAt: updated.decidedAt?.toISOString() ?? null,
    },
  });
}
