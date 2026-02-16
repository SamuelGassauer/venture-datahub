"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  TimelineChart,
  StageChart,
  GeographyChart,
  SectorChart,
} from "@/components/graph/funding-charts";
import { EntitySheet } from "@/components/graph/entity-sheet";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PipelineBucket = {
  total: number;
  ingested: number;
  pending: number;
  dismissed?: number;
};

type GraphStats = {
  summary: {
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
  ingestion: { totalInDb: number; ingested: number; pending: number };
  pipeline: {
    fundingRounds: PipelineBucket;
    fundEvents: PipelineBucket;
    valueIndicators: PipelineBucket;
  };
  fundingBySector: {
    sector: string;
    totalAmount: number;
    dealCount: number;
    companyCount: number;
  }[];
  fundSummary: { totalFunds: number; totalAum: number; managingFirms: number };
  recentDeals: {
    company: string;
    companyCountry: string | null;
    amount: number | null;
    stage: string | null;
    leadInvestor: string | null;
    participantCount: number;
    articleUrl: string | null;
    articleTitle: string | null;
    publishedAt: string | null;
  }[];
  topCompanies: {
    name: string;
    country: string | null;
    totalFunding: number | null;
    roundCount: number;
    lastRoundStage: string | null;
    lastRoundAmount: number | null;
  }[];
  topInvestors: {
    name: string;
    dealCount: number;
    leadCount: number;
    totalDeployed: number | null;
    portfolioCompanies: string[];
  }[];
  fundingByStage: { stage: string; count: number; totalAmount: number }[];
  fundingByCountry: {
    country: string;
    totalAmount: number;
    dealCount: number;
    companyCount: number;
  }[];
  fundingTimeline: { month: string; dealCount: number; totalAmount: number }[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(amount: number | null | undefined): string {
  if (!amount) return "N/A";
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "0";
  return n.toLocaleString("en-US");
}

function relTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function HeadlineBar({ summary }: { summary: GraphStats["summary"] }) {
  const items = [
    { label: "tracked", value: fmt(summary.totalFunding) },
    { label: "companies", value: fmtNum(summary.totalCompanies) },
    { label: "investors", value: fmtNum(summary.totalInvestors) },
    { label: "rounds", value: fmtNum(summary.totalRounds) },
    { label: "median deal", value: fmt(summary.medianDealSize) },
    { label: "avg deal", value: fmt(summary.avgDealSize) },
    { label: "articles", value: fmtNum(summary.totalArticles) },
    { label: "edges", value: fmtNum(summary.totalEdges) },
  ];

  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 rounded-md border px-4 py-2.5">
      {items.map((item, i) => (
        <span key={item.label} className="whitespace-nowrap">
          {i > 0 && (
            <span className="mr-1.5 text-muted-foreground/40">&middot;</span>
          )}
          <span className="font-mono text-sm font-bold tabular-nums">
            {item.value}
          </span>{" "}
          <span className="text-[11px] text-muted-foreground">
            {item.label}
          </span>
        </span>
      ))}
    </div>
  );
}

function PipelineRow({
  label,
  href,
  bucket,
}: {
  label: string;
  href: string;
  bucket: PipelineBucket;
}) {
  const pct = bucket.total > 0 ? (bucket.ingested / bucket.total) * 100 : 0;
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-md border px-3 py-1.5 transition-colors hover:bg-accent"
    >
      <span className="w-28 shrink-0 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
        {bucket.ingested}/{bucket.total}
      </span>
      {bucket.pending > 0 && (
        <span className="font-mono text-[11px] text-amber-500">
          {bucket.pending} pending
        </span>
      )}
    </Link>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </h2>
  );
}

function ChartPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border">
      <div className="px-3 pt-2.5 pb-1">
        <SectionHead>{title}</SectionHead>
      </div>
      <div className="px-1 pb-2">{children}</div>
    </div>
  );
}

type Column<T> = {
  key: string;
  label: string;
  align?: "left" | "right";
  render: (row: T, index: number) => React.ReactNode;
};

