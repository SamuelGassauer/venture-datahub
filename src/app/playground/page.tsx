"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Clock,
  ArrowLeft,
  Loader2,
  Landmark,
  Building2,
  Handshake,
  Braces,
  Table2,
  Terminal,
  RotateCcw,
  Zap,
  Hash,
  Key,
  Settings2,
  Trash2,
  Keyboard,
  ArrowUpRight,
  CircleDollarSign,
  BarChart3,
  Info,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types & Config
// ---------------------------------------------------------------------------

type Endpoint = {
  id: string;
  label: string;
  path: string;
  icon: typeof Landmark;
  color: string;
  description: string;
  fields: string[];
  kind?: "list" | "stats";
};

const ENDPOINTS: Endpoint[] = [
  {
    id: "investors",
    label: "Investors",
    path: "/api/v1/investors",
    icon: Landmark,
    color: "blue",
    description: "VC funds, angels & investment firms",
    fields: [
      "externalId",
      "name",
      "logoUrl",
      "type",
      "dealCount",
      "leadCount",
      "totalDeployedUsd",
      "hq",
      "sectorFocus",
      "stageFocus",
      "geoFocus",
      "checkSizeMinUsd",
      "checkSizeMaxUsd",
      "roundRole",
      "stages",
      "portfolioCompanies",
      "latestInvestmentDate",
      "website",
    ],
  },
  {
    id: "startups",
    label: "Startups",
    path: "/api/v1/startups",
    icon: Building2,
    color: "emerald",
    description: "Venture-funded companies",
    fields: ["externalId", "name", "hq", "sector", "stage", "fundingRounds", "foundedAt", "website"],
  },
  {
    id: "investments",
    label: "Investments",
    path: "/api/v1/investments",
    icon: Handshake,
    color: "violet",
    description: "1 record per fund participation",
    fields: ["fundName", "startupName", "stage", "totalRoundSizeUsd", "role", "coInvestors", "investmentDate"],
  },
  {
    id: "funding-rounds",
    label: "Funding Rounds",
    path: "/api/v1/funding-rounds",
    icon: CircleDollarSign,
    color: "amber",
    description: "Round-based with all investors",
    fields: ["roundExternalId", "startupName", "stage", "totalRoundSizeUsd", "investors", "investmentDate"],
  },
  {
    id: "stats-funding-rounds",
    label: "Stats · Funding Rounds",
    path: "/api/v1/stats/funding-rounds",
    icon: BarChart3,
    color: "indigo",
    description: "Aggregates: counts, percentiles, stage/geo mix",
    fields: ["roundCount", "totalCapitalUsd", "medianRoundUsd", "p25RoundUsd", "p75RoundUsd", "stageMix", "geoMix", "earliestDate", "latestDate", "computedAt"],
    kind: "stats",
  },
  {
    id: "stats-investors",
    label: "Stats · Investors",
    path: "/api/v1/stats/investors",
    icon: BarChart3,
    color: "indigo",
    description: "Aggregates: counts, type mix, top by activity",
    fields: ["investorCount", "activeInvestorCount", "typeMix", "topByActivity", "computedAt"],
    kind: "stats",
  },
  {
    id: "stats-sectors",
    label: "Stats · Sectors",
    path: "/api/v1/stats/sectors",
    icon: BarChart3,
    color: "indigo",
    description: "Full sector catalog with recent activity",
    fields: ["sectors", "totalStartups", "windowDays", "computedAt"],
    kind: "stats",
  },
];

type FilterDef = {
  key: string;
  label: string;
  type: "text" | "select" | "number";
  placeholder: string;
  options?: string[];
  dynamicOptions?: "countries" | "sectors" | "subsectors" | "stages" | "geoFocus";
};

type MetaData = {
  countries: string[];
  sectors: string[];
  subsectors: string[];
  stages: string[];
  geoFocus: string[];
};

const ENDPOINT_FILTERS: Record<string, FilterDef[]> = {
  investors: [
    { key: "id", label: "External ID", type: "text", placeholder: "UUID" },
    { key: "name", label: "Name", type: "text", placeholder: "e.g. Earlybird" },
    { key: "type", label: "Type", type: "select", placeholder: "All", options: ["vc", "pe", "cvc", "angel_group", "family_office", "accelerator", "incubator", "sovereign_wealth", "government", "bank", "hedge_fund"] },
    { key: "country", label: "HQ Country", type: "select", placeholder: "All", dynamicOptions: "countries" },
    { key: "sector", label: "Sector Focus", type: "select", placeholder: "All", dynamicOptions: "sectors" },
    { key: "geo", label: "Geo Focus", type: "select", placeholder: "All", dynamicOptions: "geoFocus" },
    { key: "role", label: "Round Role", type: "select", placeholder: "All", options: ["LEAD", "FOLLOW", "BOTH"] },
    { key: "min_check", label: "Min Check Size (USD)", type: "number", placeholder: "e.g. 500000" },
    { key: "max_check", label: "Max Check Size (USD)", type: "number", placeholder: "e.g. 25000000" },
    { key: "sort", label: "Sort By", type: "select", placeholder: "Activity", options: ["activity", "leads", "deployed", "name", "aum", "updated"] },
    { key: "dir", label: "Direction", type: "select", placeholder: "Descending", options: ["asc", "desc"] },
  ],
  startups: [
    { key: "id", label: "External ID", type: "text", placeholder: "UUID" },
    { key: "name", label: "Name", type: "text", placeholder: "e.g. Celonis" },
    { key: "country", label: "HQ Country", type: "select", placeholder: "All", dynamicOptions: "countries" },
    { key: "sector", label: "Sector", type: "select", placeholder: "All", dynamicOptions: "sectors" },
    { key: "stage", label: "Funding Stage", type: "select", placeholder: "All", dynamicOptions: "stages" },
    { key: "sort", label: "Sort By", type: "select", placeholder: "Name", options: ["name", "founded", "updated"] },
    { key: "dir", label: "Direction", type: "select", placeholder: "Ascending", options: ["asc", "desc"] },
  ],
  investments: [
    { key: "fund", label: "Fund (Name/UUID)", type: "text", placeholder: "e.g. Sequoia" },
    { key: "startup", label: "Startup (Name/UUID)", type: "text", placeholder: "e.g. Klarna" },
    { key: "stage", label: "Funding Stage", type: "select", placeholder: "All", dynamicOptions: "stages" },
    { key: "min_amount", label: "Min Round Size (USD)", type: "number", placeholder: "e.g. 1000000" },
    { key: "max_amount", label: "Max Round Size (USD)", type: "number", placeholder: "e.g. 50000000" },
    { key: "sort", label: "Sort By", type: "select", placeholder: "Date", options: ["date", "amount"] },
    { key: "dir", label: "Direction", type: "select", placeholder: "Descending", options: ["asc", "desc"] },
  ],
  "funding-rounds": [
    { key: "investor", label: "Investor (Name/UUID)", type: "text", placeholder: "e.g. Earlybird" },
    { key: "startup", label: "Startup (Name/UUID)", type: "text", placeholder: "e.g. Celonis" },
    { key: "stage", label: "Funding Stage", type: "select", placeholder: "All", dynamicOptions: "stages" },
    { key: "min_amount", label: "Min Round Size (USD)", type: "number", placeholder: "e.g. 1000000" },
    { key: "max_amount", label: "Max Round Size (USD)", type: "number", placeholder: "e.g. 50000000" },
    { key: "sort", label: "Sort By", type: "select", placeholder: "Date", options: ["date", "amount"] },
    { key: "dir", label: "Direction", type: "select", placeholder: "Descending", options: ["asc", "desc"] },
  ],
  "stats-funding-rounds": [
    { key: "sector_focus", label: "Sector Focus", type: "select", placeholder: "All", dynamicOptions: "sectors" },
    { key: "stage", label: "Funding Stage", type: "select", placeholder: "All", dynamicOptions: "stages" },
    { key: "hq_country", label: "HQ Country", type: "select", placeholder: "All", dynamicOptions: "countries" },
    { key: "date_from", label: "Date From", type: "text", placeholder: "2025-01-01" },
    { key: "date_to", label: "Date To", type: "text", placeholder: "2026-04-23" },
  ],
  "stats-investors": [
    { key: "sector_focus", label: "Sector Focus", type: "select", placeholder: "All", dynamicOptions: "sectors" },
    { key: "hq_country", label: "HQ Country", type: "select", placeholder: "All", dynamicOptions: "countries" },
    { key: "investor_type", label: "Investor Type", type: "select", placeholder: "All", options: ["vc", "pe", "cvc", "angel_group", "family_office", "accelerator", "incubator", "sovereign_wealth", "government", "bank", "hedge_fund"] },
    { key: "active_since", label: "Active Since", type: "text", placeholder: "2025-01-01" },
  ],
  "stats-sectors": [],
};

