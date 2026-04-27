import driver from "../neo4j";
import {
  tokenize,
  levenshteinSimilarity,
  tokenJaccard,
  candidateKeys,
} from "./normalize";
import type { DedupPair } from "./types";
import { ROUND_NAME_THRESHOLD, ROUND_WINDOW_DAYS } from "./types";

type RoundNode = {
  uuid: string;
  roundKey: string;
  amountUsd: number | null;
  stage: string | null;
  announcedDate: string | null;
  companyUuid: string;
  companyName: string;
  companyNormalized: string;
  country: string | null;
};

async function loadRounds(): Promise<RoundNode[]> {
  const session = driver().session();
  try {
    const result = await session.run(
      `MATCH (c:Company)-[:RAISED]->(f:FundingRound)
       RETURN f.uuid AS uuid,
              f.roundKey AS roundKey,
              f.amountUsd AS amountUsd,
              f.stage AS stage,
              f.announcedDate AS announcedDate,
              c.uuid AS companyUuid,
              c.name AS companyName,
              c.normalizedName AS companyNormalized,
              c.country AS country`
    );
    return result.records.map((r) => {
      const amount = r.get("amountUsd");
      return {
        uuid: r.get("uuid"),
        roundKey: r.get("roundKey"),
        amountUsd: typeof amount === "number" ? amount : amount?.toNumber?.() ?? null,
        stage: r.get("stage") || null,
        announcedDate: r.get("announcedDate") || null,
        companyUuid: r.get("companyUuid"),
        companyName: r.get("companyName") || "",
        companyNormalized: r.get("companyNormalized") || "",
        country: r.get("country") || null,
      };
    });
  } finally {
    await session.close();
  }
}

function normalizeStage(s: string | null): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9+]/g, "");
}

function dateBucket(iso: string | null): string | null {
  if (!iso) return null;
  return iso.slice(0, 7); // YYYY-MM
}

function adjacentBuckets(bucket: string | null): string[] {
  if (!bucket) return [];
  const [year, month] = bucket.split("-").map(Number);
  if (!year || !month) return [bucket];
  const out = [bucket];
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  out.push(`${prevYear}-${String(prevMonth).padStart(2, "0")}`);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  out.push(`${nextYear}-${String(nextMonth).padStart(2, "0")}`);
  return out;
}

function snapshot(r: RoundNode): Record<string, unknown> {
  return {
    uuid: r.uuid,
    roundKey: r.roundKey,
    company: r.companyName,
    companyUuid: r.companyUuid,
    amountUsd: r.amountUsd,
    stage: r.stage,
    announcedDate: r.announcedDate,
    country: r.country,
  };
}

export async function detectRoundDuplicates(): Promise<{ pairs: DedupPair[]; scanned: number }> {
  const rounds = await loadRounds();
  const pairs = new Map<string, DedupPair>();

  // Block by stage + month-bucket. Pairs are cross-bucket if buckets are adjacent.
  const byBucket = new Map<string, RoundNode[]>();
  for (const r of rounds) {
    const bucket = dateBucket(r.announcedDate) || "unknown";
    const stage = normalizeStage(r.stage) || "unknown";
    const k = `${stage}|${bucket}`;
    const list = byBucket.get(k) ?? [];
    list.push(r);
    byBucket.set(k, list);
  }

  function emit(
    a: RoundNode,
    b: RoundNode,
    score: number,
    reasons: Record<string, unknown>,
  ) {
    if (a.uuid === b.uuid) return;
    if (a.companyUuid === b.companyUuid && a.roundKey === b.roundKey) return;
    const { leftKey, rightKey } = candidateKeys(a.uuid, b.uuid);
    const key = `${leftKey}::${rightKey}`;
    const left = leftKey === a.uuid ? a : b;
    const right = leftKey === a.uuid ? b : a;
    const existing = pairs.get(key);
    if (!existing || score > existing.score) {
      pairs.set(key, {
        entityType: "round",
        leftKey,
        rightKey,
        tier: 2,
        score,
        reasons,
        leftSnapshot: snapshot(left),
        rightSnapshot: snapshot(right),
      });
    }
  }

  function withinWindow(a: RoundNode, b: RoundNode): boolean {
    if (!a.announcedDate || !b.announcedDate) return true; // unknown date — let other checks decide
    const da = new Date(a.announcedDate).getTime();
    const db = new Date(b.announcedDate).getTime();
    if (Number.isNaN(da) || Number.isNaN(db)) return true;
    const diff = Math.abs(da - db);
    return diff <= ROUND_WINDOW_DAYS * 86400_000;
  }

  function amountSimilarity(a: RoundNode, b: RoundNode): number {
    if (a.amountUsd == null || b.amountUsd == null) return 0.5; // neutral
    const lo = Math.min(a.amountUsd, b.amountUsd);
    const hi = Math.max(a.amountUsd, b.amountUsd);
    if (hi === 0) return 0.5;
    return lo / hi;
  }

  // Build cross-bucket candidate sets (a round in bucket X is compared to rounds in X, X-1, X+1)
  for (const [bucketKey, list] of byBucket) {
    const [stage, bucket] = bucketKey.split("|");
    if (list.length === 0) continue;

    const adjacents = adjacentBuckets(bucket === "unknown" ? null : bucket);
    const candidatePool = new Map<string, RoundNode>();
    for (const r of list) candidatePool.set(r.uuid, r);
    for (const adj of adjacents) {
      if (adj === bucket) continue;
      const adjList = byBucket.get(`${stage}|${adj}`);
      if (!adjList) continue;
      for (const r of adjList) candidatePool.set(r.uuid, r);
    }

    const pool = Array.from(candidatePool.values());
    if (pool.length > 500) continue; // skip pathological buckets

    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const a = pool[i];
        const b = pool[j];
        if (a.companyUuid === b.companyUuid) continue; // same company → already merged via roundKey
        if (!withinWindow(a, b)) continue;

        const nameLev = levenshteinSimilarity(a.companyNormalized, b.companyNormalized);
        const nameJacc = tokenJaccard(tokenize(a.companyName), tokenize(b.companyName));
        const nameScore = Math.max(nameLev, nameJacc);
        if (nameScore < ROUND_NAME_THRESHOLD) continue;

        const amtSim = amountSimilarity(a, b);
        const sameCountry = !!(a.country && b.country && a.country === b.country);

        const score =
          0.55 * nameScore +
          0.25 * amtSim +
          0.10 * (sameCountry ? 1 : 0) +
          0.10 * (a.stage && b.stage && normalizeStage(a.stage) === normalizeStage(b.stage) ? 1 : 0);

        if (score >= 0.7) {
          emit(a, b, score, {
            match: "fuzzy_round",
            companyNameScore: Number(nameScore.toFixed(3)),
            amountSimilarity: Number(amtSim.toFixed(3)),
            sameCountry,
            sameStage: normalizeStage(a.stage) === normalizeStage(b.stage),
          });
        }
      }
    }
  }

  return { pairs: Array.from(pairs.values()), scanned: rounds.length };
}
