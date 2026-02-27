"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
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
import type { GroupedFundEvent } from "@/app/api/fund-events/grouped/route";

// --- Helpers ---

const FUND_TYPES = [
  "VC", "PE", "Growth", "Growth Equity", "Debt", "Infrastructure",
  "Real Estate", "Impact", "Crypto", "Climate", "Healthcare",
  "Early-Stage VC", "Late-Stage", "Seed", "Fund of Funds", "Secondaries",
];

function fmtAmt(n: number | null | undefined): string {
  if (!n) return "\u2014";
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

// --- Component ---

export default function FundEventsPage() {
  const [events, setEvents] = useState<GroupedFundEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [fundTypeFilter, setFundTypeFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [sortBy, setSortBy] = useState("lastSeen");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [ingesting, setIngesting] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkIngesting, setBulkIngesting] = useState(false);
  const [bulkDismissing, setBulkDismissing] = useState(false);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ sortBy, sortOrder });
    if (fundTypeFilter) params.set("fundType", fundTypeFilter);
    if (countryFilter) params.set("country", countryFilter);
    if (searchDebounced) params.set("search", searchDebounced);

    const res = await fetch(`/api/fund-events/grouped?${params}`);
    const data = await res.json();
    setEvents(data.data);
    setSelected(new Set());
    setLoading(false);
  }, [fundTypeFilter, countryFilter, searchDebounced, sortBy, sortOrder]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

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

  const selectableEvents = events.filter((e) => !e.ingestedAt && !e.dismissedAt);

  function toggleSelectAll() {
    if (selected.size === selectableEvents.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableEvents.map((e) => e.key)));
    }
  }

  async function handleIngest(event: GroupedFundEvent) {
    setIngesting((prev) => new Set(prev).add(event.key));
    try {
      const res = await fetch("/api/fund-events/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: event.key,
          articleIds: event.sources.map((s) => s.articleId),
        }),
      });
      if (res.ok) {
        setEvents((prev) =>
          prev.map((e) =>
            e.key === event.key ? { ...e, ingestedAt: new Date().toISOString() } : e
          )
        );
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(event.key);
          return next;
        });
      }
    } catch (e) {
      console.error("Ingest failed:", e);
    } finally {
      setIngesting((prev) => {
        const next = new Set(prev);
        next.delete(event.key);
        return next;
      });
    }
  }

  async function handleBulkIngest() {
    if (selected.size === 0) return;
    setBulkIngesting(true);
    const selectedEvents = events.filter((e) => selected.has(e.key) && !e.ingestedAt);
    for (const event of selectedEvents) {
      await handleIngest(event);
    }
    setBulkIngesting(false);
  }

  async function handleDismiss(event: GroupedFundEvent) {
    const articleIds = event.sources.map((s) => s.articleId);
    try {
      const res = await fetch("/api/fund-events/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleIds }),
      });
      if (res.ok) {
        setEvents((prev) => prev.filter((e) => e.key !== event.key));
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(event.key);
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
    const selectedEvents = events.filter((e) => selected.has(e.key));
    for (const event of selectedEvents) {
      await handleDismiss(event);
    }
    setBulkDismissing(false);
  }

  const countries = Array.from(new Set(events.map((e) => e.country).filter(Boolean))).sort() as string[];
  const totalAmount = events.reduce((sum, e) => sum + (e.amountUsd || 0), 0);
  const multiSource = events.filter((e) => e.sourceCount > 1).length;

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
            placeholder="Search firms..."
            className="glass-search-input h-8 w-full pl-8 pr-3 text-[13px] tracking-[-0.01em]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="glass-search-input h-8 px-2.5 text-[13px] tracking-[-0.01em]"
          value={fundTypeFilter}
          onChange={(e) => setFundTypeFilter(e.target.value)}
        >
          <option value="">All types</option>
          {FUND_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
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
          <span>{events.length} fund events</span>
          <span>&middot;</span>
          <span>{fmtAmt(totalAmount)} total</span>
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
          ) : events.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-[13px] text-foreground/40">
              No fund events found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="glass-table-header hover:bg-transparent">
                  <TableHead className="w-[32px] text-[11px] px-1">
                    <Checkbox
                      checked={selectableEvents.length > 0 && selected.size === selectableEvents.length}
                      onCheckedChange={toggleSelectAll}
                      className="h-3.5 w-3.5"
                    />
                  </TableHead>
                  <TableHead className="w-[24px] text-[11px]"></TableHead>
                  <TableHead
                    className="cursor-pointer text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35"
                    onClick={() => toggleSort("firm")}
                  >
                    Firm Name <SortIcon field="firm" />
                  </TableHead>
                  <TableHead className="w-[120px] text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35">Fund Name</TableHead>
                  <TableHead
                    className="w-[80px] cursor-pointer text-right text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35"
                    onClick={() => toggleSort("amount")}
                  >
                    Amount <SortIcon field="amount" />
                  </TableHead>
                  <TableHead className="w-[80px] text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35">Type</TableHead>
                  <TableHead className="w-[44px] text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35">Ctry</TableHead>
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
                {events.map((event) => {
                  const isExpanded = expanded.has(event.key);
                  const isSelected = selected.has(event.key);
                  const isIngested = !!event.ingestedAt;
                  const isSelectable = !isIngested && !event.dismissedAt;
                  return (
                    <Fragment key={event.key}>
                      <TableRow
                        className={`lg-inset-table-row cursor-pointer text-[13px] tracking-[-0.01em] ${
                          isSelected
                            ? "bg-blue-500/10"
                            : event.sourceCount > 1
                              ? "bg-emerald-500/[0.04]"
                              : ""
                        } ${isExpanded ? "bg-foreground/[0.04]" : ""}`}
                        onClick={() => toggleExpand(event.key)}
                      >
                        <TableCell className="py-1.5 px-1 text-center" onClick={(e) => e.stopPropagation()}>
                          {isSelectable ? (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelect(event.key)}
                              className="h-3.5 w-3.5"
                            />
                          ) : isIngested ? (
                            <Check className="h-3 w-3 text-emerald-500 mx-auto" />
                          ) : null}
                        </TableCell>
                        <TableCell className="py-1.5 px-1 text-center">
                          {event.sourceCount > 1 ? (
                            isExpanded ? (
                              <ChevronDown className="h-3 w-3 text-foreground/40" />
                            ) : (
                              <ChevronRight className="h-3 w-3 text-foreground/40" />
                            )
                          ) : null}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 font-semibold text-foreground/85">
                          {event.firmName}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-foreground/45">
                          {event.fundName}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap text-foreground/70">
                          {fmtAmt(event.amountUsd)}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 whitespace-nowrap">
                          {event.fundType ? (
                            <span className="rounded-[6px] bg-foreground/[0.04] px-1 py-0.5 text-[10px] font-medium text-foreground/55">
                              {event.fundType}
                            </span>
                          ) : (
                            <span className="text-foreground/30">&mdash;</span>
                          )}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 whitespace-nowrap text-[10px] text-foreground/55">
                          {event.country ? (
                            <span title={event.country}>{event.country.slice(0, 3).toUpperCase()}</span>
                          ) : (
                            <span className="text-foreground/30">&mdash;</span>
                          )}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-center">
                          <span
                            className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${sourcesBadge(event.sourceCount)}`}
                            style={{ border: "0.5px solid rgba(0,0,0,0.06)" }}
                          >
                            <Newspaper className="h-2.5 w-2.5" />
                            {event.sourceCount}
                          </span>
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">
                          <span className="inline-flex items-center gap-0.5">
                            <span className={`inline-block h-1.5 w-1.5 rounded-full ${confDot(event.maxConfidence)}`} />
                            <span className="font-mono text-[10px] text-foreground/55">{(event.maxConfidence * 100).toFixed(0)}</span>
                          </span>
                        </TableCell>
                        <TableCell className="py-1.5 px-2 tabular-nums text-foreground/30 whitespace-nowrap">
                          {fmtTime(event.lastSeen)}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                          {isIngested ? (
                            <Check className="h-3.5 w-3.5 text-emerald-500 mx-auto" />
                          ) : (
                            <div className="flex items-center justify-center gap-0.5">
                              <button
                                className="glass-capsule-btn h-6 w-6 flex items-center justify-center disabled:opacity-50"
                                title="Sync to Neo4j"
                                disabled={ingesting.has(event.key)}
                                onClick={() => handleIngest(event)}
                              >
                                {ingesting.has(event.key) ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Upload className="h-3 w-3" />
                                )}
                              </button>
                              <button
                                className="glass-capsule-btn h-6 w-6 flex items-center justify-center text-foreground/30 hover:text-red-500"
                                title="Not a fund closing"
                                onClick={() => handleDismiss(event)}
                              >
                                <Ban className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                      {/* Expanded source rows */}
                      {isExpanded && event.sources.map((src, i) => (
                        <TableRow
                          key={`${event.key}-${i}`}
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
