import { describe, it, expect, beforeAll } from "vitest";

const BASE = process.env.TEST_API_URL || "http://localhost:3000";

type CatalogSubEntry = { label: string; startupCount: number; recentRoundCount: number };
type CatalogEntry = {
  primary: string;
  startupCount: number;
  recentRoundCount: number;
  recentAmountUsd: number;
  subsectors: CatalogSubEntry[];
};
type CatalogResponse = {
  entries: CatalogEntry[];
  totalStartups: number;
  windowDays: number;
  generatedAt: string;
};

type IntelRound = {
  roundId: string | null;
  startupId: string | null;
  startupName: string | null;
  hq: string | null;
  stage: string | null;
  amountUsd: number | null;
  date: string | null;
  sector: string[];
  lead: string | null;
  leadId: string | null;
  participants: string[];
  participantIds: string[];
};

type IntelResponse = {
  sector: string;
  subsector: string | null;
  windowDays: number;
  poolStartups: number;
  totals: {
    capitalUsd: number;
    roundCount: number;
    medianRoundUsd: number | null;
    activeInvestorCount: number;
  };
  timeline: {
    granularity: "week" | "month";
    buckets: { key: string; label: string; amountUsd: number; roundCount: number }[];
  };
  stageMix: { stage: string; roundCount: number; amountUsd: number; amountPct: number }[];
  topInvestors: {
    name: string;
    externalId: string | null;
    logoUrl: string | null;
    hq: string | null;
    stages: string[];
    dealCount: number;
    leadCount: number;
  }[];
  subsectors: { label: string; startupCount: number; roundCount: number; amountUsd: number }[];
  rounds: IntelRound[];
  biggestRounds: IntelRound[];
};

