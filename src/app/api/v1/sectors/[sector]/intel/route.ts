import { NextRequest, NextResponse } from "next/server";
import driver from "@/lib/neo4j";
import { requireApiKey } from "@/lib/api-auth";
import { EUROPE_CYPHER_LIST } from "@/lib/european-countries";

export const dynamic = "force-dynamic";
export const revalidate = 1800;

const KNOWN_STAGE_ORDER = [
  "Pre-Seed",
  "Seed",
  "Seed Extension",
  "Series A",
  "Series B",
  "Series C",
  "Series D",
  "Series E",
  "Growth",
  "Bridge",
];

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "toNumber" in v) return (v as { toNumber(): number }).toNumber();
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toNumOrNull(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "object" && v !== null && "toNumber" in v) return (v as { toNumber(): number }).toNumber();
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toStr(v: unknown): string | null {
  if (v == null) return null;
  return String(v);
}

function toStrArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v) return [v];
  return [];
}

// Align per-investor role with /v1/funding-rounds: raw "lead" → "LEAD",
// anything else → "FOLLOW". Per-round roles never emit "BOTH" (that only
// appears in investor-level aggregation elsewhere), but downstream checks
// accept it to stay forward-compatible.
function normalizeRole(role: unknown): "LEAD" | "FOLLOW" {
  if (typeof role !== "string") return "FOLLOW";
  return role.toLowerCase() === "lead" ? "LEAD" : "FOLLOW";
}

function ymdUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseYmd(s: string): Date | null {
  // Accepts "YYYY-MM-DD" or ISO datetime; returns UTC midnight of the date portion.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function mondayUtc(d: Date): Date {
  const out = new Date(d);
  const dow = out.getUTCDay(); // 0 Sun .. 6 Sat
  const diff = (dow + 6) % 7;
  out.setUTCDate(out.getUTCDate() - diff);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

function firstOfMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function weekLabel(d: Date): string {
  return `${d.getUTCDate()} ${MONTH_SHORT[d.getUTCMonth()]}`;
}

function monthLabel(d: Date): string {
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${MONTH_SHORT[d.getUTCMonth()]} ${yy}`;
}

function buildBuckets(windowDays: number, granularity: "week" | "month") {
  const now = new Date();
  const buckets: { key: string; label: string; start: Date; end: Date }[] = [];
  if (granularity === "week") {
    const currentMonday = mondayUtc(now);
    for (let i = 12; i >= 0; i--) {
      const start = new Date(currentMonday);
      start.setUTCDate(start.getUTCDate() - i * 7);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 7);
      buckets.push({ key: ymdUtc(start), label: weekLabel(start), start, end });
    }
  } else {
    const count = Math.min(Math.max(Math.round(windowDays / 30), 1), 24);
    const currentMonthStart = firstOfMonthUtc(now);
    for (let i = count - 1; i >= 0; i--) {
      const start = new Date(Date.UTC(currentMonthStart.getUTCFullYear(), currentMonthStart.getUTCMonth() - i, 1));
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
      buckets.push({ key: ymdUtc(start), label: monthLabel(start), start, end });
    }
  }
  return buckets;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stageSortIndex(stage: string | null | undefined): [number, string] {
  if (!stage) return [KNOWN_STAGE_ORDER.length, "￿"];
  const idx = KNOWN_STAGE_ORDER.findIndex((s) => s.toLowerCase() === stage.toLowerCase());
  if (idx >= 0) return [idx, ""];
  return [KNOWN_STAGE_ORDER.length, stage.toLowerCase()];
}

type InvestorRaw = {
  uuid: string | null;
  name: string | null;
  role: string | null;
  logoUrl: string | null;
  hqCity: string | null;
  hqCountry: string | null;
};

type RoundRaw = {
  roundId: string | null;
  amountUsd: number | null;
  stage: string | null;
  date: string | null;
  startupId: string | null;
  startupName: string | null;
  sector: string[];
  hq: string | null;
  investors: InvestorRaw[];
};

function emptyResponse(sectorInput: string, subsector: string | null, windowDays: number, granularity: "week" | "month") {
  const buckets = buildBuckets(windowDays, granularity).map((b) => ({
    key: b.key,
    label: b.label,
    amountUsd: 0,
    roundCount: 0,
  }));
  return {
    sector: sectorInput,
    subsector,
    windowDays,
    poolStartups: 0,
    totals: { capitalUsd: 0, roundCount: 0, medianRoundUsd: null as number | null, activeInvestorCount: 0 },
    timeline: { granularity, buckets },
    stageMix: [] as unknown[],
    topInvestors: [] as unknown[],
    subsectors: [] as unknown[],
    rounds: [] as unknown[],
    biggestRounds: [] as unknown[],
  };
}

export async function GET(
  request: NextRequest,
  { params: routeParams }: { params: Promise<{ sector: string }> },
) {
  const authError = await requireApiKey(request, "data-provider", { allowPublic: true });
  if (authError) return authError;

  const { sector: sectorParam } = await routeParams;
  const sectorInput = decodeURIComponent(sectorParam);

  const { searchParams } = new URL(request.url);
  const windowDaysRaw = parseInt(searchParams.get("window_days") || "90", 10);
  const windowDays = Number.isFinite(windowDaysRaw) && windowDaysRaw > 0
    ? Math.min(windowDaysRaw, 365 * 5)
    : 90;
  const subsectorParam = searchParams.get("subsector");
  const subsector = subsectorParam && subsectorParam.trim() ? subsectorParam.trim() : null;

  const granularityParam = searchParams.get("timeline_granularity");
  const granularity: "week" | "month" = granularityParam === "week" || granularityParam === "month"
    ? granularityParam
    : (windowDays <= 120 ? "week" : "month");

  const country = searchParams.get("country");

  // When set, `rounds[]` returns every round in the window (matching
  // totals.roundCount) instead of the recent-50 cap. `biggestRounds` is
  // unaffected and continues to be computed from the recent-50 sample.
  const fullRoundsParam = searchParams.get("full_rounds");
  const fullRounds = fullRoundsParam === "1" || fullRoundsParam === "true";

  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const sinceYmd = ymdUtc(since);

  const queryParams: Record<string, unknown> = { sectorName: sectorInput, sinceYmd };

  let countryClause = "";
  if (country && country.toLowerCase() !== "all") {
    countryClause = "AND c.country = $country";
    queryParams.country = country;
  } else if (!country) {
    countryClause = `AND c.country IN ${EUROPE_CYPHER_LIST}`;
  }

  if (subsector) {
    queryParams.subsectorName = subsector;
  }

  // c.sector is stored as a scalar string and c.subsector as a separate scalar.
  // Normalize into an array (same shape /v1/startups exposes) before matching.
  const normalizeSectorArr = `
    WITH c,
         CASE WHEN c.sector IS NULL THEN [] ELSE [] + c.sector END AS _baseSector
    WITH c, _baseSector +
         CASE WHEN c.subsector IS NOT NULL AND NOT c.subsector IN _baseSector
              THEN [c.subsector] ELSE [] END AS sectorArr
  `;
  // Variant that preserves `fr` through the WITH chain (for the rounds query).
  const normalizeSectorArrWithFr = `
    WITH c, fr,
         CASE WHEN c.sector IS NULL THEN [] ELSE [] + c.sector END AS _baseSector
    WITH c, fr, _baseSector +
         CASE WHEN c.subsector IS NOT NULL AND NOT c.subsector IN _baseSector
              THEN [c.subsector] ELSE [] END AS sectorArr
  `;

  const subsectorRoundsFilter = subsector
    ? "AND ANY(s IN sectorArr WHERE toLower(s) = toLower($subsectorName))"
    : "";

  // One session per concurrent query — a single Neo4j session serializes
  // transactions, so Promise.all on one session throws 50N42.
  const runRead = async (cypher: string) => {
    const s = driver().session({ defaultAccessMode: "READ" });
    try {
      return await s.run(cypher, queryParams);
    } finally {
      await s.close();
    }
  };

  // Effective date matches /v1/funding-rounds: COALESCE(announcedDate,
  // min SOURCED_FROM article publishedAt). announcedDate alone is ~15%
  // coverage; the article fallback brings us to ~99%.
  const recentRoundsSubquery = `
    CALL {
      WITH c
      OPTIONAL MATCH (c)-[:RAISED]->(fr:FundingRound)
      OPTIONAL MATCH (fr)-[:SOURCED_FROM]->(a:Article)
      WITH fr, COALESCE(fr.announcedDate, min(a.publishedAt)) AS effDate
      WITH fr, effDate
      WHERE fr IS NOT NULL AND effDate IS NOT NULL AND effDate >= $sinceYmd
      RETURN count(fr) AS rrc, sum(COALESCE(fr.amountUsd, 0.0)) AS rra
    }
  `;

  try {
    const [poolRes, roundsRes, subsectorsRes] = await Promise.all([
      runRead(`
        MATCH (c:Company)
        WHERE c.sector IS NOT NULL ${countryClause}
        ${normalizeSectorArr}
        WITH c, sectorArr
        WHERE ANY(s IN sectorArr WHERE toLower(s) = toLower($sectorName))
        RETURN count(c) AS poolStartups
      `),
      runRead(`
        MATCH (c:Company)-[:RAISED]->(fr:FundingRound)
        WHERE c.sector IS NOT NULL
          ${countryClause}
        ${normalizeSectorArrWithFr}
        WITH c, fr, sectorArr
        WHERE ANY(s IN sectorArr WHERE toLower(s) = toLower($sectorName))
          ${subsectorRoundsFilter}
        OPTIONAL MATCH (fr)-[:SOURCED_FROM]->(a:Article)
        WITH c, fr, sectorArr,
             COALESCE(fr.announcedDate, min(a.publishedAt)) AS effectiveDate
        WITH c, fr, sectorArr, effectiveDate
        WHERE effectiveDate IS NOT NULL AND effectiveDate >= $sinceYmd
        OPTIONAL MATCH (c)-[:HQ_IN]->(loc:Location)
        WITH fr, c, sectorArr, effectiveDate, collect(DISTINCT loc.name)[0] AS companyHq
        OPTIONAL MATCH (inv:InvestorOrg)-[rel:PARTICIPATED_IN]->(fr)
        WITH fr, c, sectorArr, effectiveDate, companyHq,
             collect(CASE WHEN inv.name IS NOT NULL THEN {
               uuid: inv.uuid, name: inv.name, role: rel.role,
               logoUrl: inv.logoUrl, hqCity: inv.hqCity, hqCountry: inv.hqCountry
             } ELSE NULL END) AS rawInvestors
        RETURN fr.uuid AS roundId, fr.amountUsd AS amountUsd, fr.stage AS stage,
               effectiveDate AS announcedDate,
               c.uuid AS startupId, c.name AS startupName,
               sectorArr AS sector,
               COALESCE(companyHq, c.country) AS hq,
               [i IN rawInvestors WHERE i IS NOT NULL] AS investors
        ORDER BY effectiveDate DESC
        LIMIT 1000
      `),
      // Subsector breakdown must NOT be narrowed by ?subsector= (only by the primary).
      runRead(`
        MATCH (c:Company)
        WHERE c.sector IS NOT NULL ${countryClause}
        ${normalizeSectorArr}
        WITH c, sectorArr
        WHERE ANY(s IN sectorArr WHERE toLower(s) = toLower($sectorName))
        UNWIND sectorArr AS sub
        WITH c, sub
        WHERE toLower(sub) <> toLower($sectorName)
        ${recentRoundsSubquery}
        RETURN sub AS label,
               count(DISTINCT c) AS startupCount,
               sum(rrc) AS roundCount,
               sum(rra) AS amountUsd
        ORDER BY roundCount DESC, startupCount DESC
      `),
    ]);

    const poolStartups = toNum(poolRes.records[0]?.get("poolStartups"));

    // If no matches at all, return empty structured response (not 404).
    if (poolStartups === 0 && roundsRes.records.length === 0) {
      return NextResponse.json(emptyResponse(sectorInput, subsector, windowDays, granularity), {
        headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=300" },
      });
    }

    const rawRounds: RoundRaw[] = roundsRes.records.map((rec) => {
      const rawInvestors = (rec.get("investors") as InvestorRaw[]).map((i) => ({
        uuid: toStr(i.uuid),
        name: toStr(i.name),
        role: normalizeRole(i.role),
        logoUrl: toStr(i.logoUrl),
        hqCity: toStr(i.hqCity),
        hqCountry: toStr(i.hqCountry),
      }));
      return {
        roundId: toStr(rec.get("roundId")),
        amountUsd: toNumOrNull(rec.get("amountUsd")),
        stage: toStr(rec.get("stage")),
        date: toStr(rec.get("announcedDate")),
        startupId: toStr(rec.get("startupId")),
        startupName: toStr(rec.get("startupName")),
        sector: toStrArr(rec.get("sector")),
        hq: toStr(rec.get("hq")),
        investors: rawInvestors,
      };
    });

    // ── totals ────────────────────────────────────────────────────────
    let capitalUsd = 0;
    const amounts: number[] = [];
    const investorIdentity = new Set<string>();
    for (const r of rawRounds) {
      if (r.amountUsd != null) {
        capitalUsd += r.amountUsd;
        amounts.push(r.amountUsd);
      }
      for (const inv of r.investors) {
        const key = inv.uuid || inv.name;
        if (key) investorIdentity.add(key);
      }
    }

    // ── timeline ──────────────────────────────────────────────────────
    const buckets = buildBuckets(windowDays, granularity);
    const bucketAgg = buckets.map((b) => ({ ...b, amountUsd: 0, roundCount: 0 }));
    for (const r of rawRounds) {
      if (!r.date) continue;
      const d = parseYmd(r.date);
      if (!d) continue;
      for (const b of bucketAgg) {
        if (d >= b.start && d < b.end) {
          b.roundCount += 1;
          if (r.amountUsd != null) b.amountUsd += r.amountUsd;
          break;
        }
      }
    }

    // ── stageMix ──────────────────────────────────────────────────────
    const stageMap = new Map<string, { stage: string; roundCount: number; amountUsd: number }>();
    for (const r of rawRounds) {
      const stage = r.stage || "Unknown";
      const entry = stageMap.get(stage) || { stage, roundCount: 0, amountUsd: 0 };
      entry.roundCount += 1;
      if (r.amountUsd != null) entry.amountUsd += r.amountUsd;
      stageMap.set(stage, entry);
    }
    const stageMix = Array.from(stageMap.values())
      .map((s) => ({
        stage: s.stage,
        roundCount: s.roundCount,
        amountUsd: s.amountUsd,
        amountPct: capitalUsd > 0 ? Math.round((s.amountUsd / capitalUsd) * 1000) / 10 : 0,
      }))
      .sort((a, b) => {
        const [ai, an] = stageSortIndex(a.stage);
        const [bi, bn] = stageSortIndex(b.stage);
        if (ai !== bi) return ai - bi;
        return an.localeCompare(bn);
      });

    // ── topInvestors ──────────────────────────────────────────────────
    type InvAgg = {
      externalId: string | null;
      name: string;
      logoUrl: string | null;
      hq: string | null;
      stages: Set<string>;
      dealCount: number;
      leadCount: number;
    };
    const invMap = new Map<string, InvAgg>();
    for (const r of rawRounds) {
      const seenInRound = new Set<string>();
      for (const inv of r.investors) {
        if (!inv.name) continue;
        const key = inv.uuid || inv.name;
        if (seenInRound.has(key)) continue;
        seenInRound.add(key);
        const city = inv.hqCity;
        const country = inv.hqCountry;
        const hq = city && country ? `${city}, ${country}` : city || country;
        const entry = invMap.get(key) || {
          externalId: inv.uuid,
          name: inv.name,
          logoUrl: inv.logoUrl,
          hq,
          stages: new Set<string>(),
          dealCount: 0,
          leadCount: 0,
        };
        entry.dealCount += 1;
        if (inv.role === "LEAD" || inv.role === "BOTH") entry.leadCount += 1;
        if (r.stage) entry.stages.add(r.stage);
        if (!entry.logoUrl && inv.logoUrl) entry.logoUrl = inv.logoUrl;
        if (!entry.hq && hq) entry.hq = hq;
        invMap.set(key, entry);
      }
    }
    const topInvestors = Array.from(invMap.values())
      .sort((a, b) => b.dealCount - a.dealCount || b.leadCount - a.leadCount || a.name.localeCompare(b.name))
      .slice(0, 10)
      .map((e) => ({
        name: e.name,
        externalId: e.externalId,
        logoUrl: e.logoUrl,
        hq: e.hq,
        stages: Array.from(e.stages).sort((a, b) => {
          const [ai] = stageSortIndex(a);
          const [bi] = stageSortIndex(b);
          return ai - bi;
        }),
        dealCount: e.dealCount,
        leadCount: e.leadCount,
      }));

    // ── rounds (sorted by date desc) ──────────────────────────────────
    // Default: cap at 50 (back-compat). With ?full_rounds=1: return every
    // round in the window so `rounds.length === totals.roundCount` and
    // consumers can apply their own client-side stage/etc. filters.
    const allRounds = rawRounds.map((r) => {
      const leadInv = r.investors.find((i) => i.role === "LEAD" || i.role === "BOTH");
      const participants = r.investors.filter((i) => i.role !== "LEAD" && i.role !== "BOTH");
      return {
        roundId: r.roundId,
        startupId: r.startupId,
        startupName: r.startupName,
        hq: r.hq,
        stage: r.stage,
        amountUsd: r.amountUsd,
        date: r.date ? r.date.slice(0, 10) : null,
        sector: r.sector,
        lead: leadInv?.name ?? null,
        leadId: leadInv?.uuid ?? null,
        participants: participants.map((p) => p.name).filter((n): n is string => !!n),
        participantIds: participants.map((p) => p.uuid).filter((id): id is string => !!id),
      };
    });
    const rounds = fullRounds ? allRounds : allRounds.slice(0, 50);

    // ── biggestRounds (top 5 by amountUsd desc, nulls excluded) ───────
    // Always computed from the recent-50 sample to keep byte-for-byte
    // identical output regardless of full_rounds.
    const biggestRounds = allRounds.slice(0, 50)
      .filter((r) => r.amountUsd != null)
      .sort((a, b) => (b.amountUsd! - a.amountUsd!))
      .slice(0, 5);

    // ── subsectors (sector-wide, never narrowed by subsector filter) ──
    const subsectors = subsectorsRes.records.map((rec) => ({
      label: toStr(rec.get("label")) || "",
      startupCount: toNum(rec.get("startupCount")),
      roundCount: toNum(rec.get("roundCount")),
      amountUsd: toNum(rec.get("amountUsd")),
    })).filter((s) => s.label);

    return NextResponse.json(
      {
        sector: sectorInput,
        subsector,
        windowDays,
        poolStartups,
        totals: {
          capitalUsd,
          roundCount: rawRounds.length,
          medianRoundUsd: median(amounts),
          activeInvestorCount: investorIdentity.size,
        },
        timeline: {
          granularity,
          buckets: bucketAgg.map((b) => ({
            key: b.key,
            label: b.label,
            amountUsd: b.amountUsd,
            roundCount: b.roundCount,
          })),
        },
        stageMix,
        topInvestors,
        subsectors,
        rounds,
        biggestRounds,
      },
      {
        headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=300" },
      },
    );
  } catch (error) {
    console.error("v1/sectors/[sector]/intel error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
