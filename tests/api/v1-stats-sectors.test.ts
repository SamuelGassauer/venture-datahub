import { describe, it, expect, beforeAll } from "vitest";

const BASE = process.env.TEST_API_URL || "http://localhost:3000";

type Subsector = { label: string; startupCount: number; recentRoundCount: number };
type Sector = {
  primary: string;
  startupCount: number;
  recentRoundCount: number;
  recentAmountUsd: number;
  subsectors: Subsector[];
};

type Response = {
  sectors: Sector[];
  totalStartups: number;
  windowDays: number;
  computedAt: string;
};

async function fetchStats(): Promise<Response> {
  const url = new URL("/api/v1/stats/sectors", BASE);
  url.searchParams.set("posted", "all");
  const res = await fetch(url.toString());
  expect(res.status).toBe(200);
  return res.json();
}

describe("/api/v1/stats/sectors", () => {
  let root: Response;

  beforeAll(async () => {
    root = await fetchStats();
  });

  it("returns catalog shape", () => {
    expect(Array.isArray(root.sectors)).toBe(true);
    expect(typeof root.totalStartups).toBe("number");
    expect(typeof root.windowDays).toBe("number");
    expect(root.windowDays).toBeGreaterThan(0);
    expect(root.computedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("every sector has a primary label and numeric counts", () => {
    for (const sec of root.sectors) {
      expect(typeof sec.primary).toBe("string");
      expect(sec.primary.length).toBeGreaterThan(0);
      expect(typeof sec.startupCount).toBe("number");
      expect(typeof sec.recentRoundCount).toBe("number");
      expect(typeof sec.recentAmountUsd).toBe("number");
      expect(Array.isArray(sec.subsectors)).toBe(true);
    }
  });

  it("sectors are sorted by recentRoundCount desc (ties broken by startupCount desc)", () => {
    for (let i = 1; i < root.sectors.length; i++) {
      const prev = root.sectors[i - 1];
      const cur = root.sectors[i];
      if (prev.recentRoundCount === cur.recentRoundCount) {
        expect(cur.startupCount).toBeLessThanOrEqual(prev.startupCount);
      } else {
        expect(cur.recentRoundCount).toBeLessThanOrEqual(prev.recentRoundCount);
      }
    }
  });

  it("matches /api/v1/sectors/catalog on totals (shared compute)", async () => {
    const url = new URL("/api/v1/sectors/catalog", BASE);
    url.searchParams.set("posted", "all");
    const catalogRes = await fetch(url.toString());
    expect(catalogRes.status).toBe(200);
    const catalog = await catalogRes.json();
    expect(catalog.totalStartups).toBe(root.totalStartups);
    expect(catalog.windowDays).toBe(root.windowDays);
    expect((catalog.entries as unknown[]).length).toBe(root.sectors.length);
  });
});