async function fetchCatalog(params: Record<string, string> = {}): Promise<CatalogResponse> {
  const url = new URL("/api/v1/sectors/catalog", BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  expect(res.status).toBe(200);
  return res.json();
}

async function fetchIntel(sector: string, params: Record<string, string> = {}): Promise<IntelResponse> {
  const url = new URL(`/api/v1/sectors/${encodeURIComponent(sector)}/intel`, BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  expect(res.status).toBe(200);
  return res.json();
}

describe("/api/v1/sectors/catalog", () => {
  let catalog: CatalogResponse;

  beforeAll(async () => {
    catalog = await fetchCatalog();
  });

  it("returns the expected envelope", () => {
    expect(catalog).toHaveProperty("entries");
    expect(catalog).toHaveProperty("totalStartups");
    expect(catalog).toHaveProperty("windowDays");
    expect(catalog).toHaveProperty("generatedAt");
    expect(Array.isArray(catalog.entries)).toBe(true);
    expect(typeof catalog.totalStartups).toBe("number");
    expect(typeof catalog.windowDays).toBe("number");
  });

  it("defaults windowDays to 90", () => {
    expect(catalog.windowDays).toBe(90);
  });

  it("entries are sorted by recentRoundCount desc, then startupCount desc", () => {
    for (let i = 1; i < catalog.entries.length; i++) {
      const prev = catalog.entries[i - 1];
      const curr = catalog.entries[i];
      const primaryOk = prev.recentRoundCount > curr.recentRoundCount
        || (prev.recentRoundCount === curr.recentRoundCount && prev.startupCount >= curr.startupCount);
      expect(primaryOk).toBe(true);
    }
  });

  it("every entry has a non-empty primary and numeric counts", () => {
    for (const e of catalog.entries) {
      expect(e.primary).toBeTruthy();
      expect(typeof e.startupCount).toBe("number");
      expect(typeof e.recentRoundCount).toBe("number");
      expect(typeof e.recentAmountUsd).toBe("number");
      expect(Array.isArray(e.subsectors)).toBe(true);
      for (const s of e.subsectors) {
        expect(s.label).toBeTruthy();
        expect(typeof s.startupCount).toBe("number");
        expect(typeof s.recentRoundCount).toBe("number");
      }
    }
  });

  it("subsectors are sorted by recentRoundCount desc, then startupCount desc", () => {
    for (const e of catalog.entries) {
      for (let i = 1; i < e.subsectors.length; i++) {
        const prev = e.subsectors[i - 1];
        const curr = e.subsectors[i];
        const ok = prev.recentRoundCount > curr.recentRoundCount
          || (prev.recentRoundCount === curr.recentRoundCount && prev.startupCount >= curr.startupCount);
        expect(ok).toBe(true);
      }
    }
  });

  it("respects the window_days param", async () => {
    const res = await fetchCatalog({ window_days: "30" });
    expect(res.windowDays).toBe(30);
  });
});

describe("/api/v1/sectors/:sector/intel", () => {
  let sampleSector: string | null = null;

  beforeAll(async () => {
    const catalog = await fetchCatalog();
    sampleSector = catalog.entries.find((e) => e.recentRoundCount > 0)?.primary
      ?? catalog.entries[0]?.primary
      ?? null;
  });

  it("returns the full envelope", async () => {
    if (!sampleSector) return;
    const res = await fetchIntel(sampleSector);
    expect(res.sector).toBe(sampleSector);
    expect(res.subsector).toBeNull();
    expect(res.windowDays).toBe(90);
    expect(typeof res.poolStartups).toBe("number");
    expect(res.totals).toMatchObject({ capitalUsd: expect.any(Number), roundCount: expect.any(Number), activeInvestorCount: expect.any(Number) });
    expect(["week", "month"]).toContain(res.timeline.granularity);
    expect(Array.isArray(res.timeline.buckets)).toBe(true);
    expect(Array.isArray(res.stageMix)).toBe(true);
    expect(Array.isArray(res.topInvestors)).toBe(true);
    expect(Array.isArray(res.subsectors)).toBe(true);
    expect(Array.isArray(res.rounds)).toBe(true);
    expect(Array.isArray(res.biggestRounds)).toBe(true);
  });

  it("timeline uses week buckets when window_days <= 120", async () => {
    if (!sampleSector) return;
    const res = await fetchIntel(sampleSector, { window_days: "90" });
    expect(res.timeline.granularity).toBe("week");
    expect(res.timeline.buckets.length).toBe(13);
  });

  it("explicit month granularity is honored", async () => {
    if (!sampleSector) return;
    const res = await fetchIntel(sampleSector, { window_days: "90", timeline_granularity: "month" });
    expect(res.timeline.granularity).toBe("month");
  });

  it("rounds are sorted by date descending and capped at 50", async () => {
    if (!sampleSector) return;
    const res = await fetchIntel(sampleSector);
    expect(res.rounds.length).toBeLessThanOrEqual(50);
    for (let i = 1; i < res.rounds.length; i++) {
      const prev = res.rounds[i - 1].date;
      const curr = res.rounds[i].date;
      if (prev && curr) expect(prev >= curr).toBe(true);
    }
  });

  it("biggestRounds are the top <=5 amounts, nulls excluded", async () => {
    if (!sampleSector) return;
    const res = await fetchIntel(sampleSector);
    expect(res.biggestRounds.length).toBeLessThanOrEqual(5);
    for (const r of res.biggestRounds) expect(r.amountUsd).not.toBeNull();
    for (let i = 1; i < res.biggestRounds.length; i++) {
      expect((res.biggestRounds[i - 1].amountUsd ?? 0) >= (res.biggestRounds[i].amountUsd ?? 0)).toBe(true);
    }
  });

  it("nonexistent sector returns 200 with a structured empty response", async () => {
    const res = await fetchIntel("DefinitelyNotReal_XYZ_123");
    expect(res.sector).toBe("DefinitelyNotReal_XYZ_123");
    expect(res.poolStartups).toBe(0);
    expect(res.totals.capitalUsd).toBe(0);
    expect(res.totals.roundCount).toBe(0);
    expect(res.totals.activeInvestorCount).toBe(0);
    expect(res.totals.medianRoundUsd).toBeNull();
    expect(res.rounds.length).toBe(0);
    expect(res.biggestRounds.length).toBe(0);
    expect(res.topInvestors.length).toBe(0);
    expect(res.stageMix.length).toBe(0);
    expect(res.subsectors.length).toBe(0);
    expect(res.timeline.buckets.length).toBeGreaterThan(0);
    for (const b of res.timeline.buckets) {
      expect(b.amountUsd).toBe(0);
      expect(b.roundCount).toBe(0);
    }
  });

  it("?subsector= narrows rounds but not the subsectors breakdown", async () => {
    if (!sampleSector) return;
    const base = await fetchIntel(sampleSector);
    const firstSubsector = base.subsectors[0]?.label;
    if (!firstSubsector) return;
    const narrowed = await fetchIntel(sampleSector, { subsector: firstSubsector });
    expect(narrowed.subsector).toBe(firstSubsector);
    // rounds must all contain both primary and subsector in sector[]
    for (const r of narrowed.rounds) {
      const lowered = r.sector.map((s) => s.toLowerCase());
      expect(lowered).toContain(sampleSector.toLowerCase());
      expect(lowered).toContain(firstSubsector.toLowerCase());
    }
    // subsectors breakdown must be identical (not narrowed)
    expect(narrowed.subsectors.length).toBe(base.subsectors.length);
  });

  it("case-insensitive sector match", async () => {
    if (!sampleSector) return;
    const lower = await fetchIntel(sampleSector.toLowerCase());
    const upper = await fetchIntel(sampleSector.toUpperCase());
    expect(lower.poolStartups).toBe(upper.poolStartups);
  });
});
