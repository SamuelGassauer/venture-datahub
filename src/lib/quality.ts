/**
 * Data quality scoring for FundingRounds, Companies, and Investors.
 *
 * Scores are normalized to 0–100 across all entity types, so a single
 * "Quality < 50" filter has consistent meaning everywhere. Each entity
 * has its own breakdown — see *Breakdown types.
 *
 * All scores are computed lazily on read. No persistence, no migration.
 */

export type Tier = "good" | "ok" | "poor";

export function tierOf(score: number): Tier {
  if (score >= 75) return "good";
  if (score >= 50) return "ok";
  return "poor";
}

const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 6;

function recencyScore(timestamp: number | null, maxPoints: number): number {
  if (timestamp == null) return 0;
  const age = Date.now() - timestamp;
  if (age <= 0) return maxPoints;
  if (age >= SIX_MONTHS_MS) return 0;
  return Math.round(maxPoints * (1 - age / SIX_MONTHS_MS));
}

// ── Round ─────────────────────────────────────────────────────────────────

export type RoundQualityInput = {
  llmConfidence: number | null;     // 0–1
  sourceCount: number;              // 1+
  hasStage: boolean;
  hasLead: boolean;
  hasCountry: boolean;
  investorCount: number;
  effectiveDateMs: number | null;
};

export type RoundBreakdown = {
  llmConfidence: number;     // 0–40
  multiSource: number;       // 0–20
  completeness: number;      // 0–20
  recency: number;           // 0–20
};

export function scoreRound(
  i: RoundQualityInput
): { score: number; breakdown: RoundBreakdown } {
  const llmConfidence = Math.round(40 * Math.max(0, Math.min(1, i.llmConfidence ?? 0)));
  const multiSource = Math.round(20 * Math.min(i.sourceCount, 3) / 3);
  const completenessParts =
    (i.hasStage ? 1 : 0) +
    (i.hasLead ? 1 : 0) +
    (i.hasCountry ? 1 : 0) +
    (i.investorCount > 0 ? 1 : 0);
  const completeness = Math.round((completenessParts / 4) * 20);
  const recency = recencyScore(i.effectiveDateMs, 20);
  const score = llmConfidence + multiSource + completeness + recency;
  return {
    score: Math.max(0, Math.min(100, score)),
    breakdown: { llmConfidence, multiSource, completeness, recency },
  };
}

// ── Company ───────────────────────────────────────────────────────────────

export const COMPANY_ENRICH_FIELDS = [
  "description",
  "website",
  "foundedYear",
  "employeeRange",
  "linkedinUrl",
  "country",
  "status",
  "location",
  "logoUrl",
] as const;

export type CompanyQualityInput = {
  enrichScore: number;       // 0–9 (existing tally from companies/route.ts)
  hasFundingHistory: boolean;
  enrichedAtMs: number | null;
  duplicated: boolean;       // confirmed merge target?
};

export type CompanyBreakdown = {
  enrichment: number;        // 0–55
  fundingHistory: number;    // 0–20
  uniqueness: number;        // 0–15
  recency: number;           // 0–10
};

export function scoreCompany(
  i: CompanyQualityInput
): { score: number; breakdown: CompanyBreakdown } {
  const enrichment = Math.round((Math.max(0, Math.min(9, i.enrichScore)) / 9) * 55);
  const fundingHistory = i.hasFundingHistory ? 20 : 0;
  const uniqueness = i.duplicated ? 0 : 15;
  const recency = recencyScore(i.enrichedAtMs, 10);
  const score = enrichment + fundingHistory + uniqueness + recency;
  return {
    score: Math.max(0, Math.min(100, score)),
    breakdown: { enrichment, fundingHistory, uniqueness, recency },
  };
}

// ── Investor ──────────────────────────────────────────────────────────────

export const INVESTOR_ENRICH_FIELDS = [
  "type",
  "website",
  "linkedinUrl",
  "foundedYear",
  "logoUrl",
  "aum",
  "hqCity",
  "hqCountry",
  "stageFocus",
  "sectorFocus",
  "geoFocus",
  "checkSizeMinUsd",
  "checkSizeMaxUsd",
] as const;

export type InvestorQualityInput = {
  enrichScore: number;       // 0–13
  dealCount: number;
  stageFocusFilled: boolean;
  sectorFocusFilled: boolean;
  geoFocusFilled: boolean;
  enrichedAtMs: number | null;
  duplicated: boolean;
};

export type InvestorBreakdown = {
  enrichment: number;        // 0–55
  dealActivity: number;      // 0–25
  focusClarity: number;      // 0–15
  uniqueness: number;        // 0–5
};

export function scoreInvestor(
  i: InvestorQualityInput
): { score: number; breakdown: InvestorBreakdown } {
  const enrichment = Math.round((Math.max(0, Math.min(13, i.enrichScore)) / 13) * 55);
  const dealActivity = i.dealCount >= 5 ? 25 : i.dealCount >= 2 ? 15 : i.dealCount >= 1 ? 5 : 0;
  const focusFilledCount =
    (i.stageFocusFilled ? 1 : 0) +
    (i.sectorFocusFilled ? 1 : 0) +
    (i.geoFocusFilled ? 1 : 0);
  const focusClarity = Math.round((focusFilledCount / 3) * 15);
  const uniqueness = i.duplicated ? 0 : 5;
  const score = enrichment + dealActivity + focusClarity + uniqueness;
  // Note: recency intentionally not used here — stale Investors with high
  // deal activity are still high-quality. enrichedAt drives the "Stale"
  // filter on the page directly, not the aggregate score.
  void recencyScore;
  return {
    score: Math.max(0, Math.min(100, score)),
    breakdown: { enrichment, dealActivity, focusClarity, uniqueness },
  };
}

// ── Helpers shared with API routes ────────────────────────────────────────

export function neoToMs(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  // neo4j DateTime / Date — has toString() returning ISO
  if (typeof v === "object" && v !== null && "toString" in v) {
    const t = Date.parse(String(v));
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

export function neoNumber(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "toNumber" in v) {
    return (v as { toNumber(): number }).toNumber();
  }
  return Number(v) || 0;
}