function RankTable<T>({
  data,
  columns,
  onRowClick,
  height = 320,
  emptyMessage,
}: {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (row: T) => void;
  height?: number;
  emptyMessage: string;
}) {
  if (!data.length) return <EmptyState message={emptyMessage} />;

  return (
    <ScrollArea style={{ height }}>
      <table className="w-full">
        <thead className="sticky top-0 z-10 bg-background">
          <tr className="border-b">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-3 py-1.5 ${
                  col.align === "right" ? "text-right" : "text-left"
                }`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={i}
              className={`border-b transition-colors hover:bg-accent ${
                onRowClick ? "cursor-pointer" : ""
              }`}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`text-xs px-3 py-1.5 ${
                    col.align === "right" ? "text-right" : "text-left"
                  }`}
                >
                  {col.render(row, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollArea>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="py-8 text-center text-xs text-muted-foreground">{message}</p>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 rounded border bg-background px-1.5 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

type Filters = { country: string; stage: string; sector: string };

function FilterBar({
  filters,
  onFilterChange,
  countryOptions,
  stageOptions,
  sectorOptions,
}: {
  filters: Filters;
  onFilterChange: (f: Filters) => void;
  countryOptions: string[];
  stageOptions: string[];
  sectorOptions: string[];
}) {
  const active =
    (filters.country ? 1 : 0) +
    (filters.stage ? 1 : 0) +
    (filters.sector ? 1 : 0);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md border px-3 py-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Filter
      </span>
      <FilterSelect
        label="Country"
        value={filters.country}
        options={countryOptions}
        onChange={(v) => onFilterChange({ ...filters, country: v })}
      />
      <FilterSelect
        label="Stage"
        value={filters.stage}
        options={stageOptions}
        onChange={(v) => onFilterChange({ ...filters, stage: v })}
      />
      <FilterSelect
        label="Sector"
        value={filters.sector}
        options={sectorOptions}
        onChange={(v) => onFilterChange({ ...filters, sector: v })}
      />
      {active > 0 && (
        <button
          onClick={() => onFilterChange({ country: "", stage: "", sector: "" })}
          className="ml-auto text-[11px] text-amber-500 hover:text-amber-400 transition-colors"
        >
          Clear {active} filter{active > 1 ? "s" : ""}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column configs
// ---------------------------------------------------------------------------

type Company = GraphStats["topCompanies"][number];
type Investor = GraphStats["topInvestors"][number];

const companyColumns: Column<Company>[] = [
  {
    key: "#",
    label: "#",
    render: (_, i) => (
      <span className="text-muted-foreground">{i + 1}</span>
    ),
  },
  {
    key: "name",
    label: "Name",
    render: (r) => (
      <span className="font-medium">
        {r.name}
        {r.country && (
          <span className="ml-1 text-muted-foreground">{r.country}</span>
        )}
      </span>
    ),
  },
  {
    key: "raised",
    label: "Raised",
    align: "right",
    render: (r) => (
      <span className="font-mono text-xs font-bold tabular-nums">
        {fmt(r.totalFunding)}
      </span>
    ),
  },
  {
    key: "rounds",
    label: "Rds",
    align: "right",
    render: (r) => (
      <span className="font-mono tabular-nums">{r.roundCount}</span>
    ),
  },
  {
    key: "stage",
    label: "Stage",
    render: (r) =>
      r.lastRoundStage ? (
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
          {r.lastRoundStage}
        </span>
      ) : null,
  },
];

const investorColumns: Column<Investor>[] = [
  {
    key: "#",
    label: "#",
    render: (_, i) => (
      <span className="text-muted-foreground">{i + 1}</span>
    ),
  },
  {
    key: "name",
    label: "Name",
    render: (r) => <span className="font-medium">{r.name}</span>,
  },
  {
    key: "deals",
    label: "Deals",
    align: "right",
    render: (r) => (
      <span className="font-mono tabular-nums">{r.dealCount}</span>
    ),
  },
  {
    key: "leads",
    label: "Leads",
    align: "right",
    render: (r) => (
      <span className="font-mono tabular-nums">{r.leadCount}</span>
    ),
  },
  {
    key: "deployed",
    label: "Deployed",
    align: "right",
    render: (r) => (
      <span className="font-mono text-xs font-bold tabular-nums">
        {fmt(r.totalDeployed)}
      </span>
    ),
  },
];

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function AdminDashboard() {
  const [data, setData] = useState<GraphStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [entity, setEntity] = useState<{
    name: string;
    type: "company" | "investor";
  } | null>(null);
  const [filters, setFilters] = useState<Filters>({
    country: "",
    stage: "",
    sector: "",
  });

  useEffect(() => {
    fetch("/api/graph-stats")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const filterOptions = useMemo(() => {
    if (!data) return { countries: [], stages: [], sectors: [] };
    const countries = [
      ...new Set([
        ...data.recentDeals.map((d) => d.companyCountry).filter(Boolean),
        ...data.topCompanies.map((c) => c.country).filter(Boolean),
        ...data.fundingByCountry.map((c) => c.country),
      ] as string[]),
    ].sort();
    const stages = [
      ...new Set([
        ...data.recentDeals.map((d) => d.stage).filter(Boolean),
        ...data.topCompanies.map((c) => c.lastRoundStage).filter(Boolean),
        ...data.fundingByStage.map((s) => s.stage),
      ] as string[]),
    ].sort();
    const sectors = [
      ...new Set(data.fundingBySector.map((s) => s.sector)),
    ].sort();
    return { countries, stages, sectors };
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return null;
    const { country, stage } = filters;

    const deals = data.recentDeals.filter((d) => {
      if (country && d.companyCountry !== country) return false;
      if (stage && d.stage !== stage) return false;
      return true;
    });

    const companies = data.topCompanies.filter((c) => {
      if (country && c.country !== country) return false;
      if (stage && c.lastRoundStage !== stage) return false;
      return true;
    });

    const byCountry = country
      ? data.fundingByCountry.filter((c) => c.country === country)
      : data.fundingByCountry;

    const byStage = stage
      ? data.fundingByStage.filter((s) => s.stage === stage)
      : data.fundingByStage;

    const bySector = filters.sector
      ? data.fundingBySector.filter((s) => s.sector === filters.sector)
      : data.fundingBySector;

    return { deals, companies, byCountry, byStage, bySector };
  }, [data, filters]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10" />
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!data || !filtered) return <p>Failed to load graph stats.</p>;

  const {
    summary,
    pipeline,
    topInvestors,
    fundingTimeline,
    fundSummary,
  } = data;

  const hasActiveFilters = filters.country || filters.stage || filters.sector;

  return (
    <div className="space-y-3">
      <HeadlineBar summary={summary} />

      <div className="space-y-1.5">
        <PipelineRow
          label="Deals"
          href="/funding"
          bucket={pipeline.fundingRounds}
        />
        <PipelineRow
          label="Events"
          href="/fund-events"
          bucket={pipeline.fundEvents}
        />
        <PipelineRow
          label="KPIs"
          href="/company-value-indicator"
          bucket={pipeline.valueIndicators}
        />
      </div>

      <FilterBar
        filters={filters}
        onFilterChange={setFilters}
        countryOptions={filterOptions.countries}
        stageOptions={filterOptions.stages}
        sectorOptions={filterOptions.sectors}
      />

      <Separator />

      <div className="rounded-md border">
        <div className="px-3 pt-2.5 pb-1 flex items-baseline gap-2">
          <SectionHead>Deal Tape</SectionHead>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {filtered.deals.length}
            {hasActiveFilters
              ? ` / ${data.recentDeals.length}`
              : ""}{" "}
            deals
          </span>
        </div>
        {filtered.deals.length > 0 ? (
          <ScrollArea className="h-[280px]">
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-background">
                <tr className="border-b">
                  <th className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-3 py-1.5 text-left">
                    Company
                  </th>
                  <th className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-3 py-1.5 text-right">
                    Amount
                  </th>
                  <th className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-3 py-1.5 text-left">
                    Stage
                  </th>
                  <th className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-3 py-1.5 text-left">
                    Lead
                  </th>
                  <th className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-3 py-1.5 text-right">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.deals.map((deal, i) => (
                  <tr
                    key={i}
                    className="cursor-pointer border-b transition-colors hover:bg-accent"
                    onClick={() =>
                      setEntity({ name: deal.company, type: "company" })
                    }
                  >
                    <td className="px-3 py-1.5 text-xs font-medium">
                      {deal.company}
                      {deal.companyCountry && (
                        <span className="ml-1 text-muted-foreground">
                          {deal.companyCountry}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs font-bold tabular-nums">
                      {fmt(deal.amount)}
                    </td>
                    <td className="px-3 py-1.5 text-xs">
                      {deal.stage && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                          {deal.stage}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">
                      {deal.leadInvestor ?? "\u2014"}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-[11px] text-muted-foreground">
                      {relTime(deal.publishedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        ) : (
          <EmptyState message={hasActiveFilters ? "No deals match filters." : "No deals yet."} />
        )}
      </div>

      <Separator />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ChartPanel title="Funding Timeline">
          {fundingTimeline.length > 0 ? (
            <TimelineChart data={fundingTimeline} height={180} />
          ) : (
            <EmptyState message="No timeline data yet." />
          )}
        </ChartPanel>

        <ChartPanel title="Stage Breakdown">
          {filtered.byStage.length > 0 ? (
            <StageChart data={filtered.byStage} height={180} />
          ) : (
            <EmptyState message="No stage data yet." />
          )}
        </ChartPanel>

        <ChartPanel title="Geography">
          {filtered.byCountry.length > 0 ? (
            <GeographyChart data={filtered.byCountry} height={180} />
          ) : (
            <EmptyState message="No geography data yet." />
          )}
        </ChartPanel>

        <ChartPanel title="Sector Heat">
          <SectorChart data={filtered.bySector} />
        </ChartPanel>
      </div>

      <Separator />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-md border">
          <div className="px-3 pt-2.5 pb-1 flex items-baseline gap-2">
            <SectionHead>Top Companies</SectionHead>
            {hasActiveFilters && (
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {filtered.companies.length} / {data.topCompanies.length}
              </span>
            )}
          </div>
          <RankTable<Company>
            data={filtered.companies}
            columns={companyColumns}
            onRowClick={(r) => setEntity({ name: r.name, type: "company" })}
            height={320}
            emptyMessage={hasActiveFilters ? "No companies match filters." : "No companies yet."}
          />
        </div>

        <div className="rounded-md border">
          <div className="px-3 pt-2.5 pb-1">
            <SectionHead>Top Investors</SectionHead>
          </div>
          <RankTable<Investor>
            data={topInvestors}
            columns={investorColumns}
            onRowClick={(r) => setEntity({ name: r.name, type: "investor" })}
            height={320}
            emptyMessage="No investors yet."
          />
        </div>
      </div>

      {(fundSummary.totalFunds > 0 ||
        fundSummary.totalAum > 0 ||
        fundSummary.managingFirms > 0) && (
        <Link
          href="/graph/fund-closings"
          className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border px-4 py-2 transition-colors hover:bg-accent"
        >
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Funds
          </span>
          <span className="whitespace-nowrap">
            <span className="font-mono text-sm font-bold tabular-nums">
              {fmtNum(fundSummary.totalFunds)}
            </span>{" "}
            <span className="text-[11px] text-muted-foreground">funds</span>
          </span>
          <span className="whitespace-nowrap">
            <span className="font-mono text-sm font-bold tabular-nums">
              {fmt(fundSummary.totalAum)}
            </span>{" "}
            <span className="text-[11px] text-muted-foreground">AUM</span>
          </span>
          <span className="whitespace-nowrap">
            <span className="font-mono text-sm font-bold tabular-nums">
              {fmtNum(fundSummary.managingFirms)}
            </span>{" "}
            <span className="text-[11px] text-muted-foreground">firms</span>
          </span>
          <span className="ml-auto text-[11px] text-muted-foreground">
            View Fund Closings &rarr;
          </span>
        </Link>
      )}

      <EntitySheet
        open={entity !== null}
        onOpenChange={(open) => {
          if (!open) setEntity(null);
        }}
        entityType={entity?.type ?? null}
        entityName={entity?.name ?? null}
      />
    </div>
  );
}
