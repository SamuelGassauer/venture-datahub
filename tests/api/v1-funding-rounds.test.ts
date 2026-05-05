import { describe, it, expect, beforeAll } from "vitest";

const BASE = process.env.TEST_API_URL || "http://localhost:3000";

type InvestorInRound = {
  externalId: string | null;
  name: string | null;
  role: string;
};

type FundingRoundPost = {
  content: string;
  publishedAt: string;
};

type FundingRoundRecord = {
  roundExternalId: string | null;
  startupExternalId: string | null;
  startupName: string | null;
  investmentDate: string | null;
  totalRoundSizeUsd: number | null;
  currency: string | null;
  stage: string | null;
  confidence: number | null;
  investors: InvestorInRound[];
  updatedAt: string;
  post: FundingRoundPost | null;
};

type ApiResponse = {
  data: FundingRoundRecord[];
  pagination: { cursor: string | null; hasMore: boolean; totalCount: number; totalCountApproximate: boolean };
};

async function fetchRounds(params: Record<string, string> = {}): Promise<ApiResponse> {
  const url = new URL("/api/v1/funding-rounds", BASE);
  if (!("posted" in params)) url.searchParams.set("posted", "all");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  expect(res.status).toBe(200);
  return res.json();
}

describe("/api/v1/funding-rounds", () => {
  let firstResponse: ApiResponse;

  beforeAll(async () => {
    firstResponse = await fetchRounds({ limit: "5" });
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
    const res = await fetchRounds({ limit: "500" });
    expect(res.data.length).toBeLessThanOrEqual(500);
  });

  it("every record has required round fields", () => {
    for (const fr of firstResponse.data) {
      expect(fr).toHaveProperty("roundExternalId");
      expect(fr).toHaveProperty("startupExternalId");
      expect(fr).toHaveProperty("startupName");
      expect(typeof fr.updatedAt).toBe("string");
    }
  });

  it("uses renamed field investmentDate (not date)", () => {
    for (const fr of firstResponse.data) {
      expect(fr).toHaveProperty("investmentDate");
      expect(fr).not.toHaveProperty("date");
    }
  });

  it("uses renamed field totalRoundSizeUsd (not amountUsd)", () => {
    for (const fr of firstResponse.data) {
      expect(fr).toHaveProperty("totalRoundSizeUsd");
      expect(fr).not.toHaveProperty("amountUsd");
    }
  });

  it("investors is an array of objects with role", () => {
    for (const fr of firstResponse.data) {
      expect(Array.isArray(fr.investors)).toBe(true);
      for (const inv of fr.investors) {
        expect(inv).toHaveProperty("externalId");
        expect(inv).toHaveProperty("name");
        expect(inv).toHaveProperty("role");
        expect(["LEAD", "FOLLOW"]).toContain(inv.role);
      }
    }
  });

  it("investmentDate is ISO date or null", () => {
    for (const fr of firstResponse.data) {
      if (fr.investmentDate) expect(fr.investmentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("totalRoundSizeUsd is number or null", () => {
    for (const fr of firstResponse.data) {
      if (fr.totalRoundSizeUsd !== null) expect(typeof fr.totalRoundSizeUsd).toBe("number");
    }
  });

  // ── Pagination ──────────────────────────────────────────────────────

  it("respects limit parameter", async () => {
    const res = await fetchRounds({ limit: "2" });
    expect(res.data.length).toBeLessThanOrEqual(2);
  });

  it("cursor pagination returns next page without overlap", async () => {
    const page1 = await fetchRounds({ limit: "2" });
    if (!page1.pagination.cursor) return;
    const page2 = await fetchRounds({ limit: "2", cursor: page1.pagination.cursor });
    expect(page2.data.length).toBeGreaterThan(0);
    const ids1 = page1.data.map((d) => d.roundExternalId);
    const ids2 = page2.data.map((d) => d.roundExternalId);
    for (const id of ids2) expect(ids1).not.toContain(id);
  });

  // ── Filters ─────────────────────────────────────────────────────────

  it("investor filter returns matching rounds", async () => {
    // Find a round with investors, then filter by one
    const withInvestors = firstResponse.data.find((fr) => fr.investors.length > 0);
    if (!withInvestors) return;
    const invName = withInvestors.investors[0].name!;
    const res = await fetchRounds({ investor: invName.substring(0, 5) });
    expect(res.data.length).toBeGreaterThan(0);
  });

  it("startup filter returns matching rounds", async () => {
    if (!firstResponse.data[0]?.startupName) return;
    const searchTerm = firstResponse.data[0].startupName.substring(0, 4);
    const res = await fetchRounds({ startup: searchTerm });
    expect(res.data.length).toBeGreaterThan(0);
    for (const fr of res.data) {
      expect(fr.startupName!.toLowerCase()).toContain(searchTerm.toLowerCase());
    }
  });

  // ── Distinct from investments endpoint ──────────────────────────────

  it("does NOT have fundExternalId (that's investments)", () => {
    for (const fr of firstResponse.data) {
      expect(fr).not.toHaveProperty("fundExternalId");
    }
  });

  it("does NOT have coInvestors (that's investments)", () => {
    for (const fr of firstResponse.data) {
      expect(fr).not.toHaveProperty("coInvestors");
    }
  });

  // ── Post field (round narrative) ────────────────────────────────────

  it("every record has a post field (object or null)", () => {
    for (const fr of firstResponse.data) {
      expect(fr).toHaveProperty("post");
      if (fr.post !== null) {
        expect(typeof fr.post).toBe("object");
        expect(typeof fr.post.content).toBe("string");
        expect(typeof fr.post.publishedAt).toBe("string");
        // ISO 8601 datetime
        expect(fr.post.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }
    }
  });

  it("default scope (posted-only) returns only rounds with non-null post", async () => {
    const res = await fetchRounds({ limit: "20", posted: "true" });
    if (res.data.length === 0) return; // dev env with no posts
    for (const fr of res.data) {
      expect(fr.post).not.toBeNull();
      expect(typeof fr.post!.content).toBe("string");
    }
  });
});
