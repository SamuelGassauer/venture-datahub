import { describe, it, expect, beforeAll } from "vitest";

const BASE = process.env.TEST_API_URL || "http://localhost:3000";

type PortfolioCompany = {
  externalId: string | null;
  name: string | null;
  country: string | null;
  sector: string[];
  dealCount: number;
  leadCount: number;
  latestStage: string | null;
  latestAmountUsd: number | null;
  latestDate: string | null;
};

type InvestorRecord = {
  externalId: string | null;
  name: string | null;
  logoUrl: string | null;
  type: string | null;
  website: string | null;
  linkedinUrl: string | null;
  description: string | null;
  hq: string | null;
  hqCity: string | null;
  hqCountry: string | null;
  foundedAt: string | null;
  aumUsdMillions: number | null;
  checkSizeMinUsd: number | null;
  checkSizeMaxUsd: number | null;
  stageFocus: string[];
  geoFocus: string[];
  dealCount: number;
  leadCount: number;
  totalDeployedUsd: number | null;
  minRoundUsd: number | null;
  maxRoundUsd: number | null;
  roundRole: string;
  stages: string[];
  sectorFocus: string[];
  latestInvestmentDate: string | null;
  portfolioCompanies: PortfolioCompany[];
  enrichedAt: string | null;
  updatedAt: string;
};

type ApiResponse = {
  data: InvestorRecord[];
  pagination: { cursor: string | null; hasMore: boolean; totalCount: number; totalCountApproximate: boolean };
};

async function fetchInvestors(params: Record<string, string> = {}): Promise<ApiResponse> {
  const url = new URL("/api/v1/investors", BASE);
  // These shape tests need the full dataset; the posted-only default is
  // covered in v1-posted-filter.test.ts.
  if (!("posted" in params)) url.searchParams.set("posted", "all");
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

  it("returns { data, pagination } envelope with totalCount", () => {
    expect(firstResponse).toHaveProperty("data");
    expect(firstResponse).toHaveProperty("pagination");
    expect(Array.isArray(firstResponse.data)).toBe(true);
    expect(firstResponse.pagination).toHaveProperty("hasMore");
    expect(firstResponse.pagination).toHaveProperty("cursor");
    expect(typeof firstResponse.pagination.totalCount).toBe("number");
    expect(typeof firstResponse.pagination.totalCountApproximate).toBe("boolean");
    expect(firstResponse.pagination.totalCount).toBeGreaterThanOrEqual(firstResponse.data.length);
  });

  it("accepts limit up to 250", async () => {
    const res = await fetchInvestors({ limit: "250" });
    expect(res.data.length).toBeLessThanOrEqual(250);
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

  it("hq is exposed as combined string plus separate city/country fields", () => {
    for (const inv of firstResponse.data) {
      if (inv.hq) expect(typeof inv.hq).toBe("string");
      // hqCity / hqCountry MUST be present (may be null)
      expect(inv).toHaveProperty("hqCity");
      expect(inv).toHaveProperty("hqCountry");
      if (inv.hqCity !== null) expect(typeof inv.hqCity).toBe("string");
      if (inv.hqCountry !== null) expect(typeof inv.hqCountry).toBe("string");
    }
  });

  it("monetary fields are numbers or null", () => {
    for (const inv of firstResponse.data) {
      if (inv.aumUsdMillions !== null) expect(typeof inv.aumUsdMillions).toBe("number");
      if (inv.minRoundUsd !== null) expect(typeof inv.minRoundUsd).toBe("number");
      if (inv.maxRoundUsd !== null) expect(typeof inv.maxRoundUsd).toBe("number");
      if (inv.checkSizeMinUsd !== null) expect(typeof inv.checkSizeMinUsd).toBe("number");
      if (inv.checkSizeMaxUsd !== null) expect(typeof inv.checkSizeMaxUsd).toBe("number");
      if (inv.totalDeployedUsd !== null) expect(typeof inv.totalDeployedUsd).toBe("number");
    }
  });

  it("leadCount never exceeds dealCount", () => {
    for (const inv of firstResponse.data) {
      expect(typeof inv.leadCount).toBe("number");
      expect(inv.leadCount).toBeLessThanOrEqual(inv.dealCount);
    }
  });

  it("stageFocus / geoFocus are arrays of strings", () => {
    for (const inv of firstResponse.data) {
      expect(Array.isArray(inv.stageFocus)).toBe(true);
      expect(Array.isArray(inv.geoFocus)).toBe(true);
      for (const s of inv.stageFocus) expect(typeof s).toBe("string");
      for (const g of inv.geoFocus) expect(typeof g).toBe("string");
    }
  });

  it("portfolioCompanies is an array with valid shape", () => {
    for (const inv of firstResponse.data) {
      expect(Array.isArray(inv.portfolioCompanies)).toBe(true);
      for (const pc of inv.portfolioCompanies) {
        expect(typeof pc.dealCount).toBe("number");
        expect(typeof pc.leadCount).toBe("number");
        expect(pc.leadCount).toBeLessThanOrEqual(pc.dealCount);
        expect(Array.isArray(pc.sector)).toBe(true);
      }
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

  // ── New sorts: deployed / leads ─────────────────────────────────────

  it("sort=deployed&dir=desc orders by totalDeployedUsd descending", async () => {
    const res = await fetchInvestors({ sort: "deployed", dir: "desc", limit: "10" });
    const values = res.data
      .map((d) => d.totalDeployedUsd)
      .filter((v): v is number => typeof v === "number");
    for (let i = 1; i < values.length; i++) {
      expect(values[i] <= values[i - 1]).toBe(true);
    }
  });

  it("sort=leads&dir=desc orders by leadCount descending", async () => {
    const res = await fetchInvestors({ sort: "leads", dir: "desc", limit: "10" });
    const values = res.data.map((d) => d.leadCount);
    for (let i = 1; i < values.length; i++) {
      expect(values[i] <= values[i - 1]).toBe(true);
    }
  });

  // ── type filter ─────────────────────────────────────────────────────

  it("type filter restricts results to that investor type", async () => {
    const pool = await fetchInvestors({ limit: "50" });
    const sample = pool.data.map((d) => d.type).find((t): t is string => typeof t === "string" && t.length > 0);
    if (!sample) return;
    const res = await fetchInvestors({ type: sample });
    expect(res.data.length).toBeGreaterThan(0);
    for (const inv of res.data) {
      if (inv.type !== null) {
        expect(inv.type.toLowerCase()).toBe(sample.toLowerCase());
      }
    }
  });
});
