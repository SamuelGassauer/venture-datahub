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
import { ArrowUpDown, Search, Building2, Globe, Trash2 } from "lucide-react";
import { SmartLogo } from "@/components/ui/smart-logo";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { EntitySheet } from "@/components/graph/entity-sheet";

type Company = {
  name: string;
  country: string | null;
  sector: string | null;
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
  if (!n) return "\u2014";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400",
  acquired: "bg-blue-500/8 text-blue-600 dark:text-blue-400",
  ipo: "bg-purple-500/8 text-purple-600 dark:text-purple-400",
  shut_down: "bg-red-500/8 text-red-500",
  unknown: "bg-foreground/[0.04] text-foreground/45",
};

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("totalFunding");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const { filters } = useGlobalFilters();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  async function handleDelete(name: string) {
    if (!confirm(`Delete "${name}" and all its relationships?`)) return;
    try {
      const res = await fetch(`/api/companies/${encodeURIComponent(name)}`, { method: "DELETE" });
      if (res.ok) {
        setCompanies((prev) => prev.filter((c) => c.name !== name));
        toast.success(`Deleted ${name}`);
      } else {
        const data = await res.json();
        toast.error(data.error || "Delete failed");
      }
    } catch {
      toast.error("Delete failed");
    }
  }

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
    const geo = resolveGeoFilter(filters);
    if (geo) {
      list = list.filter((c) => c.country && geo.countries.has(c.country.toLowerCase()));
    }
    if (filters.stages.length > 0) {
      const stagesLower = new Set(filters.stages.map((s) => s.toLowerCase()));
      list = list.filter((c) => c.lastStage && stagesLower.has(c.lastStage.toLowerCase()));
    }
    if (filters.sectors.length > 0) {
      const sectorsLower = new Set(filters.sectors.map((s) => s.toLowerCase()));
      list = list.filter((c) => c.sector && sectorsLower.has(c.sector.toLowerCase()));
    }
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
  }, [companies, search, sortBy, sortOrder, filters]);

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
      <div className="glass-status-bar flex items-center gap-3 px-4 py-2.5 shrink-0">
        <Building2 className="h-4 w-4 text-foreground/40" />
        <h1 className="text-[17px] font-semibold tracking-[-0.02em] text-foreground/85">Companies</h1>
        <div className="relative ml-auto max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/30" />
          <input
            placeholder="Search companies..."
            className="glass-search-input h-7 w-full pl-8 pr-3 text-[13px] tracking-[-0.01em] text-foreground/85 placeholder:text-foreground/30"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="text-[11px] text-foreground/35 tabular-nums tracking-[0.04em]">
          {filtered.length} companies
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
              No companies found.
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
                  <TableHead
                    className="w-[70px] cursor-pointer text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35"
                    onClick={() => toggleSort("status")}
                  >
                    Status <SortIcon field="status" />
                  </TableHead>
                  <TableHead
                    className="w-[70px] cursor-pointer text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35"
                    onClick={() => toggleSort("country")}
                  >
                    Country <SortIcon field="country" />
                  </TableHead>
                  <TableHead
                    className="w-[90px] cursor-pointer text-right text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35"
                    onClick={() => toggleSort("totalFunding")}
                  >
                    Funding <SortIcon field="totalFunding" />
                  </TableHead>
                  <TableHead
                    className="w-[55px] cursor-pointer text-center text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35"
                    onClick={() => toggleSort("roundCount")}
                  >
                    Rnds <SortIcon field="roundCount" />
                  </TableHead>
                  <TableHead className="w-[65px] text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
                    Stage
                  </TableHead>
                  <TableHead
                    className="w-[55px] cursor-pointer text-center text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35"
                    onClick={() => toggleSort("foundedYear")}
                  >
                    Est. <SortIcon field="foundedYear" />
                  </TableHead>
                  <TableHead className="w-[70px] text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
                    Size
                  </TableHead>
                  <TableHead className="min-w-[150px] text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
                    Description
                  </TableHead>
                  <TableHead
                    className="w-[55px] cursor-pointer text-center text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35"
                    onClick={() => toggleSort("enrichScore")}
                  >
                    Score <SortIcon field="enrichScore" />
                  </TableHead>
                  <TableHead className="w-[50px] text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35 text-center">
                    Links
                  </TableHead>
                  {isAdmin && <TableHead className="w-[36px]" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow
                    key={c.name}
                    className="cursor-pointer lg-inset-table-row text-[13px] tracking-[-0.01em]"
                    onClick={() => {
                      setSelectedCompany(c.name);
                      setSheetOpen(true);
                    }}
                  >
                    <TableCell className="py-1.5 px-1">
                      {c.logoUrl ? (
                        <SmartLogo src={c.logoUrl} alt={c.name} className="h-5 w-5 rounded-[6px]" fallback={<div className="h-5 w-5 rounded-[6px] bg-foreground/[0.04]" />} />
                      ) : (
                        <div className="h-5 w-5 rounded-[6px] bg-foreground/[0.04]" />
                      )}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 font-semibold text-foreground/85">
                      {c.name}
                    </TableCell>
                    <TableCell className="py-1.5 px-2">
                      {c.status ? (
                        <Badge
                          variant="outline"
                          className={`text-[10px] h-5 px-1.5 rounded-full border-0 ${STATUS_COLORS[c.status] ?? STATUS_COLORS.unknown}`}
                        >
                          {c.status}
                        </Badge>
                      ) : (
                        <span className="text-foreground/30">&mdash;</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 text-foreground/45">
                      {c.country ?? "\u2014"}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap text-foreground/85">
                      {fmtAmt(c.totalFunding)}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 text-center tabular-nums text-foreground/55">
                      {c.roundCount}
                    </TableCell>
                    <TableCell className="py-1.5 px-2">
                      {c.lastStage ? (
                        <span className="rounded-full bg-foreground/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-foreground/55">
                          {c.lastStage}
                        </span>
                      ) : (
                        <span className="text-foreground/30">&mdash;</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 text-center tabular-nums text-foreground/40">
                      {c.foundedYear ?? "\u2014"}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 text-foreground/45 whitespace-nowrap">
                      {c.employeeRange ?? "\u2014"}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 text-foreground/40 truncate max-w-[200px]" title={c.description ?? ""}>
                      {c.description ?? "\u2014"}
                    </TableCell>
                    <TableCell className="py-1.5 px-2 text-center">
                      <div className="flex items-center justify-center gap-1" title={`${c.enrichScore}/${COMPANY_MAX_SCORE}`}>
                        <div className="h-1.5 w-10 rounded-full bg-foreground/[0.04] overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              c.enrichScore >= 7 ? "bg-emerald-500" :
                              c.enrichScore >= 4 ? "bg-yellow-500" : "bg-orange-500"
                            }`}
                            style={{ width: `${(c.enrichScore / COMPANY_MAX_SCORE) * 100}%` }}
                          />
                        </div>
                        <span className="font-mono text-[10px] text-foreground/35 tabular-nums">{c.enrichScore}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-1.5 px-2 text-center">
                      <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                        {c.website && (
                          <a
                            href={c.website.startsWith("http") ? c.website : `https://${c.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-foreground/40 hover:text-foreground/85"
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
                            className="text-foreground/40 hover:text-foreground/85"
                            title="LinkedIn"
                          >
                            <Globe className="h-3 w-3" />
                          </a>
                        )}
                        {!c.website && !c.linkedinUrl && (
                          <span className="text-foreground/15">&mdash;</span>
                        )}
                      </div>
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="py-1.5 px-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(c.name); }}
                          className="rounded-[8px] p-1 text-foreground/30 hover:text-red-500 hover:bg-red-500/8 transition-colors"
                          title="Delete company"
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
