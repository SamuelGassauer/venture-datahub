import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

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
    note?: string;
  };
  const action = body.action;
  if (!action || !VALID_ACTIONS.has(action)) {
    return NextResponse.json(
      { error: "Invalid action. Must be confirm/reject/skip/reopen." },
      { status: 400 },
    );
  }

  const statusMap: Record<string, "pending" | "confirmed" | "rejected" | "skipped"> = {
    confirm: "confirmed",
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

  return NextResponse.json({
    candidate: {
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      decidedAt: updated.decidedAt?.toISOString() ?? null,
    },
  });
}
