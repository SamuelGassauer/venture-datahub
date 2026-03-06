"use client";

import { useEffect, useState, useMemo } from "react";
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
import { ArrowUpDown, Search, Gauge, Trash2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { EntitySheet } from "@/components/graph/entity-sheet";

type ValuationEntry = {
  valuationKey: string;
  company: string;
  companyNorm: string;
  metricType: string;
  valueUsd: number | null;
  unit: string | null;
  period: string | null;
  confidence: number | null;
  sourceCount: number;
  publishedAt: string | null;
};

type SortKey = "company" | "valueUsd" | "metricType" | "sourceCount" | "confidence";

const METRIC_BADGE_COLORS: Record<string, string> = {
  valuation: "bg-purple-500/8 text-purple-600 dark:text-purple-400",
  revenue: "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400",
  arr: "bg-green-500/8 text-green-600 dark:text-green-400",
  mrr: "bg-teal-500/8 text-teal-600 dark:text-teal-400",
  gmv: "bg-cyan-500/8 text-cyan-600 dark:text-cyan-400",
  users: "bg-blue-500/8 text-blue-600 dark:text-blue-400",
  growth_rate: "bg-orange-500/8 text-orange-600 dark:text-orange-400",
};

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

function fmtValue(n: number | null | undefined, unit: string | null): string {
  if (n == null) return "\u2014";
  if (unit === "%") return `${n.toFixed(1)}%`;
  if (unit === "users") {
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
    return n.toFixed(0);
  }
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
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

export default function GraphValuationsPage() {
  const [valuations, setValuations] = useState<ValuationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [metricFilter, setMetricFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("valueUsd");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  async function handleDelete(valuationKey: string) {
    if (!confirm("Delete this valuation?")) return;
    try {
      const res = await fetch(`/api/graph-valuations/${encodeURIComponent(valuationKey)}`, { method: "DELETE" });
      if (res.ok) {
        setValuations((prev) => prev.filter((v) => v.valuationKey !== valuationKey));
        toast.success("Valuation deleted");
      } else {
        const data = await res.json();
        toast.error(data.error || "Delete failed");
      }
    } catch {
      toast.error("Delete failed");
    }
  }

  useEffect(() => {
    fetch("/api/graph-valuations")
      .then((r) => r.json())
      .then((json) => setValuations(json.data ?? []))
      .finally(() => setLoading(false));
  }, []);

  function toggleSort(field: SortKey) {
    if (sortBy === field) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  }

  const metricTypes = useMemo(
    () => Array.from(new Set(valuations.map((v) => v.metricType).filter(Boolean))).sort(),
    [valuations]
  );

  const filtered = useMemo(() => {
    let list = valuations;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (v) =>
          v.company?.toLowerCase().includes(q) ||
          v.metricType?.toLowerCase().includes(q) ||
          v.period?.toLowerCase().includes(q)
      );
    }
    if (metricFilter) {
      list = list.filter((v) => v.metricType === metricFilter);
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
  }, [valuations, search, metricFilter, sortBy, sortOrder]);

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
      <div className="glass-status-bar flex items-center gap-3 px-4 py-2.5 shrink-0">
        <Gauge className="h-4 w-4 text-foreground/40" />
        <h1 className="text-[17px] font-semibold tracking-[-0.02em] text-foreground/85">Valuations &amp; KPIs</h1>
        <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35">Knowledge Graph</span>
        <select
          className="glass-search-input ml-2 h-7 px-2 text-[13px]"
          value={metricFilter}
          onChange={(e) => setMetricFilter(e.target.value)}
        >
          <option value="">All metrics</option>
          {metricTypes.map((t) => (
            <option key={t} value={t}>{metricLabel(t)}</option>
          ))}
        </select>
        <div className="relative ml-auto max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/30" />
          <input
            placeholder="Search companies..."
            className="glass-search-input h-8 w-full pl-8 text-[13px]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3 text-[12px] text-foreground/40 tabular-nums">
          <span>{filtered.length} metrics</span>
        </div>
      </div>

      {/* Table content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="lg-inset rounded-[16px] overflow-hidden">
          {loading ? (
            <div className="space-y-1 p-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="h-7 rounded-[6px]" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-[13px] text-foreground/40">
              No valuations in the knowledge graph yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="glass-table-header hover:bg-transparent">
                  <TableHead
                    className="cursor-pointer text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35"
                    onClick={() => toggleSort("company")}
                  >
                    Company <SortIcon field="company" />
                  </TableHead>
                  <TableHead
                    className="w-[90px] cursor-pointer text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35"
                    onClick={() => toggleSort("metricType")}
                  >
                    Metric <SortIcon field="metricType" />
                  </TableHead>
                  <TableHead
                    className="w-[110px] cursor-pointer text-right text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35"
                    onClick={() => toggleSort("valueUsd")}
                  >
                    Value <SortIcon field="valueUsd" />
                  </TableHead>
                  <TableHead className="w-[80px] text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35">
                    Period
                  </TableHead>
                  <TableHead
                    className="w-[70px] cursor-pointer text-center text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35"
                    onClick={() => toggleSort("confidence")}
                  >
                    Conf <SortIcon field="confidence" />
                  </TableHead>
                  <TableHead
                    className="w-[70px] cursor-pointer text-center text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35"
                    onClick={() => toggleSort("sourceCount")}
                  >
                    Sources <SortIcon field="sourceCount" />
                  </TableHead>
                  <TableHead className="w-[90px] text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35">
                    Published
                  </TableHead>
                  {isAdmin && <TableHead className="w-[36px]" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((v, i) => (
                  <TableRow
                    key={`${v.valuationKey}-${i}`}
                    className="lg-inset-table-row cursor-pointer text-[13px]"
                    onClick={() => {
                      setSelectedCompany(v.companyNorm);
                      setSheetOpen(true);
                    }}
                  >
                    <TableCell className="py-1.5 px-2 font-semibold text-foreground/85">
                      {v.company}
                    </TableCell>
                    <TableCell className="py-1.5 px-2">
                      <Badge
                        variant="outline"
                        className={`text-[10px] h-5 px-1.5 ${METRIC_BADGE_COLORS[v.metricType] || "bg-foreground/[0.04] text-foreground/45"}`}
                      >
                        {metricLabel(v.metricType)}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap text-foreground/85">
                      {fmtValue(v.valueUsd, v.unit)}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 text-foreground/40 text-[10px]">
                      {v.period ?? "\u2014"}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 text-center tabular-nums">
                      {v.confidence != null ? (
                        <span className="font-mono text-[10px] text-foreground/55">
                          {(v.confidence * 100).toFixed(0)}
                        </span>
                      ) : "\u2014"}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 text-center tabular-nums text-foreground/45">
                      {v.sourceCount}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 text-foreground/40 whitespace-nowrap">
                      {fmtDate(v.publishedAt)}
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="py-1.5 px-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(v.valuationKey); }}
                          className="rounded-[6px] p-1 text-foreground/30 hover:text-red-500 hover:bg-red-500/8 transition-colors"
                          title="Delete valuation"
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
        entityType="company"
        entityName={selectedCompany}
        onNavigate={(_, name) => setSelectedCompany(name)}
      />
    </div>
  );
}
