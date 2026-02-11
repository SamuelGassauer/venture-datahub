"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Building2,
  Users,
  CircleDollarSign,
  MapPin,
  Newspaper,
  TrendingUp,
  Database,
  ExternalLink,
  BarChart3,
  Network,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Award,
} from "lucide-react";
import dynamic from "next/dynamic";
import { EntitySheet } from "@/components/graph/entity-sheet";
import { StageChart, GeographyChart, TimelineChart, DealFlowChart } from "@/components/graph/funding-charts";

const NetworkGraph = dynamic(
  () => import("@/components/graph/network-graph").then((m) => ({ default: m.NetworkGraph })),
  { ssr: false, loading: () => <div className="flex h-full items-center justify-center"><Skeleton className="h-[500px] w-full" /></div> },
);
const NodeDetailPanel = dynamic(
  () => import("@/components/graph/node-detail-panel").then((m) => ({ default: m.NodeDetailPanel })),
  { ssr: false },
);

// --- Types ---

type Summary = {
  totalFunding: number;
  totalCompanies: number;
  totalInvestors: number;
  totalRounds: number;
  totalArticles: number;
  totalLocations: number;
  totalEdges: number;
  avgDealSize: number;
  medianDealSize: number | null;
};

type Ingestion = { totalInDb: number; ingested: number; pending: number };

type Deal = {
  company: string;
  companyCountry: string | null;
  amount: number | null;
  stage: string | null;
  leadInvestor: string | null;
  participantCount: number;
  articleUrl: string | null;
  articleTitle: string | null;
  publishedAt: string | null;
};

type Company = {
  name: string;
  country: string | null;
  totalFunding: number | null;
  roundCount: number;
  lastRoundStage: string | null;
  lastRoundAmount: number | null;
};

type Investor = {
  name: string;
  dealCount: number;
  leadCount: number;
  totalDeployed: number | null;
  portfolioCompanies: string[];
};

type StageData = { stage: string; count: number; totalAmount: number };
type CountryData = { country: string; totalAmount: number; dealCount: number; companyCount: number };
type TimelineData = { month: string; dealCount: number; totalAmount: number };

type GraphStats = {
  summary: Summary;
  ingestion: Ingestion;
  recentDeals: Deal[];
  topCompanies: Company[];
  topInvestors: Investor[];
  fundingByStage: StageData[];
  fundingByCountry: CountryData[];
  fundingTimeline: TimelineData[];
};

// --- Helpers ---

