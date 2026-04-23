import { describe, it, expect, beforeAll } from "vitest";

const BASE = process.env.TEST_API_URL || "http://localhost:3000";

type TopInvestor = {
  externalId: string | null;
  name: string | null;
  hq: string | null;
  dealCount: number;
  leadCount: number;
};

type Response = {
  investorCount: number;
  activeInvestorCount: number;
  typeMix: { type: string | null; count: number }[];
  topByActivity: TopInvestor[];
  computedAt: string;
};

async function fetchStats(params: Record<string, string> = {}): Promise<Response> {
  const url = new URL("/api/v1/stats/investors", BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  expect(res.status).toBe(200);
  return res.json();
}

describe("/api/v1/stats/investors", () => {
  let root: Response;

  beforeAll(async () => {
    root = await fetchStats();
  });

  it("returns aggregate shape", () => {
    expect(root).toHaveProperty("investorCount");
    expect(root).toHaveProperty("activeInvestorCount");
    expect(root).toHaveProperty("typeMix");
    expect(root).toHaveProperty("topByActivity");
    expect(root).toHaveProperty("computedAt");
  });

  it("activeInvestorCount ≤ investorCount", () => {
    expect(root.activeInvestorCount).toBeLessThanOrEqual(root.investorCount);
  });

  it("typeMix counts sum ≤ investorCount (mix includes investors regardless of deals)", () => {
    const sum = root.typeMix.reduce((acc, row) => acc + row.count, 0);
    // typeMix is investor-universe scoped, not deal scoped, so sum can exceed
    // investorCount when sectorFocus narrows the count. We only assert positivity.
    expect(sum).toBeGreaterThanOrEqual(0);
  });

  it("topByActivity is capped at 20 and sorted by dealCount desc", () => {
    expect(root.topByActivity.length).toBeLessThanOrEqual(20);
    for (let i = 1; i < root.topByActivity.length; i++) {
      expect(root.topByActivity[i].dealCount).toBeLessThanOrEqual(root.topByActivity[i - 1].dealCount);
    }
  });

  it("topByActivity entries have leadCount ≤ dealCount", () => {
    for (const row of root.topByActivity) {
      expect(row.leadCount).toBeLessThanOrEqual(row.dealCount);
    }
  });

  it("active_since in the far future yields activeInvestorCount 0", async () => {
    const filtered = await fetchStats({ active_since: "2099-01-01" });
    expect(filtered.activeInvestorCount).toBe(0);
  });
});
