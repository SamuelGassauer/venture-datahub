import { describe, it, expect, beforeAll } from "vitest";

const BASE = process.env.TEST_API_URL || "http://localhost:3000";

type InvestmentRecord = {
  externalId: string | null;
  fundExternalId: string | null;
  fundName: string | null;
  startupExternalId: string | null;
  startupName: string | null;
  investmentDate: string | null;
  investmentAmountUsd: number | null;
  totalRoundSizeUsd: number | null;
  stage: string | null;
  role: string;
  confidence: number | null;
  coInvestors: string[];
  updatedAt: string;
};

type ApiResponse = {
  data: InvestmentRecord[];
  pagination: { cursor: string | null; hasMore: boolean; totalCount: number; totalCountApproximate: boolean };
};

async function fetchInvestments(params: Record<string, string> = {}): Promise<ApiResponse> {
  const url = new URL("/api/v1/investments", BASE);
  if (!("posted" in params)) url.searchParams.set("posted", "all");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  expect(res.status).toBe(200);
  return res.json();
}

describe("/api/v1/investments", () => {
  let firstResponse: ApiResponse;

  beforeAll(async () => {
    firstResponse = await fetchInvestments({ limit: "5" });
  });

  // ── Response shape ──────────────────────────────────────────────────

  it("returns { data, pagination } envelope with totalCount", () => {
    expect(firstResponse).toHaveProperty("data");
    expect(firstResponse).toHaveProperty("pagination");
    expect(Array.isArray(firstResponse.data)).toBe(true);
    expect(typeof firstResponse.pagination.totalCount).toBe("number");
    expect(typeof firstResponse.pagination.totalCountApproximate).toBe("boolean");
    expect(firstResponse.pagination.totalCount).toBeGreaterThanOrEqual(firstResponse.data.length);
  });

  it("accepts limit up to 500", async () => {
    const res = await fetchInvestments({ limit: "500" });
    expect(res.data.length).toBeLessThanOrEqual(500);
  });

  it("every record is 1:1 (one fund per record)", () => {
    for (const inv of firstResponse.data) {
      expect(inv.fundExternalId).toBeTruthy();
      expect(inv.fundName).toBeTruthy();
      expect(inv.startupExternalId).toBeTruthy();
      expect(inv.startupName).toBeTruthy();
      expect(typeof inv.updatedAt).toBe("string");
    }
  });

  it("externalId is composite (fundId__roundId)", () => {
    for (const inv of firstResponse.data) {
      if (inv.externalId) {
        expect(inv.externalId).toContain("__");
      }
    }
  });

  it("role is LEAD or FOLLOW", () => {
    for (const inv of firstResponse.data) {
      expect(["LEAD", "FOLLOW"]).toContain(inv.role);
    }
  });

  it("coInvestors is a string array (not object array)", () => {
    for (const inv of firstResponse.data) {
      expect(Array.isArray(inv.coInvestors)).toBe(true);
      for (const name of inv.coInvestors) expect(typeof name).toBe("string");
    }
  });

  it("investmentAmountUsd is null (we don't have individual cheque data)", () => {
    for (const inv of firstResponse.data) {
      expect(inv.investmentAmountUsd).toBeNull();
    }
  });

  it("totalRoundSizeUsd is number or null", () => {
    for (const inv of firstResponse.data) {
      if (inv.totalRoundSizeUsd !== null) expect(typeof inv.totalRoundSizeUsd).toBe("number");
    }
  });

  it("investmentDate is ISO date or null", () => {
    for (const inv of firstResponse.data) {
      if (inv.investmentDate) expect(inv.investmentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  // ── Pagination ──────────────────────────────────────────────────────

  it("respects limit parameter", async () => {
    const res = await fetchInvestments({ limit: "2" });
    expect(res.data.length).toBeLessThanOrEqual(2);
  });

  it("cursor pagination returns next page", async () => {
    const page1 = await fetchInvestments({ limit: "2" });
    if (!page1.pagination.cursor) return;
    const page2 = await fetchInvestments({ limit: "2", cursor: page1.pagination.cursor });
    expect(page2.data.length).toBeGreaterThan(0);
    // With 1:1 structure, same fund can appear in multiple rounds — just verify we get different records
    // by checking that at least one record differs
    const json1 = page1.data.map((d) => JSON.stringify(d));
    const json2 = page2.data.map((d) => JSON.stringify(d));
    const allSame = json2.every((j) => json1.includes(j));
    expect(allSame).toBe(false);
  });

  // ── Filters ─────────────────────────────────────────────────────────

  it("fund filter returns matching records", async () => {
    if (!firstResponse.data[0]?.fundName) return;
    const searchTerm = firstResponse.data[0].fundName.substring(0, 5);
    const res = await fetchInvestments({ fund: searchTerm });
    expect(res.data.length).toBeGreaterThan(0);
    for (const inv of res.data) {
      expect(inv.fundName!.toLowerCase()).toContain(searchTerm.toLowerCase());
    }
  });

  it("startup filter returns matching records", async () => {
    if (!firstResponse.data[0]?.startupName) return;
    const searchTerm = firstResponse.data[0].startupName.substring(0, 4);
    const res = await fetchInvestments({ startup: searchTerm });
    expect(res.data.length).toBeGreaterThan(0);
    for (const inv of res.data) {
      expect(inv.startupName!.toLowerCase()).toContain(searchTerm.toLowerCase());
    }
  });

  // ── Distinct from funding-rounds ────────────────────────────────────

  it("does NOT have an investors array (that's funding-rounds)", () => {
    for (const inv of firstResponse.data) {
      expect(inv).not.toHaveProperty("investors");
    }
  });
});
