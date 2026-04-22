import { describe, it, expect, beforeAll } from "vitest";

const BASE = process.env.TEST_API_URL || "http://localhost:3000";

type InvestorRecord = {
  externalId: string | null;
  name: string | null;
  logoUrl: string | null;
  website: string | null;
  linkedinUrl: string | null;
  hq: string | null;
  foundedAt: string | null;
  description: string | null;
  aumUsdMillions: number | null;
  minRoundUsd: number | null;
  maxRoundUsd: number | null;
  dealCount: number;
  roundRole: string;
  stages: string[];
  sectorFocus: string[];
  geoFocus: string[];
  updatedAt: string;
};

type ApiResponse = {
  data: InvestorRecord[];
  pagination: { cursor: string | null; hasMore: boolean };
};

async function fetchInvestors(params: Record<string, string> = {}): Promise<ApiResponse> {
  const url = new URL("/api/v1/investors", BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  expect(res.status).toBe(200);
  return res.json();
}

describe("/api/v1/investors", () => {
  let firstResponse: ApiResponse;

  beforeAll(async () => {
    firstResponse = await fetchInvestors({ limit: "5" });
  });

  // ── Response shape ──────────────────────────────────────────────────

  it("returns { data, pagination } envelope", () => {
    expect(firstResponse).toHaveProperty("data");
    expect(firstResponse).toHaveProperty("pagination");
    expect(Array.isArray(firstResponse.data)).toBe(true);
    expect(firstResponse.pagination).toHaveProperty("hasMore");
    expect(firstResponse.pagination).toHaveProperty("cursor");
  });

  it("every record has required fields", () => {
    for (const inv of firstResponse.data) {
      expect(inv.externalId).toBeTruthy();
      expect(inv.name).toBeTruthy();
      expect(typeof inv.dealCount).toBe("number");
      expect(inv.dealCount).toBeGreaterThan(0);
      expect(typeof inv.updatedAt).toBe("string");
    }
  });

  it("roundRole is LEAD, FOLLOW, or BOTH", () => {
    for (const inv of firstResponse.data) {
      expect(["LEAD", "FOLLOW", "BOTH"]).toContain(inv.roundRole);
    }
  });

  it("sectorFocus is an array of strings", () => {
    for (const inv of firstResponse.data) {
      expect(Array.isArray(inv.sectorFocus)).toBe(true);
      for (const s of inv.sectorFocus) expect(typeof s).toBe("string");
    }
  });

  it("stages is an array of strings", () => {
    for (const inv of firstResponse.data) {
      expect(Array.isArray(inv.stages)).toBe(true);
    }
  });

  it("hq is a combined string (not separate city/country)", () => {
    for (const inv of firstResponse.data) {
      if (inv.hq) {
        expect(typeof inv.hq).toBe("string");
        // Should NOT have hqCity/hqCountry as separate fields
        expect(inv).not.toHaveProperty("hqCity");
        expect(inv).not.toHaveProperty("hqCountry");
      }
    }
  });

  it("monetary fields are numbers or null", () => {
    for (const inv of firstResponse.data) {
      if (inv.aumUsdMillions !== null) expect(typeof inv.aumUsdMillions).toBe("number");
      if (inv.minRoundUsd !== null) expect(typeof inv.minRoundUsd).toBe("number");
      if (inv.maxRoundUsd !== null) expect(typeof inv.maxRoundUsd).toBe("number");
    }
  });

  it("foundedAt is ISO date format or null", () => {
    for (const inv of firstResponse.data) {
      if (inv.foundedAt) expect(inv.foundedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  // ── Pagination ──────────────────────────────────────────────────────

  it("respects limit parameter", async () => {
    const res = await fetchInvestors({ limit: "2" });
    expect(res.data.length).toBeLessThanOrEqual(2);
  });

  it("cursor pagination returns next page", async () => {
    const page1 = await fetchInvestors({ limit: "2" });
    if (!page1.pagination.cursor) return; // not enough data
    const page2 = await fetchInvestors({ limit: "2", cursor: page1.pagination.cursor });
    expect(page2.data.length).toBeGreaterThan(0);
    // Pages should not overlap
    const ids1 = page1.data.map((d) => d.externalId);
    const ids2 = page2.data.map((d) => d.externalId);
    for (const id of ids2) expect(ids1).not.toContain(id);
  });

  // ── Filters ─────────────────────────────────────────────────────────

  it("name filter returns only matching results", async () => {
    const knownInvestor = firstResponse.data.find((d) => d.name && d.name.length >= 8);
    if (!knownInvestor) return;
    const searchTerm = knownInvestor.name!;
    const res = await fetchInvestors({ name: searchTerm });
    expect(res.data.length).toBeGreaterThan(0);
    for (const inv of res.data) {
      expect(inv.name!.toLowerCase()).toContain(searchTerm.toLowerCase());
    }
  });

  it("id filter returns exact match by UUID", async () => {
    const known = firstResponse.data.find((d) => d.externalId);
    if (!known) return;
    const res = await fetchInvestors({ id: known.externalId! });
    expect(res.data.length).toBe(1);
    expect(res.data[0].externalId).toBe(known.externalId);
  });

  it("sort=name&dir=asc returns alphabetical order", async () => {
    const res = await fetchInvestors({ sort: "name", dir: "asc", limit: "10" });
    const names = res.data.map((d) => d.name?.toLowerCase() || "");
    for (let i = 1; i < names.length; i++) {
      expect(names[i] >= names[i - 1]).toBe(true);
    }
  });

  // ── No investors with 0 deals ───────────────────────────────────────

  it("never returns investors with dealCount 0", async () => {
    const res = await fetchInvestors({ limit: "100" });
    for (const inv of res.data) {
      expect(inv.dealCount).toBeGreaterThan(0);
    }
  });

  // ── sector_focus filter (was a no-op before fix) ────────────────────

  it("sector_focus filter restricts investors to those active in that sector", async () => {
    const pool = await fetchInvestors({ limit: "50" });
    const sample = pool.data.flatMap((d) => d.sectorFocus).find((s) => typeof s === "string" && s.length > 0);
    if (!sample) return;
    const res = await fetchInvestors({ sector_focus: sample, limit: "50" });
    expect(res.data.length).toBeGreaterThan(0);
    for (const inv of res.data) {
      const lowered = inv.sectorFocus.map((x) => x.toLowerCase());
      expect(lowered).toContain(sample.toLowerCase());
    }
  });

  it("sector_focus with nonexistent value returns empty data", async () => {
    const res = await fetchInvestors({ sector_focus: "__definitely_not_a_real_sector__" });
    expect(Array.isArray(res.data)).toBe(true);
    expect(res.data.length).toBe(0);
  });
});
