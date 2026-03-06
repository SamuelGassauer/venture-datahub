"use client";

import { useEffect, useState, useMemo } from "react";
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
  if (!n) return "\u2014";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtDate(d: string | null): string {
  if (!d) return "\u2014";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "\u2014";
  }
}

const TYPE_COLORS: Record<string, string> = {
  vc: "bg-blue-500/8 text-blue-600 dark:text-blue-400",
  pe: "bg-purple-500/8 text-purple-600 dark:text-purple-400",
  growth: "bg-rose-500/8 text-rose-600 dark:text-rose-400",
  impact: "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400",
  climate: "bg-green-500/8 text-green-600 dark:text-green-400",
  debt: "bg-foreground/[0.04] text-foreground/45",
  secondary: "bg-amber-500/8 text-amber-600 dark:text-amber-400",
  infra: "bg-orange-500/8 text-orange-600 dark:text-orange-400",
  "real estate": "bg-cyan-500/8 text-cyan-600 dark:text-cyan-400",
};

function typeColor(type: string | null): string {
  if (!type) return "bg-foreground/[0.04] text-foreground/45";
  return TYPE_COLORS[type.toLowerCase()] ?? "bg-foreground/[0.04] text-foreground/45";
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
        sortBy === field ? "text-foreground" : "text-foreground/30"
      }`}
    />
  );

  return (
    <div className="flex h-[calc(100vh-1.5rem)] flex-col gap-0">
      {/* Status bar / toolbar */}
      <div className="glass-status-bar flex items-center gap-3 px-4 py-2.5 shrink-0 flex-wrap">
        <Landmark className="h-4 w-4 text-foreground/40" />
        <h1 className="text-[17px] font-semibold tracking-[-0.02em] text-foreground/85">Fund Closings</h1>
        <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35">Knowledge Graph</span>
        <select
          className="glass-search-input ml-2 h-7 px-2 text-[13px]"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">All types</option>
          {fundTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <div className="relative ml-auto max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/30" />
          <input
            placeholder="Search funds, firms, focus..."
            className="glass-search-input h-8 w-full pl-8 text-[13px]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3 text-[12px] text-foreground/40 tabular-nums">
          <span>{filtered.length} funds</span>
          <span>&middot;</span>
          <span>{fmtAmt(totalSize)} total</span>
        </div>
      </div>

      {/* Table content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="lg-inset rounded-[16px] overflow-hidden">
          {loading ? (
            <div className="space-y-1 p-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="h-10 rounded-[6px]" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-[13px] text-foreground/40">
              No fund closings found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="glass-table-header hover:bg-transparent">
                  <TableHead className="w-[32px] text-[11px]" />
                  <TableHead
                    className="cursor-pointer text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35"
                    onClick={() => toggleSort("firm")}
                  >
                    Firm <SortIcon field="firm" />
                  </TableHead>
                  <TableHead className="w-[130px] text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35">
                    Fund
                  </TableHead>
                  <TableHead
                    className="w-[90px] cursor-pointer text-right text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35"
                    onClick={() => toggleSort("sizeUsd")}
                  >
                    Size <SortIcon field="sizeUsd" />
                  </TableHead>
                  <TableHead
                    className="w-[70px] cursor-pointer text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35"
                    onClick={() => toggleSort("fundType")}
                  >
                    Type <SortIcon field="fundType" />
                  </TableHead>
                  <TableHead className="min-w-[120px] text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35">
                    <Target className="inline h-3 w-3 mr-1" />
                    Stage Focus
                  </TableHead>
                  <TableHead className="min-w-[120px] text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35">
                    <Briefcase className="inline h-3 w-3 mr-1" />
                    Sector Focus
                  </TableHead>
                  <TableHead className="min-w-[100px] text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35">
                    <Globe className="inline h-3 w-3 mr-1" />
                    Geo Focus
                  </TableHead>
                  <TableHead
                    className="w-[55px] cursor-pointer text-center text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35"
                    onClick={() => toggleSort("dealCount")}
                  >
                    Deals <SortIcon field="dealCount" />
                  </TableHead>
                  <TableHead
                    className="w-[55px] cursor-pointer text-center text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35"
                    onClick={() => toggleSort("vintage")}
                  >
                    Yr <SortIcon field="vintage" />
                  </TableHead>
                  <TableHead className="w-[55px] text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35">
                    HQ
                  </TableHead>
                  <TableHead className="w-[80px] text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35">
                    Published
                  </TableHead>
                  {isAdmin && <TableHead className="w-[36px]" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((f, i) => (
                  <TableRow
                    key={`${f.firm}-${f.fundName}-${i}`}
                    className="lg-inset-table-row cursor-pointer text-[13px] group"
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
                          className="h-6 w-6 rounded-[6px]"
                          fallback={<div className="h-6 w-6 rounded-[6px] bg-foreground/[0.04] flex items-center justify-center"><Building2 className="h-3 w-3 text-foreground/30" /></div>}
                        />
                      ) : (
                        <div className="h-6 w-6 rounded-[6px] bg-foreground/[0.04] flex items-center justify-center">
                          <Building2 className="h-3 w-3 text-foreground/30" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="py-2 px-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-foreground/85">{f.firm}</span>
                        {f.website && (
                          <a
                            href={f.website.startsWith("http") ? f.website : `https://${f.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-foreground/30 hover:text-foreground/70 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2 px-2 text-foreground/55">
                      {f.fundName}
                    </TableCell>
                    <TableCell className="py-2 px-2 text-right font-mono tabular-nums whitespace-nowrap font-semibold text-foreground/85">
                      {fmtAmt(f.sizeUsd)}
                    </TableCell>
                    <TableCell className="py-2 px-2">
                      {f.fundType ? (
                        <Badge variant="outline" className={`text-[10px] h-5 px-1.5 ${typeColor(f.fundType)}`}>
                          {f.fundType}
                        </Badge>
                      ) : (
                        <span className="text-foreground/30">\u2014</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2 px-2">
                      <div className="flex flex-wrap gap-1">
                        {(f.stageFocus ?? []).length > 0 ? (
                          f.stageFocus.map((s) => (
                            <Badge key={s} variant="outline" className="text-[10px] h-5 px-1.5 bg-blue-500/8 text-blue-600 dark:text-blue-400">
                              {s}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-foreground/30">\u2014</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2 px-2">
                      <div className="flex flex-wrap gap-1">
                        {(f.sectorFocus ?? []).length > 0 ? (
                          f.sectorFocus.slice(0, 3).map((s) => (
                            <Badge key={s} variant="outline" className="text-[10px] h-5 px-1.5 bg-amber-500/8 text-amber-600 dark:text-amber-400">
                              {s}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-foreground/30">\u2014</span>
                        )}
                        {(f.sectorFocus ?? []).length > 3 && (
                          <Badge variant="outline" className="text-[10px] h-5 px-1.5 text-foreground/40">
                            +{f.sectorFocus.length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2 px-2">
                      <div className="flex flex-wrap gap-1">
                        {(f.geoFocus ?? []).length > 0 ? (
                          f.geoFocus.slice(0, 2).map((g) => (
                            <Badge key={g} variant="outline" className="text-[10px] h-5 px-1.5 bg-emerald-500/8 text-emerald-600 dark:text-emerald-400">
                              {g}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-foreground/30">\u2014</span>
                        )}
                        {(f.geoFocus ?? []).length > 2 && (
                          <Badge variant="outline" className="text-[10px] h-5 px-1.5 text-foreground/40">
                            +{f.geoFocus.length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2 px-2 text-center tabular-nums text-foreground/55">
                      {f.dealCount || "\u2014"}
                    </TableCell>
                    <TableCell className="py-2 px-2 text-center tabular-nums text-foreground/40">
                      {f.vintage ?? "\u2014"}
                    </TableCell>
                    <TableCell className="py-2 px-2 text-foreground/40 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        {(f.hq || f.country) && <MapPin className="h-3 w-3 text-foreground/30 shrink-0" />}
                        <span className="truncate max-w-[60px]">{f.hq || f.country || "\u2014"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2 px-2 text-foreground/40 whitespace-nowrap text-[10px]">
                      {fmtDate(f.publishedAt)}
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="py-2 px-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(f.fundKey); }}
                          className="rounded-[6px] p-1 text-foreground/30 hover:text-red-500 hover:bg-red-500/8 transition-colors opacity-0 group-hover:opacity-100"
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
