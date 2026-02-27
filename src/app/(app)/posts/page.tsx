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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  ImageIcon,
  Pencil,
  Globe,
} from "lucide-react";
import { toast } from "sonner";
import { SmartLogo } from "@/components/ui/smart-logo";
import { LogoPicker } from "@/components/graph/logo-picker";
import { LiquidGlass } from "@/components/ui/liquid-glass";
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
  const [logoPickerOpen, setLogoPickerOpen] = useState(false);
  const [logoPickerTarget, setLogoPickerTarget] = useState<{
    entityType: "company" | "investor";
    name: string;
    website: string;
  } | null>(null);
  const [editingWebsite, setEditingWebsite] = useState<string | null>(null); // key like "company" or "investor_Name"
  const [editingWebsiteValue, setEditingWebsiteValue] = useState("");
  const [savingWebsite, setSavingWebsite] = useState(false);

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
      return <ArrowUpDown className="h-3 w-3 ml-0.5 text-foreground/30" />;
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

  function openLogoPicker(entityType: "company" | "investor", name: string, website: string) {
    setLogoPickerTarget({ entityType, name, website });
    setLogoPickerOpen(true);
  }

  function handleLogoSelected(logoUrl: string) {
    if (!logoPickerTarget || !wizardRound) return;
    if (logoPickerTarget.entityType === "company") {
      // Update company logo in rounds state and wizard
      const updated = { ...wizardRound, logoUrl };
      setWizardRound(updated);
      setRounds((prev) =>
        prev.map((r) =>
          r.roundKey === wizardRound.roundKey ? { ...r, logoUrl } : r
        )
      );
    } else {
      // Update investor logo in rounds state and wizard
      const investorName = logoPickerTarget.name;
      const updatedDetails = wizardRound.investorDetails.map((d) =>
        d.name === investorName ? { ...d, logoUrl } : d
      );
      const updated = { ...wizardRound, investorDetails: updatedDetails };
      setWizardRound(updated);
      setRounds((prev) =>
        prev.map((r) =>
          r.roundKey === wizardRound.roundKey
            ? { ...r, investorDetails: updatedDetails }
            : r
        )
      );
    }
  }

  async function saveWebsite(entityType: "company" | "investor", entityName: string, value: string) {
    setSavingWebsite(true);
    try {
      const res = await fetch("/api/update-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityName, field: "website", value }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error || "Fehler beim Speichern der URL");
        return;
      }
      // Update local state
      if (!wizardRound) return;
      if (entityType === "company") {
        const updated = { ...wizardRound, companyWebsite: value || null };
        setWizardRound(updated);
        setRounds((prev) =>
          prev.map((r) =>
            r.roundKey === wizardRound.roundKey ? { ...r, companyWebsite: value || null } : r
          )
        );
      } else {
        const updatedDetails = wizardRound.investorDetails.map((d) =>
          d.name === entityName ? { ...d, website: value || null } : d
        );
        const updated = { ...wizardRound, investorDetails: updatedDetails };
        setWizardRound(updated);
        setRounds((prev) =>
          prev.map((r) =>
            r.roundKey === wizardRound.roundKey
              ? { ...r, investorDetails: updatedDetails }
              : r
          )
        );
      }
      setEditingWebsite(null);
      toast.success("Website gespeichert");
    } catch {
      toast.error("Fehler beim Speichern der URL");
    } finally {
      setSavingWebsite(false);
    }
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
    <div className="flex h-[calc(100vh-1.5rem)] flex-col">
      {/* Filter toolbar */}
      <div className="glass-status-bar px-4 py-2.5 flex items-center gap-3 shrink-0 flex-wrap">
        <FileText className="h-5 w-5 text-foreground/40" />
        <h1 className="text-[17px] tracking-[-0.02em] font-semibold text-foreground/85">Beitr&auml;ge</h1>
        <div className="relative ml-4 max-w-xs flex-1 min-w-[140px]">
          <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-foreground/30" />
          <Input
            placeholder="Suchen..."
            className="glass-search-input h-7 pl-7 text-[13px] tracking-[-0.01em]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Region dropdown */}
        <select
          className="glass-capsule-btn h-7 px-3 text-[13px] tracking-[-0.01em] text-foreground/55 appearance-none cursor-pointer"
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
          className="glass-capsule-btn h-7 px-3 text-[13px] tracking-[-0.01em] text-foreground/55 appearance-none cursor-pointer"
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
              className={`glass-capsule-btn px-2.5 py-1 text-[13px] tracking-[-0.01em] font-medium transition-colors ${
                postFilter === f
                  ? "bg-foreground/[0.08] text-foreground/85"
                  : "text-foreground/45 hover:text-foreground/70"
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
        <div className="ml-auto flex items-center gap-3 text-[12px] tracking-[-0.01em] tabular-nums text-foreground/40">
          <span className="text-foreground/55">
            {filtered.length} Runden &middot; {fmtEur(totalCapital)}
          </span>
          <span className="text-foreground/30">&middot;</span>
          <span className="text-emerald-600 dark:text-emerald-400">
            {postCount} Beitr&auml;ge
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-4">
        <div className="lg-inset rounded-[16px]">
          {loading ? (
            <div className="space-y-1 p-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="h-7 rounded-[6px]" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-[13px] tracking-[-0.01em] text-foreground/40">
              Keine Funding-Runden gefunden.
            </div>
          ) : (
            <Table>
              <TableHeader className="glass-table-header sticky top-0 z-20">
                <TableRow className="hover:bg-transparent border-0">
                  <TableHead className="w-[24px] text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35" />
                  <TableHead className="w-[32px] text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35" />
                  <TableHead
                    className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35 cursor-pointer select-none"
                    onClick={() => handleSort("companyName")}
                  >
                    <span className="inline-flex items-center">
                      Firma
                      <SortIcon col="companyName" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="w-[100px] text-right text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35 cursor-pointer select-none"
                    onClick={() => handleSort("amountEur")}
                  >
                    <span className="inline-flex items-center justify-end">
                      Betrag (&euro;)
                      <SortIcon col="amountEur" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="w-[80px] text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35 cursor-pointer select-none"
                    onClick={() => handleSort("stage")}
                  >
                    <span className="inline-flex items-center">
                      Stage
                      <SortIcon col="stage" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="w-[60px] text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35 cursor-pointer select-none"
                    onClick={() => handleSort("country")}
                  >
                    <span className="inline-flex items-center">
                      Land
                      <SortIcon col="country" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="w-[85px] text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35 cursor-pointer select-none"
                    onClick={() => handleSort("articleDate")}
                  >
                    <span className="inline-flex items-center">
                      Datum
                      <SortIcon col="articleDate" />
                    </span>
                  </TableHead>
                  <TableHead className="w-[150px] text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
                    Lead
                  </TableHead>
                  <TableHead className="w-[80px] text-center text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
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
                      : "bg-foreground/[0.04]";

                  return (
                    <Fragment key={round.roundKey}>
                      <TableRow
                        className={`lg-inset-table-row border-0 cursor-pointer text-[13px] tracking-[-0.01em] hover:bg-foreground/[0.02] ${
                          isExpanded ? "bg-foreground/[0.03]" : ""
                        }`}
                        onClick={() => toggleExpand(round.roundKey)}
                      >
                        <TableCell className="py-1.5 px-1 text-center">
                          {isExpanded ? (
                            <ChevronDown className="h-3 w-3 text-foreground/40" />
                          ) : (
                            <ChevronRight className="h-3 w-3 text-foreground/40" />
                          )}
                        </TableCell>
                        <TableCell className="py-1.5 px-1">
                          {round.logoUrl ? (
                            <SmartLogo
                              src={round.logoUrl}
                              alt=""
                              className="h-5 w-5 rounded-[4px]"
                              fallback={
                                <div className="h-5 w-5 rounded-[4px] bg-foreground/[0.04]" />
                              }
                            />
                          ) : (
                            <div className="h-5 w-5 rounded-[4px] bg-foreground/[0.04]" />
                          )}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 font-semibold text-foreground/85">
                          {round.companyName}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap text-foreground/55">
                          {fmtEur(round.amountEur)}
                        </TableCell>
                        <TableCell className="py-1.5 px-2">
                          {round.stage ? (
                            <span
                              className={`rounded-[6px] px-1.5 py-0.5 text-[10px] font-medium ${stageColor}`}
                            >
                              {round.stage}
                            </span>
                          ) : (
                            <span className="text-foreground/30">
                              &mdash;
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-[12px] tracking-[-0.01em] text-foreground/55">
                          {round.country ?? (
                            <span className="text-foreground/30">
                              &mdash;
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-1.5 px-2 text-[12px] tracking-[-0.01em] tabular-nums whitespace-nowrap text-foreground/45">
                          {fmtDate(round.articleDate)}
                        </TableCell>
                        <TableCell
                          className="py-1.5 px-2 truncate max-w-[150px] text-foreground/55"
                          title={round.leadInvestor || ""}
                        >
                          {round.leadInvestor ?? (
                            <span className="text-foreground/30">
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
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground/40 mx-auto" />
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleGenerate(round);
                              }}
                              className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium bg-foreground/[0.04] text-foreground/55 hover:bg-foreground/[0.08] transition-colors"
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
                          className="border-0 hover:bg-transparent"
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
                                  className="w-full rounded-[10px] bg-foreground/[0.03] p-2 text-[13px] tracking-[-0.01em] leading-relaxed resize-y min-h-[120px] text-foreground/70 focus:outline-none focus:ring-1 focus:ring-foreground/[0.12]"
                                  style={{ borderWidth: "0.5px", borderColor: "rgba(0,0,0,0.06)" }}
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
                                  <button
                                    className="glass-capsule-btn h-7 px-3 text-[13px] tracking-[-0.01em] inline-flex items-center gap-1 text-foreground/55"
                                    onClick={() => handleCopy(content)}
                                  >
                                    <Copy className="h-3 w-3" />
                                    Kopieren
                                  </button>
                                  <button
                                    className="glass-capsule-btn h-7 px-3 text-[13px] tracking-[-0.01em] inline-flex items-center gap-1 text-foreground/55 disabled:opacity-40"
                                    disabled={isGenerating}
                                    onClick={() => handleGenerate(round)}
                                  >
                                    {isGenerating ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <RefreshCw className="h-3 w-3" />
                                    )}
                                    Neu generieren
                                  </button>
                                  {unsaved && (
                                    <button
                                      className="glass-capsule-btn h-7 px-3 text-[13px] tracking-[-0.01em] inline-flex items-center gap-1 text-foreground/85 bg-foreground/[0.06] disabled:opacity-40"
                                      disabled={saving.has(round.roundKey)}
                                      onClick={() => handleSave(round)}
                                    >
                                      {saving.has(round.roundKey) ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <Save className="h-3 w-3" />
                                      )}
                                      Speichern
                                    </button>
                                  )}
                                  <button
                                    className="apple-btn-blue h-7 px-3 text-[13px] tracking-[-0.01em] inline-flex items-center gap-1 ml-auto disabled:opacity-40"
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
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-3">
                                <span className="text-[13px] tracking-[-0.01em] text-foreground/45">
                                  Noch kein Beitrag vorhanden.
                                </span>
                                <button
                                  className="glass-capsule-btn h-7 px-3 text-[13px] tracking-[-0.01em] inline-flex items-center gap-1 text-foreground/55 disabled:opacity-40"
                                  disabled={isGenerating}
                                  onClick={() => handleGenerate(round)}
                                >
                                  {isGenerating ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Sparkles className="h-3 w-3" />
                                  )}
                                  Beitrag generieren
                                </button>
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

      {/* Pagination footer */}
      {!loading && filtered.length > 0 && (
        <div className="glass-status-bar px-4 py-2 flex items-center justify-between shrink-0">
          <span className="text-[12px] tracking-[-0.01em] tabular-nums text-foreground/35">
            {pageStart + 1}&ndash;{pageEnd} von {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              className="glass-capsule-btn h-7 w-7 inline-flex items-center justify-center disabled:opacity-30"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5 text-foreground/55" />
            </button>
            <span className="px-2 text-[12px] tracking-[-0.01em] tabular-nums text-foreground/35">
              {page + 1} / {totalPages}
            </span>
            <button
              className="glass-capsule-btn h-7 w-7 inline-flex items-center justify-center disabled:opacity-30"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5 text-foreground/55" />
            </button>
          </div>
        </div>
      )}

      {/* Publish Wizard Dialog */}
      <Dialog open={!!wizardRound} onOpenChange={(open) => { if (!open) { setWizardRound(null); setEditingWebsite(null); } }}>
        <DialogContent className="!bg-transparent !border-0 !shadow-none !p-0 !gap-0 sm:max-w-[540px] !rounded-none">
          <LiquidGlass distortion={22} blur={44} className="max-h-[85vh] overflow-y-auto p-0">
            <div className="lg-edge-glow" />
            <div className="relative z-10">
          {wizardRound && (() => {
            const required = getRequiredFields(wizardRound);
            const allChecked = required.length > 0 && required.every((f) => checkedFields.has(f));
            const wStageColor = wizardRound.stage && STAGE_COLORS[wizardRound.stage]
              ? STAGE_COLORS[wizardRound.stage]
              : "bg-foreground/[0.04]";

            return (
              <>
                {/* Header with company card */}
                <div className="px-6 pt-6 pb-4 space-y-4">
                  <DialogHeader>
                    <DialogTitle className="text-[17px] tracking-[-0.02em] font-semibold text-foreground/85">Beitrag ver&ouml;ffentlichen</DialogTitle>
                    <DialogDescription className="text-[13px] tracking-[-0.01em] text-foreground/45">
                      Pr&uuml;fe alle Daten und best&auml;tige sie per Checkbox.
                    </DialogDescription>
                  </DialogHeader>

                  {/* Company hero card */}
                  <div className="lg-inset rounded-[14px] flex items-start gap-4 p-4">
                    <button
                      type="button"
                      onClick={() => openLogoPicker("company", wizardRound.companyName, wizardRound.companyWebsite ?? "")}
                      className="relative shrink-0 group"
                      title="Logo &auml;ndern"
                    >
                      {wizardRound.logoUrl ? (
                        <SmartLogo
                          src={wizardRound.logoUrl}
                          alt=""
                          className="h-12 w-12 rounded-[10px]"
                          fallback={<div className="h-12 w-12 rounded-[10px] bg-foreground/[0.04] flex items-center justify-center"><ImageIcon className="h-5 w-5 text-foreground/30" /></div>}
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-[10px] bg-foreground/[0.04] flex items-center justify-center">
                          <ImageIcon className="h-5 w-5 text-foreground/30" />
                        </div>
                      )}
                      <div className="absolute inset-0 rounded-[10px] bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                        <Pencil className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </button>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={checkedFields.has("companyName")}
                          onCheckedChange={() => toggleCheck("companyName")}
                        />
                        <span className="text-[15px] tracking-[-0.02em] font-semibold text-foreground/85 truncate">{wizardRound.companyName}</span>
                        {wizardRound.country && (
                          <span className="text-[12px] tracking-[-0.01em] text-foreground/45">{wizardRound.country}</span>
                        )}
                      </div>
                      {/* Company website inline */}
                      <div className="flex items-center gap-1.5 ml-6">
                        {editingWebsite === "company" ? (
                          <div className="flex items-center gap-1.5 flex-1">
                            <Input
                              className="glass-search-input h-6 text-[12px] tracking-[-0.01em] flex-1 max-w-[280px]"
                              placeholder="https://example.com"
                              value={editingWebsiteValue}
                              onChange={(e) => setEditingWebsiteValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveWebsite("company", wizardRound.companyName, editingWebsiteValue);
                                if (e.key === "Escape") setEditingWebsite(null);
                              }}
                              autoFocus
                            />
                            <button
                              className="glass-capsule-btn h-6 w-6 inline-flex items-center justify-center disabled:opacity-40"
                              disabled={savingWebsite}
                              onClick={() => saveWebsite("company", wizardRound.companyName, editingWebsiteValue)}
                            >
                              {savingWebsite ? <Loader2 className="h-3 w-3 animate-spin text-foreground/40" /> : <Check className="h-3 w-3 text-foreground/55" />}
                            </button>
                          </div>
                        ) : (
                          <>
                            <Globe className="h-3 w-3 text-foreground/30" />
                            {wizardRound.companyWebsite ? (
                              <a
                                href={wizardRound.companyWebsite}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] tracking-[-0.01em] text-blue-500 hover:text-blue-600 truncate max-w-[240px]"
                              >
                                {wizardRound.companyWebsite.replace(/^https?:\/\//, "")}
                              </a>
                            ) : (
                              <a
                                href={`https://www.google.com/search?q=${encodeURIComponent(wizardRound.companyName + " website")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] tracking-[-0.01em] text-foreground/30 hover:text-blue-500 inline-flex items-center gap-1 transition-colors"
                              >
                                <Search className="h-2.5 w-2.5" />
                                Google
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingWebsite("company");
                                setEditingWebsiteValue(wizardRound.companyWebsite ?? "");
                              }}
                              className="rounded-[6px] p-0.5 text-foreground/30 hover:text-foreground/70 hover:bg-foreground/[0.04] transition-colors"
                            >
                              <Pencil className="h-2.5 w-2.5" />
                            </button>
                          </>
                        )}
                      </div>
                      {wizardRound.description && (
                        <p className="text-[12px] tracking-[-0.01em] text-foreground/45 line-clamp-2 ml-6">{wizardRound.description}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Scrollable checklist */}
                <div className="flex-1 overflow-y-auto min-h-0 px-6 pb-4">
                  <div className="space-y-5">
                    {/* Funding details */}
                    <div>
                      <h4 className="text-[11px] font-medium text-foreground/35 uppercase tracking-[0.04em] mb-2">Funding-Runde</h4>
                      <div className="grid grid-cols-3 gap-2">
                        {wizardRound.amountEur ? (
                          <label className="lg-inset-row flex items-center gap-2 rounded-[10px] px-3 py-2 cursor-pointer hover:bg-foreground/[0.02] transition-colors">
                            <Checkbox
                              checked={checkedFields.has("amount")}
                              onCheckedChange={() => toggleCheck("amount")}
                            />
                            <div className="min-w-0">
                              <p className="text-[10px] text-foreground/35">Betrag</p>
                              <p className="text-[13px] tracking-[-0.01em] font-mono font-medium text-foreground/70 truncate">{fmtEur(wizardRound.amountEur)}</p>
                            </div>
                          </label>
                        ) : (
                          <div className="flex items-center gap-2 rounded-[10px] bg-foreground/[0.02] px-3 py-2 opacity-40">
                            <Checkbox disabled />
                            <div><p className="text-[10px] text-foreground/35">Betrag</p><p className="text-[13px] tracking-[-0.01em] text-foreground/45">&mdash;</p></div>
                          </div>
                        )}
                        {wizardRound.stage ? (
                          <label className="lg-inset-row flex items-center gap-2 rounded-[10px] px-3 py-2 cursor-pointer hover:bg-foreground/[0.02] transition-colors">
                            <Checkbox
                              checked={checkedFields.has("stage")}
                              onCheckedChange={() => toggleCheck("stage")}
                            />
                            <div className="min-w-0">
                              <p className="text-[10px] text-foreground/35">Stage</p>
                              <span className={`rounded-[6px] px-1.5 py-0.5 text-[10px] font-medium ${wStageColor}`}>{wizardRound.stage}</span>
                            </div>
                          </label>
                        ) : (
                          <div className="flex items-center gap-2 rounded-[10px] bg-foreground/[0.02] px-3 py-2 opacity-40">
                            <Checkbox disabled />
                            <div><p className="text-[10px] text-foreground/35">Stage</p><p className="text-[13px] tracking-[-0.01em] text-foreground/45">&mdash;</p></div>
                          </div>
                        )}
                        {wizardRound.articleDate ? (
                          <label className="lg-inset-row flex items-center gap-2 rounded-[10px] px-3 py-2 cursor-pointer hover:bg-foreground/[0.02] transition-colors">
                            <Checkbox
                              checked={checkedFields.has("articleDate")}
                              onCheckedChange={() => toggleCheck("articleDate")}
                            />
                            <div className="min-w-0">
                              <p className="text-[10px] text-foreground/35">Datum</p>
                              <p className="text-[13px] tracking-[-0.01em] tabular-nums text-foreground/70">{fmtDate(wizardRound.articleDate)}</p>
                            </div>
                          </label>
                        ) : (
                          <div className="flex items-center gap-2 rounded-[10px] bg-foreground/[0.02] px-3 py-2 opacity-40">
                            <Checkbox disabled />
                            <div><p className="text-[10px] text-foreground/35">Datum</p><p className="text-[13px] tracking-[-0.01em] text-foreground/45">&mdash;</p></div>
                          </div>
                        )}
                        {wizardRound.description && (
                          <label className="lg-inset-row flex items-center gap-2 rounded-[10px] px-3 py-2 cursor-pointer hover:bg-foreground/[0.02] transition-colors col-span-3">
                            <Checkbox
                              checked={checkedFields.has("description")}
                              onCheckedChange={() => toggleCheck("description")}
                            />
                            <div className="min-w-0">
                              <p className="text-[10px] text-foreground/35">Beschreibung</p>
                              <p className="text-[13px] tracking-[-0.01em] text-foreground/55 line-clamp-1">{wizardRound.description}</p>
                            </div>
                          </label>
                        )}
                        {wizardRound.country && (
                          <label className="lg-inset-row flex items-center gap-2 rounded-[10px] px-3 py-2 cursor-pointer hover:bg-foreground/[0.02] transition-colors">
                            <Checkbox
                              checked={checkedFields.has("country")}
                              onCheckedChange={() => toggleCheck("country")}
                            />
                            <div className="min-w-0">
                              <p className="text-[10px] text-foreground/35">Land</p>
                              <p className="text-[13px] tracking-[-0.01em] text-foreground/70">{wizardRound.country}</p>
                            </div>
                          </label>
                        )}
                      </div>
                    </div>

                    {/* Investors */}
                    {wizardRound.allInvestors.length > 0 && (
                      <div>
                        <h4 className="text-[11px] font-medium text-foreground/35 uppercase tracking-[0.04em] mb-2">
                          Investoren ({wizardRound.allInvestors.length})
                        </h4>
                        <div className="space-y-1.5">
                          {wizardRound.allInvestors.map((inv) => {
                            const isLead = inv === wizardRound.leadInvestor;
                            const fieldKey = `investor_${inv}`;
                            const detail = wizardRound.investorDetails.find((d) => d.name === inv);
                            const editKey = `investor_${inv}`;
                            return (
                              <div key={inv} className="lg-inset-row flex items-center gap-3 rounded-[10px] px-3 py-2 hover:bg-foreground/[0.02] transition-colors">
                                <Checkbox
                                  checked={checkedFields.has(fieldKey)}
                                  onCheckedChange={() => toggleCheck(fieldKey)}
                                />
                                <button
                                  type="button"
                                  onClick={() => openLogoPicker("investor", inv, detail?.website ?? "")}
                                  className="relative shrink-0 group"
                                  title="Logo &auml;ndern"
                                >
                                  {detail?.logoUrl ? (
                                    <SmartLogo
                                      src={detail.logoUrl}
                                      alt=""
                                      className="h-8 w-8 rounded-[6px]"
                                      fallback={<div className="h-8 w-8 rounded-[6px] bg-foreground/[0.04] flex items-center justify-center"><ImageIcon className="h-3.5 w-3.5 text-foreground/30" /></div>}
                                    />
                                  ) : (
                                    <div className="h-8 w-8 rounded-[6px] bg-foreground/[0.04] flex items-center justify-center">
                                      <ImageIcon className="h-3.5 w-3.5 text-foreground/30" />
                                    </div>
                                  )}
                                  <div className="absolute inset-0 rounded-[6px] bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                                    <Pencil className="h-3 w-3 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </div>
                                </button>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[13px] tracking-[-0.01em] font-semibold text-foreground/85 truncate cursor-pointer" onClick={() => toggleCheck(fieldKey)}>{inv}</span>
                                    {isLead && (
                                      <span className="shrink-0 rounded-full bg-amber-500/8 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 text-[10px] font-medium">
                                        Lead
                                      </span>
                                    )}
                                  </div>
                                  {/* Investor website */}
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    {editingWebsite === editKey ? (
                                      <div className="flex items-center gap-1.5 flex-1">
                                        <Input
                                          className="glass-search-input h-5 text-[11px] tracking-[-0.01em] flex-1 max-w-[220px]"
                                          placeholder="https://example.com"
                                          value={editingWebsiteValue}
                                          onChange={(e) => setEditingWebsiteValue(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") saveWebsite("investor", inv, editingWebsiteValue);
                                            if (e.key === "Escape") setEditingWebsite(null);
                                          }}
                                          autoFocus
                                        />
                                        <button
                                          className="glass-capsule-btn h-5 w-5 inline-flex items-center justify-center disabled:opacity-40"
                                          disabled={savingWebsite}
                                          onClick={() => saveWebsite("investor", inv, editingWebsiteValue)}
                                        >
                                          {savingWebsite ? <Loader2 className="h-3 w-3 animate-spin text-foreground/40" /> : <Check className="h-3 w-3 text-foreground/55" />}
                                        </button>
                                      </div>
                                    ) : (
                                      <>
                                        <Globe className="h-2.5 w-2.5 text-foreground/30" />
                                        {detail?.website ? (
                                          <a
                                            href={detail.website}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[11px] tracking-[-0.01em] text-blue-500 hover:text-blue-600 truncate max-w-[180px]"
                                          >
                                            {detail.website.replace(/^https?:\/\//, "")}
                                          </a>
                                        ) : (
                                          <a
                                            href={`https://www.google.com/search?q=${encodeURIComponent(inv + " investor website")}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[11px] tracking-[-0.01em] text-foreground/30 hover:text-blue-500 inline-flex items-center gap-1 transition-colors"
                                          >
                                            <Search className="h-2.5 w-2.5" />
                                            Google
                                          </a>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingWebsite(editKey);
                                            setEditingWebsiteValue(detail?.website ?? "");
                                          }}
                                          className="rounded-[6px] p-0.5 text-foreground/30 hover:text-foreground/70 hover:bg-foreground/[0.04] transition-colors"
                                        >
                                          <Pencil className="h-2.5 w-2.5" />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Sources */}
                    {wizardRound.sources.length > 0 && (
                      <div>
                        <h4 className="text-[11px] font-medium text-foreground/35 uppercase tracking-[0.04em] mb-2">
                          Quellen ({wizardRound.sources.length})
                        </h4>
                        <div className="space-y-1.5">
                          {wizardRound.sources.map((src) => {
                            const fieldKey = `source_${src.url}`;
                            return (
                              <label key={src.url} className="lg-inset-row flex items-start gap-3 rounded-[10px] px-3 py-2 cursor-pointer hover:bg-foreground/[0.02] transition-colors">
                                <Checkbox
                                  className="mt-0.5"
                                  checked={checkedFields.has(fieldKey)}
                                  onCheckedChange={() => toggleCheck(fieldKey)}
                                />
                                <div className="flex flex-col gap-0.5 min-w-0">
                                  <span className="text-[13px] tracking-[-0.01em] font-semibold text-foreground/70 truncate">{src.title || "Ohne Titel"}</span>
                                  <a
                                    href={src.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[11px] tracking-[-0.01em] text-blue-500 hover:text-blue-600 truncate inline-flex items-center gap-1"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                                    {src.url.replace(/^https?:\/\//, "").substring(0, 50)}
                                  </a>
                                  {src.publishedAt && (
                                    <span className="text-[10px] text-foreground/30">{fmtDate(src.publishedAt)}</span>
                                  )}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Content preview */}
                    {wizardRound.postContent && (
                      <div>
                        <h4 className="text-[11px] font-medium text-foreground/35 uppercase tracking-[0.04em] mb-2">Beitrag</h4>
                        <div className="space-y-2">
                          <textarea
                            readOnly
                            className="w-full rounded-[10px] bg-foreground/[0.03] p-3 text-[13px] tracking-[-0.01em] leading-relaxed text-foreground/55 resize-none min-h-[120px] max-h-[200px] overflow-y-auto focus:outline-none"
                            style={{ borderWidth: "0.5px", borderColor: "rgba(0,0,0,0.06)" }}
                            value={wizardRound.postContent}
                          />
                          <label className="flex items-center gap-2 cursor-pointer">
                            <Checkbox
                              checked={checkedFields.has("content")}
                              onCheckedChange={() => toggleCheck("content")}
                            />
                            <span className="text-[13px] tracking-[-0.01em] font-medium text-foreground/70">Beitrag gepr&uuml;ft</span>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4" style={{ borderTopWidth: "0.5px", borderColor: "rgba(0,0,0,0.06)" }}>
                  <div className="flex items-center justify-between w-full gap-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 min-w-[80px] rounded-full bg-foreground/[0.06] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-500 transition-all"
                          style={{ width: `${required.length > 0 ? (checkedFields.size / required.length) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-[11px] tracking-[-0.01em] text-foreground/35 tabular-nums">
                        {checkedFields.size}/{required.length}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button className="glass-capsule-btn h-8 px-4 text-[13px] tracking-[-0.01em] text-foreground/55" onClick={() => setWizardRound(null)}>
                        Abbrechen
                      </button>
                      <button
                        className="apple-btn-blue h-8 px-4 text-[13px] tracking-[-0.01em] inline-flex items-center gap-1.5 disabled:opacity-40"
                        disabled={!allChecked || publishing.has(wizardRound.roundKey)}
                        onClick={async () => {
                          await handlePublish(wizardRound);
                          setWizardRound(null);
                        }}
                      >
                        {publishing.has(wizardRound.roundKey) ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Upload className="h-3.5 w-3.5" />
                        )}
                        Ver&ouml;ffentlichen
                      </button>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
            </div>
          </LiquidGlass>
        </DialogContent>
      </Dialog>

      {/* Logo Picker Dialog */}
      {logoPickerTarget && (
        <LogoPicker
          open={logoPickerOpen}
          onOpenChange={(open) => {
            setLogoPickerOpen(open);
            if (!open) setLogoPickerTarget(null);
          }}
          companyName={logoPickerTarget.name}
          website={logoPickerTarget.website}
          entityType={logoPickerTarget.entityType}
          onSelect={handleLogoSelected}
        />
      )}
    </div>
  );
}
