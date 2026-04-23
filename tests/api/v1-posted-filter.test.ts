import { describe, it, expect } from "vitest";

const BASE = process.env.TEST_API_URL || "http://localhost:3000";

type PaginatedList = {
  data: unknown[];
  pagination: { totalCount: number };
};

async function getList(path: string, postedParam?: string): Promise<PaginatedList> {
  const url = new URL(path, BASE);
  url.searchParams.set("limit", "1");
  if (postedParam !== undefined) url.searchParams.set("posted", postedParam);
  const res = await fetch(url.toString());
  expect(res.status).toBe(200);
  return res.json();
}

async function getJson(path: string, postedParam?: string): Promise<Record<string, unknown>> {
  const url = new URL(path, BASE);
  if (postedParam !== undefined) url.searchParams.set("posted", postedParam);
  const res = await fetch(url.toString());
  expect(res.status).toBe(200);
  return res.json();
}

describe("posted-rounds filter (default scope: manually reviewed only)", () => {
  // ── Default vs escape hatch ─────────────────────────────────────────

  it("list endpoints return ≤ totalCount(all) when default (posted-only)", async () => {
    for (const path of ["/api/v1/funding-rounds", "/api/v1/investments", "/api/v1/startups", "/api/v1/investors"]) {
      const defaultRes = await getList(path);
      const allRes = await getList(path, "all");
      expect(defaultRes.pagination.totalCount).toBeLessThanOrEqual(allRes.pagination.totalCount);
    }
  });

  it("?posted=all short-circuits the filter", async () => {
    const defaultRes = await getList("/api/v1/funding-rounds");
    const allRes = await getList("/api/v1/funding-rounds", "all");
    // All must be >= default. When posts are sparsely published they're
    // strictly greater; in dev-only envs with no posts they're equal (0 vs full set).
    expect(allRes.pagination.totalCount).toBeGreaterThanOrEqual(defaultRes.pagination.totalCount);
  });

  it("?posted=<garbage> falls back to posted-only default (only 'all'/'any'/'0'/'false' disable)", async () => {
    const defaultRes = await getList("/api/v1/funding-rounds");
    const garbageRes = await getList("/api/v1/funding-rounds", "unknown-value");
    expect(garbageRes.pagination.totalCount).toBe(defaultRes.pagination.totalCount);
  });

  // ── Stats endpoints respect the scope ────────────────────────────────

  it("/stats/funding-rounds roundCount is ≤ /stats/funding-rounds?posted=all", async () => {
    const scoped = await getJson("/api/v1/stats/funding-rounds") as { roundCount: number };
    const all = await getJson("/api/v1/stats/funding-rounds", "all") as { roundCount: number };
    expect(scoped.roundCount).toBeLessThanOrEqual(all.roundCount);
  });

  it("/stats/investors investorCount is ≤ /stats/investors?posted=all", async () => {
    const scoped = await getJson("/api/v1/stats/investors") as { investorCount: number };
    const all = await getJson("/api/v1/stats/investors", "all") as { investorCount: number };
    expect(scoped.investorCount).toBeLessThanOrEqual(all.investorCount);
  });

  it("/stats/sectors totalStartups is same (startups are not filtered by post status), sector counts respect scope", async () => {
    const scoped = await getJson("/api/v1/stats/sectors") as {
      totalStartups: number;
      sectors: { primary: string; recentRoundCount: number }[];
    };
    const all = await getJson("/api/v1/stats/sectors", "all") as {
      totalStartups: number;
      sectors: { primary: string; recentRoundCount: number }[];
    };
    expect(scoped.totalStartups).toBe(all.totalStartups); // totalStartups counts companies, not rounds
    const scopedSum = scoped.sectors.reduce((acc, s) => acc + s.recentRoundCount, 0);
    const allSum = all.sectors.reduce((acc, s) => acc + s.recentRoundCount, 0);
    expect(scopedSum).toBeLessThanOrEqual(allSum);
  });

  // ── Funding-rounds filter integrity ─────────────────────────────────

  it("every round returned in default scope is listed by /stats/funding-rounds (same set semantics)", async () => {
    // Sanity: totals match between list and stats for the same filter set
    const listRes = await getList("/api/v1/funding-rounds");
    const statsRes = await getJson("/api/v1/stats/funding-rounds") as { roundCount: number };
    expect(statsRes.roundCount).toBe(listRes.pagination.totalCount);
  });
});
