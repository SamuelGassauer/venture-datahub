"use client";

import { useEffect, useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useGlobalFilters, resolveGeoFilter, STAGES } from "@/lib/global-filters";
import { INVESTOR_TYPES, normalizeInvestorType } from "@/lib/investor-enricher";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowUpDown, Search, Users } from "lucide-react";
import { SmartLogo } from "@/components/ui/smart-logo";
import { EntitySheet } from "@/components/graph/entity-sheet";

type Investor = {
  name: string;
  type: string | null;
  dealCount: number;
  leadCount: number;
  totalDeployed: number | null;
  portfolioCompanies: string[];
  logoUrl: string | null;
  enrichScore: number;
  hq: string | null;
  stageFocus: string[];
  geoFocus: string[];
  sectorFocus: string[];
};

const INVESTOR_MAX_SCORE = 12;

const TYPE_LABELS: Record<string, string> = {
  vc: "VC",
  pe: "PE",
  cvc: "CVC",
  angel_group: "Angel",
  family_office: "Family Office",
  sovereign_wealth: "Sovereign Wealth",
  government: "Government",
  accelerator: "Accelerator",
  incubator: "Incubator",
  bank: "Bank",
  hedge_fund: "Hedge Fund",
};

type SortKey = "name" | "dealCount" | "leadCount" | "totalDeployed" | "enrichScore";

