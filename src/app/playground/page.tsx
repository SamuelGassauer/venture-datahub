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
};

const ENDPOINTS: Endpoint[] = [
  {
    id: "investors",
    label: "Investors",
    path: "/api/v1/investors",
    icon: Landmark,
    color: "blue",
    description: "VC Funds, Angels & Investment-Firmen",
    fields: ["externalId", "name", "logoUrl", "dealCount", "hqCity", "hqCountry", "stages", "sectors", "geoFocus", "roundRole", "website"],
  },
  {
    id: "startups",
    label: "Startups",
    path: "/api/v1/startups",
    icon: Building2,
    color: "emerald",
    description: "Venture-finanzierte Unternehmen",
    fields: ["externalId", "name", "hq", "sector", "stage", "foundedAt", "website"],
  },
  {
    id: "investments",
    label: "Investments",
    path: "/api/v1/investments",
    icon: Handshake,
    color: "violet",
    description: "Beteiligungen & Funding Rounds",
    fields: ["roundExternalId", "startupName", "stage", "amountUsd", "investors", "date"],
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
    { key: "name", label: "Name", type: "text", placeholder: "z.B. Earlybird" },
    { key: "country", label: "Land", type: "select", placeholder: "Alle", dynamicOptions: "countries" },
    { key: "sector", label: "Sektor", type: "select", placeholder: "Alle", dynamicOptions: "sectors" },
    { key: "geo", label: "Geo-Fokus", type: "select", placeholder: "Alle", dynamicOptions: "geoFocus" },
    { key: "role", label: "Rolle", type: "select", placeholder: "Alle", options: ["lead", "co-investor", "both"] },
    { key: "sort", label: "Sortierung", type: "select", placeholder: "Aktivitaet", options: ["activity", "name", "aum", "updated"] },
    { key: "dir", label: "Richtung", type: "select", placeholder: "Absteigend", options: ["asc", "desc"] },
  ],
  startups: [
    { key: "name", label: "Name", type: "text", placeholder: "z.B. Celonis" },
    { key: "country", label: "Land", type: "select", placeholder: "Alle", dynamicOptions: "countries" },
    { key: "sector", label: "Sektor", type: "select", placeholder: "Alle", dynamicOptions: "sectors" },
    { key: "stage", label: "Stage", type: "select", placeholder: "Alle", dynamicOptions: "stages" },
    { key: "sort", label: "Sortierung", type: "select", placeholder: "Name", options: ["name", "founded", "updated"] },
    { key: "dir", label: "Richtung", type: "select", placeholder: "Aufsteigend", options: ["asc", "desc"] },
  ],
  investments: [
    { key: "investor", label: "Investor", type: "text", placeholder: "Name oder UUID" },
    { key: "startup", label: "Startup", type: "text", placeholder: "Name oder UUID" },
    { key: "stage", label: "Stage", type: "select", placeholder: "Alle", dynamicOptions: "stages" },
    { key: "min_amount", label: "Min USD", type: "number", placeholder: "z.B. 1000000" },
    { key: "max_amount", label: "Max USD", type: "number", placeholder: "z.B. 50000000" },
    { key: "sort", label: "Sortierung", type: "select", placeholder: "Datum", options: ["date", "amount"] },
    { key: "dir", label: "Richtung", type: "select", placeholder: "Absteigend", options: ["asc", "desc"] },
  ],
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
      title="Kopieren"
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
  return { bg: "bg-violet-500/10", text: "text-violet-400", border: "border-violet-500/20", dot: "bg-violet-400" };
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
  const [responseData, setResponseData] = useState<{ data?: Record<string, unknown>[]; pagination?: { cursor: string | null; hasMore: boolean } } | null>(null);
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
    if (limit) params.set("limit", limit);
    if (updatedSince) params.set("updated_since", updatedSince);
    // Add active filters
    for (const [key, val] of Object.entries(filters)) {
      if (val) params.set(key, val);
    }
    if (cursor) params.set("cursor", cursor);
    const qs = params.toString();
    return `${selectedEndpoint.path}${qs ? `?${qs}` : ""}`;
  }, [selectedEndpoint, limit, updatedSince, cursor, filters]);

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
        const text = JSON.stringify({ error: "Endpoint nicht verfuegbar", status: res.status }, null, 2);
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
      const text = JSON.stringify({ error: "Verbindungsfehler", detail: String(err) }, null, 2);
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

  // Determine which columns to show in table
  const visibleFields = selectedEndpoint.fields;
  const usdFields = ["aumUsdMillions", "totalRoundSizeUsd", "investmentAmountUsd", "minTicketUsd", "maxTicketUsd"];

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
              href="mailto:sam@inventure.capital?subject=Orbit%20API%20Access"
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
          <div className="p-3 space-y-1 border-b border-white/[0.06]">
            <span className="text-[10px] uppercase tracking-[0.08em] font-medium text-white/20 px-2">
              Endpoints
            </span>
            {ENDPOINTS.map((ep) => {
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

            {showParams && (
              <div className="space-y-3 px-1">
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-white/25 flex items-center gap-1.5 px-1">
                    <Hash className="h-3 w-3" /> limit
                  </label>
                  <div className="flex items-center gap-1.5">
                    {["5", "10", "25", "50", "100"].map((v) => (
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
                      placeholder="Automatisch bei Pagination"
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
                  Verlauf
                </span>
                <button
                  onClick={() => setHistory([])}
                  className="text-white/15 hover:text-white/40 transition-colors"
                  title="Verlauf loeschen"
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
                  { id: "table" as const, icon: Table2, label: "Table" },
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
              {/* Record count */}
              {records.length > 0 && (
                <span className="text-[10px] font-mono text-white/20">
                  {records.length} {records.length === 1 ? "Record" : "Records"}
                </span>
              )}

              {/* Pagination */}
              {responseData && (
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
                  <span className="text-[12px] text-white/25">Lade {selectedEndpoint.label}...</span>
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
                    <p className="text-[13px] text-white/25">Waehle einen Endpoint und sende einen Request</p>
                    <p className="text-[11px] text-white/15 mt-1">
                      <kbd className="rounded border border-white/[0.08] bg-white/[0.04] px-1 py-0.5 text-[9px] font-mono">⌘</kbd>
                      {" + "}
                      <kbd className="rounded border border-white/[0.08] bg-white/[0.04] px-1 py-0.5 text-[9px] font-mono">↵</kbd>
                      {" zum Senden"}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TABLE VIEW */}
            {!loading && response && view === "table" && records.length > 0 && (
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
                              return (
                                <td
                                  key={field}
                                  className={`px-3 py-2 text-[12px] font-mono max-w-[300px] ${
                                    isInvestors ? "whitespace-normal" : "whitespace-nowrap truncate"
                                  } ${
                                    isId ? "text-white/20" : isUsd ? "text-emerald-400/70" : "text-white/50"
                                  }`}
                                  title={isLogo || isInvestors ? undefined : formatValue(val)}
                                >
                                  {isLogo ? (
                                    val ? (
                                      <img src={String(val)} alt="" className="h-5 w-5 rounded-[4px] object-contain bg-white/10 inline-block" />
                                    ) : (
                                      <span className="text-white/15">—</span>
                                    )
                                  ) : isInvestors ? (
                                    <div className="flex flex-wrap gap-1">
                                      {(val as { name: string; role: string }[]).map((inv, j) => (
                                        <span
                                          key={j}
                                          className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                            inv.role === "lead"
                                              ? "bg-amber-500/15 text-amber-400"
                                              : "bg-white/[0.06] text-white/40"
                                          }`}
                                        >
                                          {inv.name}
                                        </span>
                                      ))}
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
                                      <div key={key} className={`flex flex-col gap-0.5 ${key === "investors" ? "col-span-2 lg:col-span-3" : ""}`}>
                                        <span className="text-[9px] uppercase tracking-[0.06em] font-medium text-white/15">{key}</span>
                                        {key === "logoUrl" && val ? (
                                          <img src={String(val)} alt="" className="h-8 w-8 rounded-[6px] object-contain bg-white/10" />
                                        ) : key === "investors" && Array.isArray(val) ? (
                                          <div className="flex flex-wrap gap-1.5 mt-0.5">
                                            {(val as { externalId?: string; name: string; role: string }[]).map((inv, j) => (
                                              <span
                                                key={j}
                                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                                  inv.role === "lead"
                                                    ? "bg-amber-500/15 text-amber-400"
                                                    : "bg-white/[0.06] text-white/45"
                                                }`}
                                              >
                                                {inv.name}
                                                {inv.role === "lead" && (
                                                  <span className="text-[9px] uppercase tracking-wider text-amber-500/60">Lead</span>
                                                )}
                                              </span>
                                            ))}
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
                                        const investmentsEp = ENDPOINTS.find((ep) => ep.id === "investments")!;
                                        setSelectedEndpoint(investmentsEp);
                                        setFilters({ investor: String(record.externalId) });
                                        setCursor("");
                                        setExpandedRow(null);
                                        setTimeout(() => handleSend(), 100);
                                      }}
                                    >
                                      <Handshake className="h-3 w-3" />
                                      Investments anzeigen
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
                      {records.length} Records{hasMore ? " (weitere verfuegbar)" : ""}
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
            {!loading && response && view === "table" && records.length === 0 && status !== null && status >= 200 && status < 300 && (
              <div className="flex items-center justify-center h-full">
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className={`h-12 w-12 rounded-[10px] ${ec.bg} flex items-center justify-center`}>
                    <selectedEndpoint.icon className={`h-5 w-5 ${ec.text} opacity-30`} />
                  </div>
                  <p className="text-[13px] text-white/25">Keine Daten gefunden</p>
                  <p className="text-[11px] text-white/15">Probier andere Filter oder einen anderen Endpoint</p>
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
                           f.endsWith("Focus") || f === "sector" ? "string[]" :
                           f.endsWith("At") ? "string (ISO date) | null" :
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