function fmt(amount: number | null | undefined): string {
  if (!amount) return "---";
  if (amount >= 1e9) return `$${(amount / 1e9).toFixed(1)}B`;
  if (amount >= 1e6) return `$${(amount / 1e6).toFixed(1)}M`;
  if (amount >= 1e3) return `$${(amount / 1e3).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "---";
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return d;
  }
}

type SortDir = "asc" | "desc" | null;

function useSortable<T>(data: T[], defaultKey: keyof T & string, defaultDir: SortDir = "desc") {
  const [sortKey, setSortKey] = useState<keyof T & string>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  const toggle = useCallback((key: keyof T & string) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : d === "asc" ? null : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }, [sortKey]);

  const sorted = useMemo(() => {
    if (!sortDir) return data;
    return [...data].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [data, sortKey, sortDir]);

  return { sorted, sortKey, sortDir, toggle };
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active || !dir) return <ArrowUpDown className="ml-1 inline h-3 w-3 text-muted-foreground/50" />;
  return dir === "asc"
    ? <ArrowUp className="ml-1 inline h-3 w-3" />
    : <ArrowDown className="ml-1 inline h-3 w-3" />;
}

// --- Entity Sheet state ---
type SheetState = {
  open: boolean;
  entityType: "company" | "investor" | "round" | null;
  entityName: string | null;
};

// --- Selected node state for network tab ---
type SelectedNode = {
  id: string;
  type: "company" | "investor" | "round" | "location";
  meta: Record<string, unknown>;
} | null;

// --- Main Component ---

export default function GraphExplorerPage() {
  const [data, setData] = useState<GraphStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [entityTab, setEntityTab] = useState("deals");
  const [sheet, setSheet] = useState<SheetState>({ open: false, entityType: null, entityName: null });
  const [selectedNode, setSelectedNode] = useState<SelectedNode>(null);

  useEffect(() => {
    fetch("/api/graph-stats")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const openSheet = useCallback((entityType: SheetState["entityType"], entityName: string) => {
    setSheet({ open: true, entityType, entityName });
  }, []);

  const handleNodeSelect = useCallback(
    (id: string, type: "company" | "investor" | "round" | "location", meta: Record<string, unknown>) => {
      setSelectedNode({ id, type, meta });
    },
    [],
  );

  // Filter tables by search
  const filteredDeals = useMemo(() => {
    if (!data) return [];
    if (!searchQuery.trim()) return data.recentDeals;
    const q = searchQuery.toLowerCase();
    return data.recentDeals.filter(
      (d) =>
        d.company?.toLowerCase().includes(q) ||
        d.stage?.toLowerCase().includes(q) ||
        d.leadInvestor?.toLowerCase().includes(q) ||
        d.companyCountry?.toLowerCase().includes(q),
    );
  }, [data, searchQuery]);

  const filteredCompanies = useMemo(() => {
    if (!data) return [];
    if (!searchQuery.trim()) return data.topCompanies;
    const q = searchQuery.toLowerCase();
    return data.topCompanies.filter(
      (c) => c.name?.toLowerCase().includes(q) || c.country?.toLowerCase().includes(q),
    );
  }, [data, searchQuery]);

  const filteredInvestors = useMemo(() => {
    if (!data) return [];
    if (!searchQuery.trim()) return data.topInvestors;
    const q = searchQuery.toLowerCase();
    return data.topInvestors.filter(
      (inv) =>
        inv.name?.toLowerCase().includes(q) ||
        inv.portfolioCompanies?.some((c: string) => c?.toLowerCase().includes(q)),
    );
  }, [data, searchQuery]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-64" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Graph Explorer</h1>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{error || "Failed to load graph data."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { summary, ingestion } = data;
  const ingestionPct = ingestion.totalInDb > 0
    ? Math.round((ingestion.ingested / ingestion.totalInDb) * 100)
    : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Graph Explorer</h1>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Database className="h-3 w-3" />
          <span>{ingestion.ingested}/{ingestion.totalInDb} ingested</span>
          <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${ingestionPct}%` }} />
          </div>
          <span>{ingestionPct}%</span>
        </div>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="network" className="gap-1.5">
            <Network className="h-3.5 w-3.5" />
            Network
          </TabsTrigger>
        </TabsList>

        {/* ═══════════ DASHBOARD TAB ═══════════ */}
        <TabsContent value="dashboard" className="space-y-4">
          {/* Metric Bar */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <MetricCard
              label="Total Funding"
              value={fmt(summary.totalFunding as number)}
              sub={`Avg ${fmt(summary.avgDealSize as number)}`}
              icon={TrendingUp}
              color="text-emerald-500"
            />
            <MetricCard
              label="Companies"
              value={String(summary.totalCompanies)}
              sub={`${summary.totalLocations} locations`}
              icon={Building2}
              color="text-blue-500"
            />
            <MetricCard
              label="Investors"
              value={String(summary.totalInvestors)}
              icon={Users}
              color="text-green-500"
            />
            <MetricCard
              label="Deals"
              value={String(summary.totalRounds)}
              sub={summary.medianDealSize ? `Median ${fmt(summary.medianDealSize)}` : undefined}
              icon={CircleDollarSign}
              color="text-purple-500"
            />
            <MetricCard
              label="Articles"
              value={String(summary.totalArticles)}
              sub={`${summary.totalEdges} edges`}
              icon={Newspaper}
              color="text-orange-500"
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Timeline */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Funding Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                {data.fundingTimeline.length > 0 ? (
                  <TimelineChart data={data.fundingTimeline} height={220} />
                ) : (
                  <EmptyState text="No timeline data" />
                )}
              </CardContent>
            </Card>

            {/* Deal Flow Donut */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Deal Flow by Stage</CardTitle>
              </CardHeader>
              <CardContent>
                {data.fundingByStage.length > 0 ? (
                  <DealFlowChart data={data.fundingByStage} height={220} />
                ) : (
                  <EmptyState text="No stage data" />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Funding by Stage</CardTitle>
              </CardHeader>
              <CardContent>
                {data.fundingByStage.length > 0 ? (
                  <StageChart data={data.fundingByStage} height={200} />
                ) : (
                  <EmptyState text="No stage data" />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Top Geographies</CardTitle>
              </CardHeader>
              <CardContent>
                {data.fundingByCountry.length > 0 ? (
                  <GeographyChart data={data.fundingByCountry} height={200} />
                ) : (
                  <EmptyState text="No geography data" />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Data Tables */}
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <Tabs value={entityTab} onValueChange={setEntityTab}>
                  <TabsList className="h-8">
                    <TabsTrigger value="deals" className="text-xs h-7 px-3">
                      <CircleDollarSign className="mr-1 h-3 w-3" />
                      Recent Deals
                    </TabsTrigger>
                    <TabsTrigger value="companies" className="text-xs h-7 px-3">
                      <Building2 className="mr-1 h-3 w-3" />
                      Companies
                    </TabsTrigger>
                    <TabsTrigger value="investors" className="text-xs h-7 px-3">
                      <Users className="mr-1 h-3 w-3" />
                      Investors
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Filter..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 w-48 pl-8 text-xs"
                  />
                </div>
              </div>

              {entityTab === "deals" && (
                <DealsTable data={filteredDeals} onClickCompany={(name) => openSheet("company", name)} onClickInvestor={(name) => openSheet("investor", name)} />
              )}
              {entityTab === "companies" && (
                <CompaniesTable data={filteredCompanies} onClick={(name) => openSheet("company", name)} />
              )}
              {entityTab === "investors" && (
                <InvestorsTable data={filteredInvestors} onClick={(name) => openSheet("investor", name)} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════ NETWORK TAB ═══════════ */}
        <TabsContent value="network" className="relative" style={{ height: "calc(100vh - 160px)" }}>
          <NetworkGraph onNodeSelect={handleNodeSelect} />
          {selectedNode && (
            <NodeDetailPanel
              nodeId={selectedNode.id}
              nodeType={selectedNode.type}
              meta={selectedNode.meta}
              onClose={() => setSelectedNode(null)}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Entity Detail Sheet */}
      <EntitySheet
        open={sheet.open}
        onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
        entityType={sheet.entityType}
        entityName={sheet.entityName}
      />
    </div>
  );
}

// --- Sub Components ---

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof Building2;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <div className={`rounded-lg bg-muted p-2 ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold tabular-nums leading-tight">{value}</p>
          {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="py-8 text-center text-xs text-muted-foreground">{text}</p>;
}

// --- Deals Table ---

function DealsTable({
  data,
  onClickCompany,
  onClickInvestor,
}: {
  data: Deal[];
  onClickCompany: (name: string) => void;
  onClickInvestor: (name: string) => void;
}) {
  const { sorted, sortKey, sortDir, toggle } = useSortable(data, "amount");

  const SH = ({ col, label, className }: { col: keyof Deal & string; label: string; className?: string }) => (
    <TableHead className={`cursor-pointer select-none whitespace-nowrap text-xs ${className ?? ""}`} onClick={() => toggle(col)}>
      {label}
      <SortIcon active={sortKey === col} dir={sortKey === col ? sortDir : null} />
    </TableHead>
  );

  if (data.length === 0) return <EmptyState text="No deals found" />;

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <SH col="company" label="Company" />
          <SH col="amount" label="Amount" className="text-right" />
          <SH col="stage" label="Stage" />
          <SH col="leadInvestor" label="Lead Investor" />
          <SH col="participantCount" label="Investors" className="text-right" />
          <SH col="publishedAt" label="Date" />
          <TableHead className="w-8" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((d, i) => (
          <TableRow key={i} className="group">
            <TableCell>
              <button
                className="flex items-center gap-1.5 text-left font-medium hover:text-blue-600 hover:underline"
                onClick={() => onClickCompany(d.company)}
              >
                <Building2 className="h-3 w-3 shrink-0 text-blue-500" />
                <span className="truncate max-w-[200px]">{d.company}</span>
                {d.companyCountry && (
                  <span className="shrink-0 text-[10px] text-muted-foreground">{d.companyCountry}</span>
                )}
              </button>
            </TableCell>
            <TableCell className="text-right font-semibold tabular-nums">{fmt(d.amount)}</TableCell>
            <TableCell>
              {d.stage && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{d.stage}</Badge>}
            </TableCell>
            <TableCell>
              {d.leadInvestor ? (
                <button
                  className="flex items-center gap-1 text-left hover:text-green-600 hover:underline"
                  onClick={() => onClickInvestor(d.leadInvestor!)}
                >
                  <Award className="h-3 w-3 shrink-0 text-yellow-500" />
                  <span className="truncate max-w-[150px] text-xs">{d.leadInvestor}</span>
                </button>
              ) : (
                <span className="text-xs text-muted-foreground">---</span>
              )}
            </TableCell>
            <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
              {d.participantCount > 0 ? d.participantCount : "---"}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(d.publishedAt)}</TableCell>
            <TableCell>
              {d.articleUrl && (
                <a
                  href={d.articleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                </a>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// --- Companies Table ---

function CompaniesTable({ data, onClick }: { data: Company[]; onClick: (name: string) => void }) {
  const { sorted, sortKey, sortDir, toggle } = useSortable(data, "totalFunding");

  const SH = ({ col, label, className }: { col: keyof Company & string; label: string; className?: string }) => (
    <TableHead className={`cursor-pointer select-none whitespace-nowrap text-xs ${className ?? ""}`} onClick={() => toggle(col)}>
      {label}
      <SortIcon active={sortKey === col} dir={sortKey === col ? sortDir : null} />
    </TableHead>
  );

  if (data.length === 0) return <EmptyState text="No companies found" />;

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <SH col="name" label="Company" />
          <SH col="country" label="Country" />
          <SH col="totalFunding" label="Total Funding" className="text-right" />
          <SH col="roundCount" label="Rounds" className="text-right" />
          <SH col="lastRoundStage" label="Last Round" />
          <SH col="lastRoundAmount" label="Last Amount" className="text-right" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((c, i) => (
          <TableRow key={i} className="cursor-pointer" onClick={() => onClick(c.name)}>
            <TableCell>
              <div className="flex items-center gap-1.5">
                <Building2 className="h-3 w-3 shrink-0 text-blue-500" />
                <span className="font-medium hover:text-blue-600">{c.name}</span>
              </div>
            </TableCell>
            <TableCell>
              {c.country ? (
                <div className="flex items-center gap-1 text-xs">
                  <MapPin className="h-3 w-3 text-muted-foreground" />
                  {c.country}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">---</span>
              )}
            </TableCell>
            <TableCell className="text-right font-semibold tabular-nums">{fmt(c.totalFunding)}</TableCell>
            <TableCell className="text-right tabular-nums text-xs text-muted-foreground">{c.roundCount}</TableCell>
            <TableCell>
              {c.lastRoundStage && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{c.lastRoundStage}</Badge>}
            </TableCell>
            <TableCell className="text-right tabular-nums text-xs">{fmt(c.lastRoundAmount)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// --- Investors Table ---

function InvestorsTable({ data, onClick }: { data: Investor[]; onClick: (name: string) => void }) {
  const { sorted, sortKey, sortDir, toggle } = useSortable(data, "dealCount");

  const SH = ({ col, label, className }: { col: keyof Investor & string; label: string; className?: string }) => (
    <TableHead className={`cursor-pointer select-none whitespace-nowrap text-xs ${className ?? ""}`} onClick={() => toggle(col)}>
      {label}
      <SortIcon active={sortKey === col} dir={sortKey === col ? sortDir : null} />
    </TableHead>
  );

  if (data.length === 0) return <EmptyState text="No investors found" />;

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <SH col="name" label="Investor" />
          <SH col="dealCount" label="Deals" className="text-right" />
          <SH col="leadCount" label="Leads" className="text-right" />
          <SH col="totalDeployed" label="Total Deployed" className="text-right" />
          <TableHead className="text-xs">Portfolio</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((inv, i) => (
          <TableRow key={i} className="cursor-pointer" onClick={() => onClick(inv.name)}>
            <TableCell>
              <div className="flex items-center gap-1.5">
                <Users className="h-3 w-3 shrink-0 text-green-500" />
                <span className="font-medium hover:text-green-600">{inv.name}</span>
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{inv.dealCount}</Badge>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {inv.leadCount > 0 ? (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
                  <Award className="h-2.5 w-2.5 text-yellow-500" />
                  {inv.leadCount}
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground">---</span>
              )}
            </TableCell>
            <TableCell className="text-right font-semibold tabular-nums">{fmt(inv.totalDeployed)}</TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {inv.portfolioCompanies?.filter(Boolean).slice(0, 3).map((c, j) => (
                  <Badge key={j} variant="outline" className="text-[10px] px-1 py-0 font-normal">{c}</Badge>
                ))}
                {(inv.portfolioCompanies?.length ?? 0) > 3 && (
                  <span className="text-[10px] text-muted-foreground">+{inv.portfolioCompanies.length - 3}</span>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
