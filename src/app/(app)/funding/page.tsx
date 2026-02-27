"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowUpDown,
  ExternalLink,
  Search,
  ChevronDown,
  ChevronRight,
  Newspaper,
  Check,
  Loader2,
  Upload,
  Ban,
} from "lucide-react";
import type { GroupedRound } from "@/app/api/funding/grouped/route";

// --- Pipeline Types ---

type PipelineResult = {
  input: {
    articleTitle: string;
    articleUrl: string;
    rawExcerpt: string | null;
    regexExtraction: {
      companyName: string;
      amountUsd: number | null;
      stage: string | null;
      confidence: number;
    } | null;
  };
  llmOutput: {
    companyName: string;
    amountUsd: number | null;
    currency: string;
    stage: string | null;
    investors: string[];
    leadInvestor: string | null;
    country: string | null;
    confidence: number;
  };
  graph: {
    nodes: string[];
    edges: string[];
  };
};

// --- Helpers ---

const STAGES = [
  "Pre-Seed", "Seed", "Series A", "Series B", "Series C",
  "Series D", "Series E+", "Bridge", "Growth", "Debt", "Grant",
];

function fmtAmt(n: number | null | undefined): string {
  if (!n) return "\u2014";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtStage(s: string | null | undefined): string {
  if (!s) return "\u2014";
  const map: Record<string, string> = {
    "Pre-Seed": "Pre-S", Seed: "Seed", "Series A": "S-A",
    "Series B": "S-B", "Series C": "S-C", "Series D": "S-D",
    "Series E+": "S-E+", Bridge: "Brdg", Growth: "Grwth",
    Debt: "Debt", Grant: "Grant",
  };
  return map[s] || s;
}

function fmtTime(d: string | null): string {
  if (!d) return "\u2014";
  const date = new Date(d);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  return `${Math.floor(days / 30)}mo`;
}

function confDot(c: number): string {
  if (c >= 0.8) return "bg-emerald-500";
  if (c >= 0.6) return "bg-yellow-500";
  return "bg-orange-500";
}

function sourcesBadge(count: number): string {
  if (count >= 3) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
  if (count >= 2) return "bg-blue-500/15 text-blue-700 dark:text-blue-400";
  return "bg-foreground/[0.04] text-foreground/45";
}

// --- Component ---

export default function FundingPage() {
  const [rounds, setRounds] = useState<GroupedRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [sortBy, setSortBy] = useState("lastSeen");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [ingesting, setIngesting] = useState<Set<string>>(new Set());
  const [ingestResults, setIngestResults] = useState<Map<string, PipelineResult>>(new Map());
  const [ingestErrors, setIngestErrors] = useState<Map<string, string>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkIngesting, setBulkIngesting] = useState(false);
  const [dismissing, setDismissing] = useState<Set<string>>(new Set());

  const loadRounds = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ sortBy, sortOrder });
    if (stageFilter) params.set("stage", stageFilter);
    if (countryFilter) params.set("country", countryFilter);
    if (searchDebounced) params.set("search", searchDebounced);

    const res = await fetch(`/api/funding/grouped?${params}`);
    const data = await res.json();
    setRounds(data.data);
    setLoading(false);
  }, [stageFilter, countryFilter, searchDebounced, sortBy, sortOrder]);

  useEffect(() => {
    loadRounds();
  }, [loadRounds]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounced(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  function toggleSort(field: string) {
    if (sortBy === field) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  }

  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelect(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelectAll() {
    const pending = rounds.filter((r) => !r.ingestedAt && !r.dismissedAt);
    if (selected.size === pending.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pending.map((r) => r.key)));
    }
  }

  async function handleIngest(round: GroupedRound) {
    setIngesting((prev) => new Set(prev).add(round.key));
    setIngestErrors((prev) => { const next = new Map(prev); next.delete(round.key); return next; });
    try {
      const res = await fetch("/api/funding/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: round.key,
          articleIds: round.sources.map((s) => s.articleId),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const msg = json.error || `HTTP ${res.status}`;
        console.error("Ingest failed:", msg);
        setIngestErrors((prev) => new Map(prev).set(round.key, msg));
        return;
      }
      if (json.pipeline) {
        setIngestResults((prev) => new Map(prev).set(round.key, json.pipeline as PipelineResult));
        setExpanded((prev) => new Set(prev).add(round.key));
      }
      setRounds((prev) =>
        prev.map((r) =>
          r.key === round.key ? { ...r, ingestedAt: new Date().toISOString() } : r
        )
      );
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(round.key);
        return next;
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Network error";
      console.error("Ingest error:", e);
      setIngestErrors((prev) => new Map(prev).set(round.key, msg));
    } finally {
      setIngesting((prev) => {
        const next = new Set(prev);
        next.delete(round.key);
        return next;
      });
    }
  }

  async function handleBulkIngest() {
    setBulkIngesting(true);
    const selectedRounds = rounds.filter((r) => selected.has(r.key) && !r.ingestedAt);
    for (const round of selectedRounds) {
      await handleIngest(round);
    }
    setBulkIngesting(false);
  }

  async function handleDismiss(round: GroupedRound) {
    setDismissing((prev) => new Set(prev).add(round.key));
    try {
      const articleIds = round.sources.map((s) => s.articleId);
      const res = await fetch("/api/funding/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleIds }),
      });
      if (!res.ok) {
        console.error("Dismiss failed:", await res.text());
        return;
      }
      setRounds((prev) => prev.filter((r) => r.key !== round.key));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(round.key);
        return next;
      });
    } finally {
      setDismissing((prev) => {
        const next = new Set(prev);
        next.delete(round.key);
        return next;
      });
    }
  }

  async function handleBulkDismiss() {
    const selectedRounds = rounds.filter((r) => selected.has(r.key) && !r.dismissedAt);
    for (const round of selectedRounds) {
      await handleDismiss(round);
    }
  }

  const countries = Array.from(new Set(rounds.map((r) => r.country).filter(Boolean))).sort() as string[];

  const totalAmount = rounds.reduce((sum, r) => sum + (r.amountUsd || 0), 0);
  const multiSource = rounds.filter((r) => r.sourceCount > 1).length;
  const ingestedCount = rounds.filter((r) => r.ingestedAt).length;
  const pendingCount = rounds.length - ingestedCount;
  const ingestPct = rounds.length > 0 ? Math.round((ingestedCount / rounds.length) * 100) : 0;

  const SortIcon = ({ field }: { field: string }) => (
    <ArrowUpDown
      className={`ml-0.5 inline h-3 w-3 ${
        sortBy === field ? "text-foreground" : "text-foreground/30"
      }`}
    />
  );

  const pendingRounds = rounds.filter((r) => !r.ingestedAt && !r.dismissedAt);
  const allPendingSelected = pendingRounds.length > 0 && selected.size === pendingRounds.length;

  return (
    <div className="flex h-[calc(100vh-1.5rem)] flex-col">
      {/* Toolbar */}
      <div className="glass-status-bar flex items-center gap-2 px-4 py-2.5 text-[13px] tracking-[-0.01em]">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/30" />
          <input
            placeholder="Search companies..."
            className="glass-search-input h-8 w-full pl-8 pr-3 text-[13px] tracking-[-0.01em]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="glass-search-input h-8 px-2.5 text-[13px] tracking-[-0.01em]"
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
        >
          <option value="">All stages</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          className="glass-search-input h-8 px-2.5 text-[13px] tracking-[-0.01em]"
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
        >
          <option value="">All countries</option>
          {countries.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-3 text-foreground/35 tabular-nums">
          <span>{rounds.length} rounds</span>
          <span>&middot;</span>
          <span>{fmtAmt(totalAmount)} total</span>
          <span>&middot;</span>
          <span className="text-emerald-600 dark:text-emerald-400">{multiSource} multi-source</span>
        </div>
      </div>

      {/* Status-Bar + Bulk Actions */}
      {!loading && rounds.length > 0 && (
        <div className="glass-status-bar flex items-center gap-3 px-4 py-2 text-[13px] tracking-[-0.01em] text-foreground/40">
          <span className="tabular-nums">
            {rounds.length} rounds &middot; {ingestedCount} ingested &middot; {pendingCount} pending
          </span>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-24 rounded-full bg-foreground/[0.04] overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${ingestPct}%` }}
              />
            </div>
            <span className="tabular-nums text-[10px] text-foreground/35">{ingestPct}%</span>
          </div>
          {selected.size > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-foreground/85 font-medium">{selected.size} selected</span>
              <button
                onClick={handleBulkIngest}
                disabled={bulkIngesting}
                className="glass-capsule-btn h-7 px-2.5 text-[11px] font-medium inline-flex items-center gap-1 disabled:opacity-50"
              >
                {bulkIngesting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Upload className="h-3 w-3" />
                )}
                Sync to Neo4j
              </button>
              <button
                onClick={handleBulkDismiss}
                className="glass-capsule-btn h-7 px-2.5 text-[11px] font-medium text-red-500 inline-flex items-center gap-1"
              >
                <Ban className="h-3 w-3" />
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto p-4">
        <div className="lg-inset rounded-[16px]">
          {loading ? (
            <div className="space-y-1 p-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="h-7 rounded-[6px]" />
              ))}
            </div>
          ) : rounds.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-[13px] text-foreground/40">
              No funding rounds found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="glass-table-header hover:bg-transparent">
                  <TableHead className="w-[32px] text-[11px] px-1">
                    <Checkbox
                      checked={allPendingSelected}
                      onCheckedChange={toggleSelectAll}
                      className="h-3.5 w-3.5"
                    />
                  </TableHead>
                  <TableHead className="w-[24px] text-[11px]"></TableHead>
                  <TableHead
                    className="cursor-pointer text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35"
                    onClick={() => toggleSort("company")}
                  >
                    Company <SortIcon field="company" />
                  </TableHead>
                  <TableHead
                    className="w-[80px] cursor-pointer text-right text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35"
                    onClick={() => toggleSort("amount")}
                  >
                    Amount <SortIcon field="amount" />
                  </TableHead>
                  <TableHead className="w-[52px] text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35">Stage</TableHead>
                  <TableHead className="w-[44px] text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35">Ctry</TableHead>
                  <TableHead className="w-[140px] text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35">Lead Investor</TableHead>
                  <TableHead
                    className="w-[64px] cursor-pointer text-center text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35"
                    onClick={() => toggleSort("sources")}
                  >
                    Sources <SortIcon field="sources" />
                  </TableHead>
                  <TableHead
                    className="w-[52px] cursor-pointer text-right text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35"
                    onClick={() => toggleSort("confidence")}
                  >
                    Conf <SortIcon field="confidence" />
                  </TableHead>
                  <TableHead
                    className="w-[52px] cursor-pointer text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35"
                    onClick={() => toggleSort("lastSeen")}
                  >
                    Seen <SortIcon field="lastSeen" />
                  </TableHead>
                  <TableHead className="w-[72px] text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35 text-center">Neo4j</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rounds.map((round) => {
                  const isExpanded = expanded.has(round.key);
                  const isSelected = selected.has(round.key);
                  const pipelineResult = ingestResults.get(round.key);
                  return (
                    <Fragment key={round.key}>
                      <TableRow
                        className={`lg-inset-table-row cursor-pointer text-[13px] tracking-[-0.01em] ${
                          isSelected ? "bg-blue-500/10" : round.sourceCount > 1 ? "bg-emerald-500/[0.04]" : ""
                        } ${isExpanded ? "bg-foreground/[0.04]" : ""} ${
                          round.ingestedAt ? "opacity-45" : ""
                        }`}
                        onClick={() => toggleExpand(round.key)}
                      >
                        <TableCell className="py-1.5 px-1 text-center" onClick={(e) => e.stopPropagation()}>
                          {!round.ingestedAt && !round.dismissedAt && (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelect(round.key)}
                              className="h-3.5 w-3.5"
                            />
                          )}
                        </TableCell>
                        <TableCell className="py-1.5 px-1 text-center">
                          {round.sourceCount > 1 || ingestResults.has(round.key) ? (
                            isExpanded ? (
                              <ChevronDown className="h-3 w-3 text-foreground/40" />
                            ) : (
                              <ChevronRight className="h-3 w-3 text-foreground/40" />
                            )
                          ) : null}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 font-semibold text-foreground/85">
                          {round.companyName}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap text-foreground/70">
                          {fmtAmt(round.amountUsd)}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 whitespace-nowrap">
                          {round.stage ? (
                            <span className="rounded-[6px] bg-foreground/[0.04] px-1 py-0.5 text-[10px] font-medium text-foreground/55">
                              {fmtStage(round.stage)}
                            </span>
                          ) : (
                            <span className="text-foreground/30">&mdash;</span>
                          )}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 whitespace-nowrap text-[10px] text-foreground/55">
                          {round.country ? (
                            <span title={round.country}>{round.country.slice(0, 3).toUpperCase()}</span>
                          ) : (
                            <span className="text-foreground/30">&mdash;</span>
                          )}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 truncate max-w-[140px] text-foreground/55" title={round.leadInvestor || ""}>
                          {round.leadInvestor || <span className="text-foreground/30">&mdash;</span>}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-center">
                          <span
                            className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${sourcesBadge(round.sourceCount)}`}
                            style={{ border: "0.5px solid rgba(0,0,0,0.06)" }}
                          >
                            <Newspaper className="h-2.5 w-2.5" />
                            {round.sourceCount}
                          </span>
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">
                          <span className="inline-flex items-center gap-0.5">
                            <span className={`inline-block h-1.5 w-1.5 rounded-full ${confDot(round.maxConfidence)}`} />
                            <span className="font-mono text-[10px] text-foreground/55">{(round.maxConfidence * 100).toFixed(0)}</span>
                          </span>
                        </TableCell>
                        <TableCell className="py-1.5 px-2 tabular-nums text-foreground/30 whitespace-nowrap">
                          {fmtTime(round.lastSeen)}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            {round.ingestedAt ? (
                              <Check className="h-3.5 w-3.5 text-emerald-500" />
                            ) : ingesting.has(round.key) ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground/40" />
                            ) : ingestErrors.has(round.key) ? (
                              <button
                                onClick={() => handleIngest(round)}
                                className="glass-capsule-btn h-6 w-6 flex items-center justify-center text-red-500"
                                title={ingestErrors.get(round.key)}
                              >
                                <Upload className="h-3 w-3" />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleIngest(round)}
                                className="glass-capsule-btn h-6 w-6 flex items-center justify-center"
                                title="Sync to Neo4j"
                              >
                                <Upload className="h-3 w-3" />
                              </button>
                            )}
                            {!round.ingestedAt && !round.dismissedAt && (
                              dismissing.has(round.key) ? (
                                <Loader2 className="h-3 w-3 animate-spin text-foreground/40" />
                              ) : (
                                <button
                                  onClick={() => handleDismiss(round)}
                                  className="glass-capsule-btn h-6 w-6 flex items-center justify-center text-foreground/30 hover:text-red-500"
                                  title="Dismiss"
                                >
                                  <Ban className="h-3 w-3" />
                                </button>
                              )
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {/* Expanded source rows */}
                      {isExpanded && round.sources.map((src, i) => (
                        <TableRow
                          key={`${round.key}-${i}`}
                          className="text-[13px] tracking-[-0.01em] bg-foreground/[0.02] hover:bg-foreground/[0.04]"
                        >
                          <TableCell className="py-1 px-1"></TableCell>
                          <TableCell className="py-1 px-1"></TableCell>
                          <TableCell className="py-1 px-2 pl-6" colSpan={2}>
                            <div className="flex items-center gap-2">
                              <span className="text-foreground/55 font-medium shrink-0">
                                {src.feedTitle}
                              </span>
                              <span className="truncate text-foreground/40">
                                {src.articleTitle}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="py-1 px-2" colSpan={5}></TableCell>
                          <TableCell className="py-1 px-2 text-right tabular-nums whitespace-nowrap">
                            <span className="inline-flex items-center gap-0.5">
                              <span className={`inline-block h-1.5 w-1.5 rounded-full ${confDot(src.confidence)}`} />
                              <span className="font-mono text-[10px] text-foreground/55">{(src.confidence * 100).toFixed(0)}</span>
                            </span>
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            <a
                              href={src.articleUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-foreground/40 hover:text-foreground/70"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </TableCell>
                        </TableRow>
                      ))}
                      {/* Pipeline Panel */}
                      {isExpanded && pipelineResult && (
                        <TableRow key={`${round.key}-pipeline`} className="text-[13px] tracking-[-0.01em] hover:bg-transparent">
                          <TableCell colSpan={11} className="py-2 px-2">
                            <div className="flex items-start gap-2">
                              {/* Input Card */}
                              <div className="flex-1 rounded-[14px] bg-foreground/[0.04] p-2.5 min-w-0" style={{ border: "0.5px solid rgba(0,0,0,0.06)" }}>
                                <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35 mb-1.5">Input</div>
                                <div className="space-y-1">
                                  <div className="truncate text-foreground/70" title={pipelineResult.input.articleTitle}>
                                    <span className="text-foreground/40">Article:</span> {pipelineResult.input.articleTitle}
                                  </div>
                                  {pipelineResult.input.rawExcerpt && (
                                    <div className="text-foreground/35 line-clamp-2 text-[10px]">
                                      {pipelineResult.input.rawExcerpt}
                                    </div>
                                  )}
                                  {pipelineResult.input.regexExtraction && (
                                    <div className="space-y-0.5 text-[10px] text-foreground/40">
                                      <div>Company: {pipelineResult.input.regexExtraction.companyName}</div>
                                      <div>Amount: {fmtAmt(pipelineResult.input.regexExtraction.amountUsd)}</div>
                                      <div>Stage: {pipelineResult.input.regexExtraction.stage ?? "\u2014"}</div>
                                      <div>Conf: {(pipelineResult.input.regexExtraction.confidence * 100).toFixed(0)}%</div>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Arrow */}
                              <div className="flex items-center pt-6 shrink-0">
                                <ChevronRight className="h-4 w-4 text-foreground/30" />
                              </div>

                              {/* AI Output Card */}
                              <div className="flex-1 rounded-[14px] bg-blue-500/8 p-2.5 min-w-0" style={{ border: "0.5px solid rgba(59,130,246,0.2)" }}>
                                <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-blue-600 dark:text-blue-400 mb-1.5">AI Output</div>
                                <div className="space-y-0.5 text-[10px]">
                                  <div className={pipelineResult.input.regexExtraction?.companyName != null && String(pipelineResult.input.regexExtraction.companyName) !== String(pipelineResult.llmOutput.companyName) ? "bg-amber-500/8 rounded-[6px] px-0.5" : ""}>
                                    <span className="text-foreground/40">Company:</span> <span className="font-medium text-foreground/70">{pipelineResult.llmOutput.companyName}</span>
                                  </div>
                                  <div className={pipelineResult.input.regexExtraction?.amountUsd != null && String(pipelineResult.input.regexExtraction.amountUsd) !== String(pipelineResult.llmOutput.amountUsd) ? "bg-amber-500/8 rounded-[6px] px-0.5" : ""}>
                                    <span className="text-foreground/40">Amount:</span> <span className="font-medium text-foreground/70">{fmtAmt(pipelineResult.llmOutput.amountUsd)}</span> {pipelineResult.llmOutput.currency}
                                  </div>
                                  <div className={pipelineResult.input.regexExtraction?.stage != null && String(pipelineResult.input.regexExtraction.stage) !== String(pipelineResult.llmOutput.stage) ? "bg-amber-500/8 rounded-[6px] px-0.5" : ""}>
                                    <span className="text-foreground/40">Stage:</span> <span className="font-medium text-foreground/70">{pipelineResult.llmOutput.stage ?? "\u2014"}</span>
                                  </div>
                                  <div><span className="text-foreground/40">Lead:</span> <span className="font-medium text-foreground/70">{pipelineResult.llmOutput.leadInvestor ?? "\u2014"}</span></div>
                                  <div><span className="text-foreground/40">Investors:</span> <span className="font-medium text-foreground/70">{pipelineResult.llmOutput.investors.length > 0 ? pipelineResult.llmOutput.investors.join(", ") : "\u2014"}</span></div>
                                  <div><span className="text-foreground/40">Country:</span> <span className="font-medium text-foreground/70">{pipelineResult.llmOutput.country ?? "\u2014"}</span></div>
                                  <div><span className="text-foreground/40">Conf:</span> <span className="font-medium text-foreground/70">{(pipelineResult.llmOutput.confidence * 100).toFixed(0)}%</span></div>
                                </div>
                              </div>

                              {/* Arrow */}
                              <div className="flex items-center pt-6 shrink-0">
                                <ChevronRight className="h-4 w-4 text-foreground/30" />
                              </div>

                              {/* Graph Card */}
                              <div className="flex-1 rounded-[14px] bg-emerald-500/8 p-2.5 min-w-0" style={{ border: "0.5px solid rgba(16,185,129,0.2)" }}>
                                <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-emerald-600 dark:text-emerald-400 mb-1.5">Graph</div>
                                <div className="space-y-1.5">
                                  <div>
                                    <div className="text-[10px] text-foreground/40 mb-0.5">Nodes</div>
                                    <div className="flex flex-wrap gap-1">
                                      {pipelineResult.graph.nodes.map((n, i) => (
                                        <span key={i} className="rounded-full bg-emerald-500/8 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700 dark:text-emerald-400" style={{ border: "0.5px solid rgba(16,185,129,0.2)" }}>
                                          {n}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] text-foreground/40 mb-0.5">Edges</div>
                                    <div className="flex flex-wrap gap-1">
                                      {pipelineResult.graph.edges.map((edge, i) => (
                                        <span key={i} className="rounded-full bg-emerald-500/8 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700 dark:text-emerald-400" style={{ border: "0.5px solid rgba(16,185,129,0.2)" }}>
                                          {edge}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
