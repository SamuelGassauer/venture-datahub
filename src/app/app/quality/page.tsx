"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  Banknote,
  Building2,
  Users,
  ExternalLink,
  Linkedin,
  Sparkles,
  RefreshCw,
  Copy,
  Loader2,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Tier = "good" | "ok" | "poor";
type TabKey = "rounds" | "companies" | "investors";

type Overview = {
  rounds: { total: number; avgScore: number; issues: Record<string, number> };
  companies: { total: number; avgScore: number; issues: Record<string, number> };
  investors: { total: number; avgScore: number; issues: Record<string, number> };
};

type RoundRow = {
  uuid: string;
  companyName: string | null;
  companyKey: string | null;
  companyLogoUrl: string | null;
  amountUsd: number | null;
  stage: string | null;
  country: string | null;
  leadName: string | null;
  confidence: number | null;
  sourceCount: number;
  investorCount: number;
  articleIds: string[];
  effectiveDate: string | null;
  score: number;
  tier: Tier;
  breakdown: { llmConfidence: number; multiSource: number; completeness: number; recency: number };
  issues: string[];
};

type CompanyRow = {
  name: string | null;
  normalizedName: string;
  logoUrl: string | null;
  country: string | null;
  sector: string | null;
  status: string | null;
  website: string | null;
  linkedinUrl: string | null;
  foundedYear: number | null;
  roundCount: number;
  totalFunding: number;
  enrichScore: number;
  enrichedAt: string | null;
  score: number;
  tier: Tier;
  issues: string[];
};

type InvestorRow = {
  name: string | null;
  normalizedName: string;
  logoUrl: string | null;
  type: string | null;
  hqCity: string | null;
  hqCountry: string | null;
  website: string | null;
  linkedinUrl: string | null;
  stageFocus: string[];
  sectorFocus: string[];
  geoFocus: string[];
  dealCount: number;
  leadCount: number;
  totalDeployed: number;
  enrichScore: number;
  enrichedAt: string | null;
  score: number;
  tier: Tier;
  issues: string[];
};

function fmtAmt(n: number | null | undefined): string {
  if (!n) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 1) return "today";
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

function tierClass(tier: Tier): string {
  if (tier === "good") return "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400";
  if (tier === "ok") return "bg-amber-500/8 text-amber-600";
  return "bg-red-500/8 text-red-500";
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 75 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 w-12 rounded-full bg-foreground/[0.08] overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[12px] tabular-nums text-foreground/70 font-medium">{score}</span>
    </div>
  );
}

function IssuePills({
  issues,
  dedupHref,
}: {
  issues: string[];
  dedupHref?: string;
}) {
  if (issues.length === 0) {
    return <span className="text-[11px] text-emerald-600/70">clean</span>;
  }
  const visible = issues.slice(0, 3);
  const more = issues.length - visible.length;
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((iss) => {
        if (iss === "dedup-pending" && dedupHref) {
          return (
            <Link
              key={iss}
              href={dedupHref}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-px text-[10px] font-medium text-amber-600 hover:bg-amber-500/15"
            >
              <Copy className="h-2.5 w-2.5" />
              {iss}
            </Link>
          );
        }
        return (
          <span
            key={iss}
            className="inline-flex items-center rounded-full bg-foreground/[0.04] px-1.5 py-px text-[10px] font-medium text-foreground/55"
          >
            {iss}
          </span>
        );
      })}
      {more > 0 && (
        <span className="text-[10px] text-foreground/40">+{more}</span>
      )}
    </div>
  );
}

function ActionButton({
  busy,
  onClick,
  children,
  title,
  disabled,
}: {
  busy: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (!busy && !disabled) onClick();
      }}
      disabled={busy || disabled}
      title={title}
      className="glass-capsule-btn flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-foreground/70 hover:text-foreground/85 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : children}
    </button>
  );
}

