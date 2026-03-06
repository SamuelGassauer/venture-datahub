"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Search,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  TrendingUp,
  Building2,
  Users,
  CircleDollarSign,
  Target,
  Flame,
  Eye,
  Zap,
  Globe,
  BarChart3,
  Briefcase,
  Handshake,
  Landmark,
  Share2,
  ArrowRight,
  Gauge,
} from "lucide-react";
import { useGlobalFilters, resolveGeoFilter } from "@/lib/global-filters";
import type { GlobalFilters } from "@/lib/global-filters";
import {
  TimelineChart,
  StageChart,
  GeographyChart,
  SectorChart,
} from "@/components/graph/funding-charts";
import { EntitySheet } from "@/components/graph/entity-sheet";
import { EuropeMap3D } from "@/components/dashboard/europe-map-3d";
import { WeeklyDealChart } from "@/components/dashboard/weekly-deal-chart";
import type { GroupedRound } from "@/app/api/funding/grouped/route";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GraphStats = {
  summary: {
    totalFunding: number;
    totalCompanies: number;
    totalInvestors: number;
    totalRounds: number;
    medianDealSize: number | null;
    avgDealSize: number;
  };
  fundingBySector: {
    sector: string;
    totalAmount: number;
    dealCount: number;
    companyCount: number;
  }[];
  topCompanies: {
    name: string;
    country: string | null;
    totalFunding: number | null;
    roundCount: number;
    lastRoundStage: string | null;
    lastRoundAmount: number | null;
  }[];
  topInvestors: {
    name: string;
    dealCount: number;
    leadCount: number;
    totalDeployed: number | null;
    portfolioCompanies: string[];
  }[];
  fundingByStage: { stage: string; count: number; totalAmount: number }[];
  fundingByCountry: {
    country: string;
    totalAmount: number;
    dealCount: number;
    companyCount: number;
  }[];
  fundingTimeline: { month: string; dealCount: number; totalAmount: number }[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(amount: number | null | undefined): string {
  if (!amount) return "\u2014";
  if (amount >= 1_000_000_000)
    return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "0";
  return n.toLocaleString("en-US");
}

function relTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w`;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const STAGE_COLORS: Record<string, string> = {
  "Pre-Seed":
    "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/25",
  Seed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
  "Series A":
    "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/25",
  "Series B":
    "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/25",
  "Series C":
    "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25",
  "Series D":
    "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/25",
  Growth:
    "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/25",
  "Late Stage":
    "bg-pink-500/15 text-pink-700 dark:text-pink-400 border-pink-500/25",
  Debt: "bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/25",
  Grant:
    "bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/25",
};

function stageColor(stage: string | null): string {
  if (!stage) return "bg-muted text-muted-foreground border-border";
  return (
    STAGE_COLORS[stage] ?? "bg-muted text-muted-foreground border-border"
  );
}


function confidenceMeta(c: number) {
  if (c >= 0.9)
    return {
      label: "Verified",
      color: "bg-emerald-500",
      ring: "ring-emerald-500/30",
    };
  if (c >= 0.8)
    return {
      label: "High",
      color: "bg-emerald-400",
      ring: "ring-emerald-400/30",
    };
  if (c >= 0.7)
    return {
      label: "Medium",
      color: "bg-amber-400",
      ring: "ring-amber-400/30",
    };
  return { label: "Low", color: "bg-red-400", ring: "ring-red-400/30" };
}

// ---------------------------------------------------------------------------
// View type
// ---------------------------------------------------------------------------

type View = "home" | "deals" | "market";

// ============================================================================
//  HOME VIEW — Landing + orientation
// ============================================================================

function HomeView({
  onNavigate,
  onEntityOpen,
  filters,
  onCountriesLoaded,
  companySectorMap,
  onCountryClick,
}: {
  onNavigate: (v: View) => void;
  onEntityOpen: (name: string, type: "company" | "investor") => void;
  filters: GlobalFilters;
  onCountriesLoaded: (countries: string[]) => void;
  companySectorMap: Map<string, string>;
  onCountryClick?: (country: string) => void;
}) {
  const { data: session } = useSession();
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [deals, setDeals] = useState<GroupedRound[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingDeals, setLoadingDeals] = useState(true);

  useEffect(() => {
    fetch("/api/graph-stats")
      .then((r) => r.json())
      .then((data: GraphStats) => {
        setStats(data);
        const countries = [...new Set(data.fundingByCountry.map((c) => c.country))].sort();
        onCountriesLoaded(countries);
      })
      .finally(() => setLoadingStats(false));
  }, [onCountriesLoaded]);

  // Fetch deals with global filters
  useEffect(() => {
    const params = new URLSearchParams({ sortBy: "lastSeen" });
    if (filters.stages.length > 0) params.set("stage", filters.stages.join(","));
    if (filters.country) params.set("country", filters.country);

    setLoadingDeals(true);
    fetch(`/api/funding/grouped?${params}`)
      .then((r) => r.json())
      .then((json) => {
        let items: GroupedRound[] = json.data ?? [];
        // Client-side geo filter (region / preset)
        const geo = resolveGeoFilter(filters);
        if (geo && !filters.country) {
          items = items.filter(
            (d) => d.country && geo.countries.has(d.country.toLowerCase())
          );
        }
        // Client-side sector filter
        if (filters.sectors.length > 0 && companySectorMap.size > 0) {
          const sectorsLower = new Set(filters.sectors.map((s) => s.toLowerCase()));
          items = items.filter((d) => {
            const sector = companySectorMap.get(d.companyName.toLowerCase());
            return sector && sectorsLower.has(sector.toLowerCase());
          });
        }
        setDeals(items.slice(0, 5));
      })
      .finally(() => setLoadingDeals(false));
  }, [filters.stages, filters.sectors, filters.country, filters.region, companySectorMap]);

  const firstName =
    session?.user?.name?.split(" ")[0] ?? session?.user?.email?.split("@")[0];

  return (
    <div className="space-y-6">
      {/* ── 3D Europe Map ── */}
      {stats && (
        <EuropeMap3D
          fundingByCountry={stats.fundingByCountry}
          onCountryClick={onCountryClick}
        />
      )}
      <WeeklyDealChart />

      {/* ── Hero ── */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground max-w-lg">
          Your VC intelligence hub. Explore deal flow, track companies and
          investors, and monitor market trends across Europe.
        </p>
      </div>

      {/* ── Live stats ── */}
      {loadingStats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[76px] rounded-lg" />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCard
            icon={CircleDollarSign}
            label="Tracked Capital"
            value={fmt(stats.summary.totalFunding)}
          />
          <KpiCard
            icon={Building2}
            label="Companies"
            value={fmtNum(stats.summary.totalCompanies)}
          />
          <KpiCard
            icon={Users}
            label="Investors"
            value={fmtNum(stats.summary.totalInvestors)}
          />
          <KpiCard
            icon={Flame}
            label="Funding Rounds"
            value={fmtNum(stats.summary.totalRounds)}
          />
          <KpiCard
            icon={BarChart3}
            label="Median Round"
            value={fmt(stats.summary.medianDealSize)}
          />
        </div>
      ) : null}

      {/* ── Use-case cards ── */}
      <div>
        <SectionLabel>What would you like to do?</SectionLabel>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <UseCaseCard
            icon={Flame}
            title="Browse Deal Feed"
            description="Search and filter the latest funding rounds. See lead investors, amounts, stages, and source articles in real time."
            action="Open Deal Feed"
            onClick={() => onNavigate("deals")}
            accentColor="text-orange-500 bg-orange-500/10"
          />
          <UseCaseCard
            icon={BarChart3}
            title="Market Overview"
            description="Charts and rankings across funding stages, geographies, and sectors. Spot macro trends at a glance."
            action="View Market Data"
            onClick={() => onNavigate("market")}
            accentColor="text-blue-500 bg-blue-500/10"
          />
          <UseCaseCard
            icon={Building2}
            title="Company Database"
            description="Browse all tracked companies with funding history, sector, geography, and enrichment data."
            href="/app/companies"
            accentColor="text-emerald-500 bg-emerald-500/10"
          />
          <UseCaseCard
            icon={Users}
            title="Investor Directory"
            description="Explore investor profiles, portfolio companies, deal counts, and check sizes."
            href="/app/investors"
            accentColor="text-violet-500 bg-violet-500/10"
          />
          <UseCaseCard
            icon={Handshake}
            title="Deal Explorer"
            description="Full table of all funding rounds with sorting and search. Click any deal to see the complete round details."
            href="/app/graph/funding-rounds"
            accentColor="text-amber-500 bg-amber-500/10"
          />
          <UseCaseCard
            icon={Landmark}
            title="Fund Closings"
            description="Track LP fund raises, closings, and new fund launches from VCs and growth equity firms."
            href="/app/graph/fund-closings"
            accentColor="text-rose-500 bg-rose-500/10"
          />
        </div>
      </div>

      {/* ── Latest deals preview ── */}
      <div>
        <div className="flex items-center justify-between">
          <SectionLabel>Latest deals</SectionLabel>
          <button
            onClick={() => onNavigate("deals")}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            View all
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
        <div className="mt-2 rounded-lg border">
          {loadingDeals ? (
            <div className="divide-y">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <Skeleton className="h-2 w-2 rounded-full" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="ml-auto h-4 w-16" />
                  <Skeleton className="h-5 w-16 rounded-md" />
                  <Skeleton className="h-4 w-8" />
                </div>
              ))}
            </div>
          ) : deals.length === 0 ? (
            <div className="flex flex-col items-center py-10">
              <Eye className="h-5 w-5 text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">
                No deals yet. They will appear here once feeds are synced.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {deals.map((deal) => (
                <DealPreviewRow
                  key={deal.key}
                  deal={deal}
                  onCompanyClick={(n) => onEntityOpen(n, "company")}
                  onInvestorClick={(n) => onEntityOpen(n, "investor")}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── More tools ── */}
      <div>
        <SectionLabel>More tools</SectionLabel>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <MiniLink
            icon={Gauge}
            label="Valuations & KPIs"
            description="Revenue, ARR, and valuation signals extracted from news"
            href="/app/graph/valuations"
          />
          <MiniLink
            icon={Share2}
            label="Graph Explorer"
            description="Query the knowledge graph directly with Cypher"
            href="/app/graph"
          />
        </div>
      </div>
    </div>
  );
}

// ── Home sub-components ──

function KpiCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-card px-4 py-3 transition-colors hover:border-foreground/15">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <span className="text-2xl font-bold tracking-tight tabular-nums">
        {value}
      </span>
    </div>
  );
}

function UseCaseCard({
  icon: Icon,
  title,
  description,
  action,
  onClick,
  href,
  accentColor,
}: {
  icon: typeof Flame;
  title: string;
  description: string;
  action?: string;
  onClick?: () => void;
  href?: string;
  accentColor: string;
}) {
  const inner = (
    <>
      <div className="flex items-start gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${accentColor}`}
        >
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
        {action ?? `Open ${title}`}
        <ArrowRight className="h-3 w-3" />
      </div>
    </>
  );

  const cls =
    "group rounded-lg border bg-card p-4 text-left transition-all hover:border-foreground/15 hover:shadow-sm";

  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

