"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Building2,
  Users,
  CircleDollarSign,
  MapPin,
  ExternalLink,
  Globe,
  Calendar,
  TrendingUp,
  Award,
  Briefcase,
  Sparkles,
  Loader2,
  Target,
  FileText,
  ChevronDown,
  ChevronRight,
  Lock,
  Unlock,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EntitySheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: "company" | "investor" | "round" | null;
  entityName: string | null;
};

type DetailData = {
  records: Record<string, unknown>[];
  count: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeCypher(s: string): string {
  return s.replace(/'/g, "\\'");
}

function toNumber(v: unknown): unknown {
  return typeof v === "object" && v !== null && "toNumber" in v
    ? (v as { toNumber(): number }).toNumber()
    : v;
}

function asNumber(v: unknown): number {
  const n = toNumber(v);
  return typeof n === "number" && !Number.isNaN(n) ? n : 0;
}

function formatAmount(amount: number | null | undefined): string {
  if (!amount) return "N/A";
  if (amount >= 1e9) return `$${(amount / 1e9).toFixed(1)}B`;
  if (amount >= 1e6) return `$${(amount / 1e6).toFixed(1)}M`;
  if (amount >= 1e3) return `$${(amount / 1e3).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

function formatDate(raw: unknown): string | null {
  if (!raw) return null;
  try {
    const d = new Date(String(raw));
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cypher query builders
// ---------------------------------------------------------------------------

function companyQuery(name: string): string {
  const safe = escapeCypher(name);
  return `
MATCH (c:Company {name: '${safe}'})
OPTIONAL MATCH (c)-[:HQ_IN]->(loc:Location)
WITH c, collect(loc.name)[0] AS location

OPTIONAL MATCH (c)-[:RAISED]->(fr:FundingRound)
OPTIONAL MATCH (inv:InvestorOrg)-[p:PARTICIPATED_IN]->(fr)
WITH c, location, fr,
     collect(DISTINCT {name: inv.name, role: p.role}) AS roundInvestors
OPTIONAL MATCH (fr)-[:SOURCED_FROM]->(a:Article)
WITH c, location, fr, roundInvestors,
     collect(DISTINCT {url: a.url, title: a.title, publishedAt: a.publishedAt}) AS articles
WITH c, location,
     collect(CASE WHEN fr IS NOT NULL THEN {
       stage: fr.stage,
       amount: fr.amountUsd,
       roundKey: fr.roundKey,
       investors: roundInvestors,
       articles: articles
     } ELSE NULL END) AS allRounds
WITH c, location,
     [r IN allRounds WHERE r IS NOT NULL] AS rounds,
     reduce(s = 0, r IN [r IN allRounds WHERE r IS NOT NULL] | s + COALESCE(r.amount, 0)) AS calcTotal
RETURN c.name AS name,
       c.country AS country,
       COALESCE(c.totalFundingUsd, calcTotal) AS totalFunding,
       location,
       c.status AS status,
       c.description AS description,
       c.website AS website,
       c.foundedYear AS foundedYear,
       c.employeeRange AS employeeRange,
       c.linkedinUrl AS linkedinUrl,
       c.logoUrl AS logoUrl,
       c.lockedFields AS lockedFields,
       rounds
`;
}

function investorQuery(name: string): string {
  const safe = escapeCypher(name);
  return `
MATCH (inv:InvestorOrg {name: '${safe}'})
OPTIONAL MATCH (inv)-[p:PARTICIPATED_IN]->(fr:FundingRound)<-[:RAISED]-(c:Company)
RETURN inv.name AS name,
       inv.type AS type,
       inv.stageFocus AS stageFocus,
       inv.sectorFocus AS sectorFocus,
       inv.geoFocus AS geoFocus,
       inv.checkSizeMinUsd AS checkSizeMinUsd,
       inv.checkSizeMaxUsd AS checkSizeMaxUsd,
       inv.aum AS aum,
       inv.foundedYear AS foundedYear,
       inv.website AS website,
       inv.linkedinUrl AS linkedinUrl,
       inv.logoUrl AS logoUrl,
       inv.lockedFields AS lockedFields,
       count(p) AS deals,
       sum(CASE WHEN p.role = 'lead' THEN 1 ELSE 0 END) AS leads,
       sum(fr.amountUsd) AS totalDeployed,
       collect(DISTINCT {
         company: c.name,
         stage: fr.stage,
         amount: fr.amountUsd,
         role: p.role
       }) AS portfolio
`;
}

function roundQuery(name: string): string {
  // name is expected to be the roundKey or articleId for rounds
  const safe = escapeCypher(name);
  return `
MATCH (c:Company)-[:RAISED]->(fr:FundingRound)
WHERE fr.roundKey = '${safe}' OR fr.articleId = '${safe}'
OPTIONAL MATCH (inv:InvestorOrg)-[p:PARTICIPATED_IN]->(fr)
OPTIONAL MATCH (fr)-[:SOURCED_FROM]->(a:Article)
RETURN c.name AS company,
       fr.amountUsd AS amount,
       fr.stage AS stage,
       fr.confidence AS confidence,
       collect(DISTINCT {name: inv.name, role: p.role}) AS investors,
       collect(DISTINCT {url: a.url, title: a.title}) AS articles
LIMIT 1
`;
}

// ---------------------------------------------------------------------------
// Metric card
// ---------------------------------------------------------------------------

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border bg-muted/40 px-3 py-3 text-center">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="text-lg font-bold tracking-tight">{value}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section heading
// ---------------------------------------------------------------------------

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function SheetSkeleton() {
  return (
    <div className="space-y-6 p-1">
      <div className="space-y-2">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
      </div>
      <Separator />
      <div className="space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
      <Separator />
      <div className="space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Company detail view
// ---------------------------------------------------------------------------

type RoundRow = {
  stage: string | null;
  amount: unknown;
  roundKey: string | null;
  investors: { name: string | null; role: string | null }[];
  articles: { url: string | null; title: string | null; publishedAt: unknown }[];
};

function InfoRow({ label, value, missing }: { label: string; value: React.ReactNode; missing?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1.5 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      {missing ? (
        <span className="text-muted-foreground/40 text-xs italic">missing</span>
      ) : (
        <span className="text-right font-medium">{value}</span>
      )}
    </div>
  );
}

function LockableInfoRow({
  label,
  field,
  value,
  missing,
  locked,
  entityType,
  entityName,
  onLockChange,
}: {
  label: string;
  field: string;
  value: React.ReactNode;
  missing?: boolean;
  locked: boolean;
  entityType: "company" | "investor";
  entityName: string;
  onLockChange: (field: string, locked: boolean) => void;
}) {
  const [toggling, setToggling] = useState(false);

  const toggleLock = useCallback(async () => {
    setToggling(true);
    try {
      const res = await fetch("/api/lock-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityName, field, locked: !locked }),
      });
      if (res.ok) {
        onLockChange(field, !locked);
      }
    } catch {
      // ignore
    } finally {
      setToggling(false);
    }
  }, [entityType, entityName, field, locked, onLockChange]);

  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-sm px-1">
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={toggleLock}
          disabled={toggling}
          className={`p-1 rounded-md border transition-colors ${
            locked
              ? "bg-amber-50 border-amber-300 text-amber-600 hover:bg-amber-100"
              : "bg-transparent border-transparent text-muted-foreground/50 hover:border-muted hover:text-muted-foreground"
          }`}
          title={locked ? `${label} is locked — won't be changed by enrichment` : `Lock ${label} to protect from enrichment`}
        >
          {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
        </button>
        <span className="text-muted-foreground">{label}</span>
      </div>
      {missing ? (
        <span className="text-muted-foreground/40 text-xs italic">missing</span>
      ) : (
        <span className="text-right font-medium">{value}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Enrichment log
// ---------------------------------------------------------------------------

type LogEntry = {
  time: string;
  stage: string;
  message: string;
  detail?: string;
};

function EnrichLog({ log }: { log: LogEntry[] }) {
  const [open, setOpen] = useState(false);

  if (log.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <FileText className="h-3 w-3" />
        Enrichment Log ({log.length})
      </button>
      {open && (
        <div className="mt-1.5 max-h-48 overflow-y-auto rounded border bg-muted/30 p-2 text-[11px] font-mono space-y-0.5">
          {log.map((entry, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-muted-foreground shrink-0">{entry.time}</span>
              <span className={`shrink-0 w-14 ${
                entry.stage === "error" ? "text-red-500" :
                entry.stage === "done" ? "text-emerald-500" :
                "text-blue-500"
              }`}>
                [{entry.stage}]
              </span>
              <span className="text-foreground">
                {entry.message}
                {entry.detail && (
                  <span className="text-muted-foreground"> — {entry.detail}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Enrich button
// ---------------------------------------------------------------------------

type EnrichState = "idle" | "loading" | "error";

function EnrichButton({
  companyName,
  onComplete,
}: {
  companyName: string;
  onComplete: () => void;
}) {
  const [state, setState] = useState<EnrichState>("idle");
  const [stageText, setStageText] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);

  const handleEnrich = useCallback(async () => {
    if (state === "loading") return;
    setState("loading");
    setStageText("Starting...");
    setErrorMsg("");
    setLog([]);
    const startTime = Date.now();

    const addLog = (stage: string, message: string, detail?: string) => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      setLog((prev) => [...prev, { time: `${elapsed}s`, stage, message, detail }]);
    };

    try {
      const res = await fetch("/api/enrich-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName }),
      });

      if (!res.ok || !res.body) {
        setState("error");
        setErrorMsg("Request failed");
        addLog("error", "Request failed", `HTTP ${res.status}`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            addLog(payload.stage, payload.message, payload.detail);
            if (payload.stage === "error") {
              setState("error");
              setErrorMsg(payload.message);
              return;
            }
            if (payload.stage === "done") {
              setState("idle");
              onComplete();
              return;
            }
            setStageText(payload.message);
          } catch {
            // skip malformed lines
          }
        }
      }

      setState("idle");
      onComplete();
    } catch {
      setState("error");
      setErrorMsg("Connection failed");
    }
  }, [companyName, onComplete, state]);

  return (
    <div>
      <div className="flex items-center gap-2">
        {state === "error" && (
          <span className="text-xs text-red-500">{errorMsg}</span>
        )}
        {state === "loading" ? (
          <Button variant="ghost" size="sm" disabled className="h-6 gap-1 px-2 text-xs">
            <Loader2 className="h-3 w-3 animate-spin" />
            {stageText}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleEnrich}
            className="h-6 gap-1 px-2 text-xs"
          >
            <Sparkles className="h-3 w-3" />
            Enrich
          </Button>
        )}
      </div>
      <EnrichLog log={log} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Company detail view
// ---------------------------------------------------------------------------

function CompanyView({ data, onEnrichComplete }: { data: Record<string, unknown>; onEnrichComplete: () => void }) {
  const name = String(data.name ?? "");
  const country = data.country ? String(data.country) : null;
  const location = data.location ? String(data.location) : null;
  const totalFunding = asNumber(data.totalFunding);
  const status = data.status ? String(data.status) : null;
  const description = data.description ? String(data.description) : null;
  const website = data.website ? String(data.website) : null;
  const foundedYear = data.foundedYear ? asNumber(data.foundedYear) : null;
  const employeeRange = data.employeeRange ? String(data.employeeRange) : null;
  const linkedinUrl = data.linkedinUrl ? String(data.linkedinUrl) : null;
  const logoUrl = data.logoUrl ? String(data.logoUrl) : null;
  const [lockedFields, setLockedFields] = useState<Set<string>>(
    new Set(Array.isArray(data.lockedFields) ? data.lockedFields as string[] : [])
  );

  const handleLockChange = useCallback((field: string, locked: boolean) => {
    setLockedFields((prev) => {
      const next = new Set(prev);
      if (locked) next.add(field);
      else next.delete(field);
      return next;
    });
  }, []);

  const rawRounds = (data.rounds as RoundRow[]) ?? [];
  const rounds = rawRounds.filter(
    (r) => r.stage || asNumber(r.amount) > 0
  );
  const roundCount = rounds.length;
  const latestStage =
    rounds.find((r) => r.stage)?.stage ?? "N/A";

  // Collect all unique investors across rounds
  const investorMap = new Map<string, string>();
  for (const round of rounds) {
    for (const inv of round.investors ?? []) {
      if (!inv.name) continue;
      const existing = investorMap.get(inv.name);
      if (inv.role === "lead" || !existing) {
        investorMap.set(inv.name, inv.role ?? "participant");
      }
    }
  }

  // Count filled vs total metadata fields
  const metaFields = [
    { label: "Status", value: status },
    { label: "Country", value: country },
    { label: "Location", value: location },
    { label: "Founded", value: foundedYear },
    { label: "Employees", value: employeeRange },
    { label: "Description", value: description },
    { label: "Website", value: website },
    { label: "LinkedIn", value: linkedinUrl },
  ];
  const filledCount = metaFields.filter((f) => f.value != null).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={`${name} logo`}
              className="h-8 w-8 rounded-md object-contain bg-white border"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <Building2 className="h-5 w-5 text-blue-500" />
          )}
          <h2 className="text-xl font-bold">{name}</h2>
          {status && (
            <Badge variant="outline" className="text-xs ml-1">
              {status}
            </Badge>
          )}
        </div>
        {description && (
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        )}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {country && (
            <Badge variant="outline" className="gap-1 text-xs">
              <Globe className="h-3 w-3" />
              {country}
            </Badge>
          )}
          {location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {location}
            </span>
          )}
          {foundedYear && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Est. {foundedYear}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm">
          {website && (
            <a
              href={website.startsWith("http") ? website : `https://${website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-blue-500 hover:text-blue-600"
            >
              <Globe className="h-3 w-3" />
              <span className="text-xs">{website.replace(/^https?:\/\//, "")}</span>
            </a>
          )}
          {linkedinUrl && (
            <a
              href={linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-blue-500 hover:text-blue-600"
            >
              <ExternalLink className="h-3 w-3" />
              <span className="text-xs">LinkedIn</span>
            </a>
          )}
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-3">
        <MetricCard
          icon={CircleDollarSign}
          label="Total Funding"
          value={formatAmount(totalFunding)}
        />
        <MetricCard
          icon={TrendingUp}
          label="Rounds"
          value={roundCount}
        />
        <MetricCard
          icon={Award}
          label="Latest Stage"
          value={latestStage}
        />
      </div>

      <Separator />

      {/* Data Completeness */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <SectionHeading>Company Data</SectionHeading>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${filledCount === metaFields.length ? "text-emerald-600" : "text-amber-500"}`}>
              {filledCount}/{metaFields.length} fields
            </span>
            <EnrichButton companyName={name} onComplete={onEnrichComplete} />
          </div>
        </div>
        <div className="rounded-lg border divide-y">
          <LockableInfoRow label="Status" field="status" value={status} missing={!status} locked={lockedFields.has("status")} entityType="company" entityName={name} onLockChange={handleLockChange} />
          <LockableInfoRow label="Country" field="country" value={country} missing={!country} locked={lockedFields.has("country")} entityType="company" entityName={name} onLockChange={handleLockChange} />
          <LockableInfoRow label="Location" field="location" value={location} missing={!location} locked={lockedFields.has("location")} entityType="company" entityName={name} onLockChange={handleLockChange} />
          <LockableInfoRow label="Founded" field="foundedYear" value={foundedYear} missing={!foundedYear} locked={lockedFields.has("foundedYear")} entityType="company" entityName={name} onLockChange={handleLockChange} />
          <LockableInfoRow label="Employees" field="employeeRange" value={employeeRange} missing={!employeeRange} locked={lockedFields.has("employeeRange")} entityType="company" entityName={name} onLockChange={handleLockChange} />
          <LockableInfoRow
            label="Description" field="description"
            value={description ? <span className="text-xs max-w-[200px] truncate block">{description}</span> : null}
            missing={!description} locked={lockedFields.has("description")} entityType="company" entityName={name} onLockChange={handleLockChange}
          />
          <LockableInfoRow
            label="Website" field="website"
            value={website ? (
              <a href={website.startsWith("http") ? website : `https://${website}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 text-xs truncate max-w-[200px] block">
                {website.replace(/^https?:\/\//, "")}
              </a>
            ) : null}
            missing={!website} locked={lockedFields.has("website")} entityType="company" entityName={name} onLockChange={handleLockChange}
          />
          <LockableInfoRow
            label="LinkedIn" field="linkedinUrl"
            value={linkedinUrl ? (
              <a href={linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 text-xs">View profile</a>
            ) : null}
            missing={!linkedinUrl} locked={lockedFields.has("linkedinUrl")} entityType="company" entityName={name} onLockChange={handleLockChange}
          />
        </div>
      </div>

      <Separator />

      {/* Funding History */}
      {rounds.length > 0 && (
        <div className="space-y-3">
          <SectionHeading>Funding History</SectionHeading>
          <div className="space-y-2">
            {rounds.map((r, i) => {
              const amount = asNumber(r.amount);
              const leadInvestor = (r.investors ?? []).find(
                (inv) => inv.role === "lead"
              );
              const firstArticle = (r.articles ?? [])[0];
              const dateStr = formatDate(firstArticle?.publishedAt);
              return (
                <div
                  key={r.roundKey ?? i}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {r.stage ?? "Unknown"}
                    </Badge>
                    <span className="font-semibold">
                      {formatAmount(amount)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    {leadInvestor?.name && (
                      <span className="text-xs">{leadInvestor.name}</span>
                    )}
                    {dateStr && (
                      <span className="flex items-center gap-1 text-xs">
                        <Calendar className="h-3 w-3" />
                        {dateStr}
                      </span>
                    )}
                    {(r.articles ?? []).map((article, ai) =>
                      article.url ? (
                        <a
                          key={ai}
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:text-blue-600"
                          title={article.title ?? "Source article"}
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Separator />

      {/* Investors */}
      {investorMap.size > 0 && (
        <div className="space-y-3">
          <SectionHeading>Investors</SectionHeading>
          <div className="flex flex-wrap gap-2">
            {Array.from(investorMap.entries()).map(([invName, role]) => (
              <Badge
                key={invName}
                variant={role === "lead" ? "default" : "outline"}
                className="text-xs"
              >
                {role === "lead" && (
                  <Award className="mr-1 h-3 w-3" />
                )}
                {invName}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Investor enrich button
// ---------------------------------------------------------------------------

function InvestorEnrichButton({
  investorName,
  onComplete,
}: {
  investorName: string;
  onComplete: () => void;
}) {
  const [state, setState] = useState<EnrichState>("idle");
  const [stageText, setStageText] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);

  const handleEnrich = useCallback(async () => {
    if (state === "loading") return;
    setState("loading");
    setStageText("Starting...");
    setErrorMsg("");
    setLog([]);
    const startTime = Date.now();

    const addLog = (stage: string, message: string, detail?: string) => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      setLog((prev) => [...prev, { time: `${elapsed}s`, stage, message, detail }]);
    };

    try {
      const res = await fetch("/api/enrich-investor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ investorName }),
      });

      if (!res.ok || !res.body) {
        setState("error");
        setErrorMsg("Request failed");
        addLog("error", "Request failed", `HTTP ${res.status}`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            addLog(payload.stage, payload.message, payload.detail);
            if (payload.stage === "error") {
              setState("error");
              setErrorMsg(payload.message);
              return;
            }
            if (payload.stage === "done") {
              setState("idle");
              onComplete();
              return;
            }
            setStageText(payload.message);
          } catch {
            // skip malformed lines
          }
        }
      }

      setState("idle");
      onComplete();
    } catch {
      setState("error");
      setErrorMsg("Connection failed");
    }
  }, [investorName, onComplete, state]);

  return (
    <div>
      <div className="flex items-center gap-2">
        {state === "error" && (
          <span className="text-xs text-red-500">{errorMsg}</span>
        )}
        {state === "loading" ? (
          <Button variant="ghost" size="sm" disabled className="h-6 gap-1 px-2 text-xs">
            <Loader2 className="h-3 w-3 animate-spin" />
            {stageText}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleEnrich}
            className="h-6 gap-1 px-2 text-xs"
          >
            <Sparkles className="h-3 w-3" />
            Enrich
          </Button>
        )}
      </div>
      <EnrichLog log={log} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Investor detail view
// ---------------------------------------------------------------------------

type PortfolioRow = {
  company: string | null;
  stage: string | null;
  amount: unknown;
  role: string | null;
};

function InvestorView({ data, onEnrichComplete }: { data: Record<string, unknown>; onEnrichComplete: () => void }) {
  const name = String(data.name ?? "");
  const type = data.type ? String(data.type) : null;
  const stageFocus = Array.isArray(data.stageFocus) ? data.stageFocus as string[] : null;
  const sectorFocus = Array.isArray(data.sectorFocus) ? data.sectorFocus as string[] : null;
  const geoFocus = Array.isArray(data.geoFocus) ? data.geoFocus as string[] : null;
  const checkSizeMinUsd = data.checkSizeMinUsd ? asNumber(data.checkSizeMinUsd) : null;
  const checkSizeMaxUsd = data.checkSizeMaxUsd ? asNumber(data.checkSizeMaxUsd) : null;
  const aum = data.aum ? asNumber(data.aum) : null;
  const foundedYear = data.foundedYear ? asNumber(data.foundedYear) : null;
  const website = data.website ? String(data.website) : null;
  const linkedinUrl = data.linkedinUrl ? String(data.linkedinUrl) : null;
  const logoUrl = data.logoUrl ? String(data.logoUrl) : null;
  const [lockedFields, setLockedFields] = useState<Set<string>>(
    new Set(Array.isArray(data.lockedFields) ? data.lockedFields as string[] : [])
  );

  const handleLockChange = useCallback((field: string, locked: boolean) => {
    setLockedFields((prev) => {
      const next = new Set(prev);
      if (locked) next.add(field);
      else next.delete(field);
      return next;
    });
  }, []);
  const deals = asNumber(data.deals);
  const leads = asNumber(data.leads);
  const totalDeployed = asNumber(data.totalDeployed);

  const rawPortfolio = (data.portfolio as PortfolioRow[]) ?? [];
  const portfolio = rawPortfolio.filter((p) => p.company);

  // Metadata completeness
  const metaFields = [
    { label: "Type", value: type },
    { label: "Stage Focus", value: stageFocus },
    { label: "Sector Focus", value: sectorFocus },
    { label: "Geo Focus", value: geoFocus },
    { label: "Check Size", value: checkSizeMinUsd || checkSizeMaxUsd },
    { label: "AUM", value: aum },
    { label: "Founded", value: foundedYear },
    { label: "Website", value: website },
    { label: "LinkedIn", value: linkedinUrl },
  ];
  const filledCount = metaFields.filter((f) => f.value != null).length;

  const checkSizeStr =
    checkSizeMinUsd && checkSizeMaxUsd
      ? `${formatAmount(checkSizeMinUsd)} – ${formatAmount(checkSizeMaxUsd)}`
      : checkSizeMinUsd
        ? `from ${formatAmount(checkSizeMinUsd)}`
        : checkSizeMaxUsd
          ? `up to ${formatAmount(checkSizeMaxUsd)}`
          : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={`${name} logo`}
              className="h-8 w-8 rounded-md object-contain bg-white border"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <Briefcase className="h-5 w-5 text-green-500" />
          )}
          <h2 className="text-xl font-bold">{name}</h2>
          {type && (
            <Badge variant="outline" className="text-xs ml-1">
              {type}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {foundedYear && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Est. {foundedYear}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm">
          {website && (
            <a
              href={website.startsWith("http") ? website : `https://${website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-blue-500 hover:text-blue-600"
            >
              <Globe className="h-3 w-3" />
              <span className="text-xs">{website.replace(/^https?:\/\//, "")}</span>
            </a>
          )}
          {linkedinUrl && (
            <a
              href={linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-blue-500 hover:text-blue-600"
            >
              <ExternalLink className="h-3 w-3" />
              <span className="text-xs">LinkedIn</span>
            </a>
          )}
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-3">
        <MetricCard
          icon={CircleDollarSign}
          label="Total Deployed"
          value={formatAmount(totalDeployed)}
        />
        <MetricCard icon={TrendingUp} label="Deals" value={deals} />
        <MetricCard icon={Award} label="Leads" value={leads} />
      </div>

      <Separator />

      {/* Focus Tags */}
      {(stageFocus || sectorFocus || geoFocus) && (
        <>
          <div className="space-y-3">
            {stageFocus && stageFocus.length > 0 && (
              <div>
                <SectionHeading>Stage Focus</SectionHeading>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {stageFocus.map((s) => (
                    <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                  ))}
                </div>
              </div>
            )}
            {sectorFocus && sectorFocus.length > 0 && (
              <div>
                <SectionHeading>Sector Focus</SectionHeading>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {sectorFocus.map((s) => (
                    <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                  ))}
                </div>
              </div>
            )}
            {geoFocus && geoFocus.length > 0 && (
              <div>
                <SectionHeading>Geo Focus</SectionHeading>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {geoFocus.map((s) => (
                    <Badge key={s} variant="outline" className="text-xs gap-1">
                      <Target className="h-3 w-3" />
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
          <Separator />
        </>
      )}

      {/* Investor Data Completeness */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <SectionHeading>Investor Data</SectionHeading>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${filledCount === metaFields.length ? "text-emerald-600" : "text-amber-500"}`}>
              {filledCount}/{metaFields.length} fields
            </span>
            <InvestorEnrichButton investorName={name} onComplete={onEnrichComplete} />
          </div>
        </div>
        <div className="rounded-lg border divide-y">
          <LockableInfoRow label="Type" field="type" value={type} missing={!type} locked={lockedFields.has("type")} entityType="investor" entityName={name} onLockChange={handleLockChange} />
          <LockableInfoRow label="Stage Focus" field="stageFocus" value={stageFocus?.join(", ")} missing={!stageFocus} locked={lockedFields.has("stageFocus")} entityType="investor" entityName={name} onLockChange={handleLockChange} />
          <LockableInfoRow label="Sector Focus" field="sectorFocus" value={sectorFocus?.join(", ")} missing={!sectorFocus} locked={lockedFields.has("sectorFocus")} entityType="investor" entityName={name} onLockChange={handleLockChange} />
          <LockableInfoRow label="Geo Focus" field="geoFocus" value={geoFocus?.join(", ")} missing={!geoFocus} locked={lockedFields.has("geoFocus")} entityType="investor" entityName={name} onLockChange={handleLockChange} />
          <LockableInfoRow label="Check Size" field="checkSizeMinUsd" value={checkSizeStr} missing={!checkSizeStr} locked={lockedFields.has("checkSizeMinUsd")} entityType="investor" entityName={name} onLockChange={handleLockChange} />
          <LockableInfoRow label="AUM" field="aum" value={aum ? formatAmount(aum) : null} missing={!aum} locked={lockedFields.has("aum")} entityType="investor" entityName={name} onLockChange={handleLockChange} />
          <LockableInfoRow label="Founded" field="foundedYear" value={foundedYear} missing={!foundedYear} locked={lockedFields.has("foundedYear")} entityType="investor" entityName={name} onLockChange={handleLockChange} />
          <LockableInfoRow
            label="Website" field="website"
            value={website ? (
              <a href={website.startsWith("http") ? website : `https://${website}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 text-xs truncate max-w-[200px] block">
                {website.replace(/^https?:\/\//, "")}
              </a>
            ) : null}
            missing={!website} locked={lockedFields.has("website")} entityType="investor" entityName={name} onLockChange={handleLockChange}
          />
          <LockableInfoRow
            label="LinkedIn" field="linkedinUrl"
            value={linkedinUrl ? (
              <a href={linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 text-xs">View profile</a>
            ) : null}
            missing={!linkedinUrl} locked={lockedFields.has("linkedinUrl")} entityType="investor" entityName={name} onLockChange={handleLockChange}
          />
        </div>
      </div>

      <Separator />

      {/* Portfolio */}
      {portfolio.length > 0 && (
        <div className="space-y-3">
          <SectionHeading>Portfolio</SectionHeading>
          <div className="space-y-2">
            {portfolio.map((p, i) => {
              const amount = asNumber(p.amount);
              return (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{p.company}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.stage && (
                      <Badge variant="secondary" className="text-xs">
                        {p.stage}
                      </Badge>
                    )}
                    <span className="text-xs font-semibold">
                      {formatAmount(amount)}
                    </span>
                    {p.role === "lead" && (
                      <Badge variant="default" className="text-xs">
                        Lead
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Round detail view
// ---------------------------------------------------------------------------

function RoundView({ data }: { data: Record<string, unknown> }) {
  const company = String(data.company ?? "Unknown");
  const stage = data.stage ? String(data.stage) : "Unknown";
  const amount = asNumber(data.amount);
  const confidence = data.confidence ? asNumber(data.confidence) : null;
  const investors =
    (data.investors as { name: string | null; role: string | null }[]) ?? [];
  const articleUrl = data.articleUrl ? String(data.articleUrl) : null;
  const articleTitle = data.articleTitle ? String(data.articleTitle) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <CircleDollarSign className="h-5 w-5 text-purple-500" />
          <h2 className="text-xl font-bold">
            {company} &mdash;{" "}
            <Badge variant="secondary" className="text-sm align-middle">
              {stage}
            </Badge>
          </h2>
        </div>
      </div>

      {/* Amount prominently displayed */}
      <div className="flex flex-col items-center rounded-lg border bg-muted/40 py-6">
        <span className="text-3xl font-extrabold tracking-tight">
          {formatAmount(amount)}
        </span>
        <span className="mt-1 text-sm text-muted-foreground">
          Round Amount
        </span>
        {confidence !== null && (
          <span className="mt-1 text-xs text-muted-foreground">
            Confidence: {(confidence * 100).toFixed(0)}%
          </span>
        )}
      </div>

      <Separator />

      {/* Investors */}
      {investors.filter((inv) => inv.name).length > 0 && (
        <div className="space-y-3">
          <SectionHeading>Investors</SectionHeading>
          <div className="space-y-2">
            {investors
              .filter((inv) => inv.name)
              .map((inv, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{inv.name}</span>
                  </div>
                  {inv.role === "lead" && (
                    <Badge variant="default" className="text-xs">
                      Lead
                    </Badge>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      <Separator />

      {/* Source article */}
      {articleUrl && (
        <div className="space-y-3">
          <SectionHeading>Source Article</SectionHeading>
          <a
            href={articleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-blue-500 hover:bg-muted/60 transition-colors"
          >
            <ExternalLink className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {articleTitle ?? "View Article"}
            </span>
          </a>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------

export function EntitySheet({
  open,
  onOpenChange,
  entityType,
  entityName,
}: EntitySheetProps) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!entityType || !entityName) return;

    setLoading(true);
    setData(null);
    setError(null);

    let query: string;
    switch (entityType) {
      case "company":
        query = companyQuery(entityName);
        break;
      case "investor":
        query = investorQuery(entityName);
        break;
      case "round":
        query = roundQuery(entityName);
        break;
      default:
        return;
    }

    try {
      const res = await fetch("/api/graph-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`);
      }

      const json = (await res.json()) as DetailData;

      if (json.records?.[0]) {
        setData(json.records[0]);
      } else {
        setError("No data found for this entity.");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load details."
      );
    } finally {
      setLoading(false);
    }
  }, [entityType, entityName]);

  useEffect(() => {
    if (open) {
      fetchDetail();
    } else {
      // Reset state when sheet closes
      setData(null);
      setError(null);
    }
  }, [open, fetchDetail]);

  const sheetTitle = entityType
    ? {
        company: "Company Details",
        investor: "Investor Details",
        round: "Funding Round",
      }[entityType]
    : "Details";

  const sheetDescription = entityName ?? "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-2">
          <SheetTitle>{sheetTitle}</SheetTitle>
          <SheetDescription>{sheetDescription}</SheetDescription>
        </SheetHeader>

        <Separator />

        <ScrollArea className="flex-1 px-6 py-4">
          {loading && <SheetSkeleton />}

          {error && !loading && (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
              <Building2 className="h-8 w-8" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {data && !loading && entityType === "company" && (
            <CompanyView data={data} onEnrichComplete={fetchDetail} />
          )}
          {data && !loading && entityType === "investor" && (
            <InvestorView data={data} onEnrichComplete={fetchDetail} />
          )}
          {data && !loading && entityType === "round" && (
            <RoundView data={data} />
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
