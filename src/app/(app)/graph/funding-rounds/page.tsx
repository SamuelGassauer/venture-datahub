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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowUpDown, Search, CircleDollarSign } from "lucide-react";
import { EntitySheet } from "@/components/graph/entity-sheet";

type FundingRound = {
  company: string;
  country: string | null;
  sector: string | null;
  amount: number | null;
  stage: string | null;
  leadInvestor: string | null;
  investorCount: number;
  publishedAt: string | null;
};

type SortKey = "company" | "amount" | "stage" | "leadInvestor" | "investorCount" | "publishedAt";

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

export default function GraphFundingRoundsPage() {
  const [rounds, setRounds] = useState<FundingRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("publishedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [sectorFilter, setSectorFilter] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const { filters } = useGlobalFilters();

  const sectorOptions = useMemo(
    () =>
      [...new Set(rounds.map((r) => r.sector).filter(Boolean) as string[])].sort(),
    [rounds]
  );

  useEffect(() => {
    fetch("/api/graph-funding-rounds")
      .then((r) => r.json())
      .then((json) => setRounds(json.data ?? []))
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

  const filtered = useMemo(() => {
    let list = rounds;
    const geo = resolveGeoFilter(filters);
    if (geo) {
      list = list.filter((r) => r.country && geo.countries.has(r.country.toLowerCase()));
    }
    if (filters.stages.length > 0) {
      const stagesLower = new Set(filters.stages.map((s) => s.toLowerCase()));
      list = list.filter((r) => r.stage && stagesLower.has(r.stage.toLowerCase()));
    }
    if (filters.sectors.length > 0) {
      const sectorsLower = new Set(filters.sectors.map((s) => s.toLowerCase()));
      list = list.filter((r) => r.sector && sectorsLower.has(r.sector.toLowerCase()));
    }
    if (sectorFilter) {
      list = list.filter((r) => r.sector === sectorFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.company?.toLowerCase().includes(q) ||
          r.leadInvestor?.toLowerCase().includes(q) ||
          r.stage?.toLowerCase().includes(q) ||
          r.country?.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      let cmp: number;
      if (sortBy === "publishedAt") {
        cmp = new Date(aVal as string).getTime() - new Date(bVal as string).getTime();
      } else if (typeof aVal === "string") {
        cmp = aVal.localeCompare(bVal as string);
      } else {
        cmp = (aVal as number) - (bVal as number);
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });
  }, [rounds, search, sectorFilter, sortBy, sortOrder, filters]);

  const totalAmount = filtered.reduce((sum, r) => sum + (r.amount || 0), 0);

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
        <CircleDollarSign className="h-4 w-4 text-foreground/40" />
        <h1 className="text-[17px] font-semibold tracking-[-0.02em] text-foreground/85">Funding Rounds</h1>
        <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35">Knowledge Graph</span>
        <Select
          value={sectorFilter}
          onValueChange={(v) => setSectorFilter(v === "all" ? "" : v)}
        >
          <SelectTrigger className="ml-auto h-7 w-[160px] text-[13px]">
            <SelectValue placeholder="All Sectors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sectors</SelectItem>
            {sectorOptions.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/30" />
          <input
            placeholder="Search rounds..."
            className="glass-search-input h-8 w-full pl-8 text-[13px]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3 text-[12px] text-foreground/40 tabular-nums">
          <span>{filtered.length} rounds</span>
          <span>&middot;</span>
          <span>{fmtAmt(totalAmount)} total</span>
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
              No funding rounds in the knowledge graph.
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
                  <TableHead className="w-[60px] text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35">
                    Country
                  </TableHead>
                  <TableHead
                    className="w-[100px] cursor-pointer text-right text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35"
                    onClick={() => toggleSort("amount")}
                  >
                    Amount <SortIcon field="amount" />
                  </TableHead>
                  <TableHead
                    className="w-[80px] cursor-pointer text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35"
                    onClick={() => toggleSort("stage")}
                  >
                    Stage <SortIcon field="stage" />
                  </TableHead>
                  <TableHead
                    className="w-[150px] cursor-pointer text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35"
                    onClick={() => toggleSort("leadInvestor")}
                  >
                    Lead Investor <SortIcon field="leadInvestor" />
                  </TableHead>
                  <TableHead
                    className="w-[70px] cursor-pointer text-center text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35"
                    onClick={() => toggleSort("investorCount")}
                  >
                    Investors <SortIcon field="investorCount" />
                  </TableHead>
                  <TableHead
                    className="w-[90px] cursor-pointer text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35"
                    onClick={() => toggleSort("publishedAt")}
                  >
                    Published <SortIcon field="publishedAt" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r, i) => (
                  <TableRow
                    key={`${r.company}-${r.stage}-${i}`}
                    className="lg-inset-table-row cursor-pointer text-[13px]"
                    onClick={() => {
                      setSelectedCompany(r.company);
                      setSheetOpen(true);
                    }}
                  >
                    <TableCell className="py-1.5 px-2 font-semibold text-foreground/85">
                      {r.company}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 text-foreground/40">
                      {r.country ?? "\u2014"}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap text-foreground/85">
                      {fmtAmt(r.amount)}
                    </TableCell>
                    <TableCell className="py-1.5 px-2">
                      {r.stage ? (
                        <Badge variant="secondary" className="text-[10px]">
                          {r.stage}
                        </Badge>
                      ) : (
                        <span className="text-foreground/30">\u2014</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 truncate max-w-[150px] text-foreground/55" title={r.leadInvestor ?? ""}>
                      {r.leadInvestor ?? <span className="text-foreground/30">\u2014</span>}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 text-center tabular-nums text-foreground/45">
                      {r.investorCount}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 text-foreground/40 whitespace-nowrap">
                      {fmtDate(r.publishedAt)}
                    </TableCell>
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
