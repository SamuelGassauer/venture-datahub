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
import { ArrowUpDown, Search, CircleDollarSign } from "lucide-react";
import { EntitySheet } from "@/components/graph/entity-sheet";

type FundingRound = {
  company: string;
  country: string | null;
  amount: number | null;
  stage: string | null;
  leadInvestor: string | null;
  investorCount: number;
  publishedAt: string | null;
};

type SortKey = "company" | "amount" | "stage" | "leadInvestor" | "investorCount";

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

export default function GraphFundingRoundsPage() {
  const [rounds, setRounds] = useState<FundingRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("amount");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);

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
      const cmp =
        typeof aVal === "string"
          ? aVal.localeCompare(bVal as string)
          : (aVal as number) - (bVal as number);
      return sortOrder === "asc" ? cmp : -cmp;
    });
  }, [rounds, search, sortBy, sortOrder]);

  const totalAmount = filtered.reduce((sum, r) => sum + (r.amount || 0), 0);

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
        <CircleDollarSign className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Funding Rounds</h1>
        <span className="text-xs text-muted-foreground">Knowledge Graph</span>
        <div className="relative ml-auto max-w-xs flex-1">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search rounds..."
            className="h-7 pl-7 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
          <span>{filtered.length} rounds</span>
          <span>&middot;</span>
          <span>{fmtAmt(totalAmount)} total</span>
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
            No funding rounds in the knowledge graph.
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
                <TableHead className="w-[60px] text-xs font-semibold">
                  Country
                </TableHead>
                <TableHead
                  className="w-[100px] cursor-pointer text-right text-xs font-semibold"
                  onClick={() => toggleSort("amount")}
                >
                  Amount <SortIcon field="amount" />
                </TableHead>
                <TableHead
                  className="w-[80px] cursor-pointer text-xs font-semibold"
                  onClick={() => toggleSort("stage")}
                >
                  Stage <SortIcon field="stage" />
                </TableHead>
                <TableHead
                  className="w-[150px] cursor-pointer text-xs font-semibold"
                  onClick={() => toggleSort("leadInvestor")}
                >
                  Lead Investor <SortIcon field="leadInvestor" />
                </TableHead>
                <TableHead
                  className="w-[70px] cursor-pointer text-center text-xs font-semibold"
                  onClick={() => toggleSort("investorCount")}
                >
                  Investors <SortIcon field="investorCount" />
                </TableHead>
                <TableHead className="w-[90px] text-xs font-semibold">
                  Published
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r, i) => (
                <TableRow
                  key={`${r.company}-${r.stage}-${i}`}
                  className="cursor-pointer text-xs"
                  onClick={() => {
                    setSelectedCompany(r.company);
                    setSheetOpen(true);
                  }}
                >
                  <TableCell className="py-1.5 px-2 font-medium">
                    {r.company}
                  </TableCell>
                  <TableCell className="py-1.5 px-2 text-muted-foreground">
                    {r.country ?? "—"}
                  </TableCell>
                  <TableCell className="py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                    {fmtAmt(r.amount)}
                  </TableCell>
                  <TableCell className="py-1.5 px-2">
                    {r.stage ? (
                      <Badge variant="secondary" className="text-[10px]">
                        {r.stage}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </TableCell>
                  <TableCell className="py-1.5 px-2 truncate max-w-[150px]" title={r.leadInvestor ?? ""}>
                    {r.leadInvestor ?? <span className="text-muted-foreground/40">—</span>}
                  </TableCell>
                  <TableCell className="py-1.5 px-2 text-center tabular-nums">
                    {r.investorCount}
                  </TableCell>
                  <TableCell className="py-1.5 px-2 text-muted-foreground whitespace-nowrap">
                    {fmtDate(r.publishedAt)}
                  </TableCell>
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
