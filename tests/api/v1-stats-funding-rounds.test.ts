import { describe, it, expect, beforeAll } from "vitest";

const BASE = process.env.TEST_API_URL || "http://localhost:3000";

type StageMixRow = { stage: string | null; roundCount: number; medianUsd: number | null };
type GeoMixRow = { country: string | null; roundCount: number };

type Response = {
  roundCount: number;
  totalCapitalUsd: number;
  medianRoundUsd: number | null;
  p25RoundUsd: number | null;
  p75RoundUsd: number | null;
  amountSampleSize: number;
  stageMix: StageMixRow[];
  geoMix: GeoMixRow[];
  earliestDate: string | null;
  latestDate: string | null;
  computedAt: string;
};

async function fetchStats(params: Record<string, string> = {}): Promise<Response> {
  const url = new URL("/api/v1/stats/funding-rounds", BASE);
  if (!("posted" in params)) url.searchParams.set("posted", "all");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  expect(res.status).toBe(200);
  return res.json();
}

describe("/api/v1/stats/funding-rounds", () => {
  let root: Response;

  beforeAll(async () => {
    root = await fetchStats();
  });

  it("returns aggregate shape without data[]", () => {
    expect(root).toHaveProperty("roundCount");
    expect(root).toHaveProperty("totalCapitalUsd");
    expect(root).toHaveProperty("stageMix");
    expect(root).toHaveProperty("geoMix");
    expect(root).toHaveProperty("computedAt");
    expect(root).not.toHaveProperty("data");
    expect(root).not.toHaveProperty("pagination");
  });

  it("roundCount and totalCapitalUsd are non-negative numbers", () => {
    expect(typeof root.roundCount).toBe("number");
    expect(root.roundCount).toBeGreaterThanOrEqual(0);
    expect(root.totalCapitalUsd).toBeGreaterThanOrEqual(0);
  });

  it("percentiles are ordered p25 ≤ median ≤ p75 when all present", () => {
    if (root.p25RoundUsd !== null && root.medianRoundUsd !== null && root.p75RoundUsd !== null) {
      expect(root.p25RoundUsd).toBeLessThanOrEqual(root.medianRoundUsd);
      expect(root.medianRoundUsd).toBeLessThanOrEqual(root.p75RoundUsd);
    }
  });

  it("stageMix rows have numeric roundCount; sum ≤ roundCount (null stage not in mix)", () => {
    let stageSum = 0;
    for (const row of root.stageMix) {
      expect(typeof row.roundCount).toBe("number");
      expect(row.roundCount).toBeGreaterThan(0);
      stageSum += row.roundCount;
    }
    expect(stageSum).toBeLessThanOrEqual(root.roundCount);
  });

  it("computedAt is a valid ISO timestamp", () => {
    expect(root.computedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(new Date(root.computedAt).toString()).not.toBe("Invalid Date");
  });

  it("stage filter narrows stageMix", async () => {
    if (!root.stageMix.length) return;
    const sample = root.stageMix[0].stage;
    if (!sample) return;
    const filtered = await fetchStats({ stage: sample });
    // Every remaining stage row must be the selected stage (case-insensitive)
    for (const row of filtered.stageMix) {
      if (row.stage !== null) expect(row.stage.toLowerCase()).toBe(sample.toLowerCase());
    }
    expect(filtered.roundCount).toBeLessThanOrEqual(root.roundCount);
  });

  it("date_from/date_to narrow the window", async () => {
    const filtered = await fetchStats({ date_from: "2099-01-01" });
    expect(filtered.roundCount).toBe(0);
  });
});
