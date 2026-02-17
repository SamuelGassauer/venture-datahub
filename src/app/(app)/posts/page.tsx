"use client";

import { Fragment, useEffect, useState, useCallback, useMemo } from "react";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Check,
  Loader2,
  Sparkles,
  Copy,
  RefreshCw,
  Save,
  FileText,
  Upload,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { SmartLogo } from "@/components/ui/smart-logo";
import type { RoundWithPostStatus } from "@/app/api/posts/rounds/route";
import {
  REGION_COUNTRIES,
  REGION_PRESETS,
  STAGES,
  STAGE_COLORS,
} from "@/lib/global-filters";

type PostFilter = "all" | "with" | "without" | "published";
type SortKey = "companyName" | "amountEur" | "stage" | "country" | "articleDate";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 25;

function fmtEur(n: number | null | undefined): string {
  if (!n) return "\u2014";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1).replace(".", ",")} Mrd. \u20AC`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(".", ",")} Mio. \u20AC`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} Tsd. \u20AC`;
  return `${n.toFixed(0)} \u20AC`;
}

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return "\u2014";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "\u2014";
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Build region filter options
const REGION_OPTIONS: { label: string; countries: Set<string> }[] = [
  {
    label: "Europa",
    countries: new Set(
      (REGION_COUNTRIES["Europe"] ?? []).map((c) => c.toLowerCase())
    ),
  },
  ...REGION_PRESETS.map((p) => ({
    label: p.label,
    countries: new Set(p.countries.map((c) => c.toLowerCase())),
  })),
];

export default function PostsPage() {
  const [rounds, setRounds] = useState<RoundWithPostStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [postFilter, setPostFilter] = useState<PostFilter>("all");
  const [regionFilter, setRegionFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("articleDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState<Set<string>>(new Set());
  const [editedContent, setEditedContent] = useState<Map<string, string>>(
    new Map()
  );
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [publishing, setPublishing] = useState<Set<string>>(new Set());
  const [wizardRound, setWizardRound] = useState<RoundWithPostStatus | null>(null);
  const [checkedFields, setCheckedFields] = useState<Set<string>>(new Set());

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

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [searchDebounced, postFilter, regionFilter, stageFilter, sortKey, sortDir]);

  // Resolve region filter to a country set
  const regionCountries = useMemo(() => {
    if (!regionFilter) return null;
    const opt = REGION_OPTIONS.find((o) => o.label === regionFilter);
    return opt?.countries ?? null;
  }, [regionFilter]);

  // Filter + sort
  const filtered = useMemo(() => {
    let list = rounds.filter((r) => {
      if (postFilter === "with" && !r.hasPost) return false;
      if (postFilter === "without" && r.hasPost) return false;
      if (postFilter === "published" && !r.publishedAt) return false;
      if (regionCountries && (!r.country || !regionCountries.has(r.country.toLowerCase()))) return false;
      if (stageFilter && r.stage !== stageFilter) return false;
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

    // Sort
    list = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "companyName":
          cmp = a.companyName.localeCompare(b.companyName);
          break;
        case "amountEur":
          cmp = (a.amountEur ?? 0) - (b.amountEur ?? 0);
          break;
        case "stage":
          cmp = (a.stage ?? "").localeCompare(b.stage ?? "");
          break;
        case "country":
          cmp = (a.country ?? "").localeCompare(b.country ?? "");
          break;
        case "articleDate":
          cmp =
            new Date(a.articleDate ?? 0).getTime() -
            new Date(b.articleDate ?? 0).getTime();
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [rounds, postFilter, regionCountries, stageFilter, searchDebounced, sortKey, sortDir]);

  // Stats
  const totalCapital = useMemo(
    () => filtered.reduce((sum, r) => sum + (r.amountEur ?? 0), 0),
    [filtered]
  );
  const postCount = rounds.filter((r) => r.hasPost).length;

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageStart = page * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + PAGE_SIZE, filtered.length);
  const paged = filtered.slice(pageStart, pageEnd);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "articleDate" || key === "amountEur" ? "desc" : "asc");
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col)
      return <ArrowUpDown className="h-3 w-3 ml-0.5 opacity-40" />;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 ml-0.5" />
    ) : (
      <ArrowDown className="h-3 w-3 ml-0.5" />
    );
  }

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
      setEditedContent((prev) => {
        const next = new Map(prev);
        next.delete(round.roundKey);
        return next;
      });
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

  async function handlePublish(round: RoundWithPostStatus) {
    if (!round.postId) return;
    setPublishing((prev) => new Set(prev).add(round.roundKey));
    try {
      const res = await fetch(`/api/posts/${round.postId}/publish`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Fehler beim Publishen");
        return;
      }
      setRounds((prev) =>
        prev.map((r) =>
          r.roundKey === round.roundKey
            ? { ...r, publishedAt: json.publishedAt }
            : r
        )
      );
      toast.success("Erfolgreich veröffentlicht");
    } catch {
      toast.error("Fehler beim Publishen");
    } finally {
      setPublishing((prev) => {
        const next = new Set(prev);
        next.delete(round.roundKey);
        return next;
      });
    }
  }

  function getDisplayContent(round: RoundWithPostStatus): string {
    return editedContent.get(round.roundKey) ?? round.postContent ?? "";
  }

  function hasUnsavedChanges(round: RoundWithPostStatus): boolean {
    const edited = editedContent.get(round.roundKey);
    return edited != null && edited !== round.postContent;
  }

  function openWizard(round: RoundWithPostStatus) {
    setWizardRound(round);
    setCheckedFields(new Set());
  }

  function toggleCheck(field: string) {
    setCheckedFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }

  function getRequiredFields(round: RoundWithPostStatus): string[] {
    const fields: string[] = [];
    // Company section
    fields.push("companyName"); // always present
    if (round.description) fields.push("description");
    if (round.country) fields.push("country");
    // Funding section
    if (round.amountEur) fields.push("amount");
    if (round.stage) fields.push("stage");
    if (round.articleDate) fields.push("articleDate");
    // Sources
    for (const src of round.sources) {
      fields.push(`source_${src.url}`);
    }
    // Investors
    for (const inv of round.allInvestors) {
      fields.push(`investor_${inv}`);
    }
    // Content
    if (round.postContent) fields.push("content");
    return fields;
  }

  const colSpan = 9; // expand + logo + firma + betrag + stage + land + datum + lead + status

  return (
    <div className="flex h-[calc(100vh-1.5rem)] flex-col gap-2">
      {/* Header */}
      <div className="flex items-center gap-3 shrink-0 flex-wrap">
        <FileText className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Beitr&auml;ge</h1>
        <div className="relative ml-4 max-w-xs flex-1 min-w-[140px]">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Suchen..."
            className="h-7 pl-7 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Region dropdown */}
        <select
          className="h-7 rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value)}
        >
          <option value="">Alle Regionen</option>
          {REGION_OPTIONS.map((o) => (
            <option key={o.label} value={o.label}>
              {o.label}
            </option>
          ))}
        </select>

        {/* Stage dropdown */}
        <select
          className="h-7 rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
        >
          <option value="">Alle Stages</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {/* Post filter tabs */}
        <div className="flex items-center gap-1 ml-2">
          {(["all", "with", "published", "without"] as PostFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setPostFilter(f)}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                postFilter === f
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {f === "all"
                ? "Alle"
                : f === "with"
                  ? "Mit Beitrag"
                  : f === "published"
                    ? "Veröffentlicht"
                    : "Ohne Beitrag"}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
          <span>
            {filtered.length} Runden &middot; {fmtEur(totalCapital)}
          </span>
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
                <TableHead
                  className="text-xs font-semibold cursor-pointer select-none"
                  onClick={() => handleSort("companyName")}
                >
                  <span className="inline-flex items-center">
                    Firma
                    <SortIcon col="companyName" />
                  </span>
                </TableHead>
                <TableHead
                  className="w-[100px] text-right text-xs font-semibold cursor-pointer select-none"
                  onClick={() => handleSort("amountEur")}
                >
                  <span className="inline-flex items-center justify-end">
                    Betrag (&euro;)
                    <SortIcon col="amountEur" />
                  </span>
                </TableHead>
                <TableHead
                  className="w-[80px] text-xs font-semibold cursor-pointer select-none"
                  onClick={() => handleSort("stage")}
                >
                  <span className="inline-flex items-center">
                    Stage
                    <SortIcon col="stage" />
                  </span>
                </TableHead>
                <TableHead
                  className="w-[60px] text-xs font-semibold cursor-pointer select-none"
                  onClick={() => handleSort("country")}
                >
                  <span className="inline-flex items-center">
                    Land
                    <SortIcon col="country" />
                  </span>
                </TableHead>
                <TableHead
                  className="w-[85px] text-xs font-semibold cursor-pointer select-none"
                  onClick={() => handleSort("articleDate")}
                >
                  <span className="inline-flex items-center">
                    Datum
                    <SortIcon col="articleDate" />
                  </span>
                </TableHead>
                <TableHead className="w-[150px] text-xs font-semibold">
                  Lead
                </TableHead>
                <TableHead className="w-[80px] text-center text-xs font-semibold">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((round) => {
                const isExpanded = expanded.has(round.roundKey);
                const isGenerating = generating.has(round.roundKey);
                const content = getDisplayContent(round);
                const unsaved = hasUnsavedChanges(round);
                const stageColor =
                  round.stage && STAGE_COLORS[round.stage]
                    ? STAGE_COLORS[round.stage]
                    : "bg-muted";

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
                          <SmartLogo
                            src={round.logoUrl}
                            alt=""
                            className="h-5 w-5 rounded"
                            fallback={
                              <div className="h-5 w-5 rounded bg-muted" />
                            }
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
                          <span
                            className={`rounded border px-1 py-0.5 text-[10px] font-medium ${stageColor}`}
                          >
                            {round.stage}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">
                            &mdash;
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 px-2 text-[10px]">
                        {round.country ?? (
                          <span className="text-muted-foreground/40">
                            &mdash;
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 px-2 text-[10px] tabular-nums whitespace-nowrap">
                        {fmtDate(round.articleDate)}
                      </TableCell>
                      <TableCell
                        className="py-1.5 px-2 truncate max-w-[150px]"
                        title={round.leadInvestor || ""}
                      >
                        {round.leadInvestor ?? (
                          <span className="text-muted-foreground/40">
                            &mdash;
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 px-2 text-center">
                        {round.publishedAt ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500 mx-auto" />
                        ) : round.hasPost ? (
                          <Check className="h-3.5 w-3.5 text-orange-400 mx-auto" />
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
                        <TableCell colSpan={colSpan} className="py-3 px-4">
                          {round.hasPost ? (
                            <div className="space-y-2 max-w-2xl">
                              {round.publishedAt && (
                                <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
                                  Ver&ouml;ffentlicht am{" "}
                                  {new Date(
                                    round.publishedAt
                                  ).toLocaleDateString("de-DE", {
                                    day: "2-digit",
                                    month: "2-digit",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </p>
                              )}
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
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs gap-1 ml-auto"
                                  disabled={
                                    publishing.has(round.roundKey) || unsaved
                                  }
                                  onClick={() => openWizard(round)}
                                >
                                  {publishing.has(round.roundKey) ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Upload className="h-3 w-3" />
                                  )}
                                  {round.publishedAt
                                    ? "Erneut publishen"
                                    : "Publish"}
                                </Button>
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

      {/* Pagination */}
      {!loading && filtered.length > 0 && (
        <div className="flex items-center justify-between shrink-0 text-xs text-muted-foreground px-1">
          <span className="tabular-nums">
            {pageStart + 1}&ndash;{pageEnd} von {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-2 tabular-nums">
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Publish Wizard Sheet */}
      <Sheet open={!!wizardRound} onOpenChange={(open) => !open && setWizardRound(null)}>
        <SheetContent side="right" className="sm:max-w-lg w-full flex flex-col p-0">
          {wizardRound && (() => {
            const required = getRequiredFields(wizardRound);
            const allChecked = required.length > 0 && required.every((f) => checkedFields.has(f));
            const wStageColor = wizardRound.stage && STAGE_COLORS[wizardRound.stage]
              ? STAGE_COLORS[wizardRound.stage]
              : "bg-muted";

            return (
              <>
                <SheetHeader className="px-6 pt-6 pb-0">
                  <SheetTitle>Beitrag ver&ouml;ffentlichen</SheetTitle>
                  <SheetDescription>{wizardRound.companyName}</SheetDescription>
                </SheetHeader>

                <ScrollArea className="flex-1 px-6 py-4">
                  <div className="space-y-5">
                    {/* Company section */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Unternehmen</h4>
                      <div className="space-y-3">
                        {/* Company name + logo */}
                        <label className="flex items-center gap-3 cursor-pointer">
                          <Checkbox
                            checked={checkedFields.has("companyName")}
                            onCheckedChange={() => toggleCheck("companyName")}
                          />
                          <div className="flex items-center gap-2">
                            {wizardRound.logoUrl ? (
                              <SmartLogo
                                src={wizardRound.logoUrl}
                                alt=""
                                className="h-6 w-6 rounded"
                                fallback={<div className="h-6 w-6 rounded bg-muted" />}
                              />
                            ) : (
                              <div className="h-6 w-6 rounded bg-muted" />
                            )}
                            <span className="text-sm font-medium">{wizardRound.companyName}</span>
                          </div>
                        </label>

                        {/* Description */}
                        {wizardRound.description ? (
                          <label className="flex items-start gap-3 cursor-pointer">
                            <Checkbox
                              className="mt-0.5"
                              checked={checkedFields.has("description")}
                              onCheckedChange={() => toggleCheck("description")}
                            />
                            <span className="text-sm text-muted-foreground line-clamp-3">{wizardRound.description}</span>
                          </label>
                        ) : (
                          <div className="flex items-center gap-3 opacity-40">
                            <Checkbox disabled />
                            <span className="text-sm text-muted-foreground">Keine Beschreibung</span>
                          </div>
                        )}

                        {/* Country */}
                        {wizardRound.country ? (
                          <label className="flex items-center gap-3 cursor-pointer">
                            <Checkbox
                              checked={checkedFields.has("country")}
                              onCheckedChange={() => toggleCheck("country")}
                            />
                            <span className="text-sm">Land: {wizardRound.country}</span>
                          </label>
                        ) : (
                          <div className="flex items-center gap-3 opacity-40">
                            <Checkbox disabled />
                            <span className="text-sm text-muted-foreground">Kein Land</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <Separator />

                    {/* Funding section */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Funding-Runde</h4>
                      <div className="space-y-3">
                        {/* Amount */}
                        {wizardRound.amountEur ? (
                          <label className="flex items-center gap-3 cursor-pointer">
                            <Checkbox
                              checked={checkedFields.has("amount")}
                              onCheckedChange={() => toggleCheck("amount")}
                            />
                            <span className="text-sm font-mono">{fmtEur(wizardRound.amountEur)}</span>
                          </label>
                        ) : (
                          <div className="flex items-center gap-3 opacity-40">
                            <Checkbox disabled />
                            <span className="text-sm text-muted-foreground">Kein Betrag</span>
                          </div>
                        )}

                        {/* Stage */}
                        {wizardRound.stage ? (
                          <label className="flex items-center gap-3 cursor-pointer">
                            <Checkbox
                              checked={checkedFields.has("stage")}
                              onCheckedChange={() => toggleCheck("stage")}
                            />
                            <span className={`rounded border px-1.5 py-0.5 text-xs font-medium ${wStageColor}`}>
                              {wizardRound.stage}
                            </span>
                          </label>
                        ) : (
                          <div className="flex items-center gap-3 opacity-40">
                            <Checkbox disabled />
                            <span className="text-sm text-muted-foreground">Keine Stage</span>
                          </div>
                        )}

                        {/* Article date */}
                        {wizardRound.articleDate ? (
                          <label className="flex items-center gap-3 cursor-pointer">
                            <Checkbox
                              checked={checkedFields.has("articleDate")}
                              onCheckedChange={() => toggleCheck("articleDate")}
                            />
                            <span className="text-sm">Artikeldatum: {fmtDate(wizardRound.articleDate)}</span>
                          </label>
                        ) : (
                          <div className="flex items-center gap-3 opacity-40">
                            <Checkbox disabled />
                            <span className="text-sm text-muted-foreground">Kein Datum</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <Separator />

                    {/* Sources section */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                        Quellen ({wizardRound.sources.length})
                      </h4>
                      {wizardRound.sources.length > 0 ? (
                        <div className="space-y-3">
                          {wizardRound.sources.map((src) => {
                            const fieldKey = `source_${src.url}`;
                            return (
                              <label key={src.url} className="flex items-start gap-3 cursor-pointer">
                                <Checkbox
                                  className="mt-0.5"
                                  checked={checkedFields.has(fieldKey)}
                                  onCheckedChange={() => toggleCheck(fieldKey)}
                                />
                                <div className="flex flex-col gap-0.5 min-w-0">
                                  <span className="text-sm truncate">{src.title || "Ohne Titel"}</span>
                                  <a
                                    href={src.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[11px] text-blue-500 hover:text-blue-600 truncate inline-flex items-center gap-1"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <ExternalLink className="h-3 w-3 shrink-0" />
                                    {src.url.replace(/^https?:\/\//, "").substring(0, 60)}
                                  </a>
                                  {src.publishedAt && (
                                    <span className="text-[10px] text-muted-foreground">{fmtDate(src.publishedAt)}</span>
                                  )}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground/40">Keine Quellen</p>
                      )}
                    </div>

                    <Separator />

                    {/* Investors section */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                        Investoren ({wizardRound.allInvestors.length})
                      </h4>
                      {wizardRound.allInvestors.length > 0 ? (
                        <div className="space-y-3">
                          {wizardRound.allInvestors.map((inv) => {
                            const isLead = inv === wizardRound.leadInvestor;
                            const fieldKey = `investor_${inv}`;
                            return (
                              <label key={inv} className="flex items-center gap-3 cursor-pointer">
                                <Checkbox
                                  checked={checkedFields.has(fieldKey)}
                                  onCheckedChange={() => toggleCheck(fieldKey)}
                                />
                                <span className="text-sm">{inv}</span>
                                {isLead && (
                                  <span className="rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 text-[10px] font-medium">
                                    Lead
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground/40">Keine Investoren</p>
                      )}
                    </div>

                    <Separator />

                    {/* Content preview */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Beitrag</h4>
                      {wizardRound.postContent ? (
                        <div className="space-y-3">
                          <textarea
                            readOnly
                            className="w-full rounded border border-input bg-muted/30 p-3 text-sm leading-relaxed resize-none min-h-[160px] max-h-[240px] overflow-y-auto focus:outline-none"
                            value={wizardRound.postContent}
                          />
                          <label className="flex items-center gap-3 cursor-pointer">
                            <Checkbox
                              checked={checkedFields.has("content")}
                              onCheckedChange={() => toggleCheck("content")}
                            />
                            <span className="text-sm font-medium">Beitrag gepr&uuml;ft</span>
                          </label>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground/40">Kein Beitrag vorhanden</p>
                      )}
                    </div>
                  </div>
                </ScrollArea>

                <Separator />

                <SheetFooter className="px-6 py-4">
                  <div className="flex items-center justify-between w-full gap-3">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {checkedFields.size} / {required.length}
                    </span>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setWizardRound(null)}>
                        Abbrechen
                      </Button>
                      <Button
                        size="sm"
                        disabled={!allChecked || publishing.has(wizardRound.roundKey)}
                        onClick={async () => {
                          await handlePublish(wizardRound);
                          setWizardRound(null);
                        }}
                      >
                        {publishing.has(wizardRound.roundKey) ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                        ) : (
                          <Upload className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Ver&ouml;ffentlichen
                      </Button>
                    </div>
                  </div>
                </SheetFooter>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
