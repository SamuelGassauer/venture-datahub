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
  Upload,
  Check,
  Loader2,
  Ban,
  X,
} from "lucide-react";
import type { GroupedValueIndicator } from "@/app/api/value-indicators/grouped/route";

// --- Helpers ---

const METRIC_TYPES = [
  "valuation", "revenue", "arr", "mrr", "gmv", "users", "growth_rate",
];

const METRIC_BADGE_COLORS: Record<string, string> = {
  valuation: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
  revenue: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  arr: "bg-green-500/15 text-green-700 dark:text-green-400",
  mrr: "bg-teal-500/15 text-teal-700 dark:text-teal-400",
  gmv: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400",
  users: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  growth_rate: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
};

function fmtValue(n: number | null | undefined, unit: string | null): string {
  if (n == null) return "\u2014";
  if (unit === "%") return `${n.toFixed(1)}%`;
  if (unit === "users") {
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
    return n.toFixed(0);
  }
  // Monetary
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
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

function metricLabel(type: string): string {
  const labels: Record<string, string> = {
    valuation: "Valuation",
    revenue: "Revenue",
    arr: "ARR",
    mrr: "MRR",
    gmv: "GMV",
    users: "Users",
    growth_rate: "Growth",
  };
  return labels[type] || type;
}

// --- Component ---

export default function ValueIndicatorsPage() {
  const [indicators, setIndicators] = useState<GroupedValueIndicator[]>([]);
  const [loading, setLoading] = useState(true);
  const [metricTypeFilter, setMetricTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [sortBy, setSortBy] = useState("lastSeen");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [ingesting, setIngesting] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkIngesting, setBulkIngesting] = useState(false);
  const [bulkDismissing, setBulkDismissing] = useState(false);

  const loadIndicators = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ sortBy, sortOrder });
    if (metricTypeFilter) params.set("metricType", metricTypeFilter);
    if (searchDebounced) params.set("search", searchDebounced);

    const res = await fetch(`/api/value-indicators/grouped?${params}`);
    const data = await res.json();
    setIndicators(data.data);
    setSelected(new Set());
    setLoading(false);
  }, [metricTypeFilter, searchDebounced, sortBy, sortOrder]);

  useEffect(() => {
    loadIndicators();
  }, [loadIndicators]);

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

  const selectableIndicators = indicators.filter((e) => !e.ingestedAt && !e.dismissedAt);

  function toggleSelectAll() {
    if (selected.size === selectableIndicators.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableIndicators.map((e) => e.key)));
    }
  }

  async function handleIngest(indicator: GroupedValueIndicator) {
    setIngesting((prev) => new Set(prev).add(indicator.key));
    try {
      const res = await fetch("/api/value-indicators/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: indicator.key,
          articleIds: indicator.sources.map((s) => s.articleId),
        }),
      });
      if (res.ok) {
        setIndicators((prev) =>
          prev.map((e) =>
            e.key === indicator.key ? { ...e, ingestedAt: new Date().toISOString() } : e
          )
        );
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(indicator.key);
          return next;
        });
      }
    } catch (e) {
      console.error("Ingest failed:", e);
    } finally {
      setIngesting((prev) => {
        const next = new Set(prev);
        next.delete(indicator.key);
        return next;
      });
    }
  }

  async function handleBulkIngest() {
    if (selected.size === 0) return;
    setBulkIngesting(true);
    const selectedIndicators = indicators.filter((e) => selected.has(e.key) && !e.ingestedAt);
    for (const indicator of selectedIndicators) {
      await handleIngest(indicator);
    }
    setBulkIngesting(false);
  }

  async function handleDismiss(indicator: GroupedValueIndicator) {
    const articleIds = indicator.sources.map((s) => s.articleId);
    try {
      const res = await fetch("/api/value-indicators/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleIds }),
      });
      if (res.ok) {
        setIndicators((prev) => prev.filter((e) => e.key !== indicator.key));
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(indicator.key);
          return next;
        });
      }
    } catch (e) {
      console.error("Dismiss failed:", e);
    }
  }

  async function handleBulkDismiss() {
    if (selected.size === 0) return;
    setBulkDismissing(true);
    const selectedIndicators = indicators.filter((e) => selected.has(e.key));
    for (const indicator of selectedIndicators) {
      await handleDismiss(indicator);
    }
    setBulkDismissing(false);
  }

  const multiSource = indicators.filter((e) => e.sourceCount > 1).length;

  const SortIcon = ({ field }: { field: string }) => (
    <ArrowUpDown
      className={`ml-0.5 inline h-3 w-3 ${
        sortBy === field ? "text-foreground" : "text-foreground/30"
      }`}
    />
  );

  const hasSelection = selected.size > 0;

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
          value={metricTypeFilter}
          onChange={(e) => setMetricTypeFilter(e.target.value)}
        >
          <option value="">All metrics</option>
          {METRIC_TYPES.map((t) => (
            <option key={t} value={t}>{metricLabel(t)}</option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-3 text-foreground/35 tabular-nums">
          <span>{indicators.length} indicators</span>
          <span>&middot;</span>
          <span className="text-emerald-600 dark:text-emerald-400">{multiSource} multi-source</span>
        </div>
      </div>

      {/* Bulk action bar */}
      {hasSelection && (
        <div className="glass-status-bar flex items-center gap-2 px-4 py-2 text-[13px] tracking-[-0.01em]">
          <span className="font-medium tabular-nums text-foreground/85">{selected.size} selected</span>
          <button
            className="apple-btn-blue h-7 px-2.5 text-[11px] font-medium inline-flex items-center gap-1 disabled:opacity-50"
            disabled={bulkIngesting}
            onClick={handleBulkIngest}
          >
            {bulkIngesting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Upload className="h-3 w-3" />
            )}
            Sync to Neo4j
          </button>
          <button
            className="glass-capsule-btn h-7 px-2.5 text-[11px] font-medium text-red-500 inline-flex items-center gap-1 disabled:opacity-50"
            disabled={bulkDismissing}
            onClick={handleBulkDismiss}
          >
            {bulkDismissing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Ban className="h-3 w-3" />
            )}
            Dismiss
          </button>
          <button
            className="ml-1 text-foreground/40 hover:text-foreground/70"
            onClick={() => setSelected(new Set())}
          >
            <X className="h-3.5 w-3.5" />
          </button>
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
          ) : indicators.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-[13px] text-foreground/40">
              No value indicators found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="glass-table-header hover:bg-transparent">
                  <TableHead className="w-[32px] text-[11px] px-1">
                    <Checkbox
                      checked={selectableIndicators.length > 0 && selected.size === selectableIndicators.length}
                      onCheckedChange={toggleSelectAll}
                      className="h-3.5 w-3.5"
                    />
                  </TableHead>
                  <TableHead className="w-[24px] text-[11px]"></TableHead>
                  <TableHead
                    className="cursor-pointer text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35"
                    onClick={() => toggleSort("company")}
                  >
                    Company Name <SortIcon field="company" />
                  </TableHead>
                  <TableHead className="w-[80px] text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35">Metric</TableHead>
                  <TableHead
                    className="w-[100px] cursor-pointer text-right text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35"
                    onClick={() => toggleSort("value")}
                  >
                    Value <SortIcon field="value" />
                  </TableHead>
                  <TableHead className="w-[60px] text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35">Period</TableHead>
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
                  <TableHead className="w-[52px] text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35 text-center">Neo4j</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {indicators.map((indicator) => {
                  const isExpanded = expanded.has(indicator.key);
                  const isSelected = selected.has(indicator.key);
                  const isIngested = !!indicator.ingestedAt;
                  const isSelectable = !isIngested && !indicator.dismissedAt;
                  return (
                    <Fragment key={indicator.key}>
                      <TableRow
                        className={`lg-inset-table-row cursor-pointer text-[13px] tracking-[-0.01em] ${
                          isSelected
                            ? "bg-blue-500/10"
                            : indicator.sourceCount > 1
                              ? "bg-emerald-500/[0.04]"
                              : ""
                        } ${isExpanded ? "bg-foreground/[0.04]" : ""}`}
                        onClick={() => toggleExpand(indicator.key)}
                      >
                        <TableCell className="py-1.5 px-1 text-center" onClick={(e) => e.stopPropagation()}>
                          {isSelectable ? (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelect(indicator.key)}
                              className="h-3.5 w-3.5"
                            />
                          ) : isIngested ? (
                            <Check className="h-3 w-3 text-emerald-500 mx-auto" />
                          ) : null}
                        </TableCell>
                        <TableCell className="py-1.5 px-1 text-center">
                          {indicator.sourceCount > 1 ? (
                            isExpanded ? (
                              <ChevronDown className="h-3 w-3 text-foreground/40" />
                            ) : (
                              <ChevronRight className="h-3 w-3 text-foreground/40" />
                            )
                          ) : null}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 font-semibold text-foreground/85">
                          {indicator.companyName}
                        </TableCell>
                        <TableCell className="py-1.5 px-2">
                          <span
                            className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${METRIC_BADGE_COLORS[indicator.metricType] || "bg-foreground/[0.04] text-foreground/45"}`}
                            style={{ border: "0.5px solid rgba(0,0,0,0.06)" }}
                          >
                            {metricLabel(indicator.metricType)}
                          </span>
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap text-foreground/70">
                          {fmtValue(indicator.valueUsd ?? indicator.value, indicator.unit)}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 whitespace-nowrap text-[10px] text-foreground/40">
                          {indicator.period || "\u2014"}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-center">
                          <span
                            className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${sourcesBadge(indicator.sourceCount)}`}
                            style={{ border: "0.5px solid rgba(0,0,0,0.06)" }}
                          >
                            <Newspaper className="h-2.5 w-2.5" />
                            {indicator.sourceCount}
                          </span>
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">
                          <span className="inline-flex items-center gap-0.5">
                            <span className={`inline-block h-1.5 w-1.5 rounded-full ${confDot(indicator.maxConfidence)}`} />
                            <span className="font-mono text-[10px] text-foreground/55">{(indicator.maxConfidence * 100).toFixed(0)}</span>
                          </span>
                        </TableCell>
                        <TableCell className="py-1.5 px-2 tabular-nums text-foreground/30 whitespace-nowrap">
                          {fmtTime(indicator.lastSeen)}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                          {isIngested ? (
                            <Check className="h-3.5 w-3.5 text-emerald-500 mx-auto" />
                          ) : (
                            <div className="flex items-center justify-center gap-0.5">
                              <button
                                className="glass-capsule-btn h-6 w-6 flex items-center justify-center disabled:opacity-50"
                                title="Sync to Neo4j"
                                disabled={ingesting.has(indicator.key)}
                                onClick={() => handleIngest(indicator)}
                              >
                                {ingesting.has(indicator.key) ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Upload className="h-3 w-3" />
                                )}
                              </button>
                              <button
                                className="glass-capsule-btn h-6 w-6 flex items-center justify-center text-foreground/30 hover:text-red-500"
                                title="Not relevant"
                                onClick={() => handleDismiss(indicator)}
                              >
                                <Ban className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                      {/* Expanded source rows */}
                      {isExpanded && indicator.sources.map((src, i) => (
                        <TableRow
                          key={`${indicator.key}-${i}`}
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
                          <TableCell className="py-1 px-2" colSpan={4}></TableCell>
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
