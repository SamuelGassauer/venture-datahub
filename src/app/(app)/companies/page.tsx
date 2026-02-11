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
import { ArrowUpDown, Search, Building2, ExternalLink, Globe } from "lucide-react";
import { EntitySheet } from "@/components/graph/entity-sheet";

type Company = {
  name: string;
  country: string | null;
  totalFunding: number | null;
  roundCount: number;
  location: string | null;
  lastStage: string | null;
  status: string | null;
  description: string | null;
  website: string | null;
  foundedYear: number | null;
  employeeRange: string | null;
  linkedinUrl: string | null;
  logoUrl: string | null;
  enrichScore: number;
};

const COMPANY_MAX_SCORE = 9;

type SortKey = "name" | "country" | "totalFunding" | "roundCount" | "lastStage" | "foundedYear" | "status" | "enrichScore";

function fmtAmt(n: number | null | undefined): string {
  if (!n) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  acquired: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  ipo: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30",
  shut_down: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
  unknown: "bg-muted text-muted-foreground border-border",
};

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("totalFunding");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/companies")
      .then((r) => r.json())
      .then((json) => setCompanies(json.data ?? []))
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
    let list = companies;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.name?.toLowerCase().includes(q) ||
          c.country?.toLowerCase().includes(q) ||
          c.location?.toLowerCase().includes(q) ||
          c.description?.toLowerCase().includes(q)
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
  }, [companies, search, sortBy, sortOrder]);

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
        <Building2 className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Companies</h1>
        <div className="relative ml-auto max-w-xs flex-1">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search companies..."
            className="h-7 pl-7 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {filtered.length} companies
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
            No companies found.
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
                  className="w-[70px] cursor-pointer text-xs font-semibold"
                  onClick={() => toggleSort("status")}
                >
                  Status <SortIcon field="status" />
                </TableHead>
                <TableHead
                  className="w-[70px] cursor-pointer text-xs font-semibold"
                  onClick={() => toggleSort("country")}
                >
                  Country <SortIcon field="country" />
                </TableHead>
                <TableHead
                  className="w-[90px] cursor-pointer text-right text-xs font-semibold"
                  onClick={() => toggleSort("totalFunding")}
                >
                  Funding <SortIcon field="totalFunding" />
                </TableHead>
                <TableHead
                  className="w-[55px] cursor-pointer text-center text-xs font-semibold"
                  onClick={() => toggleSort("roundCount")}
                >
                  Rnds <SortIcon field="roundCount" />
                </TableHead>
                <TableHead className="w-[65px] text-xs font-semibold">
                  Stage
                </TableHead>
                <TableHead
                  className="w-[55px] cursor-pointer text-center text-xs font-semibold"
                  onClick={() => toggleSort("foundedYear")}
                >
                  Est. <SortIcon field="foundedYear" />
                </TableHead>
                <TableHead className="w-[70px] text-xs font-semibold">
                  Size
                </TableHead>
                <TableHead className="min-w-[150px] text-xs font-semibold">
                  Description
                </TableHead>
                <TableHead
                  className="w-[55px] cursor-pointer text-center text-xs font-semibold"
                  onClick={() => toggleSort("enrichScore")}
                >
                  Score <SortIcon field="enrichScore" />
                </TableHead>
                <TableHead className="w-[50px] text-xs font-semibold text-center">
                  Links
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow
                  key={c.name}
                  className="cursor-pointer text-xs"
                  onClick={() => {
                    setSelectedCompany(c.name);
                    setSheetOpen(true);
                  }}
                >
                  <TableCell className="py-1.5 px-1">
                    {c.logoUrl ? (
                      <img src={c.logoUrl} alt="" className="h-5 w-5 rounded object-contain" />
                    ) : (
                      <div className="h-5 w-5 rounded bg-muted" />
                    )}
                  </TableCell>
                  <TableCell className="py-1.5 px-2 font-medium">
                    {c.name}
                  </TableCell>
                  <TableCell className="py-1.5 px-2">
                    {c.status ? (
                      <Badge
                        variant="outline"
                        className={`text-[10px] h-5 px-1.5 ${STATUS_COLORS[c.status] ?? STATUS_COLORS.unknown}`}
                      >
                        {c.status}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </TableCell>
                  <TableCell className="py-1.5 px-2 text-muted-foreground">
                    {c.country ?? "—"}
                  </TableCell>
                  <TableCell className="py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                    {fmtAmt(c.totalFunding)}
                  </TableCell>
                  <TableCell className="py-1.5 px-2 text-center tabular-nums">
                    {c.roundCount}
                  </TableCell>
                  <TableCell className="py-1.5 px-2">
                    {c.lastStage ? (
                      <Badge variant="secondary" className="text-[10px]">
                        {c.lastStage}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </TableCell>
                  <TableCell className="py-1.5 px-2 text-center tabular-nums text-muted-foreground">
                    {c.foundedYear ?? "—"}
                  </TableCell>
                  <TableCell className="py-1.5 px-2 text-muted-foreground whitespace-nowrap">
                    {c.employeeRange ?? "—"}
                  </TableCell>
                  <TableCell className="py-1.5 px-2 text-muted-foreground truncate max-w-[200px]" title={c.description ?? ""}>
                    {c.description ?? "—"}
                  </TableCell>
                  <TableCell className="py-1.5 px-2 text-center">
                    <div className="flex items-center justify-center gap-1" title={`${c.enrichScore}/${COMPANY_MAX_SCORE}`}>
                      <div className="h-1.5 w-10 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            c.enrichScore >= 7 ? "bg-emerald-500" :
                            c.enrichScore >= 4 ? "bg-yellow-500" : "bg-orange-500"
                          }`}
                          style={{ width: `${(c.enrichScore / COMPANY_MAX_SCORE) * 100}%` }}
                        />
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{c.enrichScore}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-1.5 px-2 text-center">
                    <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {c.website && (
                        <a
                          href={c.website.startsWith("http") ? c.website : `https://${c.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                          title={c.website}
                        >
                          <Globe className="h-3 w-3" />
                        </a>
                      )}
                      {c.linkedinUrl && (
                        <a
                          href={c.linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                          title="LinkedIn"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {!c.website && !c.linkedinUrl && (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </div>
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