type HistoryEntry = {
  id: string;
  endpoint: Endpoint;
  url: string;
  status: number;
  duration: number;
  recordCount: number;
  timestamp: Date;
};

type ResponseView = "table" | "json" | "curl";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function CopyBtn({ text, size = "sm" }: { text: string; size?: "sm" | "xs" }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className={`rounded-[6px] transition-all text-white/30 hover:text-white/60 hover:bg-white/[0.06] ${
        size === "xs" ? "p-1" : "p-1.5"
      }`}
      title="Copy"
    >
      {copied ? (
        <Check className={size === "xs" ? "h-3 w-3 text-emerald-400" : "h-3.5 w-3.5 text-emerald-400"} />
      ) : (
        <Copy className={size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      )}
    </button>
  );
}

function CodeSnippet({ label, code }: { label: string; code: string }) {
  return (
    <div className="rounded-[10px] border border-white/[0.06] bg-[#0d0d0f] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06]">
        <span className="text-[11px] font-mono text-white/20">{label}</span>
        <CopyBtn text={code} size="xs" />
      </div>
      <pre className="p-4 text-[12px] font-mono text-white/50 leading-relaxed overflow-x-auto">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function highlightJSON(json: string): string {
  return json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"([^"]+)":/g, '<span class="text-blue-400">"$1"</span>:')
    .replace(/: "([^"]*)"(,?)/g, ': <span class="text-amber-300">"$1"</span>$2')
    .replace(/: (true|false)/g, ': <span class="text-violet-400">$1</span>')
    .replace(/: (null)/g, ': <span class="text-white/25">$1</span>')
    .replace(/: (-?\d+\.?\d*)(,?)/g, ': <span class="text-emerald-400">$1</span>$2');
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (Array.isArray(val)) return val.length ? val.join(", ") : "—";
  if (typeof val === "number") return val.toLocaleString("de-DE");
  return String(val);
}

