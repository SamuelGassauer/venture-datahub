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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
     collect(DISTINCT {name: inv.name, role: p.role}) AS roundInvestors
OPTIONAL MATCH (fr)-[:SOURCED_FROM]->(a:Article)
WITH c, location, fr, roundInvestors,
     collect(DISTINCT {url: a.url, title: a.title, publishedAt: a.publishedAt}) AS articles
WITH c, location,
     collect(CASE WHEN fr IS NOT NULL THEN {
       stage: fr.stage,
       amount: fr.amountUsd,
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
  roundKey: string | null;
  investors: { name: string | null; role: string | null }[];
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
// Glassmorphism class constants
// ---------------------------------------------------------------------------

const GLASS_HERO =
  "rounded-2xl border border-white/10 bg-card/70 backdrop-blur-xl shadow-2xl dark:border-white/5 dark:bg-card/60";
const GLASS_ATTR =
  "rounded-xl border border-white/10 bg-card/50 backdrop-blur-md shadow-lg dark:border-white/5 dark:bg-card/40";
const GLASS_INVESTOR =
  "rounded-lg border border-white/10 bg-card/40 backdrop-blur-sm shadow-md dark:border-white/5 dark:bg-card/30";

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

  // Refs for SVG line drawing
  const containerRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const attrRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [lines, setLines] = useState<
    { x1: number; y1: number; x2: number; y2: number; id: string }[]
  >([]);

  // Fetch main company data
  useEffect(() => {
    async function load() {
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
    }
    load();
  }, [companyName]);

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
  const rounds = rawRounds.filter((r) => r.stage || asNumber(r.amount) > 0);
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
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 p-6">
        <div className="mx-auto max-w-6xl space-y-8">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-64 w-full rounded-2xl" />
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Building2 className="h-12 w-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">{error}</p>
          <button
            onClick={() => router.push("/companies")}
            className="text-sm text-blue-500 hover:text-blue-600"
          >
            Back to companies
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-10">
        {/* Back button */}
        <button
          onClick={() => router.push("/companies")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to companies
        </button>

        {/* ================================================================= */}
        {/* Graph Section — Hero + Attribute Nodes                            */}
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
                className={`${GLASS_ATTR} p-4 flex flex-col items-center gap-2 text-center animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500 hover:animate-[float_3s_ease-in-out_infinite]`}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <card.icon className="h-5 w-5 text-muted-foreground" />
                <span className="text-lg font-bold tracking-tight">
                  {card.value}
                </span>
                <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
                  {card.label}
                </span>
              </div>
            ))}

            {/* HERO card — center, spans 2 rows on desktop */}
            <div
              ref={heroRef}
              className={`${GLASS_HERO} p-6 sm:p-8 col-span-2 md:col-span-1 lg:row-span-2 flex flex-col items-center text-center gap-4 animate-in fade-in-0 zoom-in-95 duration-500`}
            >
              {logoUrl ? (
                <SmartLogo
                  src={logoUrl}
                  alt={name}
                  className="h-16 w-16 rounded-xl"
                  fallback={
                    <div className="h-16 w-16 rounded-xl bg-muted flex items-center justify-center">
                      <Building2 className="h-8 w-8 text-muted-foreground" />
                    </div>
                  }
                />
              ) : (
                <div className="h-16 w-16 rounded-xl bg-muted flex items-center justify-center">
                  <Building2 className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
              {description && (
                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">
                  {description}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-center gap-2">
                {status && (
                  <Badge variant="outline" className="text-xs">
                    {status}
                  </Badge>
                )}
                {sector && (
                  <Badge variant="secondary" className="text-xs">
                    {sector}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm">
                {website && (
                  <a
                    href={
                      website.startsWith("http") ? website : `https://${website}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-500 hover:text-blue-600"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    <span className="text-xs">
                      {website.replace(/^https?:\/\//, "")}
                    </span>
                  </a>
                )}
                {linkedinUrl && (
                  <a
                    href={linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-500 hover:text-blue-600"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span className="text-xs">LinkedIn</span>
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
                className={`${GLASS_ATTR} p-4 flex flex-col items-center gap-2 text-center animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500 hover:animate-[float_3s_ease-in-out_infinite]`}
                style={{ animationDelay: `${(i + 2) * 80}ms` }}
              >
                <card.icon className="h-5 w-5 text-muted-foreground" />
                <span className="text-lg font-bold tracking-tight">
                  {card.value}
                </span>
                <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
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
                className={`${GLASS_ATTR} p-4 flex flex-col items-center gap-2 text-center animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500 hover:animate-[float_3s_ease-in-out_infinite]`}
                style={{ animationDelay: `${(i + 4) * 80}ms` }}
              >
                <card.icon className="h-5 w-5 text-muted-foreground" />
                <span className="text-lg font-bold tracking-tight">
                  {card.value}
                </span>
                <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
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
            <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              Investors
            </h2>
            <div className="flex flex-wrap gap-3">
              {Array.from(investorMap.entries()).map(
                ([invName, role], i) => (
                  <div
                    key={invName}
                    className={`${GLASS_INVESTOR} px-4 py-3 flex items-center gap-2 animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500 hover:animate-[float_3s_ease-in-out_infinite]`}
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <Briefcase className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium">{invName}</span>
                    {role === "lead" && (
                      <Badge
                        variant="default"
                        className="text-[10px] px-1.5 py-0"
                      >
                        Lead
                      </Badge>
                    )}
                  </div>
                )
              )}
            </div>
          </section>
        )}

        {/* ================================================================= */}
        {/* Funding Timeline                                                  */}
        {/* ================================================================= */}
        {rounds.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              Funding Timeline
            </h2>
            <div className="relative pl-6 space-y-0">
              {/* Vertical line */}
              <div className="absolute left-2.5 top-2 bottom-2 w-px bg-border" />

              {rounds.map((r, i) => {
                const amount = asNumber(r.amount);
                const leadInvestor = (r.investors ?? []).find(
                  (inv) => inv.role === "lead"
                );
                const firstArticle = (r.articles ?? [])[0];
                const dateStr = formatDate(firstArticle?.publishedAt);
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

                    <div
                      className={`${GLASS_ATTR} flex-1 p-4 flex items-center justify-between gap-4`}
                    >
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {r.stage ?? "Unknown"}
                        </Badge>
                        <span className="font-bold text-lg tabular-nums">
                          {formatAmount(amount)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-muted-foreground text-xs">
                        {leadInvestor?.name && (
                          <span className="hidden sm:inline">
                            {leadInvestor.name}
                          </span>
                        )}
                        {dateStr && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {dateStr}
                          </span>
                        )}
                        {(r.articles ?? []).map((article, ai) =>
                          article.url ? (
                            <a
                              key={ai}
                              href={article.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:text-blue-600"
                              title={article.title ?? "Source article"}
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : null
                        )}
                      </div>
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
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Similar Companies
          </h2>
          {similarLoading && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          )}
          {similar && similar.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No similar companies found.
            </p>
          )}
          {similar && similar.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {similar.map((c, i) => (
                <Link
                  key={c.name}
                  href={`/companies/${encodeURIComponent(c.name)}`}
                  className={`${GLASS_ATTR} p-4 flex flex-col gap-2 transition-colors hover:bg-card/70 animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500`}
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {c.logoUrl ? (
                      <SmartLogo
                        src={c.logoUrl}
                        alt={c.name}
                        className="h-6 w-6 rounded shrink-0"
                        fallback={
                          <Building2 className="h-5 w-5 text-muted-foreground shrink-0" />
                        }
                      />
                    ) : (
                      <Building2 className="h-5 w-5 text-muted-foreground shrink-0" />
                    )}
                    <span className="text-sm font-medium truncate">
                      {c.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {c.totalFunding > 0 && (
                      <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                        {formatAmount(c.totalFunding)}
                      </span>
                    )}
                    {(c.subsector || c.sector) && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0 h-4"
                      >
                        {c.subsector ?? c.sector}
                      </Badge>
                    )}
                    {c.country && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 h-4"
                      >
                        {c.country}
                      </Badge>
                    )}
                  </div>
                  {c.topInvestors.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {c.topInvestors.map((inv) => (
                        <span
                          key={inv}
                          className="text-[10px] text-muted-foreground truncate max-w-[100px]"
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
  );
}
