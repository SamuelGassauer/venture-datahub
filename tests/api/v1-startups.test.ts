import { describe, it, expect, beforeAll } from "vitest";

const BASE = process.env.TEST_API_URL || "http://localhost:3000";

type FundingRound = {
  roundExternalId: string | null;
  stage: string | null;
  amountUsd: number | null;
  date: string | null;
  investors: { externalId: string | null; name: string | null; role: string | null }[];
};

type StartupRecord = {
  externalId: string | null;
  name: string | null;
  website: string | null;
  hq: string | null;
  description: string | null;
  foundedAt: string | null;
  sector: string[];
  stage: string | null;
  fundingRounds: FundingRound[];
  updatedAt: string;
};

type ApiResponse = {
  data: StartupRecord[];
  pagination: { cursor: string | null; hasMore: boolean };
};

async function fetchStartups(params: Record<string, string> = {}): Promise<ApiResponse> {
  const url = new URL("/api/v1/startups", BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  expect(res.status).toBe(200);
  return res.json();
}

describe("/api/v1/startups", () => {
  let firstResponse: ApiResponse;

  beforeAll(async () => {
    firstResponse = await fetchStartups({ limit: "5" });
  });

  // ── Response shape ──────────────────────────────────────────────────

  it("returns { data, pagination } envelope", () => {
    expect(firstResponse).toHaveProperty("data");
    expect(firstResponse).toHaveProperty("pagination");
    expect(Array.isArray(firstResponse.data)).toBe(true);
  });

  it("every record has required fields", () => {
    for (const s of firstResponse.data) {
      expect(s.externalId).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(typeof s.updatedAt).toBe("string");
    }
  });

  it("sector is an array of strings", () => {
    for (const s of firstResponse.data) {
      expect(Array.isArray(s.sector)).toBe(true);
      for (const sec of s.sector) expect(typeof sec).toBe("string");
    }
  });

  it("foundedAt is ISO date format or null", () => {
    for (const s of firstResponse.data) {
      if (s.foundedAt) expect(s.foundedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  // ── Funding Rounds (nested) ─────────────────────────────────────────

  it("fundingRounds is an array", () => {
    for (const s of firstResponse.data) {
      expect(Array.isArray(s.fundingRounds)).toBe(true);
    }
  });

  it("each funding round has correct shape", () => {
    for (const s of firstResponse.data) {
      for (const fr of s.fundingRounds) {
        expect(fr).toHaveProperty("roundExternalId");
        expect(fr).toHaveProperty("stage");
        expect(fr).toHaveProperty("amountUsd");
        expect(fr).toHaveProperty("investors");
        expect(Array.isArray(fr.investors)).toBe(true);
      }
    }
  });

  it("funding round investors have externalId, name, role", () => {
    for (const s of firstResponse.data) {
      for (const fr of s.fundingRounds) {
        for (const inv of fr.investors) {
          expect(inv).toHaveProperty("externalId");
          expect(inv).toHaveProperty("name");
          expect(inv).toHaveProperty("role");
        }
      }
    }
  });

  // ── Pagination ──────────────────────────────────────────────────────

  it("respects limit parameter", async () => {
    const res = await fetchStartups({ limit: "2" });
    expect(res.data.length).toBeLessThanOrEqual(2);
  });

  it("cursor pagination returns next page without overlap", async () => {
    const page1 = await fetchStartups({ limit: "2" });
    if (!page1.pagination.cursor) return;
    const page2 = await fetchStartups({ limit: "2", cursor: page1.pagination.cursor });
    expect(page2.data.length).toBeGreaterThan(0);
    const ids1 = page1.data.map((d) => d.externalId);
    const ids2 = page2.data.map((d) => d.externalId);
    for (const id of ids2) expect(ids1).not.toContain(id);
  });

  // ── Filters ─────────────────────────────────────────────────────────

  it("name filter returns only matching results", async () => {
    const known = firstResponse.data.find((d) => d.name && d.name.length >= 8);
    if (!known) return;
    const searchTerm = known.name!;
    const res = await fetchStartups({ name: searchTerm });
    expect(res.data.length).toBeGreaterThan(0);
    for (const s of res.data) {
      expect(s.name!.toLowerCase()).toContain(searchTerm.toLowerCase());
    }
  });

  it("id filter returns exact match by UUID", async () => {
    const known = firstResponse.data.find((d) => d.externalId);
    if (!known) return;
    const res = await fetchStartups({ id: known.externalId! });
    expect(res.data.length).toBe(1);
    expect(res.data[0].externalId).toBe(known.externalId);
  });

  it("sort=name returns consistent ordering", async () => {
    // Just verify the same query returns the same order twice (deterministic)
    const res1 = await fetchStartups({ sort: "name", dir: "asc", limit: "5" });
    const res2 = await fetchStartups({ sort: "name", dir: "asc", limit: "5" });
    const names1 = res1.data.map((d) => d.name);
    const names2 = res2.data.map((d) => d.name);
    expect(names1).toEqual(names2);
  });

  // ── sector_focus filter (was a no-op before fix) ────────────────────

  it("sector_focus filter returns only startups tagged with that sector", async () => {
    const pool = await fetchStartups({ limit: "50" });
    const sample = pool.data.flatMap((s) => s.sector).find((s) => typeof s === "string" && s.length > 0);
    if (!sample) return;
    const res = await fetchStartups({ sector_focus: sample, limit: "50" });
    expect(res.data.length).toBeGreaterThan(0);
    for (const s of res.data) {
      const lowered = s.sector.map((x) => x.toLowerCase());
      expect(lowered).toContain(sample.toLowerCase());
    }
  });

  it("sector_focus with nonexistent value returns empty data + pagination envelope", async () => {
    const res = await fetchStartups({ sector_focus: "__definitely_not_a_real_sector__" });
    expect(Array.isArray(res.data)).toBe(true);
    expect(res.data.length).toBe(0);
    expect(res.pagination).toHaveProperty("hasMore");
    expect(res.pagination.hasMore).toBe(false);
  });

  it("sector_focus is case-insensitive", async () => {
    const pool = await fetchStartups({ limit: "50" });
    const sample = pool.data.flatMap((s) => s.sector).find((s) => typeof s === "string" && /[a-zA-Z]/.test(s));
    if (!sample) return;
    const upper = sample.toUpperCase();
    const lower = sample.toLowerCase();
    const resUpper = await fetchStartups({ sector_focus: upper, limit: "50" });
    const resLower = await fetchStartups({ sector_focus: lower, limit: "50" });
    expect(resUpper.data.length).toBe(resLower.data.length);
  });
});
