import { prisma } from "@/lib/db";

/**
 * "Posted" funding rounds are ones we have manually reviewed + published via
 * the internal /posts workflow. Source of truth: Post table in Postgres,
 * filtered to publishedAt IS NOT NULL.
 *
 * Each Post row references its FundingRound via `fundingRoundKey`, a composite
 * string of the form `${normalizedCompanyName}_${stage||'unknown'}_${neo4jId}`
 * (built in src/app/api/posts/rounds/route.ts when the reviewer loads the
 * queue). The trailing `_<int>` is the Neo4j internal node id — same primitive
 * that `id(fr)` returns inside Cypher, so we can filter by `id(fr) IN $ids`.
 *
 * We cache the full post map in-process for 60s. Serverless instances each hold
 * their own copy, so stale windows are bounded by TTL × instance count.
 * Publishing a new post won't appear to the API immediately; that's fine for
 * the v1 data-provider contract.
 */

export type PostData = { content: string; publishedAt: string };

type Cache = { map: Map<number, PostData>; expiresAt: number };
let cache: Cache | null = null;
const TTL_MS = 60_000;

const KEY_SUFFIX_RE = /_(\d+)$/;

async function loadCache(): Promise<Map<number, PostData>> {
  if (cache && cache.expiresAt > Date.now()) return cache.map;

  const rows = await prisma.post.findMany({
    where: { publishedAt: { not: null } },
    select: { fundingRoundKey: true, content: true, publishedAt: true },
  });

  const map = new Map<number, PostData>();
  for (const row of rows) {
    const match = row.fundingRoundKey.match(KEY_SUFFIX_RE);
    if (!match) continue;
    const n = Number.parseInt(match[1], 10);
    if (!Number.isFinite(n)) continue;
    map.set(n, {
      content: row.content,
      publishedAt: row.publishedAt!.toISOString(),
    });
  }

  cache = { map, expiresAt: Date.now() + TTL_MS };
  return map;
}

export async function getPostedRoundIds(): Promise<number[]> {
  return Array.from((await loadCache()).keys());
}

export async function getPostedRoundsMap(): Promise<Map<number, PostData>> {
  return loadCache();
}

/**
 * Reads `?posted=` from the request. Accepts:
 *   - "all" / "any"  → include unposted rounds (escape hatch for admin/debug)
 *   - anything else  → posted-only (default)
 */
export type PostedMode = "posted" | "all";

export function parsePostedMode(searchParams: URLSearchParams): PostedMode {
  const v = searchParams.get("posted");
  if (v && ["all", "any", "0", "false"].includes(v.toLowerCase())) return "all";
  return "posted";
}

export function clearPostedRoundsCache(): void {
  cache = null;
}
