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
import { ArrowUpDown, Search, Users } from "lucide-react";
import { EntitySheet } from "@/components/graph/entity-sheet";

type Investor = {
  name: string;
  dealCount: number;
  leadCount: number;
  totalDeployed: number | null;
  portfolioCompanies: string[];
  logoUrl: string | null;
  enrichScore: number;
};

const INVESTOR_MAX_SCORE = 12;

type SortKey = "name" | "dealCount" | "leadCount" | "totalDeployed" | "enrichScore";

function fmtAmt(n: number | null | undefined): string {
  if (!n) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function InvestorsPage() {
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("dealCount");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedInvestor, setSelectedInvestor] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/investors")
      .then((r) => r.json())
      .then((json) => setInvestors(json.data ?? []))
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
    let list = investors;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (inv) =>
          inv.name?.toLowerCase().includes(q) ||
          inv.portfolioCompanies?.some((c) => c?.toLowerCase().includes(q))
      );
    }
    return [...list].sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = typeof aVal === "string"
        ? aVal.localeCompare(bVal as string)
        : (aVal as number) - (bVal as number);
      return sortOrder === "asc" ? cmp : -cmp;
    });
  }, [investors, search, sortBy, sortOrder]);

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
        <Users className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Investors</h1>
        <div className="relative ml-auto max-w-xs flex-1">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search investors..."
            className="h-7 pl-7 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {filtered.length} investors
        </span>
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
            No investors found.
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[32px] text-xs" />
                <TableHead
                  className="cursor-pointer text-xs font-semibold"
                  onClick={() => toggleSort("name")}
                >
                  Name <SortIcon field="name" />
                </TableHead>
                <TableHead
                  className="w-[70px] cursor-pointer text-center text-xs font-semibold"
                  onClick={() => toggleSort("dealCount")}
                >
                  Deals <SortIcon field="dealCount" />
                </TableHead>
                <TableHead
                  className="w-[70px] cursor-pointer text-center text-xs font-semibold"
                  onClick={() => toggleSort("leadCount")}
                >
                  Leads <SortIcon field="leadCount" />
                </TableHead>
                <TableHead
                  className="w-[110px] cursor-pointer text-right text-xs font-semibold"
                  onClick={() => toggleSort("totalDeployed")}
                >
                  Total Deployed <SortIcon field="totalDeployed" />
                </TableHead>
                <TableHead
                  className="w-[55px] cursor-pointer text-center text-xs font-semibold"
                  onClick={() => toggleSort("enrichScore")}
                >
                  Score <SortIcon field="enrichScore" />
                </TableHead>
                <TableHead className="text-xs font-semibold">
                  Portfolio
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((inv) => {
                const shown = (inv.portfolioCompanies ?? []).slice(0, 3);
                const extra = (inv.portfolioCompanies ?? []).length - 3;
                return (
                  <TableRow
                    key={inv.name}
                    className="cursor-pointer text-xs"
                    onClick={() => {
                      setSelectedInvestor(inv.name);
                      setSheetOpen(true);
                    }}
                  >
                    <TableCell className="py-1.5 px-1">
                      {inv.logoUrl ? (
                        <img src={inv.logoUrl} alt="" className="h-5 w-5 rounded object-contain" />
                      ) : (
                        <div className="h-5 w-5 rounded bg-muted" />
                      )}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 font-medium">
                      {inv.name}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 text-center tabular-nums">
                      {inv.dealCount}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 text-center tabular-nums">
                      {inv.leadCount}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                      {fmtAmt(inv.totalDeployed)}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 text-center">
                      <div className="flex items-center justify-center gap-1" title={`${inv.enrichScore}/${INVESTOR_MAX_SCORE}`}>
                        <div className="h-1.5 w-10 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              inv.enrichScore >= 9 ? "bg-emerald-500" :
                              inv.enrichScore >= 5 ? "bg-yellow-500" : "bg-orange-500"
                            }`}
                            style={{ width: `${(inv.enrichScore / INVESTOR_MAX_SCORE) * 100}%` }}
                          />
                        </div>
                        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{inv.enrichScore}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-1.5 px-2">
                      <div className="flex flex-wrap gap-1">
                        {shown.map((c) => (
                          <Badge
                            key={c}
                            variant="outline"
                            className="text-[10px] h-5 px-1.5"
                          >
                            {c}
                          </Badge>
                        ))}
                        {extra > 0 && (
                          <Badge
                            variant="outline"
                            className="text-[10px] h-5 px-1.5 text-muted-foreground"
                          >
                            +{extra}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <EntitySheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        entityType="investor"
        entityName={selectedInvestor}
      />
    </div>
  );
}
