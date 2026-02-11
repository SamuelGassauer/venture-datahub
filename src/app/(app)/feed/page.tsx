"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  Search,
  TrendingUp,
  Eye,
  EyeOff,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { markArticleRead, toggleBookmark, markAllRead } from "@/lib/actions";
import type { ArticleWithFunding, FeedWithCategory } from "@/lib/types";
import { toast } from "sonner";

// --- Helpers ---

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
    "Pre-Seed": "Pre-S",
    Seed: "Seed",
    "Series A": "S-A",
    "Series B": "S-B",
    "Series C": "S-C",
    "Series D": "S-D",
    "Series E+": "S-E+",
    Bridge: "Brdg",
    Growth: "Grwth",
    Debt: "Debt",
    Grant: "Grant",
  };
  return map[s] || s;
}

function fmtTime(d: string | Date | null): string {
  if (!d) return "—";
  const date = new Date(d);
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

function confDot(c: number): string {
  if (c >= 0.8) return "text-emerald-500";
  if (c >= 0.6) return "text-yellow-500";
  return "text-orange-500";
}

// --- Component ---

export default function FeedPage() {
  const [articles, setArticles] = useState<ArticleWithFunding[]>([]);
  const [feeds, setFeeds] = useState<FeedWithCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selectedArticle, setSelectedArticle] = useState<ArticleWithFunding | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [feedFilter, setFeedFilter] = useState("");
  const [readFilter, setReadFilter] = useState("");
  const [fundingFilter, setFundingFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [sortBy, setSortBy] = useState("publishedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const pageSize = 50;
  const tableRef = useRef<HTMLDivElement>(null);

  const totalPages = Math.ceil(total / pageSize);
  const fundingCount = articles.filter((a) => a.fundingRound).length;

  const loadArticles = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sortBy,
      sortOrder,
    });
    if (feedFilter) params.set("feedId", feedFilter);
    if (readFilter) params.set("isRead", readFilter);
    if (fundingFilter === "funding") params.set("hasFunding", "true");
    if (searchDebounced) params.set("search", searchDebounced);

    const res = await fetch(`/api/articles?${params}`);
    const data = await res.json();
    setArticles(data.data);
    setTotal(data.total);
    setLoading(false);
    setSelectedIdx(-1);
  }, [page, feedFilter, readFilter, fundingFilter, searchDebounced, sortBy, sortOrder]);

  useEffect(() => {
    fetch("/api/feeds").then((r) => r.json()).then(setFeeds);
  }, []);

  useEffect(() => {
    loadArticles();
  }, [loadArticles]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, articles.length - 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && selectedIdx >= 0) {
        e.preventDefault();
        openArticle(articles[selectedIdx]);
      } else if (e.key === "Escape") {
        setSelectedArticle(null);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIdx, articles]);

  function toggleSort(field: string) {
    if (sortBy === field) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setPage(1);
  }

  async function openArticle(article: ArticleWithFunding) {
    setSelectedArticle(article);
    if (!article.isRead) {
      await markArticleRead(article.id, true);
      setArticles((prev) =>
        prev.map((a) => (a.id === article.id ? { ...a, isRead: true } : a))
      );
    }
  }

  async function handleMarkRead(article: ArticleWithFunding) {
    await markArticleRead(article.id, !article.isRead);
    setArticles((prev) =>
      prev.map((a) => (a.id === article.id ? { ...a, isRead: !a.isRead } : a))
    );
  }

  async function handleToggleBookmark(article: ArticleWithFunding) {
    await toggleBookmark(article.id);
    setArticles((prev) =>
      prev.map((a) =>
        a.id === article.id ? { ...a, isBookmarked: !a.isBookmarked } : a
      )
    );
  }

  async function handleMarkAllRead() {
    await markAllRead(feedFilter || undefined);
    setArticles((prev) => prev.map((a) => ({ ...a, isRead: true })));
    toast.success("All marked read");
  }

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
            placeholder="Search..."
            className="h-7 pl-7 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="h-7 rounded border border-input bg-transparent px-2 text-xs"
          value={feedFilter}
          onChange={(e) => { setFeedFilter(e.target.value); setPage(1); }}
        >
          <option value="">All feeds</option>
          {feeds.map((f) => (
            <option key={f.id} value={f.id}>{f.title}</option>
          ))}
        </select>
        <select
          className="h-7 rounded border border-input bg-transparent px-2 text-xs"
          value={readFilter}
          onChange={(e) => { setReadFilter(e.target.value); setPage(1); }}
        >
          <option value="">All</option>
          <option value="false">Unread</option>
          <option value="true">Read</option>
        </select>
        <select
          className="h-7 rounded border border-input bg-transparent px-2 text-xs"
          value={fundingFilter}
          onChange={(e) => { setFundingFilter(e.target.value); setPage(1); }}
        >
          <option value="">All articles</option>
          <option value="funding">Funding only</option>
        </select>
        <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={handleMarkAllRead}>
          Mark all read
        </Button>
        <div className="ml-auto text-muted-foreground tabular-nums">
          {total} articles{fundingFilter !== "funding" && <> &middot; <span className="text-emerald-600 dark:text-emerald-400">{fundingCount} funding</span></>}
        </div>
      </div>

      {/* Table */}
      <div ref={tableRef} className="flex-1 overflow-auto rounded border">
        {loading ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 15 }).map((_, i) => (
              <Skeleton key={i} className="h-7" />
            ))}
          </div>
        ) : articles.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
            No articles found.
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow className="hover:bg-transparent">
                <TableHead
                  className="w-[52px] cursor-pointer text-xs font-semibold"
                  onClick={() => toggleSort("publishedAt")}
                >
                  Time <SortIcon field="publishedAt" />
                </TableHead>
                <TableHead className="w-[110px] text-xs font-semibold">Source</TableHead>
                <TableHead className="text-xs font-semibold">Title</TableHead>
                <TableHead className="w-[130px] text-xs font-semibold">Company</TableHead>
                <TableHead
                  className="w-[72px] cursor-pointer text-right text-xs font-semibold"
                  onClick={() => toggleSort("amount")}
                >
                  Amt <SortIcon field="amount" />
                </TableHead>
                <TableHead className="w-[52px] text-xs font-semibold">Stg</TableHead>
                <TableHead className="w-[44px] text-xs font-semibold">Ctry</TableHead>
                <TableHead
                  className="w-[52px] cursor-pointer text-right text-xs font-semibold"
                  onClick={() => toggleSort("confidence")}
                >
                  Conf <SortIcon field="confidence" />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {articles.map((article, idx) => {
                const fr = article.fundingRound;
                const hasFr = !!fr;
                return (
                  <TableRow
                    key={article.id}
                    className={`cursor-pointer text-xs ${
                      selectedIdx === idx ? "bg-accent" : ""
                    } ${hasFr ? "bg-emerald-500/[0.04] hover:bg-emerald-500/[0.08]" : ""} ${
                      article.isRead ? "opacity-50" : ""
                    }`}
                    onClick={() => {
                      setSelectedIdx(idx);
                      openArticle(article);
                    }}
                  >
                    <TableCell className="py-1.5 px-2 tabular-nums text-muted-foreground whitespace-nowrap">
                      {fmtTime(article.publishedAt)}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 truncate max-w-[110px]" title={article.feed.title}>
                      {article.feed.title}
                    </TableCell>
                    <TableCell className="py-1.5 px-2">
                      <div className="flex items-center gap-1.5">
                        {!article.isRead && !hasFr && (
                          <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                        )}
                        {article.isBookmarked && (
                          <Bookmark className="h-3 w-3 shrink-0 fill-yellow-500 text-yellow-500" />
                        )}
                        <span className={`truncate ${!article.isRead ? "font-medium" : ""}`}>
                          {article.title}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-1.5 px-2 truncate max-w-[130px] font-medium" title={fr?.companyName}>
                      {fr?.companyName || <span className="text-muted-foreground/40">—</span>}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 text-right tabular-nums font-mono whitespace-nowrap">
                      {hasFr ? (
                        <span className={fr?.amountUsd ? "text-foreground" : "text-muted-foreground/40"}>
                          {fmtAmt(fr?.amountUsd)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 whitespace-nowrap">
                      {fr?.stage ? (
                        <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-medium">
                          {fmtStage(fr.stage)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 whitespace-nowrap text-[10px]">
                      {fr?.country ? (
                        <span title={fr.country}>{fr.country.slice(0, 3).toUpperCase()}</span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">
                      {hasFr ? (
                        <span className="inline-flex items-center gap-0.5">
                          <span className={`inline-block h-1.5 w-1.5 rounded-full ${confDot(fr!.confidence)}`} />
                          <span className="font-mono text-[10px]">{(fr!.confidence * 100).toFixed(0)}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs shrink-0">
          <span className="text-muted-foreground tabular-nums">
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail Sheet */}
      <Sheet open={!!selectedArticle} onOpenChange={() => setSelectedArticle(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {selectedArticle && (() => {
            const fr = selectedArticle.fundingRound;
            return (
              <>
                <SheetHeader>
                  <SheetTitle className="text-left text-sm leading-tight">
                    {selectedArticle.title}
                  </SheetTitle>
                </SheetHeader>
                <div className="mt-3 space-y-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{selectedArticle.feed.title}</span>
                    <span>&middot;</span>
                    {selectedArticle.publishedAt && (
                      <span>
                        {formatDistanceToNow(new Date(selectedArticle.publishedAt), { addSuffix: true })}
                      </span>
                    )}
                    {selectedArticle.author && (
                      <>
                        <span>&middot;</span>
                        <span>{selectedArticle.author}</span>
                      </>
                    )}
                  </div>

                  {fr && (
                    <div className="rounded border border-emerald-500/20 bg-emerald-500/5 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                          <TrendingUp className="h-3.5 w-3.5" />
                          Funding Round
                        </div>
                        <span className="inline-flex items-center gap-1 text-xs tabular-nums">
                          <span className={`inline-block h-2 w-2 rounded-full ${confDot(fr.confidence)}`} />
                          {(fr.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                        <div>
                          <span className="text-muted-foreground">Company</span>
                          <div className="font-medium">{fr.companyName}</div>
                        </div>
                        {fr.amountUsd ? (
                          <div>
                            <span className="text-muted-foreground">Amount</span>
                            <div className="font-medium font-mono">{fmtAmt(fr.amountUsd)}</div>
                          </div>
                        ) : null}
                        {fr.stage && (
                          <div>
                            <span className="text-muted-foreground">Stage</span>
                            <div>{fr.stage}</div>
                          </div>
                        )}
                        {fr.country && (
                          <div>
                            <span className="text-muted-foreground">Country</span>
                            <div>{fr.country}</div>
                          </div>
                        )}
                        {fr.leadInvestor && (
                          <div className="col-span-2">
                            <span className="text-muted-foreground">Lead</span>
                            <div>{fr.leadInvestor}</div>
                          </div>
                        )}
                        {fr.investors && (fr.investors as string[]).length > 0 && (
                          <div className="col-span-2">
                            <span className="text-muted-foreground">Investors</span>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {(fr.investors as string[]).map((inv) => (
                                <Badge key={inv} variant="outline" className="text-[10px] h-5 px-1.5">
                                  {inv}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleToggleBookmark(selectedArticle)}
                    >
                      {selectedArticle.isBookmarked ? (
                        <BookmarkCheck className="mr-1 h-3 w-3" />
                      ) : (
                        <Bookmark className="mr-1 h-3 w-3" />
                      )}
                      {selectedArticle.isBookmarked ? "Saved" : "Save"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleMarkRead(selectedArticle)}
                    >
                      {selectedArticle.isRead ? (
                        <EyeOff className="mr-1 h-3 w-3" />
                      ) : (
                        <Eye className="mr-1 h-3 w-3" />
                      )}
                      {selectedArticle.isRead ? "Unread" : "Read"}
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                      <a href={selectedArticle.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-1 h-3 w-3" />
                        Source
                      </a>
                    </Button>
                  </div>

                  {selectedArticle.content ? (
                    <div
                      className="prose prose-xs dark:prose-invert max-w-none text-sm leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: selectedArticle.content }}
                    />
                  ) : selectedArticle.summary ? (
                    <p className="text-sm leading-relaxed">{selectedArticle.summary}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No content.{" "}
                      <a href={selectedArticle.url} target="_blank" rel="noopener noreferrer" className="underline">
                        Open source
                      </a>
                    </p>
                  )}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
