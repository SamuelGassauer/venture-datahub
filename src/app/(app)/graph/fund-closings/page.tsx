"use client";

import { useEffect, useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useGlobalFilters, resolveGeoFilter } from "@/lib/global-filters";
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
  Search,
  Landmark,
  Globe,
  Target,
  Briefcase,
  MapPin,
  Building2,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { SmartLogo } from "@/components/ui/smart-logo";
import { EntitySheet } from "@/components/graph/entity-sheet";

type FundClosing = {
  fundKey: string;
  firm: string;
  fundName: string;
  sizeUsd: number | null;
  fundType: string | null;
  vintage: string | null;
  status: string | null;
  country: string | null;
  sourceCount: number;
  publishedAt: string | null;
  logoUrl: string | null;
  website: string | null;
  stageFocus: string[];
  sectorFocus: string[];
  geoFocus: string[];
  hq: string | null;
  dealCount: number;
  portfolioCompanies: string[];
};

type SortKey = "firm" | "sizeUsd" | "fundType" | "vintage" | "sourceCount" | "dealCount";

function fmtAmt(n: number | null | undefined): string {
  if (!n) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

const TYPE_COLORS: Record<string, string> = {
  vc: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  pe: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30",
  growth: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
  impact: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  climate: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
  debt: "bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30",
  secondary: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  infra: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
  "real estate": "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/30",
};

function typeColor(type: string | null): string {
  if (!type) return "bg-muted text-muted-foreground border-border";
  return TYPE_COLORS[type.toLowerCase()] ?? "bg-muted text-muted-foreground border-border";
}

export default function GraphFundClosingsPage() {
  const [funds, setFunds] = useState<FundClosing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("sizeUsd");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<{
    type: "fund" | "investor";
    name: string;
  } | null>(null);
  const { filters } = useGlobalFilters();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  useEffect(() => {
    fetch("/api/graph-fund-closings")
      .then((r) => r.json())
      .then((json) => setFunds(json.data ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(fundKey: string) {
    if (!confirm("Delete this fund?")) return;
    try {
      const res = await fetch(`/api/graph-fund-closings/${encodeURIComponent(fundKey)}`, { method: "DELETE" });
      if (res.ok) {
        setFunds((prev) => prev.filter((f) => f.fundKey !== fundKey));
        toast.success("Fund deleted");
      } else {
        const data = await res.json();
        toast.error(data.error || "Delete failed");
      }
    } catch {
      toast.error("Delete failed");
    }
  }

  function toggleSort(field: SortKey) {
    if (sortBy === field) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  }

  const fundTypes = useMemo(
    () => Array.from(new Set(funds.map((f) => f.fundType).filter(Boolean) as string[])).sort(),
    [funds]
  );

  const filtered = useMemo(() => {
    let list = funds;
    const geo = resolveGeoFilter(filters);
    if (geo) {
      list = list.filter((f) => {
        if (f.country && geo.countries.has(f.country.toLowerCase())) return true;
        if (f.hq && geo.countries.has(f.hq.toLowerCase())) return true;
        if (f.geoFocus?.some((g) => geo.countries.has(g.toLowerCase()))) return true;
        return false;
      });
    }
    if (filters.stages.length > 0) {
      const stagesLower = new Set(filters.stages.map((s) => s.toLowerCase()));
      list = list.filter((f) =>
        f.stageFocus?.some((s) => stagesLower.has(s.toLowerCase()))
      );
    }
    if (filters.sectors.length > 0) {
      const sectorsLower = new Set(filters.sectors.map((s) => s.toLowerCase()));
      list = list.filter((f) =>
        f.sectorFocus?.some((s) => sectorsLower.has(s.toLowerCase()))
      );
    }
    if (typeFilter) {
      list = list.filter((f) => f.fundType === typeFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (f) =>
          f.firm?.toLowerCase().includes(q) ||
          f.fundName?.toLowerCase().includes(q) ||
          f.fundType?.toLowerCase().includes(q) ||
          f.country?.toLowerCase().includes(q) ||
          f.stageFocus?.some((s) => s.toLowerCase().includes(q)) ||
          f.sectorFocus?.some((s) => s.toLowerCase().includes(q)) ||
          f.geoFocus?.some((g) => g.toLowerCase().includes(q))
      );
    }
    return [...list].sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp =
        typeof aVal === "string"
          ? aVal.localeCompare(bVal as string)
          : (aVal as number) - (bVal as number);
      return sortOrder === "asc" ? cmp : -cmp;
    });
  }, [funds, search, typeFilter, sortBy, sortOrder, filters]);

  const totalSize = filtered.reduce((sum, f) => sum + (f.sizeUsd || 0), 0);

  const SortIcon = ({ field }: { field: SortKey }) => (
    <ArrowUpDown
      className={`ml-0.5 inline h-3 w-3 ${
        sortBy === field ? "text-foreground" : "text-muted-foreground/50"
      }`}
    />
  );

  return (
    <div className="flex h-[calc(100vh-1.5rem)] flex-col gap-2">
      <div className="flex items-center gap-3 shrink-0 flex-wrap">
        <Landmark className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Fund Closings</h1>
        <span className="text-xs text-muted-foreground">Knowledge Graph</span>
        <select
          className="ml-2 h-7 rounded border border-input bg-transparent px-2 text-xs"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">All types</option>
          {fundTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <div className="relative ml-auto max-w-xs flex-1">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search funds, firms, focus..."
            className="h-7 pl-7 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
          <span>{filtered.length} funds</span>
          <span>&middot;</span>
          <span>{fmtAmt(totalSize)} total</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded border">
        {loading ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
            No fund closings found.
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[32px] text-xs" />
                <TableHead
                  className="cursor-pointer text-xs font-semibold"
                  onClick={() => toggleSort("firm")}
                >
                  Firm <SortIcon field="firm" />
                </TableHead>
                <TableHead className="w-[130px] text-xs font-semibold">
                  Fund
                </TableHead>
                <TableHead
                  className="w-[90px] cursor-pointer text-right text-xs font-semibold"
                  onClick={() => toggleSort("sizeUsd")}
                >
                  Size <SortIcon field="sizeUsd" />
                </TableHead>
                <TableHead
                  className="w-[70px] cursor-pointer text-xs font-semibold"
                  onClick={() => toggleSort("fundType")}
                >
                  Type <SortIcon field="fundType" />
                </TableHead>
                <TableHead className="min-w-[120px] text-xs font-semibold">
                  <Target className="inline h-3 w-3 mr-1" />
                  Stage Focus
                </TableHead>
                <TableHead className="min-w-[120px] text-xs font-semibold">
                  <Briefcase className="inline h-3 w-3 mr-1" />
                  Sector Focus
                </TableHead>
                <TableHead className="min-w-[100px] text-xs font-semibold">
                  <Globe className="inline h-3 w-3 mr-1" />
                  Geo Focus
                </TableHead>
                <TableHead
                  className="w-[55px] cursor-pointer text-center text-xs font-semibold"
                  onClick={() => toggleSort("dealCount")}
                >
                  Deals <SortIcon field="dealCount" />
                </TableHead>
                <TableHead
                  className="w-[55px] cursor-pointer text-center text-xs font-semibold"
                  onClick={() => toggleSort("vintage")}
                >
                  Yr <SortIcon field="vintage" />
                </TableHead>
                <TableHead className="w-[55px] text-xs font-semibold">
                  HQ
                </TableHead>
                <TableHead className="w-[80px] text-xs font-semibold">
                  Published
                </TableHead>
                {isAdmin && <TableHead className="w-[36px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((f, i) => (
                <TableRow
                  key={`${f.firm}-${f.fundName}-${i}`}
                  className="cursor-pointer text-xs group"
                  onClick={() => {
                    setSelectedEntity({ type: "investor", name: f.firm });
                    setSheetOpen(true);
                  }}
                >
                  <TableCell className="py-2 px-1">
                    {f.logoUrl ? (
                      <SmartLogo
                        src={f.logoUrl}
                        alt={f.firm}
                        className="h-6 w-6 rounded"
                        fallback={<div className="h-6 w-6 rounded bg-muted flex items-center justify-center"><Building2 className="h-3 w-3 text-muted-foreground" /></div>}
                      />
                    ) : (
                      <div className="h-6 w-6 rounded bg-muted flex items-center justify-center">
                        <Building2 className="h-3 w-3 text-muted-foreground" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="py-2 px-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold">{f.firm}</span>
                      {f.website && (
                        <a
                          href={f.website.startsWith("http") ? f.website : `https://${f.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground/40 hover:text-foreground transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-2 px-2 text-muted-foreground">
                    {f.fundName}
                  </TableCell>
                  <TableCell className="py-2 px-2 text-right font-mono tabular-nums whitespace-nowrap font-semibold">
                    {fmtAmt(f.sizeUsd)}
                  </TableCell>
                  <TableCell className="py-2 px-2">
                    {f.fundType ? (
                      <Badge variant="outline" className={`text-[10px] h-5 px-1.5 ${typeColor(f.fundType)}`}>
                        {f.fundType}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2 px-2">
                    <div className="flex flex-wrap gap-1">
                      {(f.stageFocus ?? []).length > 0 ? (
                        f.stageFocus.map((s) => (
                          <Badge key={s} variant="outline" className="text-[10px] h-5 px-1.5 bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/25">
                            {s}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-2 px-2">
                    <div className="flex flex-wrap gap-1">
                      {(f.sectorFocus ?? []).length > 0 ? (
                        f.sectorFocus.slice(0, 3).map((s) => (
                          <Badge key={s} variant="outline" className="text-[10px] h-5 px-1.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25">
                            {s}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                      {(f.sectorFocus ?? []).length > 3 && (
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 text-muted-foreground">
                          +{f.sectorFocus.length - 3}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-2 px-2">
                    <div className="flex flex-wrap gap-1">
                      {(f.geoFocus ?? []).length > 0 ? (
                        f.geoFocus.slice(0, 2).map((g) => (
                          <Badge key={g} variant="outline" className="text-[10px] h-5 px-1.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25">
                            {g}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                      {(f.geoFocus ?? []).length > 2 && (
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 text-muted-foreground">
                          +{f.geoFocus.length - 2}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-2 px-2 text-center tabular-nums">
                    {f.dealCount || "—"}
                  </TableCell>
                  <TableCell className="py-2 px-2 text-center tabular-nums text-muted-foreground">
                    {f.vintage ?? "—"}
                  </TableCell>
                  <TableCell className="py-2 px-2 text-muted-foreground whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      {(f.hq || f.country) && <MapPin className="h-3 w-3 text-muted-foreground/50 shrink-0" />}
                      <span className="truncate max-w-[60px]">{f.hq || f.country || "—"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-2 px-2 text-muted-foreground whitespace-nowrap text-[10px]">
                    {fmtDate(f.publishedAt)}
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="py-2 px-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(f.fundKey); }}
                        className="rounded p-1 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                        title="Delete fund"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <EntitySheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        entityType={selectedEntity?.type ?? null}
        entityName={selectedEntity?.name ?? null}
        onNavigate={(type, name) => setSelectedEntity({ type: type as "fund" | "investor", name })}
      />
    </div>
  );
}
