import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { runDedup } from "@/lib/dedup/run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  // Block parallel runs
  const inflight = await prisma.dedupRun.findFirst({
    where: { status: "running" },
    orderBy: { startedAt: "desc" },
  });
  if (inflight) {
    const ageMs = Date.now() - inflight.startedAt.getTime();
    if (ageMs < 10 * 60_000) {
      return NextResponse.json(
        {
          error: "Dedup run already in progress",
          runId: inflight.id,
          startedAt: inflight.startedAt.toISOString(),
        },
        { status: 409 },
      );
    }
    // stale lock — mark as error and proceed
    await prisma.dedupRun.update({
      where: { id: inflight.id },
      data: { status: "error", errorMessage: "Stale lock cleared", finishedAt: new Date() },
    });
  }

  const summary = await runDedup(`manual:${session.user.email ?? session.user.id ?? "admin"}`);
  return NextResponse.json({ summary });
}

export async function GET() {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const runs = await prisma.dedupRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 20,
  });
  return NextResponse.json({
    runs: runs.map((r) => ({
      ...r,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
    })),
  });
}