function KpiCard({
  icon: Icon,
  label,
  total,
  avgScore,
  issues,
}: {
  icon: typeof Activity;
  label: string;
  total: number;
  avgScore: number;
  issues: Record<string, number>;
}) {
  const topIssues = Object.entries(issues)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const tier: Tier = avgScore >= 75 ? "good" : avgScore >= 50 ? "ok" : "poor";
  return (
    <div className="lg-inset rounded-[14px] p-4 flex flex-col gap-3 min-w-0">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-foreground/40" />
        <span className="text-[13px] font-semibold tracking-[-0.02em] text-foreground/85">{label}</span>
        <span className="ml-auto text-[11px] text-foreground/35 tabular-nums tracking-[0.04em]">
          {total.toLocaleString()}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight text-foreground/85 tabular-nums">{avgScore}</span>
        <span className="text-[11px] text-foreground/40">avg score</span>
        <span className={`ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${tierClass(tier)}`}>
          {tier}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {topIssues.length === 0 ? (
          <span className="text-[11px] text-foreground/40">no issues</span>
        ) : (
          topIssues.map(([key, n]) => (
            <span
              key={key}
              className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.04] px-2 py-0.5 text-[11px] text-foreground/55"
            >
              <span className="font-medium tabular-nums text-foreground/70">{n}</span>
              <span>{key}</span>
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function TierFilter({
  value,
  onChange,
}: {
  value: Tier | null;
  onChange: (v: Tier | null) => void;
}) {
  const opts: { key: Tier | null; label: string }[] = [
    { key: null, label: "All" },
    { key: "poor", label: "Poor (<50)" },
    { key: "ok", label: "Ok (50–74)" },
    { key: "good", label: "Good (75+)" },
  ];
  return (
    <div className="flex items-center gap-1">
      {opts.map((o) => (
        <button
          key={o.label}
          onClick={() => onChange(o.key)}
          className={`glass-capsule-btn px-3 py-1 text-[11px] font-medium ${
            value === o.key ? "text-foreground/85 bg-foreground/[0.06]" : "text-foreground/55"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

async function consumeSSE(url: string, body: object): Promise<{ ok: boolean; lastStage: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) return { ok: false, lastStage: `HTTP ${res.status}` };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastStage = "";
  let errored = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const evt = JSON.parse(line.slice(6));
        if (evt.stage === "error") errored = true;
        if (evt.stage) lastStage = evt.stage;
      } catch { /* ignore */ }
    }
  }
  return { ok: !errored, lastStage };
}

export default function QualityPage() {
  const [tab, setTab] = useState<TabKey>("rounds");
  const [tier, setTier] = useState<Tier | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [rounds, setRounds] = useState<RoundRow[] | null>(null);
  const [companies, setCompanies] = useState<CompanyRow[] | null>(null);
  const [investors, setInvestors] = useState<InvestorRow[] | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const setRowBusy = useCallback((key: string, on: boolean) => {
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(key); else next.delete(key);
      return next;
    });
  }, []);

  const reloadOverview = useCallback(() => {
    fetch("/api/v1/quality/overview")
      .then((r) => r.json())
      .then(setOverview)
      .catch((e) => console.error("overview", e));
  }, []);

  const reloadTab = useCallback((which: TabKey, currentTier: Tier | null) => {
    const url = `/api/v1/quality/${which}${currentTier ? `?tier=${currentTier}` : ""}`;
    fetch(url)
      .then((r) => r.json())
      .then((j) => {
        if (which === "rounds") setRounds(j.data || []);
        else if (which === "companies") setCompanies(j.data || []);
        else if (which === "investors") setInvestors(j.data || []);
      })
      .catch((e) => console.error(which, e));
  }, []);

  useEffect(() => {
    reloadOverview();
  }, [reloadOverview]);

  useEffect(() => {
    if (tab === "rounds") setRounds(null);
    if (tab === "companies") setCompanies(null);
    if (tab === "investors") setInvestors(null);
    reloadTab(tab, tier);
  }, [tab, tier, reloadTab]);

  const reExtractRound = useCallback(async (row: RoundRow) => {
    if (!row.articleIds.length) {
      toast.error("No source articles linked — can't re-extract");
      return;
    }
    const key = `round:${row.uuid}`;
    setRowBusy(key, true);
    try {
      const res = await fetch("/api/funding/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: row.companyName ?? row.uuid, articleIds: row.articleIds }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(`${row.companyName}: ${json.error ?? `HTTP ${res.status}`}`);
        return;
      }
      toast.success(`${row.companyName}: re-extracted`);
      reloadTab("rounds", tier);
      reloadOverview();
    } catch (e) {
      toast.error(`${row.companyName}: ${e instanceof Error ? e.message : "failed"}`);
    } finally {
      setRowBusy(key, false);
    }
  }, [setRowBusy, reloadTab, tier, reloadOverview]);

  const reEnrichCompany = useCallback(async (row: CompanyRow) => {
    if (!row.name) return;
    const key = `company:${row.normalizedName}`;
    setRowBusy(key, true);
    const t = toast.loading(`Enriching ${row.name}…`);
    try {
      const r = await consumeSSE("/api/enrich-company", { companyName: row.name, force: true });
      if (r.ok) {
        toast.success(`${row.name} enriched`, { id: t });
        reloadTab("companies", tier);
        reloadOverview();
      } else {
        toast.error(`${row.name}: ${r.lastStage || "failed"}`, { id: t });
      }
    } finally {
      setRowBusy(key, false);
    }
  }, [setRowBusy, reloadTab, tier, reloadOverview]);

  const reEnrichInvestor = useCallback(async (row: InvestorRow) => {
    if (!row.name) return;
    const key = `investor:${row.normalizedName}`;
    setRowBusy(key, true);
    const t = toast.loading(`Enriching ${row.name}…`);
    try {
      const r = await consumeSSE("/api/enrich-investor", { investorName: row.name, force: true });
      if (r.ok) {
        toast.success(`${row.name} enriched`, { id: t });
        reloadTab("investors", tier);
        reloadOverview();
      } else {
        toast.error(`${row.name}: ${r.lastStage || "failed"}`, { id: t });
      }
    } finally {
      setRowBusy(key, false);
    }
  }, [setRowBusy, reloadTab, tier, reloadOverview]);

  return (
    <div className="flex h-[calc(100vh-1.5rem)] flex-col">
      {/* Tier 2: Title + Tabs */}
      <div className="glass-status-bar flex items-center gap-3 px-4 py-2.5 shrink-0">
        <Activity className="h-4 w-4 text-foreground/40" />
        <h1 className="text-[17px] font-semibold tracking-[-0.02em] text-foreground/85">
          Data Quality
        </h1>
        <div className="ml-4 flex items-center gap-1">
          {(
            [
              { key: "rounds" as const, label: "Rounds", icon: Banknote },
              { key: "companies" as const, label: "Companies", icon: Building2 },
              { key: "investors" as const, label: "Investors", icon: Users },
            ]
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`glass-capsule-btn flex items-center gap-1.5 px-3 py-1 text-[12px] font-medium ${
                tab === t.key
                  ? "text-foreground/85 bg-foreground/[0.06]"
                  : "text-foreground/55"
              }`}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <TierFilter value={tier} onChange={setTier} />
        </div>
      </div>

      {/* Tier 3: KPI cards */}
      <div className="px-4 pt-4 grid grid-cols-1 md:grid-cols-3 gap-3 shrink-0">
        {overview ? (
          <>
            <KpiCard
              icon={Banknote}
              label="Funding Rounds"
              total={overview.rounds.total}
              avgScore={overview.rounds.avgScore}
              issues={overview.rounds.issues}
            />
            <KpiCard
              icon={Building2}
              label="Companies"
              total={overview.companies.total}
              avgScore={overview.companies.avgScore}
              issues={overview.companies.issues}
            />
            <KpiCard
              icon={Users}
              label="Investors"
              total={overview.investors.total}
              avgScore={overview.investors.avgScore}
              issues={overview.investors.issues}
            />
          </>
        ) : (
          [0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-[14px]" />
          ))
        )}
      </div>

      {/* Tier 3: Table */}
      <div className="flex-1 overflow-auto p-4">
        <div className="lg-inset rounded-[16px] overflow-hidden">
          {tab === "rounds" && (
            <RoundsTable rows={rounds} busy={busy} onReExtract={reExtractRound} />
          )}
          {tab === "companies" && (
            <CompaniesTable rows={companies} busy={busy} onReEnrich={reEnrichCompany} />
          )}
          {tab === "investors" && (
            <InvestorsTable rows={investors} busy={busy} onReEnrich={reEnrichInvestor} />
          )}
        </div>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="space-y-1 p-2">
      {Array.from({ length: 12 }).map((_, i) => (
        <Skeleton key={i} className="h-7 rounded-[6px]" />
      ))}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-40 text-[13px] text-foreground/40">
      {label}
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <TableHead
      className={`text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35 ${className}`}
    >
      {children}
    </TableHead>
  );
}

function RoundsTable({
  rows,
  busy,
  onReExtract,
}: {
  rows: RoundRow[] | null;
  busy: Set<string>;
  onReExtract: (row: RoundRow) => void;
}) {
  if (rows == null) return <Loading />;
  if (rows.length === 0) return <Empty label="No rounds match this filter." />;
  return (
    <Table>
      <TableHeader className="glass-table-header sticky top-0 z-10">
        <TableRow className="hover:bg-transparent">
          <Th className="w-[100px]">Score</Th>
          <Th>Company</Th>
          <Th className="w-[80px] text-right">Amount</Th>
          <Th className="w-[70px]">Stage</Th>
          <Th className="w-[60px]">Country</Th>
          <Th>Lead</Th>
          <Th className="w-[55px] text-center">Src</Th>
          <Th className="w-[60px] text-right">Conf</Th>
          <Th>Issues</Th>
          <Th className="w-[140px] text-right">Actions</Th>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const isBusy = busy.has(`round:${r.uuid}`);
          return (
            <TableRow key={r.uuid} className="lg-inset-table-row text-[13px] tracking-[-0.01em]">
              <TableCell><ScoreBar score={r.score} /></TableCell>
              <TableCell className="font-semibold text-foreground/85">
                <div className="flex items-center gap-2">
                  {r.companyLogoUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={r.companyLogoUrl} alt="" className="h-4 w-4 rounded-[3px] object-contain" />
                  ) : null}
                  <span className="truncate">{r.companyName ?? "—"}</span>
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums text-foreground/70">{fmtAmt(r.amountUsd)}</TableCell>
              <TableCell className="text-foreground/70">{r.stage ?? "—"}</TableCell>
              <TableCell className="text-foreground/70">{r.country ?? "—"}</TableCell>
              <TableCell className="text-foreground/70 truncate max-w-[160px]">{r.leadName ?? "—"}</TableCell>
              <TableCell className="text-center tabular-nums text-foreground/70">{r.sourceCount}</TableCell>
              <TableCell className="text-right tabular-nums text-foreground/70">
                {r.confidence != null ? `${(r.confidence * 100).toFixed(0)}%` : "—"}
              </TableCell>
              <TableCell>
                <IssuePills
                  issues={r.issues}
                  dedupHref="/app/admin/dedup?type=round&status=pending"
                />
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  <ActionButton
                    busy={isBusy}
                    disabled={r.articleIds.length === 0}
                    onClick={() => onReExtract(r)}
                    title={
                      r.articleIds.length === 0
                        ? "No source articles linked"
                        : "Re-run LLM extraction with fresh content"
                    }
                  >
                    <RefreshCw className="h-3 w-3" />
                    Re-extract
                  </ActionButton>
                  {r.companyName && (
                    <Link
                      href={`/app/funding?search=${encodeURIComponent(r.companyName)}`}
                      onClick={(e) => e.stopPropagation()}
                      className="glass-capsule-btn flex items-center px-2 py-1 text-foreground/55 hover:text-foreground/85"
                      title="Open in Deal Flow"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function CompaniesTable({
  rows,
  busy,
  onReEnrich,
}: {
  rows: CompanyRow[] | null;
  busy: Set<string>;
  onReEnrich: (row: CompanyRow) => void;
}) {
  if (rows == null) return <Loading />;
  if (rows.length === 0) return <Empty label="No companies match this filter." />;
  return (
    <Table>
      <TableHeader className="glass-table-header sticky top-0 z-10">
        <TableRow className="hover:bg-transparent">
          <Th className="w-[100px]">Score</Th>
          <Th>Name</Th>
          <Th className="w-[60px]">Country</Th>
          <Th className="w-[100px]">Sector</Th>
          <Th className="w-[90px] text-right">Funding</Th>
          <Th className="w-[50px] text-center">Rnds</Th>
          <Th className="w-[60px] text-center">Enrich</Th>
          <Th className="w-[60px]">Last</Th>
          <Th>Issues</Th>
          <Th className="w-[140px] text-right">Actions</Th>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((c) => {
          const isBusy = busy.has(`company:${c.normalizedName}`);
          return (
            <TableRow key={c.normalizedName} className="lg-inset-table-row text-[13px] tracking-[-0.01em]">
              <TableCell><ScoreBar score={c.score} /></TableCell>
              <TableCell className="font-semibold text-foreground/85">
                <div className="flex items-center gap-2">
                  {c.logoUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={c.logoUrl} alt="" className="h-4 w-4 rounded-[3px] object-contain" />
                  ) : null}
                  <span className="truncate">{c.name ?? "—"}</span>
                </div>
              </TableCell>
              <TableCell className="text-foreground/70">{c.country ?? "—"}</TableCell>
              <TableCell className="text-foreground/70 truncate">{c.sector ?? "—"}</TableCell>
              <TableCell className="text-right tabular-nums text-foreground/70">{fmtAmt(c.totalFunding)}</TableCell>
              <TableCell className="text-center tabular-nums text-foreground/70">{c.roundCount}</TableCell>
              <TableCell className="text-center tabular-nums text-foreground/70">{c.enrichScore}/9</TableCell>
              <TableCell className="text-foreground/55">{fmtDate(c.enrichedAt)}</TableCell>
              <TableCell>
                <IssuePills
                  issues={c.issues}
                  dedupHref="/app/admin/dedup?type=company&status=pending"
                />
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  <ActionButton
                    busy={isBusy}
                    onClick={() => onReEnrich(c)}
                    title="Re-run LLM enrichment (overrides unlocked fields)"
                  >
                    <Sparkles className="h-3 w-3" />
                    Enrich
                  </ActionButton>
                  {c.name && (
                    <Link
                      href={`/app/companies/${encodeURIComponent(c.name)}`}
                      onClick={(e) => e.stopPropagation()}
                      className="glass-capsule-btn flex items-center px-2 py-1 text-foreground/55 hover:text-foreground/85"
                      title="Open detail page"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                  {c.website && (
                    <a
                      href={c.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="glass-capsule-btn flex items-center px-2 py-1 text-foreground/55 hover:text-foreground/85"
                      title="Website"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {c.linkedinUrl && (
                    <a
                      href={c.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="glass-capsule-btn flex items-center px-2 py-1 text-foreground/55 hover:text-foreground/85"
                      title="LinkedIn"
                    >
                      <Linkedin className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function InvestorsTable({
  rows,
  busy,
  onReEnrich,
}: {
  rows: InvestorRow[] | null;
  busy: Set<string>;
  onReEnrich: (row: InvestorRow) => void;
}) {
  if (rows == null) return <Loading />;
  if (rows.length === 0) return <Empty label="No investors match this filter." />;
  return (
    <Table>
      <TableHeader className="glass-table-header sticky top-0 z-10">
        <TableRow className="hover:bg-transparent">
          <Th className="w-[100px]">Score</Th>
          <Th>Name</Th>
          <Th className="w-[80px]">Type</Th>
          <Th className="w-[120px]">HQ</Th>
          <Th className="w-[60px] text-center">Deals</Th>
          <Th className="w-[60px] text-center">Lead</Th>
          <Th className="w-[100px]">Focus</Th>
          <Th className="w-[60px] text-center">Enrich</Th>
          <Th className="w-[60px]">Last</Th>
          <Th>Issues</Th>
          <Th className="w-[140px] text-right">Actions</Th>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((iv) => {
          const isBusy = busy.has(`investor:${iv.normalizedName}`);
          return (
            <TableRow key={iv.normalizedName} className="lg-inset-table-row text-[13px] tracking-[-0.01em]">
              <TableCell><ScoreBar score={iv.score} /></TableCell>
              <TableCell className="font-semibold text-foreground/85">
                <div className="flex items-center gap-2">
                  {iv.logoUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={iv.logoUrl} alt="" className="h-4 w-4 rounded-[3px] object-contain" />
                  ) : null}
                  <span className="truncate">{iv.name ?? "—"}</span>
                </div>
              </TableCell>
              <TableCell className="text-foreground/70 truncate">{iv.type ?? "—"}</TableCell>
              <TableCell className="text-foreground/70 truncate">
                {[iv.hqCity, iv.hqCountry].filter(Boolean).join(", ") || "—"}
              </TableCell>
              <TableCell className="text-center tabular-nums text-foreground/70">{iv.dealCount}</TableCell>
              <TableCell className="text-center tabular-nums text-foreground/70">{iv.leadCount}</TableCell>
              <TableCell className="text-foreground/55 text-[11px]">
                {[
                  iv.stageFocus.length > 0 ? "S" : null,
                  iv.sectorFocus.length > 0 ? "Sec" : null,
                  iv.geoFocus.length > 0 ? "G" : null,
                ]
                  .filter(Boolean)
                  .join("·") || "—"}
              </TableCell>
              <TableCell className="text-center tabular-nums text-foreground/70">{iv.enrichScore}/13</TableCell>
              <TableCell className="text-foreground/55">{fmtDate(iv.enrichedAt)}</TableCell>
              <TableCell>
                <IssuePills
                  issues={iv.issues}
                  dedupHref="/app/admin/dedup?type=investor&status=pending"
                />
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  <ActionButton
                    busy={isBusy}
                    onClick={() => onReEnrich(iv)}
                    title="Re-run LLM enrichment (overrides unlocked fields)"
                  >
                    <Sparkles className="h-3 w-3" />
                    Enrich
                  </ActionButton>
                  {iv.website && (
                    <a
                      href={iv.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="glass-capsule-btn flex items-center px-2 py-1 text-foreground/55 hover:text-foreground/85"
                      title="Website"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {iv.linkedinUrl && (
                    <a
                      href={iv.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="glass-capsule-btn flex items-center px-2 py-1 text-foreground/55 hover:text-foreground/85"
                      title="LinkedIn"
                    >
                      <Linkedin className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
