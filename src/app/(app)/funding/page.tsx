"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  if (!n) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtStage(s: string | null | undefined): string {
  if (!s) return "—";
  const map: Record<string, string> = {
    "Pre-Seed": "Pre-S", Seed: "Seed", "Series A": "S-A",
    "Series B": "S-B", "Series C": "S-C", "Series D": "S-D",
    "Series E+": "S-E+", Bridge: "Brdg", Growth: "Grwth",
    Debt: "Debt", Grant: "Grant",
  };
  return map[s] || s;
}

function fmtTime(d: string | null): string {
  if (!d) return "—";
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
  if (count >= 3) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
  if (count >= 2) return "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30";
  return "bg-muted text-muted-foreground border-border";
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
      await loadRounds();
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

  // Derive unique countries from data
  const countries = Array.from(new Set(rounds.map((r) => r.country).filter(Boolean))).sort() as string[];

  const totalAmount = rounds.reduce((sum, r) => sum + (r.amountUsd || 0), 0);
  const multiSource = rounds.filter((r) => r.sourceCount > 1).length;
  const ingestedCount = rounds.filter((r) => r.ingestedAt).length;
  const pendingCount = rounds.length - ingestedCount;
  const ingestPct = rounds.length > 0 ? Math.round((ingestedCount / rounds.length) * 100) : 0;

  const SortIcon = ({ field }: { field: string }) => (
    <ArrowUpDown
      className={`ml-0.5 inline h-3 w-3 ${
        sortBy === field ? "text-foreground" : "text-muted-foreground/50"
      }`}
    />
  );

  return (
    <div className="flex h-[calc(100vh-1.5rem)] flex-col gap-2">
      {/* Toolbar */}
      <div className="flex items-center gap-2 text-xs shrink-0">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search companies..."
            className="h-7 pl-7 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="h-7 rounded border border-input bg-transparent px-2 text-xs"
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
        >
          <option value="">All stages</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          className="h-7 rounded border border-input bg-transparent px-2 text-xs"
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
        >
          <option value="">All countries</option>
          {countries.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-3 text-muted-foreground tabular-nums">
          <span>{rounds.length} rounds</span>
          <span>&middot;</span>
          <span>{fmtAmt(totalAmount)} total</span>
          <span>&middot;</span>
          <span className="text-emerald-600 dark:text-emerald-400">{multiSource} multi-source</span>
        </div>
      </div>

      {/* Status-Bar */}
      {!loading && rounds.length > 0 && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0 px-1">
          <span className="tabular-nums">
            {rounds.length} rounds &middot; {ingestedCount} ingested &middot; {pendingCount} pending
          </span>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${ingestPct}%` }}
              />
            </div>
            <span className="tabular-nums text-[10px]">{ingestPct}%</span>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto rounded border">
        {loading ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-7" />
            ))}
          </div>
        ) : rounds.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
            No funding rounds found.
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[24px] text-xs"></TableHead>
                <TableHead
                  className="cursor-pointer text-xs font-semibold"
                  onClick={() => toggleSort("company")}
                >
                  Company <SortIcon field="company" />
                </TableHead>
                <TableHead
                  className="w-[80px] cursor-pointer text-right text-xs font-semibold"
                  onClick={() => toggleSort("amount")}
                >
                  Amount <SortIcon field="amount" />
                </TableHead>
                <TableHead className="w-[52px] text-xs font-semibold">Stage</TableHead>
                <TableHead className="w-[44px] text-xs font-semibold">Ctry</TableHead>
                <TableHead className="w-[140px] text-xs font-semibold">Lead Investor</TableHead>
                <TableHead
                  className="w-[64px] cursor-pointer text-center text-xs font-semibold"
                  onClick={() => toggleSort("sources")}
                >
                  Sources <SortIcon field="sources" />
                </TableHead>
                <TableHead
                  className="w-[52px] cursor-pointer text-right text-xs font-semibold"
                  onClick={() => toggleSort("confidence")}
                >
                  Conf <SortIcon field="confidence" />
                </TableHead>
                <TableHead
                  className="w-[52px] cursor-pointer text-xs font-semibold"
                  onClick={() => toggleSort("lastSeen")}
                >
                  Seen <SortIcon field="lastSeen" />
                </TableHead>
                <TableHead className="w-[52px] text-xs font-semibold text-center">Neo4j</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rounds.map((round) => {
                const isExpanded = expanded.has(round.key);
                const pipelineResult = ingestResults.get(round.key);
                return (
                  <Fragment key={round.key}>
                    <TableRow
                      className={`cursor-pointer text-xs ${
                        round.sourceCount > 1 ? "bg-emerald-500/[0.04]" : ""
                      } ${isExpanded ? "bg-accent/50" : ""} ${
                        round.ingestedAt ? "opacity-45" : ""
                      }`}
                      onClick={() => toggleExpand(round.key)}
                    >
                      <TableCell className="py-1.5 px-1 text-center">
                        {round.sourceCount > 1 || ingestResults.has(round.key) ? (
                          isExpanded ? (
                            <ChevronDown className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-3 w-3 text-muted-foreground" />
                          )
                        ) : null}
                      </TableCell>
                      <TableCell className="py-1.5 px-2 font-medium">
                        {round.companyName}
                      </TableCell>
                      <TableCell className="py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                        {fmtAmt(round.amountUsd)}
                      </TableCell>
                      <TableCell className="py-1.5 px-2 whitespace-nowrap">
                        {round.stage ? (
                          <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-medium">
                            {fmtStage(round.stage)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 px-2 whitespace-nowrap text-[10px]">
                        {round.country ? (
                          <span title={round.country}>{round.country.slice(0, 3).toUpperCase()}</span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 px-2 truncate max-w-[140px]" title={round.leadInvestor || ""}>
                        {round.leadInvestor || <span className="text-muted-foreground/40">—</span>}
                      </TableCell>
                      <TableCell className="py-1.5 px-2 text-center">
                        <Badge
                          variant="outline"
                          className={`text-[10px] h-5 px-1.5 tabular-nums ${sourcesBadge(round.sourceCount)}`}
                        >
                          <Newspaper className="mr-0.5 h-2.5 w-2.5" />
                          {round.sourceCount}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">
                        <span className="inline-flex items-center gap-0.5">
                          <span className={`inline-block h-1.5 w-1.5 rounded-full ${confDot(round.maxConfidence)}`} />
                          <span className="font-mono text-[10px]">{(round.maxConfidence * 100).toFixed(0)}</span>
                        </span>
                      </TableCell>
                      <TableCell className="py-1.5 px-2 tabular-nums text-muted-foreground whitespace-nowrap">
                        {fmtTime(round.lastSeen)}
                      </TableCell>
                      <TableCell className="py-1.5 px-2 text-center">
                        {round.ingestedAt ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500 mx-auto" />
                        ) : ingesting.has(round.key) ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground mx-auto" />
                        ) : ingestErrors.has(round.key) ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleIngest(round); }}
                            className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                            title={ingestErrors.get(round.key)}
                          >
                            <Upload className="h-3 w-3" />
                          </button>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleIngest(round); }}
                            className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                            title="Einlesen in Neo4j"
                          >
                            <Upload className="h-3 w-3" />
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                    {/* Expanded source rows */}
                    {isExpanded && round.sources.map((src, i) => (
                      <TableRow
                        key={`${round.key}-${i}`}
                        className="text-xs bg-muted/30 hover:bg-muted/50"
                      >
                        <TableCell className="py-1 px-1"></TableCell>
                        <TableCell className="py-1 px-2 pl-6" colSpan={2}>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground font-medium shrink-0">
                              {src.feedTitle}
                            </span>
                            <span className="truncate text-muted-foreground">
                              {src.articleTitle}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-1 px-2" colSpan={5}></TableCell>
                        <TableCell className="py-1 px-2 text-right tabular-nums whitespace-nowrap">
                          <span className="inline-flex items-center gap-0.5">
                            <span className={`inline-block h-1.5 w-1.5 rounded-full ${confDot(src.confidence)}`} />
                            <span className="font-mono text-[10px]">{(src.confidence * 100).toFixed(0)}</span>
                          </span>
                        </TableCell>
                        <TableCell className="py-1 px-2">
                          <a
                            href={src.articleUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Pipeline Panel */}
                    {isExpanded && pipelineResult && (
                      <TableRow key={`${round.key}-pipeline`} className="text-xs hover:bg-transparent">
                        <TableCell colSpan={10} className="py-2 px-2">
                          <div className="flex items-start gap-2">
                            {/* Input Card */}
                            <div className="flex-1 rounded border border-border bg-muted/40 p-2 min-w-0">
                              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Input</div>
                              <div className="space-y-1">
                                <div className="truncate" title={pipelineResult.input.articleTitle}>
                                  <span className="text-muted-foreground">Article:</span> {pipelineResult.input.articleTitle}
                                </div>
                                {pipelineResult.input.rawExcerpt && (
                                  <div className="text-muted-foreground line-clamp-2 text-[10px]">
                                    {pipelineResult.input.rawExcerpt}
                                  </div>
                                )}
                                {pipelineResult.input.regexExtraction && (
                                  <div className="space-y-0.5 text-[10px] text-muted-foreground">
                                    <div>Company: {pipelineResult.input.regexExtraction.companyName}</div>
                                    <div>Amount: {fmtAmt(pipelineResult.input.regexExtraction.amountUsd)}</div>
                                    <div>Stage: {pipelineResult.input.regexExtraction.stage ?? "—"}</div>
                                    <div>Conf: {(pipelineResult.input.regexExtraction.confidence * 100).toFixed(0)}%</div>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Arrow */}
                            <div className="flex items-center pt-6 shrink-0">
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </div>

                            {/* AI Output Card */}
                            <div className="flex-1 rounded border border-primary/30 bg-primary/5 p-2 min-w-0">
                              <div className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-1.5">AI Output</div>
                              <div className="space-y-0.5 text-[10px]">
                                <div className={pipelineResult.input.regexExtraction?.companyName != null && String(pipelineResult.input.regexExtraction.companyName) !== String(pipelineResult.llmOutput.companyName) ? "bg-yellow-500/15 rounded px-0.5" : ""}>
                                  Company: <span className="font-medium">{pipelineResult.llmOutput.companyName}</span>
                                </div>
                                <div className={pipelineResult.input.regexExtraction?.amountUsd != null && String(pipelineResult.input.regexExtraction.amountUsd) !== String(pipelineResult.llmOutput.amountUsd) ? "bg-yellow-500/15 rounded px-0.5" : ""}>
                                  Amount: <span className="font-medium">{fmtAmt(pipelineResult.llmOutput.amountUsd)}</span> {pipelineResult.llmOutput.currency}
                                </div>
                                <div className={pipelineResult.input.regexExtraction?.stage != null && String(pipelineResult.input.regexExtraction.stage) !== String(pipelineResult.llmOutput.stage) ? "bg-yellow-500/15 rounded px-0.5" : ""}>
                                  Stage: <span className="font-medium">{pipelineResult.llmOutput.stage ?? "—"}</span>
                                </div>
                                <div>Lead: <span className="font-medium">{pipelineResult.llmOutput.leadInvestor ?? "—"}</span></div>
                                <div>Investors: <span className="font-medium">{pipelineResult.llmOutput.investors.length > 0 ? pipelineResult.llmOutput.investors.join(", ") : "—"}</span></div>
                                <div>Country: <span className="font-medium">{pipelineResult.llmOutput.country ?? "—"}</span></div>
                                <div>Conf: <span className="font-medium">{(pipelineResult.llmOutput.confidence * 100).toFixed(0)}%</span></div>
                              </div>
                            </div>

                            {/* Arrow */}
                            <div className="flex items-center pt-6 shrink-0">
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </div>

                            {/* Graph Card */}
                            <div className="flex-1 rounded border border-emerald-500/30 bg-emerald-500/5 p-2 min-w-0">
                              <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-1.5">Graph</div>
                              <div className="space-y-1.5">
                                <div>
                                  <div className="text-[10px] text-muted-foreground mb-0.5">Nodes</div>
                                  <div className="flex flex-wrap gap-1">
                                    {pipelineResult.graph.nodes.map((n, i) => (
                                      <Badge key={i} variant="outline" className="text-[9px] h-4 px-1 bg-emerald-500/10 border-emerald-500/30">
                                        {n}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-muted-foreground mb-0.5">Edges</div>
                                  <div className="flex flex-wrap gap-1">
                                    {pipelineResult.graph.edges.map((edge, i) => (
                                      <Badge key={i} variant="outline" className="text-[9px] h-4 px-1 bg-emerald-500/10 border-emerald-500/30">
                                        {edge}
                                      </Badge>
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
  );
}