function formatUsd(val: unknown): string {
  if (val === null || val === undefined) return "—";
  const n = Number(val);
  if (isNaN(n)) return String(val);
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function getEndpointColor(color: string) {
  if (color === "blue") return { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20", dot: "bg-blue-400" };
  if (color === "emerald") return { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20", dot: "bg-emerald-400" };
  if (color === "amber") return { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20", dot: "bg-amber-400" };
  if (color === "indigo") return { bg: "bg-indigo-500/10", text: "text-indigo-400", border: "border-indigo-500/20", dot: "bg-indigo-400" };
  return { bg: "bg-violet-500/10", text: "text-violet-400", border: "border-violet-500/20", dot: "bg-violet-400" };
}

// ---------------------------------------------------------------------------
// Stats Summary view — renders the headline numbers of /stats/* endpoints as
// big stat cards. Falls through to "see JSON" for nested structures.
// ---------------------------------------------------------------------------

function StatCard({ label, value, sub, accent = "indigo" }: { label: string; value: string; sub?: string; accent?: "indigo" | "emerald" | "amber" | "blue" | "violet" }) {
  const accents: Record<string, string> = {
    indigo: "text-indigo-400",
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    blue: "text-blue-400",
    violet: "text-violet-400",
  };
  return (
    <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.02] px-4 py-3 flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.08em] font-medium text-white/30">{label}</span>
      <span className={`text-2xl font-bold tracking-tight ${accents[accent]}`}>{value}</span>
      {sub && <span className="text-[10px] font-mono text-white/30">{sub}</span>}
    </div>
  );
}

function StatsSummary({ endpointId, data }: { endpointId: string; data: Record<string, unknown> }) {
  const n = (v: unknown) => typeof v === "number" ? v : 0;
  const s = (v: unknown) => v == null ? "—" : String(v);

  if (endpointId === "stats-funding-rounds") {
    const stageMix = (data.stageMix as { stage: string | null; roundCount: number; medianUsd: number | null }[]) ?? [];
    const geoMix = (data.geoMix as { country: string | null; roundCount: number }[]) ?? [];
    return (
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard label="Round Count" value={n(data.roundCount).toLocaleString("de-DE")} />
          <StatCard label="Total Capital" value={formatUsd(data.totalCapitalUsd)} accent="emerald" />
          <StatCard label="Median Round" value={formatUsd(data.medianRoundUsd)} accent="blue" sub={`${n(data.amountSampleSize).toLocaleString("de-DE")} sample`} />
          <StatCard label="P25 Round" value={formatUsd(data.p25RoundUsd)} accent="violet" />
          <StatCard label="P75 Round" value={formatUsd(data.p75RoundUsd)} accent="amber" />
        </div>

        <div className="rounded-[10px] border border-white/[0.06] bg-[#0d0d0f] p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] uppercase tracking-[0.08em] font-medium text-white/40">Stage mix</span>
            <span className="text-[10px] font-mono text-white/25">{stageMix.length} stages</span>
          </div>
          <div className="space-y-1.5">
            {stageMix.slice(0, 10).map((row) => (
              <div key={row.stage ?? "?"} className="flex items-center gap-3 text-[12px] font-mono">
                <span className="w-[100px] text-white/60 truncate">{row.stage ?? "—"}</span>
                <span className="text-indigo-400 font-semibold w-[60px]">{n(row.roundCount).toLocaleString("de-DE")}</span>
                <span className="text-emerald-400/70">median {formatUsd(row.medianUsd)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[10px] border border-white/[0.06] bg-[#0d0d0f] p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] uppercase tracking-[0.08em] font-medium text-white/40">Geo mix</span>
            <span className="text-[10px] font-mono text-white/25">{geoMix.length} countries</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1.5">
            {geoMix.slice(0, 16).map((row) => (
              <div key={row.country ?? "?"} className="flex items-center gap-2 text-[12px] font-mono">
                <span className="text-white/50 truncate flex-1">{row.country ?? "—"}</span>
                <span className="text-indigo-400 font-semibold">{n(row.roundCount).toLocaleString("de-DE")}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="text-[10px] font-mono text-white/25 flex items-center gap-4">
          <span>Window: {s(data.earliestDate)} → {s(data.latestDate)}</span>
          <span>computedAt: {s(data.computedAt)}</span>
        </div>
      </div>
    );
  }

  if (endpointId === "stats-investors") {
    const typeMix = (data.typeMix as { type: string | null; count: number }[]) ?? [];
    const top = (data.topByActivity as { externalId: string | null; name: string | null; hq: string | null; dealCount: number; leadCount: number }[]) ?? [];
    return (
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3 md:max-w-md">
          <StatCard label="Investor Count" value={n(data.investorCount).toLocaleString("de-DE")} />
          <StatCard label="Active" value={n(data.activeInvestorCount).toLocaleString("de-DE")} accent="emerald" sub={`${Math.round((n(data.activeInvestorCount) / Math.max(n(data.investorCount), 1)) * 100)}% of pool`} />
        </div>

        <div className="rounded-[10px] border border-white/[0.06] bg-[#0d0d0f] p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] uppercase tracking-[0.08em] font-medium text-white/40">Type mix</span>
            <span className="text-[10px] font-mono text-white/25">{typeMix.length} types</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1.5">
            {typeMix.map((row) => (
              <div key={row.type ?? "?"} className="flex items-center gap-2 text-[12px] font-mono">
                <span className="text-white/50 truncate flex-1">{row.type ?? "—"}</span>
                <span className="text-indigo-400 font-semibold">{n(row.count).toLocaleString("de-DE")}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[10px] border border-white/[0.06] bg-[#0d0d0f] p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] uppercase tracking-[0.08em] font-medium text-white/40">Top by activity</span>
            <span className="text-[10px] font-mono text-white/25">top {top.length}</span>
          </div>
          <div className="space-y-1">
            {top.map((inv, i) => (
              <div key={inv.externalId ?? i} className="flex items-center gap-3 text-[12px] font-mono">
                <span className="w-6 text-white/25">{i + 1}</span>
                <span className="flex-1 text-white/70 font-semibold truncate">{inv.name ?? "—"}</span>
                <span className="text-white/40 truncate w-[140px]">{inv.hq ?? "—"}</span>
                <span className="text-indigo-400 w-[50px] text-right">{n(inv.dealCount)}</span>
                <span className="text-amber-400 w-[50px] text-right">{n(inv.leadCount)} lead</span>
              </div>
            ))}
          </div>
        </div>

        <div className="text-[10px] font-mono text-white/25">computedAt: {s(data.computedAt)}</div>
      </div>
    );
  }

  if (endpointId === "stats-sectors") {
    const sectors = (data.sectors as { primary: string; startupCount: number; recentRoundCount: number; recentAmountUsd: number; subsectors: { label: string; startupCount: number; recentRoundCount: number }[] }[]) ?? [];
    return (
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-3 gap-3 md:max-w-xl">
          <StatCard label="Sectors" value={sectors.length.toLocaleString("de-DE")} />
          <StatCard label="Total Startups" value={n(data.totalStartups).toLocaleString("de-DE")} accent="emerald" />
          <StatCard label="Window" value={`${n(data.windowDays)}d`} accent="amber" />
        </div>

        <div className="rounded-[10px] border border-white/[0.06] bg-[#0d0d0f] overflow-hidden">
          <div className="px-4 py-2 border-b border-white/[0.06]">
            <span className="text-[11px] uppercase tracking-[0.08em] font-medium text-white/40">Sectors · recent window ({n(data.windowDays)}d)</span>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {sectors.slice(0, 25).map((sec) => (
              <div key={sec.primary} className="px-4 py-2 text-[12px] font-mono">
                <div className="flex items-center gap-3">
                  <span className="flex-1 text-white/70 font-semibold truncate">{sec.primary}</span>
                  <span className="text-white/40 w-[80px] text-right">{n(sec.startupCount).toLocaleString("de-DE")} cos</span>
                  <span className="text-indigo-400 w-[80px] text-right">{n(sec.recentRoundCount).toLocaleString("de-DE")} rounds</span>
                  <span className="text-emerald-400/70 w-[80px] text-right">{formatUsd(sec.recentAmountUsd)}</span>
                </div>
                {sec.subsectors.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5 ml-1">
                    {sec.subsectors.slice(0, 6).map((sub) => (
                      <span key={sub.label} className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] bg-white/[0.04] text-white/40">
                        {sub.label}
                        <span className="text-indigo-400/70">{n(sub.recentRoundCount)}</span>
                      </span>
                    ))}
                    {sec.subsectors.length > 6 && (
                      <span className="text-[10px] text-white/25">+{sec.subsectors.length - 6}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="text-[10px] font-mono text-white/25">computedAt: {s(data.computedAt)}</div>
      </div>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PlaygroundPage() {
  const [selectedEndpoint, setSelectedEndpoint] = useState<Endpoint>(ENDPOINTS[0]);
  const [apiKey, setApiKey] = useState("");
  const [limit, setLimit] = useState("10");
  const [updatedSince, setUpdatedSince] = useState("");
  const [cursor, setCursor] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [responseData, setResponseData] = useState<{ data?: Record<string, unknown>[]; pagination?: { cursor: string | null; hasMore: boolean; totalCount?: number; totalCountApproximate?: boolean } } | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<ResponseView>("table");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showParams, setShowParams] = useState(true);
  const [showAuth, setShowAuth] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [autoSent, setAutoSent] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [meta, setMeta] = useState<MetaData | null>(null);
  const [postedOnly, setPostedOnly] = useState(true);
  const responseRef = useRef<HTMLPreElement>(null);

  const activeFilterDefs = ENDPOINT_FILTERS[selectedEndpoint.id] ?? [];
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const setFilter = useCallback((key: string, value: string) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
    setCursor("");
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({});
    setCursor("");
  }, []);

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams();
    const isStats = selectedEndpoint.kind === "stats";
    if (!isStats) {
      if (limit) params.set("limit", limit);
      if (updatedSince) params.set("updated_since", updatedSince);
    }
    for (const [key, val] of Object.entries(filters)) {
      if (val) params.set(key, val);
    }
    if (!isStats && cursor) params.set("cursor", cursor);
    if (!postedOnly) params.set("posted", "all");
    const qs = params.toString();
    return `${selectedEndpoint.path}${qs ? `?${qs}` : ""}`;
  }, [selectedEndpoint, limit, updatedSince, cursor, filters, postedOnly]);

  const buildCurl = useCallback(() => {
    const url = `https://orbit.inventure.capital${buildUrl()}`;
    const parts = [`curl "${url}"`];
    if (apiKey.trim()) {
      parts.push(`  -H "Authorization: Bearer ${apiKey}"`);
    }
    return parts.join(" \\\n");
  }, [buildUrl, apiKey]);

  const handleSend = useCallback(async () => {
    setLoading(true);
    setResponse(null);
    setResponseData(null);
    setStatus(null);
    setDuration(null);
    setExpandedRow(null);

    const start = performance.now();
    const url = buildUrl();
    try {
      const headers: Record<string, string> = {};
      if (apiKey.trim()) {
        headers.Authorization = `Bearer ${apiKey}`;
      }
      const res = await fetch(url, { headers });
      const elapsed = Math.round(performance.now() - start);
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const text = JSON.stringify({ error: "Endpoint not available", status: res.status }, null, 2);
        setResponse(text);
        setStatus(res.status);
        setDuration(elapsed);
      } else {
        const data = await res.json();
        const text = JSON.stringify(data, null, 2);
        setResponse(text);
        setResponseData(data);
        setStatus(res.status);
        setDuration(elapsed);

        // Add to history
        setHistory((prev) => [
          {
            id: crypto.randomUUID(),
            endpoint: selectedEndpoint,
            url,
            status: res.status,
            duration: elapsed,
            recordCount: data?.data?.length ?? 0,
            timestamp: new Date(),
          },
          ...prev.slice(0, 19),
        ]);
      }
    } catch (err) {
      const text = JSON.stringify({ error: "Connection error", detail: String(err) }, null, 2);
      setResponse(text);
      setStatus(0);
      setDuration(Math.round(performance.now() - start));
    } finally {
      setLoading(false);
    }
  }, [apiKey, selectedEndpoint, buildUrl]);

  // Fetch filter options
  useEffect(() => {
    fetch("/api/v1/meta")
      .then((r) => r.json())
      .then((d) => setMeta(d))
      .catch(() => {});
  }, []);

  // Auto-send on first load
  useEffect(() => {
    if (!autoSent) {
      setAutoSent(true);
      handleSend();
    }
  }, [autoSent, handleSend]);

  // Keyboard shortcut: Cmd/Ctrl + Enter to send
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSend();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSend]);

  const handleNextPage = useCallback(() => {
    if (responseData?.pagination?.cursor) {
      setCursor(responseData.pagination.cursor);
      setTimeout(() => handleSend(), 50);
    }
  }, [responseData, handleSend]);

  const handlePrevPage = useCallback(() => {
    setCursor("");
    setTimeout(() => handleSend(), 50);
  }, [handleSend]);

  const switchEndpoint = useCallback((ep: Endpoint) => {
    setSelectedEndpoint(ep);
    setResponse(null);
    setResponseData(null);
    setCursor("");
    setStatus(null);
    setDuration(null);
    setExpandedRow(null);
    setFilters({});
    // Stats endpoints return a flat object, not { data: [] } — JSON is the
    // useful default view.
    if (ep.kind === "stats") setView("json");
    else setView("table");
  }, []);

  const fullUrl = `https://orbit.inventure.capital${buildUrl()}`;
  const jsSnippet = apiKey
    ? `const res = await fetch("${fullUrl}", {\n  headers: { Authorization: "Bearer ${apiKey}" }\n});\nconst data = await res.json();\nconsole.log(data);`
    : `const res = await fetch("${fullUrl}");\nconst data = await res.json();\nconsole.log(data);`;
  const pySnippet = apiKey
    ? `import requests\n\nres = requests.get(\n    "${fullUrl}",\n    headers={"Authorization": "Bearer ${apiKey}"}\n)\ndata = res.json()\nprint(data)`
    : `import requests\n\nres = requests.get("${fullUrl}")\ndata = res.json()\nprint(data)`;

  const ec = getEndpointColor(selectedEndpoint.color);
  const records = responseData?.data ?? [];
  const hasMore = responseData?.pagination?.hasMore ?? false;
  const hasCursor = !!cursor;
  const isStatsEndpoint = selectedEndpoint.kind === "stats";
  const totalCount = responseData?.pagination?.totalCount ?? null;

  // Determine which columns to show in table
  const visibleFields = selectedEndpoint.fields;
  const usdFields = ["aumUsdMillions", "totalRoundSizeUsd", "investmentAmountUsd", "minTicketUsd", "maxTicketUsd", "minRoundUsd", "maxRoundUsd", "checkSizeMinUsd", "checkSizeMaxUsd", "totalDeployedUsd"];

  return (
    <div className="h-screen flex flex-col bg-[#09090b] text-white selection:bg-blue-500/30 overflow-hidden">
      {/* ── Top Nav ── */}
      <nav className="border-b border-white/[0.06] bg-[#0c0c0e]/90 backdrop-blur-xl shrink-0 z-30">
        <div className="px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-white/30 hover:text-white/60 transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="h-4 w-px bg-white/[0.08]" />
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-[5px] bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                <span className="text-[10px] font-bold text-white">O</span>
              </div>
              <span className="text-[14px] font-semibold tracking-[-0.02em]">Orbit API</span>
              <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[9px] font-medium text-white/30">
                v1
              </span>
            </div>
          </div>

          {/* URL Bar */}
          <div className="flex-1 max-w-2xl mx-6">
            <div className="flex items-center gap-2 rounded-[8px] border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5">
              <span className={`rounded-[3px] px-1.5 py-0.5 text-[10px] font-mono font-bold ${ec.bg} ${ec.text}`}>
                GET
              </span>
              <span className="text-[12px] font-mono text-white/40 truncate flex-1">
                {buildUrl()}
              </span>
              <CopyBtn text={`https://orbit.inventure.capital${buildUrl()}`} size="xs" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/20 flex items-center gap-1">
              <Keyboard className="h-3 w-3" />
              <kbd className="rounded border border-white/[0.08] bg-white/[0.04] px-1 py-0.5 text-[9px] font-mono">⌘↵</kbd>
            </span>
            <div className="h-4 w-px bg-white/[0.08]" />
            <Link href="/login" className="text-[12px] text-white/30 hover:text-white/50 transition-colors">
              Sign in
            </Link>
            <Link
              href="mailto:samuel.gassauer@inventure.de?subject=Orbit%20API%20Access"
              className="apple-btn-blue px-3 py-1 text-[12px] font-medium flex items-center gap-1.5"
            >
              Get Access
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Main Layout ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Sidebar ── */}
        <div className="w-[300px] border-r border-white/[0.06] bg-[#0c0c0e]/60 flex flex-col shrink-0 overflow-hidden">
          {/* Endpoint Tabs */}
          <div className="p-3 space-y-3 border-b border-white/[0.06]">
            {(["list", "stats"] as const).map((group) => {
              const items = ENDPOINTS.filter((e) => (group === "stats" ? e.kind === "stats" : e.kind !== "stats"));
              if (!items.length) return null;
              return (
                <div key={group} className="space-y-1">
                  <span className="text-[10px] uppercase tracking-[0.08em] font-medium text-white/20 px-2">
                    {group === "stats" ? "Stats · Aggregates" : "List Endpoints"}
                  </span>
                  {items.map((ep) => {
                    const c = getEndpointColor(ep.color);
                    const active = ep.id === selectedEndpoint.id;
                    return (
                      <button
                        key={ep.id}
                        onClick={() => switchEndpoint(ep)}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[8px] text-left transition-all ${
                          active
                            ? `bg-white/[0.06] ${c.text}`
                            : "text-white/40 hover:bg-white/[0.03] hover:text-white/60"
                        }`}
                      >
                        <div className={`flex h-6 w-6 items-center justify-center rounded-[5px] ${c.bg}`}>
                          <ep.icon className="h-3 w-3" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium truncate">{ep.label}</p>
                          <p className="text-[10px] text-white/20 truncate">{ep.description}</p>
                        </div>
                        {active && <div className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Scrollable config */}
          <div className="flex-1 overflow-auto p-3 space-y-2">
            {/* Parameters Section */}
            <button
              onClick={() => setShowParams(!showParams)}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded-[6px] hover:bg-white/[0.03] transition-colors"
            >
              <div className="flex items-center gap-2">
                <Settings2 className="h-3.5 w-3.5 text-white/25" />
                <span className="text-[11px] uppercase tracking-[0.06em] font-medium text-white/30">
                  Parameter
                </span>
              </div>
              <ChevronDown className={`h-3.5 w-3.5 text-white/20 transition-transform ${showParams ? "" : "-rotate-90"}`} />
            </button>

            {showParams && !isStatsEndpoint && (
              <div className="space-y-3 px-1">
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-white/25 flex items-center gap-1.5 px-1">
                    <Hash className="h-3 w-3" /> limit
                    <span className="text-white/15 ml-auto">
                      max {selectedEndpoint.id === "investors" ? "250" : "500"}
                    </span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    {["10", "50", "100", "250", "500"].map((v) => (
                      <button
                        key={v}
                        onClick={() => setLimit(v)}
                        className={`flex-1 rounded-[6px] py-1.5 text-[11px] font-mono transition-all ${
                          limit === v
                            ? `${ec.bg} ${ec.text} font-semibold`
                            : "bg-white/[0.03] text-white/30 hover:bg-white/[0.06] hover:text-white/50"
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-white/25 flex items-center gap-1.5 px-1">
                    <Clock className="h-3 w-3" /> updated_since
                  </label>
                  <input
                    type="text"
                    value={updatedSince}
                    onChange={(e) => setUpdatedSince(e.target.value)}
                    placeholder="2026-01-01T00:00:00Z"
                    className="w-full rounded-[6px] border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-[11px] font-mono text-white/60 placeholder:text-white/15 focus:border-blue-500/30 focus:outline-none transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-white/25 flex items-center gap-1.5 px-1">
                    <ChevronRight className="h-3 w-3" /> cursor
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={cursor}
                      onChange={(e) => setCursor(e.target.value)}
                      placeholder="Auto-filled on pagination"
                      className="flex-1 rounded-[6px] border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-[11px] font-mono text-white/60 placeholder:text-white/15 focus:border-blue-500/30 focus:outline-none transition-all"
                    />
                    {cursor && (
                      <button
                        onClick={() => setCursor("")}
                        className="rounded-[6px] p-1.5 text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-all"
                        title="Cursor zuruecksetzen"
                      >
                        <RotateCcw className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {showParams && isStatsEndpoint && (
              <div className="px-1 py-2 rounded-[6px] border border-indigo-500/15 bg-indigo-500/[0.04] text-[11px] text-white/40 leading-relaxed">
                <span className="font-medium text-indigo-400">Aggregate endpoint.</span>{" "}
                Single JSON payload, no pagination. Use the filter bar on the right
                to narrow the scope.
              </div>
            )}

            {/* Auth Section */}
            <button
              onClick={() => setShowAuth(!showAuth)}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded-[6px] hover:bg-white/[0.03] transition-colors"
            >
              <div className="flex items-center gap-2">
                <Key className="h-3.5 w-3.5 text-white/25" />
                <span className="text-[11px] uppercase tracking-[0.06em] font-medium text-white/30">
                  Auth
                </span>
                {!apiKey.trim() && (
                  <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400">
                    Public
                  </span>
                )}
              </div>
              <ChevronDown className={`h-3.5 w-3.5 text-white/20 transition-transform ${showAuth ? "" : "-rotate-90"}`} />
            </button>

            {showAuth && (
              <div className="px-1 space-y-1">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="orb_sk_live_..."
                  className="w-full rounded-[6px] border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-[11px] font-mono text-white/60 placeholder:text-white/15 focus:border-blue-500/30 focus:outline-none transition-all"
                />
                <p className="text-[10px] text-white/15 px-1">Optional — API ist ohne Key zugaenglich</p>
              </div>
            )}

            {/* Send Button */}
            <button
              onClick={handleSend}
              disabled={loading}
              className="apple-btn-blue flex items-center justify-center gap-2 w-full py-2.5 text-[13px] font-semibold disabled:opacity-50 mt-2"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="h-3.5 w-3.5" />
              )}
              {loading ? "Loading..." : "Send Request"}
            </button>
          </div>

          {/* History */}
          {history.length > 0 && (
            <div className="border-t border-white/[0.06] p-3 max-h-[200px] overflow-auto">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-[10px] uppercase tracking-[0.08em] font-medium text-white/20">
                  History
                </span>
                <button
                  onClick={() => setHistory([])}
                  className="text-white/15 hover:text-white/40 transition-colors"
                  title="Clear history"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <div className="space-y-0.5">
                {history.map((h) => {
                  const hc = getEndpointColor(h.endpoint.color);
                  return (
                    <button
                      key={h.id}
                      onClick={() => {
                        switchEndpoint(h.endpoint);
                        // Re-fetch after endpoint switch
                        setTimeout(() => handleSend(), 100);
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[6px] hover:bg-white/[0.03] transition-colors group"
                    >
                      <span className={`rounded-[3px] px-1 py-0.5 text-[9px] font-mono font-bold ${hc.bg} ${hc.text}`}>
                        {h.status}
                      </span>
                      <span className="text-[10px] font-mono text-white/25 truncate flex-1 text-left">
                        {h.endpoint.label}
                      </span>
                      <span className="text-[9px] text-white/15 font-mono">
                        {h.duration}ms
                      </span>
                      <span className="text-[9px] text-white/15">
                        {h.recordCount}r
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Main Content ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Info Banner */}
          <div className="border-b border-white/[0.06] bg-indigo-500/[0.03] shrink-0">
            <div className="flex items-center justify-between gap-4 px-4 py-2">
              <div className="flex items-start gap-2 text-[11px] text-white/50 min-w-0">
                <Info className="h-3.5 w-3.5 text-indigo-400 mt-0.5 shrink-0" />
                <span className="truncate">
                  <span className="text-white/70 font-medium">Default scope: manually reviewed rounds only.</span>{" "}
                  Prefer <code className="text-indigo-400">/stats/*</code> for aggregates.{" "}
                  <code className="text-white/60">pagination.totalCount</code> is returned on every page.
                </span>
              </div>

              <div className="shrink-0 flex items-center rounded-[8px] border border-white/[0.08] bg-white/[0.02] p-0.5">
                <button
                  onClick={() => { setPostedOnly(true); setCursor(""); setTimeout(() => handleSend(), 50); }}
                  className={`rounded-[6px] px-2.5 py-1 text-[11px] font-medium transition-all ${
                    postedOnly ? "bg-emerald-500/15 text-emerald-400" : "text-white/35 hover:text-white/55"
                  }`}
                  title="Default: posted (manually reviewed) rounds only"
                >
                  Posted
                </button>
                <button
                  onClick={() => { setPostedOnly(false); setCursor(""); setTimeout(() => handleSend(), 50); }}
                  className={`rounded-[6px] px-2.5 py-1 text-[11px] font-medium transition-all ${
                    !postedOnly ? "bg-amber-500/15 text-amber-400" : "text-white/35 hover:text-white/55"
                  }`}
                  title="Escape hatch: ?posted=all — includes unreviewed rounds"
                >
                  All (incl. unreviewed)
                </button>
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="border-b border-white/[0.06] bg-[#0c0c0e]/60 shrink-0">
            <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto">
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`text-[10px] uppercase tracking-[0.06em] font-medium ${ec.text}`}>
                  Filter
                </span>
                {activeFilterCount > 0 && (
                  <span className={`h-4 min-w-[16px] px-1 rounded-full ${ec.bg} ${ec.text} text-[9px] font-bold flex items-center justify-center`}>
                    {activeFilterCount}
                  </span>
                )}
                <div className="h-3 w-px bg-white/[0.06] mx-1" />
              </div>

              {activeFilterDefs.map((f) => {
                const opts = f.dynamicOptions && meta ? meta[f.dynamicOptions] : f.options;
                return (
                  <div key={f.key} className="shrink-0">
                    {f.type === "select" ? (
                      <select
                        value={filters[f.key] || ""}
                        onChange={(e) => setFilter(f.key, e.target.value)}
                        className={`h-7 rounded-[6px] border bg-[#111113] px-2 pr-6 text-[11px] font-mono appearance-none cursor-pointer transition-all focus:outline-none ${
                          filters[f.key]
                            ? `${ec.border} ${ec.text}`
                            : "border-white/[0.06] text-white/30"
                        }`}
                        style={{
                          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                          backgroundRepeat: "no-repeat",
                          backgroundPosition: "right 6px center",
                        }}
                      >
                        <option value="">{f.label}</option>
                        {opts?.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={f.type}
                        value={filters[f.key] || ""}
                        onChange={(e) => setFilter(f.key, e.target.value)}
                        placeholder={f.label}
                        className={`h-7 w-[120px] rounded-[6px] border bg-[#111113] px-2 text-[11px] font-mono transition-all focus:outline-none focus:border-blue-500/30 ${
                          filters[f.key]
                            ? `${ec.border} ${ec.text}`
                            : "border-white/[0.06] text-white/30 placeholder:text-white/15"
                        }`}
                      />
                    )}
                  </div>
                );
              })}

              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="shrink-0 flex items-center gap-1 h-7 rounded-[6px] px-2 text-[10px] font-medium text-white/25 hover:text-white/50 hover:bg-white/[0.04] transition-all"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </button>
              )}

              <div className="shrink-0 ml-auto">
                <button
                  onClick={handleSend}
                  disabled={loading}
                  className={`flex items-center gap-1.5 h-7 rounded-[6px] px-3 text-[11px] font-semibold transition-all disabled:opacity-50 ${ec.bg} ${ec.text} hover:brightness-125`}
                >
                  {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                  Apply
                </button>
              </div>
            </div>
          </div>

          {/* Response Toolbar */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06] bg-[#0c0c0e]/40 shrink-0">
            <div className="flex items-center gap-2">
              {/* View Tabs */}
              <div className="flex items-center rounded-[8px] border border-white/[0.06] bg-white/[0.02] p-0.5">
                {([
                  { id: "table" as const, icon: Table2, label: isStatsEndpoint ? "Summary" : "Table" },
                  { id: "json" as const, icon: Braces, label: "JSON" },
                  { id: "curl" as const, icon: Terminal, label: "cURL" },
                ] as const).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setView(tab.id)}
                    className={`flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-[11px] font-medium transition-all ${
                      view === tab.id
                        ? "bg-white/[0.08] text-white/70"
                        : "text-white/25 hover:text-white/45"
                    }`}
                  >
                    <tab.icon className="h-3 w-3" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Status badge */}
              {status !== null && (
                <span className={`rounded-[4px] px-2 py-0.5 text-[11px] font-mono font-bold ${
                  status >= 200 && status < 300
                    ? "bg-emerald-500/15 text-emerald-400"
                    : status >= 400
                      ? "bg-red-500/15 text-red-400"
                      : "bg-amber-500/15 text-amber-400"
                }`}>
                  {status}
                </span>
              )}

              {duration !== null && (
                <span className="flex items-center gap-1 text-[10px] font-mono text-white/20">
                  <Clock className="h-3 w-3" />
                  {duration}ms
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Record count + totalCount */}
              {!isStatsEndpoint && records.length > 0 && (
                <span className="text-[10px] font-mono text-white/25 flex items-baseline gap-1">
                  <span className="text-white/60">{records.length.toLocaleString("de-DE")}</span>
                  {totalCount !== null && totalCount > 0 && (
                    <>
                      <span className="text-white/15">/</span>
                      <span className="text-indigo-400 font-semibold" title="pagination.totalCount">
                        {totalCount.toLocaleString("de-DE")}
                      </span>
                    </>
                  )}
                  <span>{records.length === 1 ? "Record" : "Records"}</span>
                </span>
              )}

              {/* Pagination (hide for stats) */}
              {!isStatsEndpoint && responseData && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={handlePrevPage}
                    disabled={!hasCursor || loading}
                    className="rounded-[6px] p-1 text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                    title="Erste Seite"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={handleNextPage}
                    disabled={!hasMore || loading}
                    className="rounded-[6px] p-1 text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                    title="Naechste Seite"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {response && <CopyBtn text={response} size="xs" />}
            </div>
          </div>

          {/* Response Body */}
          <div className="flex-1 overflow-auto min-h-0">
            {loading && (
              <div className="flex items-center justify-center h-full">
                <div className="flex flex-col items-center gap-3">
                  <div className="relative">
                    <div className={`h-10 w-10 rounded-[10px] ${ec.bg} flex items-center justify-center`}>
                      <selectedEndpoint.icon className={`h-5 w-5 ${ec.text}`} />
                    </div>
                    <Loader2 className="absolute -top-1 -right-1 h-4 w-4 text-blue-400 animate-spin" />
                  </div>
                  <span className="text-[12px] text-white/25">Loading {selectedEndpoint.label}...</span>
                </div>
              </div>
            )}

            {!loading && !response && (
              <div className="flex items-center justify-center h-full">
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-[14px] bg-white/[0.02] border border-white/[0.06]">
                    <Zap className="h-6 w-6 text-white/10" />
                  </div>
                  <div>
                    <p className="text-[13px] text-white/25">Select an endpoint and send a request</p>
                    <p className="text-[11px] text-white/15 mt-1">
                      <kbd className="rounded border border-white/[0.08] bg-white/[0.04] px-1 py-0.5 text-[9px] font-mono">⌘</kbd>
                      {" + "}
                      <kbd className="rounded border border-white/[0.08] bg-white/[0.04] px-1 py-0.5 text-[9px] font-mono">↵</kbd>
                      {" to send"}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* STATS SUMMARY VIEW */}
            {!loading && response && view === "table" && isStatsEndpoint && responseData && status !== null && status >= 200 && status < 300 && (
              <StatsSummary endpointId={selectedEndpoint.id} data={responseData as unknown as Record<string, unknown>} />
            )}

            {/* TABLE VIEW */}
            {!loading && response && view === "table" && !isStatsEndpoint && records.length > 0 && (
              <div className="p-3">
                <div className="rounded-[10px] border border-white/[0.06] overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className="w-8 px-3 py-2" />
                        {visibleFields.map((field) => (
                          <th
                            key={field}
                            className="px-3 py-2 text-left text-[10px] uppercase tracking-[0.06em] font-medium text-white/20 whitespace-nowrap"
                          >
                            {field}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((record, i) => (
                        <>
                          <tr
                            key={`row-${i}`}
                            onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                            className={`border-b border-white/[0.04] cursor-pointer transition-colors ${
                              expandedRow === i ? "bg-white/[0.04]" : "hover:bg-white/[0.02]"
                            }`}
                          >
                            <td className="px-3 py-2 text-center">
                              <ChevronRight className={`h-3 w-3 text-white/15 transition-transform inline-block ${expandedRow === i ? "rotate-90" : ""}`} />
                            </td>
                            {visibleFields.map((field) => {
                              const val = record[field];
                              const isUsd = usdFields.includes(field);
                              const isId = field === "externalId" || field.endsWith("ExternalId");
                              const isLogo = field === "logoUrl";
                              const isInvestors = field === "investors" && Array.isArray(val);
                              const isCoInvestors = field === "coInvestors" && Array.isArray(val);
                              const isFundingRounds = field === "fundingRounds" && Array.isArray(val);
                              const isPortfolio = field === "portfolioCompanies" && Array.isArray(val);
                              const isChips = isInvestors || isFundingRounds || isCoInvestors || isPortfolio;
                              return (
                                <td
                                  key={field}
                                  className={`px-3 py-2 text-[12px] font-mono max-w-[300px] ${
                                    isChips ? "whitespace-normal" : "whitespace-nowrap truncate"
                                  } ${
                                    isId ? "text-white/20" : isUsd ? "text-emerald-400/70" : "text-white/50"
                                  }`}
                                  title={isLogo || isChips ? undefined : formatValue(val)}
                                >
                                  {isLogo ? (
                                    val ? (
                                      <img src={String(val)} alt="" className="h-5 w-5 rounded-[4px] object-contain bg-white/10 inline-block" />
                                    ) : (
                                      <span className="text-white/15">—</span>
                                    )
                                  ) : isFundingRounds ? (
                                    <div className="flex flex-wrap gap-1">
                                      {(val as { stage: string | null; amountUsd: number | null; investors: { name: string; role: string }[] }[]).map((round, j) => (
                                        <span
                                          key={j}
                                          className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-emerald-500/12 text-emerald-400"
                                        >
                                          {round.stage || "Round"}{round.amountUsd ? ` $${(round.amountUsd / 1e6).toFixed(1)}M` : ""}
                                          {round.investors.length > 0 && (
                                            <span className="ml-1 text-white/25">({round.investors.length})</span>
                                          )}
                                        </span>
                                      ))}
                                    </div>
                                  ) : isInvestors ? (
                                    <div className="flex flex-wrap gap-1">
                                      {(val as { name: string; role: string }[]).map((inv, j) => (
                                        <span
                                          key={j}
                                          className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                            inv.role === "LEAD"
                                              ? "bg-amber-500/15 text-amber-400"
                                              : "bg-white/[0.06] text-white/40"
                                          }`}
                                        >
                                          {inv.name}
                                        </span>
                                      ))}
                                    </div>
                                  ) : isCoInvestors ? (
                                    <div className="flex flex-wrap gap-1">
                                      {(val as string[]).map((name, j) => (
                                        <span
                                          key={j}
                                          className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-white/[0.06] text-white/40"
                                        >
                                          {name}
                                        </span>
                                      ))}
                                    </div>
                                  ) : isPortfolio ? (
                                    <div className="flex flex-wrap gap-1">
                                      {(val as { name: string | null; latestStage: string | null; latestAmountUsd: number | null; leadCount: number }[]).slice(0, 8).map((pc, j) => (
                                        <span
                                          key={j}
                                          className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                            pc.leadCount > 0 ? "bg-amber-500/12 text-amber-400" : "bg-blue-500/12 text-blue-400"
                                          }`}
                                        >
                                          {pc.name}
                                          {pc.latestStage && <span className="text-white/25">· {pc.latestStage}</span>}
                                        </span>
                                      ))}
                                      {(val as unknown[]).length > 8 && (
                                        <span className="text-[10px] text-white/25">+{(val as unknown[]).length - 8}</span>
                                      )}
                                    </div>
                                  ) : isUsd ? formatUsd(val) : formatValue(val)}
                                </td>
                              );
                            })}
                          </tr>
                          {expandedRow === i && (
                            <tr key={`detail-${i}`}>
                              <td colSpan={visibleFields.length + 1} className="bg-white/[0.02]">
                                <div className="px-6 py-3">
                                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-2">
                                    {Object.entries(record).map(([key, val]) => (
                                      <div key={key} className={`flex flex-col gap-0.5 ${key === "investors" || key === "fundingRounds" || key === "coInvestors" || key === "portfolioCompanies" ? "col-span-2 lg:col-span-3" : ""}`}>
                                        <span className="text-[9px] uppercase tracking-[0.06em] font-medium text-white/15">{key}</span>
                                        {key === "logoUrl" && val ? (
                                          <img src={String(val)} alt="" className="h-8 w-8 rounded-[6px] object-contain bg-white/10" />
                                        ) : key === "fundingRounds" && Array.isArray(val) ? (
                                          <div className="flex flex-col gap-2 mt-1">
                                            {(val as { roundExternalId?: string; stage: string | null; amountUsd: number | null; date: string | null; investors: { externalId?: string; name: string; role: string }[] }[]).map((round, j) => (
                                              <div key={j} className="rounded-[8px] bg-white/[0.03] border border-white/[0.06] px-3 py-2">
                                                <div className="flex items-center gap-2 mb-1.5">
                                                  <span className="text-[11px] font-semibold text-emerald-400">
                                                    {round.stage || "Round"}
                                                  </span>
                                                  {round.amountUsd != null && (
                                                    <span className="text-[11px] font-mono text-emerald-400/60">
                                                      ${(round.amountUsd / 1e6).toFixed(1)}M
                                                    </span>
                                                  )}
                                                  {round.date && (
                                                    <span className="text-[10px] text-white/20 ml-auto">{round.date}</span>
                                                  )}
                                                </div>
                                                {round.investors.length > 0 && (
                                                  <div className="flex flex-wrap gap-1">
                                                    {round.investors.map((inv, k) => (
                                                      <span
                                                        key={k}
                                                        className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                                          inv.role === "LEAD"
                                                            ? "bg-amber-500/15 text-amber-400"
                                                            : "bg-white/[0.06] text-white/40"
                                                        }`}
                                                      >
                                                        {inv.name}
                                                        {inv.role === "LEAD" && (
                                                          <span className="text-[8px] uppercase tracking-wider text-amber-500/60">Lead</span>
                                                        )}
                                                      </span>
                                                    ))}
                                                  </div>
                                                )}
                                              </div>
                                            ))}
                                            {(val as unknown[]).length === 0 && (
                                              <span className="text-[11px] text-white/15 italic">No funding rounds</span>
                                            )}
                                          </div>
                                        ) : key === "investors" && Array.isArray(val) ? (
                                          <div className="flex flex-wrap gap-1.5 mt-0.5">
                                            {(val as { externalId?: string; name: string; role: string }[]).map((inv, j) => (
                                              <span
                                                key={j}
                                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                                  inv.role === "LEAD"
                                                    ? "bg-amber-500/15 text-amber-400"
                                                    : "bg-white/[0.06] text-white/45"
                                                }`}
                                              >
                                                {inv.name}
                                                {inv.role === "LEAD" && (
                                                  <span className="text-[9px] uppercase tracking-wider text-amber-500/60">Lead</span>
                                                )}
                                              </span>
                                            ))}
                                          </div>
                                        ) : key === "coInvestors" && Array.isArray(val) ? (
                                          <div className="flex flex-wrap gap-1.5 mt-0.5">
                                            {(val as string[]).map((name, j) => (
                                              <span
                                                key={j}
                                                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-white/[0.06] text-white/45"
                                              >
                                                {name}
                                              </span>
                                            ))}
                                            {(val as string[]).length === 0 && (
                                              <span className="text-[11px] text-white/15 italic">No co-investors</span>
                                            )}
                                          </div>
                                        ) : key === "portfolioCompanies" && Array.isArray(val) ? (
                                          <div className="flex flex-col gap-1.5 mt-0.5">
                                            {(val as { externalId: string | null; name: string | null; country: string | null; sector: string[]; dealCount: number; leadCount: number; latestStage: string | null; latestAmountUsd: number | null; latestDate: string | null }[]).map((pc, j) => (
                                              <div key={j} className="rounded-[8px] bg-white/[0.03] border border-white/[0.06] px-3 py-1.5 flex items-center gap-3 flex-wrap">
                                                <span className="text-[11px] font-semibold text-white/70">{pc.name}</span>
                                                {pc.country && (
                                                  <span className="text-[10px] text-white/30">{pc.country}</span>
                                                )}
                                                {pc.latestStage && (
                                                  <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-emerald-500/12 text-emerald-400">
                                                    {pc.latestStage}
                                                  </span>
                                                )}
                                                {pc.latestAmountUsd != null && (
                                                  <span className="text-[10px] font-mono text-emerald-400/60">
                                                    ${(pc.latestAmountUsd / 1e6).toFixed(1)}M
                                                  </span>
                                                )}
                                                {pc.leadCount > 0 && (
                                                  <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium bg-amber-500/15 text-amber-400 uppercase tracking-wider">
                                                    Lead ×{pc.leadCount}
                                                  </span>
                                                )}
                                                <span className="text-[10px] text-white/25 ml-auto">
                                                  {pc.dealCount} {pc.dealCount === 1 ? "deal" : "deals"}
                                                  {pc.latestDate ? ` · ${pc.latestDate}` : ""}
                                                </span>
                                              </div>
                                            ))}
                                            {(val as unknown[]).length === 0 && (
                                              <span className="text-[11px] text-white/15 italic">No portfolio companies</span>
                                            )}
                                          </div>
                                        ) : (
                                          <span className={`text-[11px] font-mono break-all ${
                                            val === null ? "text-white/15 italic" : "text-white/50"
                                          }`}>
                                            {val === null ? "null" : typeof val === "object" ? JSON.stringify(val) : String(val)}
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                  {selectedEndpoint.id === "investors" && record.externalId != null && (
                                    <button
                                      className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-[11px] font-medium text-white/50 hover:text-white/70 transition-colors"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const fundingRoundsEp = ENDPOINTS.find((ep) => ep.id === "funding-rounds")!;
                                        setSelectedEndpoint(fundingRoundsEp);
                                        setFilters({ investor: String(record.externalId) });
                                        setCursor("");
                                        setExpandedRow(null);
                                        setTimeout(() => handleSend(), 100);
                                      }}
                                    >
                                      <Handshake className="h-3 w-3" />
                                      View investments
                                      <ArrowUpRight className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Footer */}
                {(hasMore || hasCursor) && (
                  <div className="flex items-center justify-between mt-3 px-1">
                    <span className="text-[10px] text-white/15 font-mono">
                      {records.length} Records{hasMore ? " (more available)" : ""}
                    </span>
                    <div className="flex items-center gap-2">
                      {hasCursor && (
                        <button
                          onClick={handlePrevPage}
                          disabled={loading}
                          className="flex items-center gap-1 rounded-[6px] border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-[11px] text-white/30 hover:text-white/50 hover:bg-white/[0.04] transition-all disabled:opacity-30"
                        >
                          <ChevronLeft className="h-3 w-3" /> Erste Seite
                        </button>
                      )}
                      {hasMore && (
                        <button
                          onClick={handleNextPage}
                          disabled={loading}
                          className={`flex items-center gap-1 rounded-[6px] border px-2.5 py-1 text-[11px] font-medium transition-all disabled:opacity-30 ${ec.border} ${ec.bg} ${ec.text} hover:brightness-125`}
                        >
                          Naechste Seite <ChevronRight className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TABLE VIEW — no records */}
            {!loading && response && view === "table" && !isStatsEndpoint && records.length === 0 && status !== null && status >= 200 && status < 300 && (
              <div className="flex items-center justify-center h-full">
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className={`h-12 w-12 rounded-[10px] ${ec.bg} flex items-center justify-center`}>
                    <selectedEndpoint.icon className={`h-5 w-5 ${ec.text} opacity-30`} />
                  </div>
                  <p className="text-[13px] text-white/25">No data found</p>
                  <p className="text-[11px] text-white/15">Try different filters or another endpoint</p>
                </div>
              </div>
            )}

            {/* TABLE VIEW — error */}
            {!loading && response && view === "table" && !records.length && status !== null && (status < 200 || status >= 300) && (
              <div className="p-4">
                <pre
                  className="p-4 text-[12px] font-mono leading-relaxed rounded-[10px] border border-red-500/10 bg-red-500/[0.03]"
                  dangerouslySetInnerHTML={{ __html: highlightJSON(response) }}
                />
              </div>
            )}

            {/* JSON VIEW */}
            {!loading && response && view === "json" && (
              <div className="relative">
                <pre
                  ref={responseRef}
                  className="p-4 text-[12px] font-mono leading-relaxed overflow-auto h-full"
                  dangerouslySetInnerHTML={{ __html: highlightJSON(response) }}
                />
                <div className="absolute top-3 right-3">
                  <CopyBtn text={response} />
                </div>
              </div>
            )}

            {/* CURL VIEW */}
            {!loading && view === "curl" && (
              <div className="p-4 space-y-4">
                <div className="rounded-[10px] border border-white/[0.06] bg-[#0d0d0f] overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06]">
                    <span className="text-[11px] font-mono text-white/20">cURL</span>
                    <CopyBtn text={buildCurl()} size="xs" />
                  </div>
                  <pre className="p-4 text-[12px] font-mono text-white/50 leading-relaxed">
                    <code>{buildCurl()}</code>
                  </pre>
                </div>

                <CodeSnippet
                  label="JavaScript / TypeScript"
                  code={jsSnippet}
                />

                <CodeSnippet
                  label="Python"
                  code={pySnippet}
                />

                {/* Schema Info */}
                <div className="rounded-[10px] border border-white/[0.06] bg-[#0d0d0f] overflow-hidden">
                  <div className="px-4 py-2 border-b border-white/[0.06]">
                    <span className="text-[11px] font-mono text-white/20">Response Schema — {selectedEndpoint.label}</span>
                  </div>
                  <div className="p-4 space-y-1.5">
                    {selectedEndpoint.fields.map((f) => (
                      <div key={f} className="flex items-center gap-3">
                        <span className="text-[11px] font-mono text-blue-400 w-[180px]">{f}</span>
                        <span className="text-[10px] text-white/15 font-mono">
                          {usdFields.includes(f) ? "number | null" :
                           f === "dealCount" || f === "leadCount" ? "number" :
                           f === "portfolioCompanies" ? "Array<{ externalId, name, country, sector[], dealCount, leadCount, latestStage, latestAmountUsd, latestDate }>" :
                           f === "fundingRounds" ? "Array<{ roundExternalId, stage, amountUsd, date, investors[] }>" :
                           f === "investors" ? "Array<{ externalId, name, role }>" :
                           f === "coInvestors" ? "string[]" :
                           f === "stages" || f === "stageFocus" || f === "sectorFocus" || f === "geoFocus" || f === "sector" ? "string[]" :
                           f.endsWith("Date") || f.endsWith("At") ? "string (ISO date) | null" :
                           "string | null"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
