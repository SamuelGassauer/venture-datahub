"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Globe,
  MapPin,
  Calendar,
  Users,
  TrendingUp,
  CircleDollarSign,
  Award,
  Briefcase,
  ExternalLink,
  Layers,
  Tag,
  Search,
  Pencil,
  Check,
  X,
  Loader2,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { SmartLogo } from "@/components/ui/smart-logo";

// ---------------------------------------------------------------------------
// Helpers (copied from entity-sheet.tsx to keep self-contained)
// ---------------------------------------------------------------------------

function escapeCypher(s: string): string {
  return s.replace(/'/g, "\\'");
}

function toNumber(v: unknown): unknown {
  return typeof v === "object" && v !== null && "toNumber" in v
    ? (v as { toNumber(): number }).toNumber()
    : v;
}

function asNumber(v: unknown): number {
  const n = toNumber(v);
  return typeof n === "number" && !Number.isNaN(n) ? n : 0;
}

function formatAmount(amount: number | null | undefined): string {
  if (!amount) return "N/A";
  if (amount >= 1e9) return `$${(amount / 1e9).toFixed(1)}B`;
  if (amount >= 1e6) return `$${(amount / 1e6).toFixed(1)}M`;
  if (amount >= 1e3) return `$${(amount / 1e3).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

// Estimated post-money valuation multiples by stage (Carta/PitchBook 2023-2025)
// Multiple = 1 / dilution%. Low multiple = 1 / high dilution, high multiple = 1 / low dilution.
// Pre-Seed: 5-20% dilution → 5-20x | Seed: 10-30% → 3.3-10x | Series A: 15-30% → 3.3-6.7x
// Series B: 10-25% → 4-10x | Series C: 8-20% → 5-12.5x | D+: 5-15% → 6.7-20x | Growth: 3-12% → 8.3-33x
const VALUATION_MULTIPLES: Record<string, { low: number; high: number }> = {
  "pre-seed": { low: 5, high: 20 },
  seed: { low: 3.3, high: 10 },
  "series a": { low: 3.3, high: 6.7 },
  "series b": { low: 4, high: 10 },
  "series c": { low: 5, high: 12.5 },
  "series d": { low: 6.7, high: 20 },
  "series d+": { low: 6.7, high: 20 },
  "series e": { low: 6.7, high: 20 },
  "series e+": { low: 6.7, high: 20 },
  growth: { low: 8.3, high: 33 },
};

function estimateValuation(stage: string | null, amountUsd: number): { low: number; high: number } | null {
  if (!stage || amountUsd <= 0) return null;
  const mult = VALUATION_MULTIPLES[stage.toLowerCase()];
  if (!mult) return null;
  return { low: amountUsd * mult.low, high: amountUsd * mult.high };
}

function formatDate(raw: unknown): string | null {
  if (!raw) return null;
  try {
    const d = new Date(String(raw));
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cypher query builders (duplicated from entity-sheet.tsx)
// ---------------------------------------------------------------------------

function companyQuery(name: string): string {
  const safe = escapeCypher(name);
  return `
MATCH (c:Company {name: '${safe}'})
OPTIONAL MATCH (c)-[:HQ_IN]->(loc:Location)
WITH c, collect(loc.name)[0] AS location

OPTIONAL MATCH (c)-[:RAISED]->(fr:FundingRound)
OPTIONAL MATCH (inv:InvestorOrg)-[p:PARTICIPATED_IN]->(fr)
WITH c, location, fr,
     collect(DISTINCT {name: inv.name, role: p.role, logoUrl: inv.logoUrl, country: inv.country}) AS roundInvestors
OPTIONAL MATCH (fr)-[:SOURCED_FROM]->(a:Article)
WITH c, location, fr, roundInvestors,
     collect(DISTINCT {url: a.url, title: a.title, publishedAt: a.publishedAt}) AS articles
WITH c, location,
     collect(CASE WHEN fr IS NOT NULL THEN {
       stage: fr.stage,
       amount: fr.amountUsd,
       currency: fr.currency,
       originalAmount: fr.amount,
       fxRate: fr.fxRate,
       confidence: fr.confidence,
       date: fr.date,
       announcedDate: fr.announcedDate,
       roundKey: fr.roundKey,
       investors: roundInvestors,
       articles: articles
     } ELSE NULL END) AS allRounds
WITH c, location,
     [r IN allRounds WHERE r IS NOT NULL] AS rounds,
     reduce(s = 0, r IN [r IN allRounds WHERE r IS NOT NULL] | s + COALESCE(r.amount, 0)) AS calcTotal
RETURN c.name AS name,
       c.country AS country,
       COALESCE(c.totalFundingUsd, calcTotal) AS totalFunding,
       location,
       c.status AS status,
       c.description AS description,
       c.website AS website,
       c.foundedYear AS foundedYear,
       c.employeeRange AS employeeRange,
       c.linkedinUrl AS linkedinUrl,
       c.logoUrl AS logoUrl,
       c.sector AS sector,
       c.subsector AS subsector,
       rounds
`;
}

function similarCompaniesQuery(name: string): string {
  const safe = escapeCypher(name);
  return `
MATCH (me:Company {name: '${safe}'})
OPTIONAL MATCH (me)-[:RAISED]->(myRound:FundingRound)
WITH me,
     me.sector AS mySector,
     me.subsector AS mySubsector,
     me.country AS myCountry,
     COALESCE(me.totalFundingUsd, 0) AS myFunding,
     collect(DISTINCT myRound.stage) AS myStages

OPTIONAL MATCH (inv:InvestorOrg)-[:PARTICIPATED_IN]->(:FundingRound)<-[:RAISED]-(me)
WITH me, mySector, mySubsector, myCountry, myFunding, myStages,
     collect(DISTINCT inv.name) AS myInvestors

MATCH (c:Company)
WHERE c.name <> me.name

OPTIONAL MATCH (c)-[:RAISED]->(cr:FundingRound)
WITH me, mySector, mySubsector, myCountry, myFunding, myStages, myInvestors,
     c,
     collect(DISTINCT cr.stage) AS cStages,
     COALESCE(c.totalFundingUsd, 0) AS cFunding

OPTIONAL MATCH (ci:InvestorOrg)-[:PARTICIPATED_IN]->(:FundingRound)<-[:RAISED]-(c)
WITH me, mySector, mySubsector, myCountry, myFunding, myStages, myInvestors,
     c, cStages, cFunding,
     collect(DISTINCT ci.name) AS cInvestors

WITH c, cFunding, cInvestors, cStages,
     mySector, mySubsector, myCountry, myFunding, myStages, myInvestors

WITH c, cFunding, cInvestors,
     CASE WHEN c.subsector IS NOT NULL AND c.subsector = mySubsector THEN 10 ELSE 0 END +
     CASE WHEN c.sector IS NOT NULL AND c.sector = mySector AND (c.subsector IS NULL OR c.subsector <> mySubsector) THEN 3 ELSE 0 END +
     size([i IN cInvestors WHERE i IN myInvestors]) * 3 +
     CASE WHEN c.country IS NOT NULL AND c.country = myCountry THEN 2 ELSE 0 END +
     size([s IN cStages WHERE s IN myStages]) +
     CASE WHEN cFunding > 0 AND myFunding > 0
       AND abs(log(cFunding + 1) - log(myFunding + 1)) < 2.0 THEN 2 ELSE 0 END
     AS score

WHERE score > 0
ORDER BY score DESC
LIMIT 12

RETURN c.name AS name,
       c.logoUrl AS logoUrl,
       c.subsector AS subsector,
       c.sector AS sector,
       c.country AS country,
       cFunding AS totalFunding,
       cInvestors[0..3] AS topInvestors,
       score
`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RoundRow = {
  stage: string | null;
  amount: unknown;
  currency: string | null;
  originalAmount: unknown;
  fxRate: unknown;
  confidence: unknown;
  date: unknown;
  announcedDate: unknown;
  roundKey: string | null;
  investors: { name: string | null; role: string | null; logoUrl: string | null; country: string | null }[];
  articles: {
    url: string | null;
    title: string | null;
    publishedAt: unknown;
  }[];
};

type SimilarCompany = {
  name: string;
  logoUrl: string | null;
  subsector: string | null;
  sector: string | null;
  country: string | null;
  totalFunding: number;
  topInvestors: string[];
  score: number;
};

type DetailData = {
  records: Record<string, unknown>[];
  count: number;
};

// ---------------------------------------------------------------------------
// Attribute card configuration
// ---------------------------------------------------------------------------

type AttrCard = {
  id: string;
  label: string;
  value: string | number | null;
  icon: typeof Building2;
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function CompanyProfilePage() {
  const params = useParams();
  const router = useRouter();
  const companyName = decodeURIComponent((params?.name as string) ?? "");

  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [similar, setSimilar] = useState<SimilarCompany[] | null>(null);
  const [similarLoading, setSimilarLoading] = useState(false);

  // Round editing state
  const [editingRoundKey, setEditingRoundKey] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    announcedDate: string;
    stage: string;
    amountUsd: string;
  }>({ announcedDate: "", stage: "", amountUsd: "" });
  const [editSaving, setEditSaving] = useState(false);

  // Refs for SVG line drawing
  const containerRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const attrRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [lines, setLines] = useState<
    { x1: number; y1: number; x2: number; y2: number; id: string }[]
  >([]);

  // Fetch main company data
  const loadCompany = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/graph-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: companyQuery(companyName) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as DetailData;
      if (json.records?.[0]) {
        setData(json.records[0]);
      } else {
        setError("Company not found.");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load company."
      );
    } finally {
      setLoading(false);
    }
  }, [companyName]);

  useEffect(() => {
    loadCompany();
  }, [loadCompany]);

  // Save round edits
  const saveRoundEdit = useCallback(async (roundKey: string) => {
    setEditSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      if (editForm.announcedDate) payload.announcedDate = editForm.announcedDate;
      else payload.announcedDate = null;
      if (editForm.stage) payload.stage = editForm.stage;
      if (editForm.amountUsd) payload.amountUsd = parseFloat(editForm.amountUsd);

      const res = await fetch(`/api/graph-funding-rounds/${encodeURIComponent(roundKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setEditingRoundKey(null);
      await loadCompany();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setEditSaving(false);
    }
  }, [editForm, loadCompany]);

  // Fetch similar companies lazily after main data loads
  useEffect(() => {
    if (!data) return;
    setSimilarLoading(true);
    fetch("/api/graph-query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: similarCompaniesQuery(companyName) }),
    })
      .then((r) => r.json())
      .then((json: DetailData) => {
        setSimilar(
          (json.records ?? []).map((r: Record<string, unknown>) => ({
            name: String(r.name ?? ""),
            logoUrl: r.logoUrl ? String(r.logoUrl) : null,
            subsector: r.subsector ? String(r.subsector) : null,
            sector: r.sector ? String(r.sector) : null,
            country: r.country ? String(r.country) : null,
            totalFunding: asNumber(r.totalFunding),
            topInvestors: Array.isArray(r.topInvestors)
              ? (r.topInvestors as (string | null)[]).filter(
                  Boolean
                ) as string[]
              : [],
            score: asNumber(r.score),
          }))
        );
      })
      .catch(() => {})
      .finally(() => setSimilarLoading(false));
  }, [data, companyName]);

  // Calculate SVG connection lines
  const computeLines = useCallback(() => {
    if (!containerRef.current || !heroRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const heroRect = heroRef.current.getBoundingClientRect();
    const heroCx = heroRect.left + heroRect.width / 2 - containerRect.left;
    const heroCy = heroRect.top + heroRect.height / 2 - containerRect.top;

    const newLines: typeof lines = [];
    attrRefs.current.forEach((el, id) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2 - containerRect.left;
      const cy = rect.top + rect.height / 2 - containerRect.top;
      newLines.push({ x1: heroCx, y1: heroCy, x2: cx, y2: cy, id });
    });
    setLines(newLines);
  }, []);

  useEffect(() => {
    if (!data || loading) return;
    // Wait for layout to settle
    const timer = setTimeout(computeLines, 100);
    const ro = new ResizeObserver(computeLines);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", computeLines);
    return () => {
      clearTimeout(timer);
      ro.disconnect();
      window.removeEventListener("resize", computeLines);
    };
  }, [data, loading, computeLines]);

  // Extract values from data
  const name = data ? String(data.name ?? "") : "";
  const country = data?.country ? String(data.country) : null;
  const location = data?.location ? String(data.location) : null;
  const totalFunding = data ? asNumber(data.totalFunding) : 0;
  const status = data?.status ? String(data.status) : null;
  const description = data?.description ? String(data.description) : null;
  const website = data?.website ? String(data.website) : null;
  const foundedYear = data?.foundedYear ? asNumber(data.foundedYear) : null;
  const employeeRange = data?.employeeRange
    ? String(data.employeeRange)
    : null;
  const linkedinUrl = data?.linkedinUrl ? String(data.linkedinUrl) : null;
  const logoUrl = data?.logoUrl ? String(data.logoUrl) : null;
  const sector = data?.sector ? String(data.sector) : null;
  const subsector = data?.subsector ? String(data.subsector) : null;

  const rawRounds = (data?.rounds as RoundRow[]) ?? [];

  // Stage order for fallback sorting when dates are missing
  const STAGE_ORDER: Record<string, number> = {
    "pre-seed": 0, seed: 1, "series a": 2, "series b": 3,
    "series c": 4, "series d": 5, "series e": 6, "series e+": 6,
    bridge: 7, growth: 8, debt: 9, grant: 10,
  };

  const rounds = rawRounds
    .filter((r) => r.stage || asNumber(r.amount) > 0)
    .sort((a, b) => {
      // Resolve the best available date for each round
      const dateA = String(a.announcedDate ?? a.date ?? (a.articles ?? [])[0]?.publishedAt ?? "");
      const dateB = String(b.announcedDate ?? b.date ?? (b.articles ?? [])[0]?.publishedAt ?? "");
      if (dateA && dateB) return dateA.localeCompare(dateB);
      if (dateA) return -1;
      if (dateB) return 1;
      // Fallback: sort by stage order
      const stageA = STAGE_ORDER[(a.stage ?? "").toLowerCase()] ?? 99;
      const stageB = STAGE_ORDER[(b.stage ?? "").toLowerCase()] ?? 99;
      return stageA - stageB;
    });
  const roundCount = rounds.length;
  const latestStage = rounds.find((r) => r.stage)?.stage ?? null;

  // Collect unique investors
  const investorMap = new Map<string, string>();
  for (const round of rounds) {
    for (const inv of round.investors ?? []) {
      if (!inv.name) continue;
      const existing = investorMap.get(inv.name);
      if (inv.role === "lead" || !existing) {
        investorMap.set(inv.name, inv.role ?? "participant");
      }
    }
  }

  // Build attribute cards (only non-null)
  const attrCards: AttrCard[] = [
    { id: "sector", label: "Sector", value: sector, icon: Layers },
    { id: "country", label: "Country", value: country, icon: Globe },
    {
      id: "funding",
      label: "Total Funding",
      value: totalFunding ? formatAmount(totalFunding) : null,
      icon: CircleDollarSign,
    },
    { id: "stage", label: "Latest Stage", value: latestStage, icon: TrendingUp },
    {
      id: "founded",
      label: "Founded",
      value: foundedYear,
      icon: Calendar,
    },
    {
      id: "employees",
      label: "Employees",
      value: employeeRange,
      icon: Users,
    },
    {
      id: "location",
      label: "Location",
      value: location,
      icon: MapPin,
    },
    {
      id: "rounds",
      label: "Rounds",
      value: roundCount > 0 ? roundCount : null,
      icon: Award,
    },
    { id: "subsector", label: "Subsector", value: subsector, icon: Tag },
  ].filter((c) => c.value != null);

  // Register attr ref
  const setAttrRef = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (el) attrRefs.current.set(id, el);
      else attrRefs.current.delete(id);
    },
    []
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-6xl space-y-8">
          <Skeleton className="h-8 w-32 rounded-[8px]" />
          <Skeleton className="h-64 w-full rounded-[16px]" />
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-[14px]" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <Building2 className="h-12 w-12 text-foreground/15 mx-auto" />
          <p className="text-foreground/45 text-[13px]">{error}</p>
          <button
            onClick={() => router.push("/app/companies")}
            className="glass-capsule-btn px-4 py-1.5 text-[13px] text-blue-600"
          >
            Back to companies
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Tier 2: Navigation bar */}
      <div className="glass-status-bar px-4 py-2.5 shrink-0 flex items-center justify-between">
        <button
          onClick={() => router.push("/app/companies")}
          className="glass-capsule-btn flex items-center gap-2 px-3 py-1 text-[13px] tracking-[-0.01em] text-foreground/55 hover:text-foreground/85 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to companies
        </button>
        <Link
          href={`/app/companies/${encodeURIComponent(companyName)}/history`}
          className="glass-capsule-btn flex items-center gap-2 px-3 py-1 text-[13px] tracking-[-0.01em] text-foreground/55 hover:text-foreground/85 transition-colors"
        >
          <Search className="h-3.5 w-3.5" />
          Historische Rounds suchen
        </Link>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-6xl space-y-10">
          {/* ================================================================= */}
          {/* Graph Section -- Hero + Attribute Nodes                            */}
          {/* ================================================================= */}
          <div ref={containerRef} className="relative">
            {/* SVG connections (desktop only) */}
            <svg
              className="absolute inset-0 pointer-events-none hidden lg:block"
              width="100%"
              height="100%"
              style={{ zIndex: 0 }}
            >
              {lines.map((l) => (
                <line
                  key={l.id}
                  x1={l.x1}
                  y1={l.y1}
                  x2={l.x2}
                  y2={l.y2}
                  stroke="currentColor"
                  strokeWidth={1}
                  opacity={0.12}
                  strokeDasharray="6 4"
                  style={{
                    animation: "draw-line 0.8s ease forwards",
                    strokeDashoffset: 200,
                    strokeDasharray: "200",
                  }}
                />
              ))}
            </svg>

            {/* Grid layout */}
            <div className="relative z-10 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
              {/* Top-left attribute cards */}
              {attrCards.slice(0, 2).map((card, i) => (
                <div
                  key={card.id}
                  ref={setAttrRef(card.id)}
                  data-node-id={card.id}
                  className="lg-inset rounded-[14px] p-4 flex flex-col items-center gap-2 text-center animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500 hover:animate-[float_3s_ease-in-out_infinite]"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <card.icon className="h-5 w-5 text-foreground/40" />
                  <span className="text-[17px] font-bold tracking-[-0.02em] text-foreground/85">
                    {card.value}
                  </span>
                  <span className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
                    {card.label}
                  </span>
                </div>
              ))}

              {/* HERO card -- center, spans 2 rows on desktop */}
              <div
                ref={heroRef}
                className="liquid-glass rounded-[24px] p-6 sm:p-8 col-span-2 md:col-span-1 lg:row-span-2 flex flex-col items-center text-center gap-4 animate-in fade-in-0 zoom-in-95 duration-500"
              >
                {logoUrl ? (
                  <SmartLogo
                    src={logoUrl}
                    alt={name}
                    className="h-16 w-16 rounded-[14px]"
                    fallback={
                      <div className="h-16 w-16 rounded-[14px] bg-foreground/[0.04] flex items-center justify-center">
                        <Building2 className="h-8 w-8 text-foreground/15" />
                      </div>
                    }
                  />
                ) : (
                  <div className="h-16 w-16 rounded-[14px] bg-foreground/[0.04] flex items-center justify-center">
                    <Building2 className="h-8 w-8 text-foreground/15" />
                  </div>
                )}
                <h1 className="text-2xl font-bold tracking-tight text-foreground/85">{name}</h1>
                {description && (
                  <p className="text-[13px] tracking-[-0.01em] text-foreground/45 leading-relaxed line-clamp-4">
                    {description}
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {status && (
                    <span className="rounded-full bg-foreground/[0.04] px-2.5 py-0.5 text-[10px] font-medium text-foreground/55">
                      {status}
                    </span>
                  )}
                  {sector && (
                    <span className="rounded-full bg-blue-500/8 px-2.5 py-0.5 text-[10px] font-medium text-blue-600">
                      {sector}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[13px]">
                  {website && (
                    <a
                      href={
                        website.startsWith("http") ? website : `https://${website}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-blue-600 hover:text-blue-500"
                    >
                      <Globe className="h-3.5 w-3.5" />
                      <span className="text-[12px]">
                        {website.replace(/^https?:\/\//, "")}
                      </span>
                    </a>
                  )}
                  {linkedinUrl && (
                    <a
                      href={linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-blue-600 hover:text-blue-500"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span className="text-[12px]">LinkedIn</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Top-right attribute cards */}
              {attrCards.slice(2, 4).map((card, i) => (
                <div
                  key={card.id}
                  ref={setAttrRef(card.id)}
                  data-node-id={card.id}
                  className="lg-inset rounded-[14px] p-4 flex flex-col items-center gap-2 text-center animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500 hover:animate-[float_3s_ease-in-out_infinite]"
                  style={{ animationDelay: `${(i + 2) * 80}ms` }}
                >
                  <card.icon className="h-5 w-5 text-foreground/40" />
                  <span className="text-[17px] font-bold tracking-[-0.02em] text-foreground/85">
                    {card.value}
                  </span>
                  <span className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
                    {card.label}
                  </span>
                </div>
              ))}

              {/* Bottom row attribute cards */}
              {attrCards.slice(4).map((card, i) => (
                <div
                  key={card.id}
                  ref={setAttrRef(card.id)}
                  data-node-id={card.id}
                  className="lg-inset rounded-[14px] p-4 flex flex-col items-center gap-2 text-center animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500 hover:animate-[float_3s_ease-in-out_infinite]"
                  style={{ animationDelay: `${(i + 4) * 80}ms` }}
                >
                  <card.icon className="h-5 w-5 text-foreground/40" />
                  <span className="text-[17px] font-bold tracking-[-0.02em] text-foreground/85">
                    {card.value}
                  </span>
                  <span className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
                    {card.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ================================================================= */}
          {/* Investors Section                                                 */}
          {/* ================================================================= */}
          {investorMap.size > 0 && (
            <section className="space-y-4">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35">
                Investors
              </h2>
              <div className="flex flex-wrap gap-3">
                {Array.from(investorMap.entries()).map(
                  ([invName, role], i) => (
                    <div
                      key={invName}
                      className="lg-inset rounded-[10px] px-4 py-3 flex items-center gap-2 animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500 hover:animate-[float_3s_ease-in-out_infinite]"
                      style={{ animationDelay: `${i * 60}ms` }}
                    >
                      <Briefcase className="h-4 w-4 text-foreground/40 shrink-0" />
                      <span className="text-[13px] font-semibold tracking-[-0.01em] text-foreground/85">{invName}</span>
                      {role === "lead" && (
                        <span className="rounded-full bg-blue-500/8 px-1.5 py-0 text-[10px] font-medium text-blue-600">
                          Lead
                        </span>
                      )}
                    </div>
                  )
                )}
              </div>
            </section>
          )}

          {/* ================================================================= */}
          {/* Valuation Range Chart                                             */}
          {/* ================================================================= */}
          {(() => {
            const chartData = rounds
              .map((r) => {
                const amt = asNumber(r.amount);
                const val = estimateValuation(r.stage, amt);
                const dateRaw = r.announcedDate ?? r.date ?? (r.articles ?? [])[0]?.publishedAt;
                if (!val || !dateRaw) return null;
                const d = new Date(String(dateRaw));
                if (Number.isNaN(d.getTime())) return null;
                return {
                  date: d.getTime(),
                  label: d.toLocaleDateString("de-DE", { month: "short", year: "numeric" }),
                  stage: r.stage ?? "Unknown",
                  low: val.low,
                  high: val.high,
                  amount: amt,
                };
              })
              .filter(Boolean) as { date: number; label: string; stage: string; low: number; high: number; amount: number }[];

            if (chartData.length < 2) return null;

            return (
              <section className="space-y-4">
                <h2 className="text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35">
                  Geschätzte Bewertung über Zeit
                </h2>
                <div className="lg-inset rounded-[16px] p-4">
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="valRangeFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgb(59,130,246)" stopOpacity={0.15} />
                          <stop offset="100%" stopColor="rgb(59,130,246)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(0,0,0,0.04)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: "rgba(0,0,0,0.35)" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(v: number) =>
                          v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(0)}M`
                        }
                        tick={{ fontSize: 11, fill: "rgba(0,0,0,0.35)" }}
                        axisLine={false}
                        tickLine={false}
                        width={60}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload as (typeof chartData)[number];
                          return (
                            <div className="glass-popover rounded-[10px] px-3 py-2 text-[12px] space-y-1">
                              <p className="font-semibold text-foreground/85">{d.stage}</p>
                              <p className="text-foreground/55">Runde: {formatAmount(d.amount)}</p>
                              <p className="text-foreground/55">
                                Bewertung: {formatAmount(d.low)} – {formatAmount(d.high)}
                              </p>
                            </div>
                          );
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="high"
                        stroke="rgb(59,130,246)"
                        strokeWidth={1.5}
                        fill="url(#valRangeFill)"
                        strokeOpacity={0.6}
                        dot={{ r: 3, fill: "rgb(59,130,246)", strokeWidth: 0 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="low"
                        stroke="rgb(59,130,246)"
                        strokeWidth={1.5}
                        strokeDasharray="4 3"
                        fill="white"
                        fillOpacity={1}
                        strokeOpacity={0.4}
                        dot={{ r: 3, fill: "white", stroke: "rgb(59,130,246)", strokeWidth: 1 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="flex items-center justify-center gap-4 mt-2 text-[11px] text-foreground/40">
                    <span className="flex items-center gap-1.5">
                      <span className="h-0.5 w-4 bg-blue-500 rounded-full inline-block" />
                      Obere Schätzung
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-0.5 w-4 bg-blue-500/40 rounded-full inline-block" style={{ backgroundImage: "repeating-linear-gradient(90deg, rgb(59,130,246) 0 4px, transparent 4px 7px)" }} />
                      Untere Schätzung
                    </span>
                  </div>
                </div>
              </section>
            );
          })()}

          {/* ================================================================= */}
          {/* Funding Timeline                                                  */}
          {/* ================================================================= */}
          {rounds.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35">
                Funding Timeline
              </h2>
              <div className="relative pl-6 space-y-0">
                {/* Vertical line */}
                <div className="absolute left-2.5 top-2 bottom-2 w-px bg-foreground/[0.04]" />

                {rounds.map((r, i) => {
                  const amount = asNumber(r.amount);
                  const originalAmt = asNumber(r.originalAmount);
                  const fxRate = asNumber(r.fxRate);
                  const confidence = asNumber(r.confidence);
                  const leadInvestor = (r.investors ?? []).find(
                    (inv) => inv.role === "lead"
                  );
                  const participants = (r.investors ?? []).filter(
                    (inv) => inv.name && inv.role !== "lead"
                  );
                  const firstArticle = (r.articles ?? [])[0];
                  const dateStr = formatDate(r.date) ?? formatDate(r.announcedDate) ?? formatDate(firstArticle?.publishedAt);
                  const hasCurrencyDetail = r.currency && r.currency !== "USD" && originalAmt > 0;
                  const valuation = estimateValuation(r.stage, amount);

                  return (
                    <div
                      key={r.roundKey ?? i}
                      className="relative flex items-start gap-4 pb-6 last:pb-0 animate-in fade-in-0 slide-in-from-left-2 fill-mode-both duration-500"
                      style={{ animationDelay: `${i * 100}ms` }}
                    >
                      {/* Node dot */}
                      <div className="absolute -left-6 top-1.5 flex h-5 w-5 items-center justify-center">
                        <div className="h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-background" />
                      </div>

                      <div className="lg-inset rounded-[14px] flex-1 p-4 space-y-3">
                        {/* Row 1: Stage, amount, valuation, date */}
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <span className="rounded-full bg-foreground/[0.04] px-2.5 py-0.5 text-[10px] font-medium text-foreground/55 shrink-0">
                              {r.stage ?? "Unknown"}
                            </span>
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-[17px] tracking-[-0.02em] tabular-nums text-foreground/85">
                                  {formatAmount(amount)}
                                </span>
                                {hasCurrencyDetail && (
                                  <span className="text-[11px] text-foreground/30 tabular-nums">
                                    ({r.currency} {formatAmount(originalAmt)}{fxRate > 0 ? ` × ${fxRate.toFixed(3)}` : ""})
                                  </span>
                                )}
                              </div>
                              {valuation && (
                                <span className="text-[11px] text-foreground/35 tabular-nums tracking-[-0.01em]">
                                  Est. Bewertung {formatAmount(valuation.low)} – {formatAmount(valuation.high)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2.5">
                            {confidence > 0 && (
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                confidence >= 0.8
                                  ? "bg-emerald-500/8 text-emerald-600"
                                  : confidence >= 0.6
                                    ? "bg-amber-500/8 text-amber-600"
                                    : "bg-foreground/[0.04] text-foreground/40"
                              }`}>
                                {Math.round(confidence * 100)}%
                              </span>
                            )}
                            {dateStr && (
                              <span className="flex items-center gap-1 text-foreground/30 text-[12px]">
                                <Calendar className="h-3 w-3" />
                                {dateStr}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Row 2: Investors with logos */}
                        {(leadInvestor || participants.length > 0) && (
                          <div className="flex flex-wrap gap-2">
                            {leadInvestor?.name && (
                              <div className="flex items-center gap-1.5 rounded-full bg-blue-500/8 pl-1 pr-2.5 py-0.5">
                                {leadInvestor.logoUrl ? (
                                  <SmartLogo
                                    src={leadInvestor.logoUrl}
                                    alt={leadInvestor.name}
                                    className="h-4 w-4 rounded-full"
                                    fallback={
                                      <Briefcase className="h-3.5 w-3.5 text-blue-500/50" />
                                    }
                                  />
                                ) : (
                                  <Briefcase className="h-3.5 w-3.5 text-blue-500/50" />
                                )}
                                <span className="text-[11px] font-semibold text-blue-600">
                                  {leadInvestor.name}
                                </span>
                                <span className="text-[9px] font-medium text-blue-500/60 uppercase">
                                  Lead
                                </span>
                              </div>
                            )}
                            {participants.map((inv) => (
                              <div
                                key={inv.name}
                                className="flex items-center gap-1.5 rounded-full bg-foreground/[0.04] pl-1 pr-2.5 py-0.5"
                              >
                                {inv.logoUrl ? (
                                  <SmartLogo
                                    src={inv.logoUrl}
                                    alt={inv.name ?? ""}
                                    className="h-4 w-4 rounded-full"
                                    fallback={
                                      <Briefcase className="h-3.5 w-3.5 text-foreground/25" />
                                    }
                                  />
                                ) : (
                                  <Briefcase className="h-3.5 w-3.5 text-foreground/25" />
                                )}
                                <span className="text-[11px] font-medium text-foreground/55">
                                  {inv.name}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Row 3: Source articles + Edit button */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex flex-wrap gap-2">
                            {(r.articles ?? []).map((article, ai) =>
                              article.url ? (
                                <a
                                  key={ai}
                                  href={article.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-500 transition-colors"
                                >
                                  <ExternalLink className="h-3 w-3 shrink-0" />
                                  <span className="truncate max-w-[200px]">
                                    {article.title ?? "Source"}
                                  </span>
                                </a>
                              ) : null
                            )}
                          </div>
                          {r.roundKey && editingRoundKey !== r.roundKey && (
                            <button
                              onClick={() => {
                                setEditingRoundKey(r.roundKey);
                                setEditForm({
                                  announcedDate: String(r.announcedDate ?? r.date ?? ""),
                                  stage: String(r.stage ?? ""),
                                  amountUsd: amount > 0 ? String(amount) : "",
                                });
                              }}
                              className="glass-capsule-btn flex items-center gap-1 px-2 py-0.5 text-[11px] text-foreground/35 hover:text-foreground/60 transition-colors shrink-0"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                        </div>

                        {/* Inline edit form */}
                        {r.roundKey && editingRoundKey === r.roundKey && (
                          <div className="rounded-[10px] bg-foreground/[0.02] border border-foreground/[0.06] p-3 space-y-3">
                            <div className="grid grid-cols-3 gap-3">
                              <div className="space-y-1">
                                <label className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
                                  Datum
                                </label>
                                <input
                                  type="date"
                                  value={editForm.announcedDate}
                                  onChange={(e) => setEditForm((f) => ({ ...f, announcedDate: e.target.value }))}
                                  className="glass-search-input w-full px-2 py-1 text-[13px] text-foreground/85"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
                                  Stage
                                </label>
                                <select
                                  value={editForm.stage}
                                  onChange={(e) => setEditForm((f) => ({ ...f, stage: e.target.value }))}
                                  className="glass-search-input w-full px-2 py-1 text-[13px] text-foreground/85"
                                >
                                  <option value="">—</option>
                                  {["Pre-Seed", "Seed", "Series A", "Series B", "Series C", "Series D", "Series E", "Series E+", "Bridge", "Growth", "Debt", "Grant"].map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
                                  Betrag (USD)
                                </label>
                                <input
                                  type="number"
                                  value={editForm.amountUsd}
                                  onChange={(e) => setEditForm((f) => ({ ...f, amountUsd: e.target.value }))}
                                  placeholder="z.B. 10000000"
                                  className="glass-search-input w-full px-2 py-1 text-[13px] text-foreground/85 tabular-nums"
                                />
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => saveRoundEdit(r.roundKey!)}
                                disabled={editSaving}
                                className="apple-btn-blue px-3 py-1 text-[11px] font-semibold rounded-[8px] flex items-center gap-1 disabled:opacity-50"
                              >
                                {editSaving ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Check className="h-3 w-3" />
                                )}
                                Speichern
                              </button>
                              <button
                                onClick={() => setEditingRoundKey(null)}
                                className="glass-capsule-btn px-3 py-1 text-[11px] text-foreground/45 flex items-center gap-1"
                              >
                                <X className="h-3 w-3" />
                                Abbrechen
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ================================================================= */}
          {/* Similar Companies                                                 */}
          {/* ================================================================= */}
          <section className="space-y-4">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35">
              Similar Companies
            </h2>
            {similarLoading && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-[14px]" />
                ))}
              </div>
            )}
            {similar && similar.length === 0 && (
              <p className="text-[13px] text-foreground/40">
                No similar companies found.
              </p>
            )}
            {similar && similar.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {similar.map((c, i) => (
                  <Link
                    key={c.name}
                    href={`/app/companies/${encodeURIComponent(c.name)}`}
                    className="lg-inset rounded-[14px] p-4 flex flex-col gap-2 transition-colors hover:bg-foreground/[0.04] animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {c.logoUrl ? (
                        <SmartLogo
                          src={c.logoUrl}
                          alt={c.name}
                          className="h-6 w-6 rounded-[6px] shrink-0"
                          fallback={
                            <Building2 className="h-5 w-5 text-foreground/15 shrink-0" />
                          }
                        />
                      ) : (
                        <Building2 className="h-5 w-5 text-foreground/15 shrink-0" />
                      )}
                      <span className="text-[13px] font-semibold tracking-[-0.01em] text-foreground/85 truncate">
                        {c.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {c.totalFunding > 0 && (
                        <span className="text-[12px] font-semibold text-foreground/55 tabular-nums">
                          {formatAmount(c.totalFunding)}
                        </span>
                      )}
                      {(c.subsector || c.sector) && (
                        <span className="rounded-full bg-foreground/[0.04] px-1.5 py-0 text-[10px] font-medium text-foreground/55 h-4 flex items-center">
                          {c.subsector ?? c.sector}
                        </span>
                      )}
                      {c.country && (
                        <span className="rounded-full bg-foreground/[0.04] px-1.5 py-0 text-[10px] font-medium text-foreground/40 h-4 flex items-center">
                          {c.country}
                        </span>
                      )}
                    </div>
                    {c.topInvestors.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {c.topInvestors.map((inv) => (
                          <span
                            key={inv}
                            className="text-[10px] text-foreground/35 truncate max-w-[100px]"
                          >
                            {inv}
                          </span>
                        ))}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
