import { prisma } from "../db";
import { detectCompanyDuplicates } from "./companies";
import { detectInvestorDuplicates } from "./investors";
import { detectRoundDuplicates } from "./rounds";
import type { DedupPair } from "./types";

export type DedupRunSummary = {
  runId: string;
  companiesScanned: number;
  investorsScanned: number;
  roundsScanned: number;
  candidatesNew: number;
  candidatesUpdated: number;
  durationMs: number;
};

async function upsertCandidates(pairs: DedupPair[]): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  for (const p of pairs) {
    const result = await prisma.dedupCandidate.upsert({
      where: {
        entityType_leftKey_rightKey: {
          entityType: p.entityType,
          leftKey: p.leftKey,
          rightKey: p.rightKey,
        },
      },
      create: {
        entityType: p.entityType,
        leftKey: p.leftKey,
        rightKey: p.rightKey,
        tier: p.tier,
        score: p.score,
        reasons: p.reasons as object,
        leftSnapshot: p.leftSnapshot as object,
        rightSnapshot: p.rightSnapshot as object,
        status: "pending",
      },
      update: {
        // Only refresh if still pending — never reopen decided candidates
        tier: p.tier,
        score: p.score,
        reasons: p.reasons as object,
        leftSnapshot: p.leftSnapshot as object,
        rightSnapshot: p.rightSnapshot as object,
      },
    });
    if (result.createdAt.getTime() === result.updatedAt.getTime()) created++;
    else updated++;
  }
  return { created, updated };
}

export async function runDedup(triggeredBy = "cron"): Promise<DedupRunSummary> {
  const start = Date.now();
  const run = await prisma.dedupRun.create({
    data: { status: "running", triggeredBy },
  });

  try {
    const [companies, investors, rounds] = await Promise.all([
      detectCompanyDuplicates(),
      detectInvestorDuplicates(),
      detectRoundDuplicates(),
    ]);

    const allPairs = [...companies.pairs, ...investors.pairs, ...rounds.pairs];

    // Filter out candidates that are already decided (rejected/confirmed/skipped)
    // by skipping upsert.update for non-pending rows.
    const decided = await prisma.dedupCandidate.findMany({
      where: { status: { not: "pending" } },
      select: { entityType: true, leftKey: true, rightKey: true },
    });
    const decidedSet = new Set(decided.map((d) => `${d.entityType}::${d.leftKey}::${d.rightKey}`));
    const filtered = allPairs.filter(
      (p) => !decidedSet.has(`${p.entityType}::${p.leftKey}::${p.rightKey}`),
    );

    const { created, updated } = await upsertCandidates(filtered);

    const durationMs = Date.now() - start;
    await prisma.dedupRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: "ok",
        companiesScanned: companies.scanned,
        investorsScanned: investors.scanned,
        roundsScanned: rounds.scanned,
        candidatesNew: created,
        candidatesUpdated: updated,
        durationMs,
      },
    });

    return {
      runId: run.id,
      companiesScanned: companies.scanned,
      investorsScanned: investors.scanned,
      roundsScanned: rounds.scanned,
      candidatesNew: created,
      candidatesUpdated: updated,
      durationMs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.dedupRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: "error",
        errorMessage: message,
        durationMs: Date.now() - start,
      },
    });
    throw error;
  }
}