function MiniLink({
  icon: Icon,
  label,
  description,
  href,
}: {
  icon: typeof Share2;
  label: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-lg border px-4 py-3 transition-all hover:border-foreground/15 hover:shadow-sm"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <span className="text-sm font-medium">{label}</span>
        <p className="text-[11px] text-muted-foreground leading-snug">
          {description}
        </p>
      </div>
      <ArrowRight className="ml-auto h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-foreground transition-colors" />
    </Link>
  );
}

function DealPreviewRow({
  deal,
  onCompanyClick,
  onInvestorClick,
}: {
  deal: GroupedRound;
  onCompanyClick: (n: string) => void;
  onInvestorClick: (n: string) => void;
}) {
  const conf = confidenceMeta(deal.maxConfidence);
  const isRecent =
    Date.now() - new Date(deal.lastSeen).getTime() < 4 * 60 * 60 * 1000;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/40">
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${conf.color} ring-2 ${conf.ring}`}
            />
          </TooltipTrigger>
          <TooltipContent side="right">
            <p className="text-xs">
              {conf.label} ({(deal.maxConfidence * 100).toFixed(0)}%)
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <button
        onClick={() => onCompanyClick(deal.companyName)}
        className="min-w-0 truncate text-sm font-semibold hover:underline decoration-dotted underline-offset-4 text-left"
      >
        {deal.companyName}
      </button>

      {isRecent && (
        <span className="flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 shrink-0">
          <Zap className="h-2.5 w-2.5" />
          New
        </span>
      )}

      {deal.leadInvestor && (
        <button
          onClick={() => onInvestorClick(deal.leadInvestor!)}
          className="hidden sm:block shrink-0 text-[11px] text-muted-foreground hover:text-foreground hover:underline decoration-dotted underline-offset-2 truncate max-w-[140px]"
        >
          {deal.leadInvestor}
        </button>
      )}

      <span className="ml-auto shrink-0 font-mono text-sm font-bold tabular-nums">
        {fmt(deal.amountUsd)}
      </span>

      {deal.stage && (
        <span
          className={`shrink-0 inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold ${stageColor(deal.stage)}`}
        >
          {deal.stage}
        </span>
      )}

      <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground w-8 text-right">
        {relTime(deal.lastSeen)}
      </span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h2>
  );
}

// ============================================================================
//  DEALS VIEW
// ============================================================================

function DealsView({
  onEntityOpen,
  onBack,
  filters,
  onCountriesLoaded,
  companySectorMap,
}: {
  onEntityOpen: (name: string, type: "company" | "investor") => void;
  onBack: () => void;
  filters: GlobalFilters;
  onCountriesLoaded: (countries: string[]) => void;
  companySectorMap: Map<string, string>;
}) {
  const [deals, setDeals] = useState<GroupedRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState("lastSeen");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement).tagName
        )
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape" && document.activeElement === searchRef.current) {
        searchRef.current?.blur();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const fetchDeals = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    // Apply global filters
    if (filters.stages.length > 0) params.set("stage", filters.stages.join(","));
    if (filters.country) params.set("country", filters.country);
    if (debouncedSearch) params.set("search", debouncedSearch);
    params.set("sortBy", sortBy);

    try {
      const res = await fetch(`/api/funding/grouped?${params}`);
      const json = await res.json();
      let items: GroupedRound[] = json.data ?? [];

      // Client-side geo filter (region / preset)
      const geo = resolveGeoFilter(filters);
      if (geo && !filters.country) {
        items = items.filter(
          (d) => d.country && geo.countries.has(d.country.toLowerCase())
        );
      }

      // Client-side sector filter via company→sector lookup
      if (filters.sectors.length > 0 && companySectorMap.size > 0) {
        const sectorsLower = new Set(filters.sectors.map((s) => s.toLowerCase()));
        items = items.filter((d) => {
          const sector = companySectorMap.get(d.companyName.toLowerCase());
          return sector && sectorsLower.has(sector.toLowerCase());
        });
      }

      // Collect countries for the global filter bar
      const countries = new Set<string>();
      for (const d of json.data ?? []) if (d.country) countries.add(d.country);
      onCountriesLoaded([...countries].sort());

      setDeals(items);
    } catch {
      setDeals([]);
    } finally {
      setLoading(false);
    }
  }, [filters.stages, filters.sectors, filters.country, filters.region, debouncedSearch, sortBy, onCountriesLoaded, companySectorMap]);

  useEffect(() => {
    fetchDeals();
  }, [fetchDeals]);

  const totalAmount = deals.reduce((s, d) => s + (d.amountUsd ?? 0), 0);

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight className="h-3 w-3 rotate-180" />
          Home
        </button>
        <h1 className="text-lg font-bold tracking-tight">Deal Feed</h1>
        <p className="hidden sm:block text-xs text-muted-foreground">
          Real-time funding rounds from across your feed sources
        </p>
      </div>

      {/* Search + controls */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder='Search companies, articles...  press "/" '
            className="h-8 w-full rounded-lg border bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
          />
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="h-8 rounded-lg border bg-background px-2.5 text-xs font-medium text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
        >
          <option value="lastSeen">Latest</option>
          <option value="amount">Largest</option>
          <option value="confidence">Confidence</option>
          <option value="sources">Most Sources</option>
          <option value="company">A{"\u2013"}Z</option>
        </select>

        <div className="hidden sm:flex items-center gap-3 ml-auto text-[11px] text-muted-foreground">
          <span className="tabular-nums font-mono font-semibold text-foreground">
            {deals.length}
          </span>
          <span>deals</span>
          {totalAmount > 0 && (
            <>
              <span className="text-muted-foreground/30">&middot;</span>
              <span className="tabular-nums font-mono font-semibold text-foreground">
                {fmt(totalAmount)}
              </span>
              <span>total</span>
            </>
          )}
        </div>
      </div>

      {/* Column header */}
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-3 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 border-b">
        <span>Company</span>
        <span className="text-right w-20">Amount</span>
        <span className="text-center w-20">Stage</span>
        <span className="text-center w-16">Geo</span>
        <span className="w-[62px] text-right pr-7">Time</span>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-0.5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5">
              <Skeleton className="h-2 w-2 rounded-full" />
              <Skeleton className="h-4 flex-1 max-w-[200px]" />
              <Skeleton className="h-4 w-16 ml-auto" />
              <Skeleton className="h-5 w-16 rounded-md" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-8" />
            </div>
          ))}
        </div>
      ) : deals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted mb-3">
            <Eye className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No deals found</p>
          <p className="mt-1 text-xs text-muted-foreground max-w-xs">
            {(filters.stages.length > 0 || filters.country || filters.region || debouncedSearch)
              ? "Try adjusting your filters or search query."
              : "New deals will appear as they are discovered from feed sources."}
          </p>
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-260px)]">
          <div className="rounded-lg border">
            {deals.map((deal) => (
              <DealRow
                key={deal.key}
                deal={deal}
                onCompanyClick={(n) => onEntityOpen(n, "company")}
                onInvestorClick={(n) => onEntityOpen(n, "investor")}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

// ── Deal Row ──

function DealRow({
  deal,
  onCompanyClick,
  onInvestorClick,
}: {
  deal: GroupedRound;
  onCompanyClick: (name: string) => void;
  onInvestorClick: (name: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const conf = confidenceMeta(deal.maxConfidence);
  const isRecent =
    Date.now() - new Date(deal.lastSeen).getTime() < 4 * 60 * 60 * 1000;

  return (
    <div className="group border-b border-border/50 last:border-b-0 transition-colors hover:bg-accent/50">
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-3 px-4 py-2.5">
        {/* Company */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${conf.color} ring-2 ${conf.ring}`}
                  />
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="text-xs">
                    {conf.label} confidence (
                    {(deal.maxConfidence * 100).toFixed(0)}%)
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <button
              onClick={() => onCompanyClick(deal.companyName)}
              className="truncate text-sm font-semibold hover:underline decoration-dotted underline-offset-4 text-left"
            >
              {deal.companyName}
            </button>
            {isRecent && (
              <span className="flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                <Zap className="h-2.5 w-2.5" />
                New
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {deal.leadInvestor && (
              <>
                <span className="text-muted-foreground/60">led by</span>
                <button
                  onClick={() => onInvestorClick(deal.leadInvestor!)}
                  className="font-medium text-foreground/70 hover:text-foreground hover:underline decoration-dotted underline-offset-2"
                >
                  {deal.leadInvestor}
                </button>
                <span className="text-muted-foreground/30">&middot;</span>
              </>
            )}
            {deal.allInvestors.length > 0 && (
              <>
                <span className="tabular-nums">
                  {deal.allInvestors.length}
                </span>
                <span>
                  investor{deal.allInvestors.length !== 1 ? "s" : ""}
                </span>
                <span className="text-muted-foreground/30">&middot;</span>
              </>
            )}
            <span className="tabular-nums">{deal.sourceCount}</span>
            <span>source{deal.sourceCount !== 1 ? "s" : ""}</span>
          </div>
        </div>

        {/* Amount */}
        <div className="text-right">
          <span
            className={`font-mono text-sm font-bold tabular-nums ${
              deal.amountUsd ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {fmt(deal.amountUsd)}
          </span>
        </div>

        {/* Stage */}
        <div className="flex justify-center">
          {deal.stage ? (
            <span
              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold ${stageColor(deal.stage)}`}
            >
              {deal.stage}
            </span>
          ) : (
            <span className="text-muted-foreground/40">{"\u2014"}</span>
          )}
        </div>

        {/* Country */}
        <div className="w-16 text-center">
          {deal.country ? (
            <span className="text-xs text-muted-foreground">
              {deal.country}
            </span>
          ) : (
            <span className="text-muted-foreground/30">{"\u2014"}</span>
          )}
        </div>

        {/* Time + expand */}
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground w-8 text-right">
            {relTime(deal.lastSeen)}
          </span>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded */}
      {expanded && deal.sources.length > 0 && (
        <div className="border-t border-dashed border-border/50 bg-muted/30 px-4 py-2 space-y-1">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
            Source Articles
          </div>
          {deal.sources.map((src) => (
            <a
              key={src.articleId}
              href={src.articleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group/src flex items-center gap-2.5 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-background"
            >
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {src.feedTitle}
              </span>
              <span className="min-w-0 truncate text-foreground/80 group-hover/src:text-foreground">
                {src.articleTitle}
              </span>
              <ExternalLink className="ml-auto h-3 w-3 shrink-0 text-muted-foreground/40 group-hover/src:text-blue-500" />
            </a>
          ))}
          {deal.allInvestors.length > 0 && (
            <div className="mt-2 pt-2 border-t border-dashed border-border/50">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
                Investors
              </div>
              <div className="flex flex-wrap gap-1">
                {deal.allInvestors.map((inv) => (
                  <button
                    key={inv}
                    onClick={() => onInvestorClick(inv)}
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-accent ${
                      inv === deal.leadInvestor
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    {inv === deal.leadInvestor && (
                      <Target className="h-2.5 w-2.5" />
                    )}
                    {inv}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
//  MARKET VIEW
// ============================================================================

function MarketView({
  onEntityOpen,
  onBack,
  filters,
  onCountriesLoaded,
}: {
  onEntityOpen: (name: string, type: "company" | "investor") => void;
  onBack: () => void;
  filters: GlobalFilters;
  onCountriesLoaded: (countries: string[]) => void;
}) {
  const [data, setData] = useState<GraphStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/graph-stats")
      .then((r) => r.json())
      .then((stats: GraphStats) => {
        setData(stats);
        const countries = [...new Set(stats.fundingByCountry.map((c) => c.country))].sort();
        onCountriesLoaded(countries);
      })
      .finally(() => setLoading(false));
  }, [onCountriesLoaded]);

  // Apply global filters client-side
  const filtered = useMemo(() => {
    if (!data) return null;

    const geo = resolveGeoFilter(filters);

    const matchesCountry = (country: string | null) => {
      if (!country) return !geo;
      if (!geo) return true;
      return geo.countries.has(country.toLowerCase());
    };

    const stagesSet = new Set(filters.stages);
    const sectorsSet = new Set(filters.sectors);

    return {
      byCountry: data.fundingByCountry.filter((c) => matchesCountry(c.country)),
      byStage: stagesSet.size > 0
        ? data.fundingByStage.filter((s) => stagesSet.has(s.stage))
        : data.fundingByStage,
      bySector: sectorsSet.size > 0
        ? data.fundingBySector.filter((s) => sectorsSet.has(s.sector))
        : data.fundingBySector,
      companies: data.topCompanies.filter((c) => {
        if (!matchesCountry(c.country)) return false;
        if (stagesSet.size > 0 && (!c.lastRoundStage || !stagesSet.has(c.lastRoundStage))) return false;
        return true;
      }),
    };
  }, [data, filters.country, filters.region, filters.stages, filters.sectors]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[76px] rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-8 rounded-lg" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || !filtered)
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Failed to load market data.
      </p>
    );

  const { summary, fundingTimeline, topInvestors } = data;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight className="h-3 w-3 rotate-180" />
          Home
        </button>
        <h1 className="text-lg font-bold tracking-tight">Market Overview</h1>
        <p className="hidden sm:block text-xs text-muted-foreground">
          Aggregate trends and top performers across the portfolio
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          icon={CircleDollarSign}
          label="Total Funding"
          value={fmt(summary.totalFunding)}
        />
        <KpiCard
          icon={Building2}
          label="Companies"
          value={fmtNum(summary.totalCompanies)}
        />
        <KpiCard
          icon={Users}
          label="Investors"
          value={fmtNum(summary.totalInvestors)}
        />
        <KpiCard
          icon={Flame}
          label="Rounds"
          value={fmtNum(summary.totalRounds)}
        />
        <KpiCard
          icon={BarChart3}
          label="Median Deal"
          value={fmt(summary.medianDealSize)}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ChartCard title="Funding Timeline" icon={TrendingUp}>
          {fundingTimeline.length > 0 ? (
            <TimelineChart data={fundingTimeline} height={200} />
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
        <ChartCard title="Stage Breakdown" icon={BarChart3}>
          {filtered.byStage.length > 0 ? (
            <StageChart data={filtered.byStage} height={200} />
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
        <ChartCard title="Geography" icon={Globe}>
          {filtered.byCountry.length > 0 ? (
            <GeographyChart data={filtered.byCountry} height={200} />
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
        <ChartCard title="Sectors" icon={Briefcase}>
          {filtered.bySector.length > 0 ? (
            <SectorChart data={filtered.bySector} height={200} />
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
      </div>

      {/* Top tables */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Companies */}
        <div className="rounded-lg border">
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              Top Companies
            </span>
            <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
              {filtered.companies.length}
            </span>
          </div>
          <ScrollArea style={{ height: 320 }}>
            {filtered.companies.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-xs text-muted-foreground">
                  No companies match filters.
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {filtered.companies.map((c, i) => (
                  <button
                    key={c.name}
                    onClick={() => onEntityOpen(c.name, "company")}
                    className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-accent/50"
                  >
                    <span className="w-5 shrink-0 text-[11px] font-mono tabular-nums text-muted-foreground/50">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium truncate">
                          {c.name}
                        </span>
                        {c.country && (
                          <span className="text-[11px] text-muted-foreground">
                            {c.country}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground">
                        <span className="tabular-nums">
                          {c.roundCount} round
                          {c.roundCount !== 1 ? "s" : ""}
                        </span>
                        {c.lastRoundStage && (
                          <>
                            <span className="text-muted-foreground/30">
                              &middot;
                            </span>
                            <span>{c.lastRoundStage}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className="font-mono text-sm font-bold tabular-nums">
                      {fmt(c.totalFunding)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Investors */}
        <div className="rounded-lg border">
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              Top Investors
            </span>
            <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
              {topInvestors.length}
            </span>
          </div>
          <ScrollArea style={{ height: 320 }}>
            {topInvestors.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-xs text-muted-foreground">
                  No investors yet.
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {topInvestors.map((inv, i) => (
                  <button
                    key={inv.name}
                    onClick={() => onEntityOpen(inv.name, "investor")}
                    className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-accent/50"
                  >
                    <span className="w-5 shrink-0 text-[11px] font-mono tabular-nums text-muted-foreground/50">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium truncate block">
                        {inv.name}
                      </span>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground">
                        <span className="tabular-nums">
                          {inv.dealCount} deal
                          {inv.dealCount !== 1 ? "s" : ""}
                        </span>
                        <span className="text-muted-foreground/30">
                          &middot;
                        </span>
                        <span className="tabular-nums">
                          {inv.leadCount} lead
                          {inv.leadCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                    <span className="font-mono text-sm font-bold tabular-nums">
                      {fmt(inv.totalDeployed)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function ChartCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof TrendingUp;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border">
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wider">
          {title}
        </span>
      </div>
      <div className="p-2">{children}</div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex items-center justify-center py-16">
      <p className="text-xs text-muted-foreground">No data available yet.</p>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Main Component — View router
// ---------------------------------------------------------------------------

export function ViewerDashboard() {
  const [view, setView] = useState<View>("home");
  const { filters, setAvailableCountries, updateFilter } = useGlobalFilters();
  const [entity, setEntity] = useState<{
    name: string;
    type: "company" | "investor";
  } | null>(null);

  // Company → sector lookup for deal filtering
  const [companySectorMap, setCompanySectorMap] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    fetch("/api/companies")
      .then((r) => r.json())
      .then((json) => {
        const map = new Map<string, string>();
        for (const c of json.data ?? []) {
          if (c.name && c.sector) map.set(c.name.toLowerCase(), c.sector);
        }
        setCompanySectorMap(map);
      })
      .catch(() => {});
  }, []);

  const handleEntityOpen = useCallback(
    (name: string, type: "company" | "investor") => {
      setEntity({ name, type });
    },
    []
  );

  return (
    <div>
      {view === "home" && (
        <HomeView
          onNavigate={setView}
          onEntityOpen={handleEntityOpen}
          filters={filters}
          onCountriesLoaded={setAvailableCountries}
          companySectorMap={companySectorMap}
          onCountryClick={(country) =>
            updateFilter({
              country: filters.country === country ? "" : country,
            })
          }
        />
      )}
      {view === "deals" && (
        <DealsView
          onEntityOpen={handleEntityOpen}
          onBack={() => setView("home")}
          filters={filters}
          onCountriesLoaded={setAvailableCountries}
          companySectorMap={companySectorMap}
        />
      )}
      {view === "market" && (
        <MarketView
          onEntityOpen={handleEntityOpen}
          onBack={() => setView("home")}
          filters={filters}
          onCountriesLoaded={setAvailableCountries}
        />
      )}

      <EntitySheet
        open={entity !== null}
        onOpenChange={(open) => {
          if (!open) setEntity(null);
        }}
        entityType={entity?.type ?? null}
        entityName={entity?.name ?? null}
        onNavigate={(type, name) => setEntity({ name, type: type as "company" | "investor" })}
      />
    </div>
  );
}
