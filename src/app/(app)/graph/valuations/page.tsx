"use client";

import { useEffect, useState, useMemo } from "react";
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
  valuation: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30",
  revenue: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  arr: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
  mrr: "bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/30",
  gmv: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/30",
  users: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  growth_rate: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
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
        sortBy === field ? "text-foreground" : "text-muted-foreground/50"
      }`}
    />
  );

  return (
    <div className="flex h-[calc(100vh-1.5rem)] flex-col gap-2">
      <div className="flex items-center gap-3 shrink-0">
        <Gauge className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Valuations &amp; KPIs</h1>
        <span className="text-xs text-muted-foreground">Knowledge Graph</span>
        <select
          className="ml-2 h-7 rounded border border-input bg-transparent px-2 text-xs"
          value={metricFilter}
          onChange={(e) => setMetricFilter(e.target.value)}
        >
          <option value="">All metrics</option>
          {metricTypes.map((t) => (
            <option key={t} value={t}>{metricLabel(t)}</option>
          ))}
        </select>
        <div className="relative ml-auto max-w-xs flex-1">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search companies..."
            className="h-7 pl-7 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
          <span>{filtered.length} metrics</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded border">
        {loading ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-7" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
            No valuations in the knowledge graph yet.
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow className="hover:bg-transparent">
                <TableHead
                  className="cursor-pointer text-xs font-semibold"
                  onClick={() => toggleSort("company")}
                >
                  Company <SortIcon field="company" />
                </TableHead>
                <TableHead
                  className="w-[90px] cursor-pointer text-xs font-semibold"
                  onClick={() => toggleSort("metricType")}
                >
                  Metric <SortIcon field="metricType" />
                </TableHead>
                <TableHead
                  className="w-[110px] cursor-pointer text-right text-xs font-semibold"
                  onClick={() => toggleSort("valueUsd")}
                >
                  Value <SortIcon field="valueUsd" />
                </TableHead>
                <TableHead className="w-[80px] text-xs font-semibold">
                  Period
                </TableHead>
                <TableHead
                  className="w-[70px] cursor-pointer text-center text-xs font-semibold"
                  onClick={() => toggleSort("confidence")}
                >
                  Conf <SortIcon field="confidence" />
                </TableHead>
                <TableHead
                  className="w-[70px] cursor-pointer text-center text-xs font-semibold"
                  onClick={() => toggleSort("sourceCount")}
                >
                  Sources <SortIcon field="sourceCount" />
                </TableHead>
                <TableHead className="w-[90px] text-xs font-semibold">
                  Published
                </TableHead>
                {isAdmin && <TableHead className="w-[36px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((v, i) => (
                <TableRow
                  key={`${v.valuationKey}-${i}`}
                  className="cursor-pointer text-xs"
                  onClick={() => {
                    setSelectedCompany(v.companyNorm);
                    setSheetOpen(true);
                  }}
                >
                  <TableCell className="py-1.5 px-2 font-medium">
                    {v.company}
                  </TableCell>
                  <TableCell className="py-1.5 px-2">
                    <Badge
                      variant="outline"
                      className={`text-[10px] h-5 px-1.5 ${METRIC_BADGE_COLORS[v.metricType] || "bg-muted text-muted-foreground border-border"}`}
                    >
                      {metricLabel(v.metricType)}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                    {fmtValue(v.valueUsd, v.unit)}
                  </TableCell>
                  <TableCell className="py-1.5 px-2 text-muted-foreground text-[10px]">
                    {v.period ?? "\u2014"}
                  </TableCell>
                  <TableCell className="py-1.5 px-2 text-center tabular-nums">
                    {v.confidence != null ? (
                      <span className="font-mono text-[10px]">
                        {(v.confidence * 100).toFixed(0)}
                      </span>
                    ) : "\u2014"}
                  </TableCell>
                  <TableCell className="py-1.5 px-2 text-center tabular-nums">
                    {v.sourceCount}
                  </TableCell>
                  <TableCell className="py-1.5 px-2 text-muted-foreground whitespace-nowrap">
                    {fmtDate(v.publishedAt)}
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="py-1.5 px-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(v.valuationKey); }}
                        className="rounded p-1 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
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

      <EntitySheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        entityType="company"
        entityName={selectedCompany}
      />
    </div>
  );
}