function fmtAmt(n: number | null | undefined): string {
  if (!n) return "\u2014";
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
  const [minDeals, setMinDeals] = useState(0);
  const [stageFilter, setStageFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [logoFilter, setLogoFilter] = useState<"all" | "with" | "without">("all");
  const { filters } = useGlobalFilters();

  useEffect(() => {
    fetch("/api/investors")
      .then((r) => r.json())
      .then((json) => {
        const data = (json.data ?? []).map((inv: Investor) => ({
          ...inv,
          type: normalizeInvestorType(inv.type) ?? inv.type,
        }));
        setInvestors(data);
      })
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
    if (minDeals > 0) {
      list = list.filter((inv) => inv.dealCount >= minDeals);
    }
    if (stageFilter) {
      const sf = stageFilter.toLowerCase();
      list = list.filter((inv) =>
        inv.stageFocus?.some((s) => s.toLowerCase() === sf)
      );
    }
    if (typeFilter) {
      list = list.filter((inv) => inv.type === typeFilter);
    }
    if (logoFilter === "with") {
      list = list.filter((inv) => !!inv.logoUrl);
    } else if (logoFilter === "without") {
      list = list.filter((inv) => !inv.logoUrl);
    }
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
  }, [investors, search, sortBy, sortOrder, filters, minDeals, stageFilter, typeFilter, logoFilter]);

  const SortIcon = ({ field }: { field: SortKey }) => (
    <ArrowUpDown
      className={`ml-0.5 inline h-3 w-3 ${
        sortBy === field ? "text-foreground/85" : "text-foreground/30"
      }`}
    />
  );

  return (
    <div className="flex h-[calc(100vh-1.5rem)] flex-col">
      {/* Tier 2: Status bar / toolbar */}
      <div className="glass-status-bar flex items-center gap-3 px-4 py-2.5 shrink-0 flex-wrap">
        <Users className="h-4 w-4 text-foreground/40" />
        <h1 className="text-[17px] font-semibold tracking-[-0.02em] text-foreground/85">Investors</h1>
        <div className="relative ml-4 max-w-xs flex-1 min-w-[140px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/30" />
          <input
            placeholder="Search investors..."
            className="glass-search-input h-7 w-full pl-8 pr-3 text-[13px] tracking-[-0.01em] text-foreground/85 placeholder:text-foreground/30"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Min Deals */}
        <select
          className="glass-search-input h-7 px-2 text-[13px] tracking-[-0.01em] text-foreground/85 focus:outline-none"
          value={minDeals}
          onChange={(e) => setMinDeals(Number(e.target.value))}
        >
          <option value={0}>Alle Deals</option>
          <option value={2}>&ge; 2 Deals</option>
          <option value={3}>&ge; 3 Deals</option>
          <option value={5}>&ge; 5 Deals</option>
          <option value={10}>&ge; 10 Deals</option>
        </select>

        {/* Stage Focus */}
        <select
          className="glass-search-input h-7 px-2 text-[13px] tracking-[-0.01em] text-foreground/85 focus:outline-none"
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
        >
          <option value="">Alle Stages</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* Investor Type */}
        <select
          className="glass-search-input h-7 px-2 text-[13px] tracking-[-0.01em] text-foreground/85 focus:outline-none"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">Alle Typen</option>
          {INVESTOR_TYPES.map((t) => (
            <option key={t} value={t}>{TYPE_LABELS[t] ?? t}</option>
          ))}
        </select>

        {/* Logo filter */}
        <div className="flex items-center gap-1">
          {(["all", "with", "without"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setLogoFilter(f)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                logoFilter === f
                  ? "apple-btn-blue"
                  : "glass-capsule-btn text-foreground/45"
              }`}
            >
              {f === "all" ? "Alle" : f === "with" ? "Mit Logo" : "Ohne Logo"}
            </button>
          ))}
        </div>

        <span className="ml-auto text-[11px] text-foreground/35 tabular-nums tracking-[0.04em]">
          {filtered.length} investors
        </span>
      </div>

      {/* Tier 3: Scrollable content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="lg-inset rounded-[16px] overflow-hidden">
          {loading ? (
            <div className="space-y-1 p-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="h-7 rounded-[6px]" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-[13px] text-foreground/40">
              No investors found.
            </div>
          ) : (
            <Table>
              <TableHeader className="glass-table-header sticky top-0 z-10">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[32px] text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35" />
                  <TableHead
                    className="cursor-pointer text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35"
                    onClick={() => toggleSort("name")}
                  >
                    Name <SortIcon field="name" />
                  </TableHead>
                  <TableHead className="w-[100px] text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
                    Typ
                  </TableHead>
                  <TableHead
                    className="w-[70px] cursor-pointer text-center text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35"
                    onClick={() => toggleSort("dealCount")}
                  >
                    Deals <SortIcon field="dealCount" />
                  </TableHead>
                  <TableHead
                    className="w-[70px] cursor-pointer text-center text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35"
                    onClick={() => toggleSort("leadCount")}
                  >
                    Leads <SortIcon field="leadCount" />
                  </TableHead>
                  <TableHead
                    className="w-[110px] cursor-pointer text-right text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35"
                    onClick={() => toggleSort("totalDeployed")}
                  >
                    Total Deployed <SortIcon field="totalDeployed" />
                  </TableHead>
                  <TableHead
                    className="w-[55px] cursor-pointer text-center text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35"
                    onClick={() => toggleSort("enrichScore")}
                  >
                    Score <SortIcon field="enrichScore" />
                  </TableHead>
                  <TableHead className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
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
                      className="cursor-pointer lg-inset-table-row text-[13px] tracking-[-0.01em]"
                      onClick={() => {
                        setSelectedInvestor(inv.name);
                        setSheetOpen(true);
                      }}
                    >
                      <TableCell className="py-1.5 px-1">
                        {inv.logoUrl ? (
                          <SmartLogo src={inv.logoUrl} alt={inv.name} className="h-5 w-5 rounded-[6px]" fallback={<div className="h-5 w-5 rounded-[6px] bg-foreground/[0.04]" />} />
                        ) : (
                          <div className="h-5 w-5 rounded-[6px] bg-foreground/[0.04]" />
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 px-2 font-semibold text-foreground/85">
                        {inv.name}
                      </TableCell>
                      <TableCell className="py-1.5 px-2">
                        {inv.type ? (
                          <span className="rounded-full bg-foreground/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-foreground/55">
                            {TYPE_LABELS[inv.type] ?? inv.type}
                          </span>
                        ) : (
                          <span className="text-foreground/15">&mdash;</span>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 px-2 text-center tabular-nums text-foreground/55">
                        {inv.dealCount}
                      </TableCell>
                      <TableCell className="py-1.5 px-2 text-center tabular-nums text-foreground/55">
                        {inv.leadCount}
                      </TableCell>
                      <TableCell className="py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap text-foreground/85">
                        {fmtAmt(inv.totalDeployed)}
                      </TableCell>
                      <TableCell className="py-1.5 px-2 text-center">
                        <div className="flex items-center justify-center gap-1" title={`${inv.enrichScore}/${INVESTOR_MAX_SCORE}`}>
                          <div className="h-1.5 w-10 rounded-full bg-foreground/[0.04] overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                inv.enrichScore >= 9 ? "bg-emerald-500" :
                                inv.enrichScore >= 5 ? "bg-yellow-500" : "bg-orange-500"
                              }`}
                              style={{ width: `${(inv.enrichScore / INVESTOR_MAX_SCORE) * 100}%` }}
                            />
                          </div>
                          <span className="font-mono text-[10px] text-foreground/35 tabular-nums">{inv.enrichScore}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-1.5 px-2">
                        <div className="flex flex-wrap gap-1">
                          {shown.map((c) => (
                            <span
                              key={c}
                              className="rounded-full bg-foreground/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-foreground/55 h-5 flex items-center"
                            >
                              {c}
                            </span>
                          ))}
                          {extra > 0 && (
                            <span className="rounded-full bg-foreground/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-foreground/30 h-5 flex items-center">
                              +{extra}
                            </span>
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
      </div>

      <EntitySheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        entityType="investor"
        entityName={selectedInvestor}
        onNavigate={(type, name) => {
          if (type === "investor") setSelectedInvestor(name);
        }}
      />
    </div>
  );
}
