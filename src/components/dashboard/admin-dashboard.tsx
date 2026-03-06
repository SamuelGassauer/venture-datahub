"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  TimelineChart,
  StageChart,
  GeographyChart,
  SectorChart,
} from "@/components/graph/funding-charts";
import { EntitySheet } from "@/components/graph/entity-sheet";
import { EuropeMap3D } from "@/components/dashboard/europe-map-3d";
import { WeeklyDealChart } from "@/components/dashboard/weekly-deal-chart";

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
    <div className="glass-status-bar flex flex-wrap items-baseline gap-x-1.5 gap-y-1 px-4 py-2.5">
      {items.map((item, i) => (
        <span key={item.label} className="whitespace-nowrap">
          {i > 0 && (
            <span className="mr-1.5 text-foreground/15">&middot;</span>
          )}
          <span className="font-mono text-[13px] font-bold tabular-nums text-foreground/85">
            {item.value}
          </span>{" "}
          <span className="text-[11px] tracking-[0.04em] text-foreground/35">
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
      className="lg-inset-row flex items-center gap-3 px-3 py-1.5 transition-colors"
    >
      <span className="w-28 shrink-0 text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35">
        {label}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/[0.04]">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-[11px] tabular-nums text-foreground/45">
        {bucket.ingested}/{bucket.total}
      </span>
      {bucket.pending > 0 && (
        <span className="font-mono text-[11px] text-amber-600">
          {bucket.pending} pending
        </span>
      )}
    </Link>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35">
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
    <div className="lg-inset rounded-[16px]">
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
        <thead className="glass-table-header sticky top-0 z-10">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35 px-3 py-1.5 ${
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
              className={`lg-inset-table-row transition-colors ${
                onRowClick ? "cursor-pointer" : ""
              }`}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`text-[13px] tracking-[-0.01em] px-3 py-1.5 ${
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
    <p className="py-8 text-center text-[13px] text-foreground/40">{message}</p>
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
      <span className="text-[11px] text-foreground/45">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="glass-search-input h-6 px-1.5 text-[11px] font-mono text-foreground/85 focus:outline-none"
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
    <div className="glass-status-bar flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35">
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
          className="ml-auto text-[11px] text-amber-600 hover:text-amber-500 transition-colors"
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
      <span className="text-foreground/40">{i + 1}</span>
    ),
  },
  {
    key: "name",
    label: "Name",
    render: (r) => (
      <span className="font-semibold text-[13px] tracking-[-0.01em] text-foreground/85">
        {r.name}
        {r.country && (
          <span className="ml-1 text-foreground/40">{r.country}</span>
        )}
      </span>
    ),
  },
  {
    key: "raised",
    label: "Raised",
    align: "right",
    render: (r) => (
      <span className="font-mono text-[13px] font-bold tabular-nums text-foreground/85">
        {fmt(r.totalFunding)}
      </span>
    ),
  },
  {
    key: "rounds",
    label: "Rds",
    align: "right",
    render: (r) => (
      <span className="font-mono tabular-nums text-foreground/55">{r.roundCount}</span>
    ),
  },
  {
    key: "stage",
    label: "Stage",
    render: (r) =>
      r.lastRoundStage ? (
        <span className="rounded-full bg-foreground/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-foreground/55">
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
      <span className="text-foreground/40">{i + 1}</span>
    ),
  },
  {
    key: "name",
    label: "Name",
    render: (r) => <span className="font-semibold text-[13px] tracking-[-0.01em] text-foreground/85">{r.name}</span>,
  },
  {
    key: "deals",
    label: "Deals",
    align: "right",
    render: (r) => (
      <span className="font-mono tabular-nums text-foreground/55">{r.dealCount}</span>
    ),
  },
  {
    key: "leads",
    label: "Leads",
    align: "right",
    render: (r) => (
      <span className="font-mono tabular-nums text-foreground/55">{r.leadCount}</span>
    ),
  },
  {
    key: "deployed",
    label: "Deployed",
    align: "right",
    render: (r) => (
      <span className="font-mono text-[13px] font-bold tabular-nums text-foreground/85">
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
      .then((json) => {
        if (!json.error) setData(json);
      })
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
      <div className="space-y-3 p-4">
        <Skeleton className="h-10 rounded-[10px]" />
        <Skeleton className="h-24 rounded-[14px]" />
        <Skeleton className="h-64 rounded-[16px]" />
      </div>
    );
  }

  if (!data || !filtered) return <p className="text-foreground/45 p-4">Failed to load graph stats.</p>;

  const {
    summary,
    pipeline,
    topInvestors,
    fundingTimeline,
    fundSummary,
  } = data;

  const hasActiveFilters = filters.country || filters.stage || filters.sector;

  return (
    <div className="space-y-3 p-4">
      {/* 3D Europe Map */}
      <EuropeMap3D
        fundingByCountry={filtered.byCountry}
        recentDeals={data.recentDeals}
        activeCountry={filters.country || undefined}
        onCountryClick={(country) =>
          setFilters((prev) => ({
            ...prev,
            country: prev.country === country ? "" : country,
          }))
        }
      />
      <WeeklyDealChart />

      <HeadlineBar summary={summary} />

      <div className="lg-inset rounded-[16px] overflow-hidden">
        <PipelineRow
          label="Deals"
          href="/app/funding"
          bucket={pipeline.fundingRounds}
        />
        <PipelineRow
          label="Events"
          href="/app/fund-events"
          bucket={pipeline.fundEvents}
        />
        <PipelineRow
          label="KPIs"
          href="/app/company-value-indicator"
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

      {/* Deal Tape */}
      <div className="lg-inset rounded-[16px] overflow-hidden">
        <div className="glass-table-header px-3 py-2 flex items-baseline gap-2">
          <SectionHead>Deal Tape</SectionHead>
          <span className="font-mono text-[11px] tabular-nums text-foreground/35">
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
              <thead className="glass-table-header sticky top-0 z-10">
                <tr>
                  <th className="text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35 px-3 py-1.5 text-left">
                    Company
                  </th>
                  <th className="text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35 px-3 py-1.5 text-right">
                    Amount
                  </th>
                  <th className="text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35 px-3 py-1.5 text-left">
                    Stage
                  </th>
                  <th className="text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35 px-3 py-1.5 text-left">
                    Lead
                  </th>
                  <th className="text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35 px-3 py-1.5 text-right">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.deals.map((deal, i) => (
                  <tr
                    key={i}
                    className="cursor-pointer lg-inset-table-row transition-colors"
                    onClick={() =>
                      setEntity({ name: deal.company, type: "company" })
                    }
                  >
                    <td className="px-3 py-1.5 text-[13px] tracking-[-0.01em] font-semibold text-foreground/85">
                      {deal.company}
                      {deal.companyCountry && (
                        <span className="ml-1 text-foreground/40">
                          {deal.companyCountry}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-[13px] font-bold tabular-nums text-foreground/85">
                      {fmt(deal.amount)}
                    </td>
                    <td className="px-3 py-1.5 text-[13px]">
                      {deal.stage && (
                        <span className="rounded-full bg-foreground/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-foreground/55">
                          {deal.stage}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-[13px] text-foreground/45">
                      {deal.leadInvestor ?? "\u2014"}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-[11px] text-foreground/30">
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

      {/* Charts */}
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

      {/* Top Companies & Investors */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="lg-inset rounded-[16px] overflow-hidden">
          <div className="glass-table-header px-3 py-2 flex items-baseline gap-2">
            <SectionHead>Top Companies</SectionHead>
            {hasActiveFilters && (
              <span className="font-mono text-[11px] tabular-nums text-foreground/35">
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

        <div className="lg-inset rounded-[16px] overflow-hidden">
          <div className="glass-table-header px-3 py-2">
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

      {/* Funds Summary */}
      {(fundSummary.totalFunds > 0 ||
        fundSummary.totalAum > 0 ||
        fundSummary.managingFirms > 0) && (
        <Link
          href="/app/graph/fund-closings"
          className="glass-status-bar flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 transition-colors hover:bg-foreground/[0.04]"
        >
          <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35">
            Funds
          </span>
          <span className="whitespace-nowrap">
            <span className="font-mono text-[13px] font-bold tabular-nums text-foreground/85">
              {fmtNum(fundSummary.totalFunds)}
            </span>{" "}
            <span className="text-[11px] text-foreground/45">funds</span>
          </span>
          <span className="whitespace-nowrap">
            <span className="font-mono text-[13px] font-bold tabular-nums text-foreground/85">
              {fmt(fundSummary.totalAum)}
            </span>{" "}
            <span className="text-[11px] text-foreground/45">AUM</span>
          </span>
          <span className="whitespace-nowrap">
            <span className="font-mono text-[13px] font-bold tabular-nums text-foreground/85">
              {fmtNum(fundSummary.managingFirms)}
            </span>{" "}
            <span className="text-[11px] text-foreground/45">firms</span>
          </span>
          <span className="ml-auto text-[11px] text-foreground/40">
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
        onNavigate={(type, name) => setEntity({ name, type: type as "company" | "investor" })}
      />
    </div>
  );
}
