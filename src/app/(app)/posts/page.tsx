"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  Search,
  ChevronDown,
  ChevronRight,
  Check,
  Loader2,
  Sparkles,
  Copy,
  RefreshCw,
  Save,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import type { RoundWithPostStatus } from "@/app/api/posts/rounds/route";

type Filter = "all" | "with" | "without";

function fmtEur(n: number | null | undefined): string {
  if (!n) return "\u2014";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1).replace(".", ",")} Mrd. \u20AC`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(".", ",")} Mio. \u20AC`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} Tsd. \u20AC`;
  return `${n.toFixed(0)} \u20AC`;
}

export default function PostsPage() {
  const [rounds, setRounds] = useState<RoundWithPostStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState<Set<string>>(new Set());
  const [editedContent, setEditedContent] = useState<Map<string, string>>(new Map());
  const [saving, setSaving] = useState<Set<string>>(new Set());

  const loadRounds = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/posts/rounds");
      const json = await res.json();
      setRounds(json.data ?? []);
    } catch {
      toast.error("Fehler beim Laden der Runden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRounds();
  }, [loadRounds]);

  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const filtered = rounds.filter((r) => {
    if (filter === "with" && !r.hasPost) return false;
    if (filter === "without" && r.hasPost) return false;
    if (searchDebounced) {
      const q = searchDebounced.toLowerCase();
      return (
        r.companyName.toLowerCase().includes(q) ||
        r.leadInvestor?.toLowerCase().includes(q) ||
        r.stage?.toLowerCase().includes(q) ||
        r.country?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const postCount = rounds.filter((r) => r.hasPost).length;

  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleGenerate(round: RoundWithPostStatus) {
    setGenerating((prev) => new Set(prev).add(round.roundKey));
    try {
      const res = await fetch("/api/posts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundKey: round.roundKey }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Fehler beim Generieren");
        return;
      }
      // Update the round in-place
      setRounds((prev) =>
        prev.map((r) =>
          r.roundKey === round.roundKey
            ? {
                ...r,
                hasPost: true,
                postId: json.post.id,
                postContent: json.post.content,
              }
            : r
        )
      );
      // Clear any edited content for this round
      setEditedContent((prev) => {
        const next = new Map(prev);
        next.delete(round.roundKey);
        return next;
      });
      // Auto-expand to show result
      setExpanded((prev) => new Set(prev).add(round.roundKey));
      toast.success("Beitrag generiert");
    } catch {
      toast.error("Fehler beim Generieren");
    } finally {
      setGenerating((prev) => {
        const next = new Set(prev);
        next.delete(round.roundKey);
        return next;
      });
    }
  }

  async function handleSave(round: RoundWithPostStatus) {
    const content = editedContent.get(round.roundKey);
    if (!content || !round.postId) return;

    setSaving((prev) => new Set(prev).add(round.roundKey));
    try {
      const res = await fetch(`/api/posts/${round.postId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        toast.error("Fehler beim Speichern");
        return;
      }
      setRounds((prev) =>
        prev.map((r) =>
          r.roundKey === round.roundKey ? { ...r, postContent: content } : r
        )
      );
      setEditedContent((prev) => {
        const next = new Map(prev);
        next.delete(round.roundKey);
        return next;
      });
      toast.success("Gespeichert");
    } catch {
      toast.error("Fehler beim Speichern");
    } finally {
      setSaving((prev) => {
        const next = new Set(prev);
        next.delete(round.roundKey);
        return next;
      });
    }
  }

  function handleCopy(content: string) {
    navigator.clipboard.writeText(content);
    toast.success("In Zwischenablage kopiert");
  }

  function getDisplayContent(round: RoundWithPostStatus): string {
    return editedContent.get(round.roundKey) ?? round.postContent ?? "";
  }

  function hasUnsavedChanges(round: RoundWithPostStatus): boolean {
    const edited = editedContent.get(round.roundKey);
    return edited != null && edited !== round.postContent;
  }

  return (
    <div className="flex h-[calc(100vh-1.5rem)] flex-col gap-2">
      {/* Header */}
      <div className="flex items-center gap-3 shrink-0">
        <FileText className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Beitr&auml;ge</h1>
        <div className="relative ml-4 max-w-xs flex-1">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Suchen..."
            className="h-7 pl-7 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {/* Filter tabs */}
        <div className="flex items-center gap-1 ml-2">
          {(["all", "with", "without"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {f === "all" ? "Alle" : f === "with" ? "Mit Beitrag" : "Ohne Beitrag"}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
          <span>{rounds.length} Runden</span>
          <span>&middot;</span>
          <span className="text-emerald-600 dark:text-emerald-400">
            {postCount} Beitr&auml;ge
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto rounded border">
        {loading ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-7" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
            Keine Funding-Runden gefunden.
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[24px] text-xs" />
                <TableHead className="w-[32px] text-xs" />
                <TableHead className="text-xs font-semibold">Firma</TableHead>
                <TableHead className="w-[100px] text-right text-xs font-semibold">
                  Betrag (&euro;)
                </TableHead>
                <TableHead className="w-[80px] text-xs font-semibold">Stage</TableHead>
                <TableHead className="w-[60px] text-xs font-semibold">Land</TableHead>
                <TableHead className="w-[150px] text-xs font-semibold">Lead</TableHead>
                <TableHead className="w-[80px] text-center text-xs font-semibold">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((round) => {
                const isExpanded = expanded.has(round.roundKey);
                const isGenerating = generating.has(round.roundKey);
                const content = getDisplayContent(round);
                const unsaved = hasUnsavedChanges(round);

                return (
                  <Fragment key={round.roundKey}>
                    <TableRow
                      className={`cursor-pointer text-xs ${
                        isExpanded ? "bg-accent/50" : ""
                      }`}
                      onClick={() => toggleExpand(round.roundKey)}
                    >
                      <TableCell className="py-1.5 px-1 text-center">
                        {isExpanded ? (
                          <ChevronDown className="h-3 w-3 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 px-1">
                        {round.logoUrl ? (
                          <img
                            src={round.logoUrl}
                            alt=""
                            className="h-5 w-5 rounded object-contain"
                          />
                        ) : (
                          <div className="h-5 w-5 rounded bg-muted" />
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 px-2 font-medium">
                        {round.companyName}
                      </TableCell>
                      <TableCell className="py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                        {fmtEur(round.amountEur)}
                      </TableCell>
                      <TableCell className="py-1.5 px-2">
                        {round.stage ? (
                          <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-medium">
                            {round.stage}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">&mdash;</span>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 px-2 text-[10px]">
                        {round.country ?? (
                          <span className="text-muted-foreground/40">&mdash;</span>
                        )}
                      </TableCell>
                      <TableCell
                        className="py-1.5 px-2 truncate max-w-[150px]"
                        title={round.leadInvestor || ""}
                      >
                        {round.leadInvestor ?? (
                          <span className="text-muted-foreground/40">&mdash;</span>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 px-2 text-center">
                        {round.hasPost ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500 mx-auto" />
                        ) : isGenerating ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground mx-auto" />
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleGenerate(round);
                            }}
                            className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                          >
                            <Sparkles className="h-3 w-3" />
                            Generieren
                          </button>
                        )}
                      </TableCell>
                    </TableRow>

                    {/* Expanded: Post content */}
                    {isExpanded && (
                      <TableRow
                        key={`${round.roundKey}-expand`}
                        className="text-xs hover:bg-transparent"
                      >
                        <TableCell colSpan={8} className="py-3 px-4">
                          {round.hasPost ? (
                            <div className="space-y-2 max-w-2xl">
                              <textarea
                                className="w-full rounded border border-input bg-transparent p-2 text-sm leading-relaxed resize-y min-h-[120px] focus:outline-none focus:ring-1 focus:ring-ring"
                                value={content}
                                onChange={(e) =>
                                  setEditedContent((prev) =>
                                    new Map(prev).set(
                                      round.roundKey,
                                      e.target.value
                                    )
                                  )
                                }
                              />
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs gap-1"
                                  onClick={() => handleCopy(content)}
                                >
                                  <Copy className="h-3 w-3" />
                                  Kopieren
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs gap-1"
                                  disabled={isGenerating}
                                  onClick={() => handleGenerate(round)}
                                >
                                  {isGenerating ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <RefreshCw className="h-3 w-3" />
                                  )}
                                  Neu generieren
                                </Button>
                                {unsaved && (
                                  <Button
                                    size="sm"
                                    className="h-7 text-xs gap-1"
                                    disabled={saving.has(round.roundKey)}
                                    onClick={() => handleSave(round)}
                                  >
                                    {saving.has(round.roundKey) ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Save className="h-3 w-3" />
                                    )}
                                    Speichern
                                  </Button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3">
                              <span className="text-muted-foreground">
                                Noch kein Beitrag vorhanden.
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs gap-1"
                                disabled={isGenerating}
                                onClick={() => handleGenerate(round)}
                              >
                                {isGenerating ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Sparkles className="h-3 w-3" />
                                )}
                                Beitrag generieren
                              </Button>
                            </div>
                          )}
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
