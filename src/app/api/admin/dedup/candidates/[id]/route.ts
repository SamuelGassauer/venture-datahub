import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { mergeCompany, mergeInvestor, type MergeSnapshot } from "@/lib/dedup/merge";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const VALID_ACTIONS = new Set(["confirm", "reject", "skip", "reopen"]);

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    winnerKey?: string;
    note?: string;
  };
  const action = body.action;
  if (!action || !VALID_ACTIONS.has(action)) {
    return NextResponse.json(
      { error: "Invalid action. Must be confirm/reject/skip/reopen." },
      { status: 400 },
    );
  }

  const candidate = await prisma.dedupCandidate.findUnique({ where: { id: params.id } });
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  // Confirm flow: validate winnerKey, run merge for company/investor.
  if (action === "confirm") {
    if (candidate.status !== "pending") {
      return NextResponse.json(
        { error: `Candidate is already ${candidate.status}. Reopen first.` },
        { status: 409 },
      );
    }

    if (candidate.entityType === "round") {
      // Round confirms are advisory only — actual round-merging is implicit
      // when the underlying companies are merged. Mark and move on.
      const updated = await prisma.dedupCandidate.update({
        where: { id: params.id },
        data: {
          status: "confirmed",
          decidedById: session.user.id,
          decidedAt: new Date(),
          note: body.note ?? "Round merge erfolgt implizit beim Company-Merge.",
        },
      });
      return NextResponse.json({ candidate: serialize(updated) });
    }

    const winnerKey = body.winnerKey;
    if (!winnerKey || (winnerKey !== candidate.leftKey && winnerKey !== candidate.rightKey)) {
      return NextResponse.json(
        {
          error:
            "winnerKey is required for company/investor confirms and must match leftKey or rightKey.",
        },
        { status: 400 },
      );
    }
    const loserKey = winnerKey === candidate.leftKey ? candidate.rightKey : candidate.leftKey;

    let snapshot: MergeSnapshot;
    try {
      if (candidate.entityType === "company") {
        snapshot = await mergeCompany(loserKey, winnerKey);
      } else {
        snapshot = await mergeInvestor(loserKey, winnerKey);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Merge failed: ${message}` }, { status: 500 });
    }

    const updated = await prisma.dedupCandidate.update({
      where: { id: params.id },
      data: {
        status: "confirmed",
        winnerKey,
        mergeSnapshot: snapshot as unknown as object,
        decidedById: session.user.id,
        decidedAt: new Date(),
        note: body.note ?? undefined,
      },
    });
    return NextResponse.json({ candidate: serialize(updated), merged: true });
  }

  // Non-merge actions: just status update.
  const statusMap: Record<string, "pending" | "confirmed" | "rejected" | "skipped"> = {
    reject: "rejected",
    skip: "skipped",
    reopen: "pending",
  };

  const updated = await prisma.dedupCandidate.update({
    where: { id: params.id },
    data: {
      status: statusMap[action],
      decidedById: action === "reopen" ? null : session.user.id,
      decidedAt: action === "reopen" ? null : new Date(),
      note: body.note ?? undefined,
    },
  });

  return NextResponse.json({ candidate: serialize(updated) });
}

function serialize(c: {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  decidedAt: Date | null;
  [k: string]: unknown;
}) {
  return {
    ...c,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    decidedAt: c.decidedAt?.toISOString() ?? null,
  };
}
