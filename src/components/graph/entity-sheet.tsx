"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  Pencil,
  Check,
  X,
  Camera,
  Maximize2,
} from "lucide-react";
import Link from "next/link";
import { SECTORS, SECTOR_TAXONOMY } from "@/lib/taxonomy";
import { SmartLogo } from "@/components/ui/smart-logo";
import { LogoPicker } from "@/components/graph/logo-picker";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EntitySheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: "company" | "investor" | "round" | "fund" | null;
  entityName: string | null;
  onNavigate?: (entityType: string, entityName: string) => void;
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
       c.sector AS sector,
       c.subsector AS subsector,
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
       inv.hqCity AS hqCity,
       inv.hqCountry AS hqCountry,
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

function fundQuery(fundKey: string): string {
  const safe = escapeCypher(fundKey);
  return `
MATCH (i:InvestorOrg)-[:MANAGES]->(f:Fund {fundKey: '${safe}'})
OPTIONAL MATCH (i)-[:HQ_IN]->(l:Location)
OPTIONAL MATCH (f)-[:SOURCED_FROM]->(a:Article)
RETURN f.name AS name,
       f.fundKey AS fundKey,
       f.sizeUsd AS sizeUsd,
       f.type AS type,
       f.vintage AS vintage,
       f.status AS status,
       i.name AS firmName,
       collect(DISTINCT l.name)[0] AS country,
       collect(DISTINCT {url: a.url, title: a.title, publishedAt: a.publishedAt}) AS articles
LIMIT 1
`;
}

function similarCompaniesQuery(name: string): string {
  const safe = escapeCypher(name);
  return `
MATCH (me:Company {name: '${safe}'})
OPTIONAL MATCH (me)-[:RAISED]->(myRound:FundingRound)
WITH me,
     me.sector AS mySector,
     me.subsector AS mySubsector,
     me.country AS myCountry,
     COALESCE(me.totalFundingUsd, 0) AS myFunding,
     collect(DISTINCT myRound.stage) AS myStages

OPTIONAL MATCH (inv:InvestorOrg)-[:PARTICIPATED_IN]->(:FundingRound)<-[:RAISED]-(me)
WITH me, mySector, mySubsector, myCountry, myFunding, myStages,
     collect(DISTINCT inv.name) AS myInvestors

MATCH (c:Company)
WHERE c.name <> me.name

OPTIONAL MATCH (c)-[:RAISED]->(cr:FundingRound)
WITH me, mySector, mySubsector, myCountry, myFunding, myStages, myInvestors,
     c,
     collect(DISTINCT cr.stage) AS cStages,
     COALESCE(c.totalFundingUsd, 0) AS cFunding

OPTIONAL MATCH (ci:InvestorOrg)-[:PARTICIPATED_IN]->(:FundingRound)<-[:RAISED]-(c)
WITH me, mySector, mySubsector, myCountry, myFunding, myStages, myInvestors,
     c, cStages, cFunding,
     collect(DISTINCT ci.name) AS cInvestors

WITH c, cFunding, cInvestors, cStages,
     mySector, mySubsector, myCountry, myFunding, myStages, myInvestors

WITH c, cFunding, cInvestors,
     CASE WHEN c.subsector IS NOT NULL AND c.subsector = mySubsector THEN 10 ELSE 0 END +
     CASE WHEN c.sector IS NOT NULL AND c.sector = mySector AND (c.subsector IS NULL OR c.subsector <> mySubsector) THEN 3 ELSE 0 END +
     size([i IN cInvestors WHERE i IN myInvestors]) * 3 +
     CASE WHEN c.country IS NOT NULL AND c.country = myCountry THEN 2 ELSE 0 END +
     size([s IN cStages WHERE s IN myStages]) +
     CASE WHEN cFunding > 0 AND myFunding > 0
       AND abs(log(cFunding + 1) - log(myFunding + 1)) < 2.0 THEN 2 ELSE 0 END
     AS score

WHERE score > 0
ORDER BY score DESC
LIMIT 12

RETURN c.name AS name,
       c.logoUrl AS logoUrl,
       c.subsector AS subsector,
       c.sector AS sector,
       c.country AS country,
       cFunding AS totalFunding,
       cInvestors[0..3] AS topInvestors,
       score
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
    <div className="flex flex-col items-center gap-1 rounded-lg border bg-muted/40 px-3 py-3 text-center overflow-hidden">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="text-lg font-bold tracking-tight truncate w-full">{value}</span>
      <span className="text-[11px] text-muted-foreground truncate w-full">{label}</span>
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

function LockableInfoRow({
  label,
  field,
  value,
  rawValue,
  missing,
  locked,
  entityType,
  entityName,
  onLockChange,
  editable = true,
  fieldType = "text",
  selectOptions,
  onValueChange,
}: {
  label: string;
  field: string;
  value: React.ReactNode;
  rawValue?: string | number | null;
  missing?: boolean;
  locked: boolean;
  entityType: "company" | "investor";
  entityName: string;
  onLockChange: (field: string, locked: boolean) => void;
  editable?: boolean;
  fieldType?: "text" | "textarea" | "number" | "select";
  selectOptions?: string[];
  onValueChange?: (field: string, value: string | number | null) => void;
}) {
  const [toggling, setToggling] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editValue, setEditValue] = useState("");

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

  const startEditing = useCallback(() => {
    setEditValue(rawValue != null ? String(rawValue) : "");
    setEditing(true);
  }, [rawValue]);

  const cancelEditing = useCallback(() => {
    setEditing(false);
  }, []);

  const saveValue = useCallback(async () => {
    setSaving(true);
    const trimmed = editValue.trim();
    const newValue: string | number | null =
      trimmed === ""
        ? null
        : fieldType === "number"
          ? Number(trimmed) || null
          : trimmed;

    try {
      const res = await fetch("/api/update-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityName, field, value: newValue }),
      });
      if (res.ok) {
        const result = await res.json();
        onValueChange?.(field, result.value ?? null);
        onLockChange(field, result.locked);
        setEditing(false);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }, [editValue, fieldType, entityType, entityName, field, onValueChange, onLockChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && fieldType !== "textarea") {
        e.preventDefault();
        saveValue();
      } else if (e.key === "Escape") {
        cancelEditing();
      }
    },
    [saveValue, cancelEditing, fieldType]
  );

  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-sm px-1 overflow-hidden">
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

      {editing ? (
        <div className="flex items-center gap-1 min-w-0 flex-1 justify-end">
          {fieldType === "textarea" ? (
            <textarea
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") cancelEditing();
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveValue();
              }}
              className="w-full max-w-[220px] rounded border bg-background px-2 py-1 text-xs resize-none h-16 focus:outline-none focus:ring-1 focus:ring-ring"
              disabled={saving}
            />
          ) : fieldType === "select" ? (
            <select
              autoFocus
              value={editValue}
              onChange={(e) => {
                setEditValue(e.target.value);
              }}
              onBlur={saveValue}
              onKeyDown={handleKeyDown}
              className="max-w-[180px] rounded border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              disabled={saving}
            >
              <option value="">— none —</option>
              {selectOptions?.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : (
            <input
              autoFocus
              type={fieldType === "number" ? "number" : "text"}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={saveValue}
              onKeyDown={handleKeyDown}
              className="max-w-[180px] rounded border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              disabled={saving}
            />
          )}
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
          ) : fieldType === "textarea" ? (
            <div className="flex flex-col gap-0.5 shrink-0">
              <button onClick={saveValue} className="p-0.5 rounded hover:bg-muted" title="Save (Cmd+Enter)">
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              </button>
              <button onClick={cancelEditing} className="p-0.5 rounded hover:bg-muted" title="Cancel (Esc)">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex items-center gap-1 min-w-0 overflow-hidden">
          {missing ? (
            <span className="text-muted-foreground/40 text-xs italic">missing</span>
          ) : (
            <span className="text-right font-medium truncate min-w-0">{value}</span>
          )}
          {editable && (
            <button
              onClick={startEditing}
              className="p-0.5 rounded-md text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0"
              title={`Edit ${label}`}
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
        </div>
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
        body: JSON.stringify({ companyName, force: true }),
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

function CompanyView({ data, onEnrichComplete, onOpenLogoPicker, onNavigateToCompany }: { data: Record<string, unknown>; onEnrichComplete: () => void; onOpenLogoPicker: () => void; onNavigateToCompany?: (name: string) => void }) {
  const name = String(data.name ?? "");
  const [editedFields, setEditedFields] = useState<Record<string, string | number | null>>({});
  const get = (key: string, fallback: string | number | null = null) =>
    key in editedFields ? editedFields[key] : (data[key] != null ? (typeof data[key] === "number" || typeof data[key] === "object" ? asNumber(data[key]) : String(data[key])) : fallback);

  const country = get("country") as string | null;
  const location = (("location" in editedFields) ? editedFields.location : (data.location ? String(data.location) : null)) as string | null;
  const totalFunding = asNumber(data.totalFunding);
  const status = get("status") as string | null;
  const description = get("description") as string | null;
  const website = get("website") as string | null;
  const foundedYear = get("foundedYear") as number | null;
  const employeeRange = get("employeeRange") as string | null;
  const linkedinUrl = get("linkedinUrl") as string | null;
  const logoUrl = get("logoUrl") as string | null;
  const sector = get("sector") as string | null;
  const subsector = get("subsector") as string | null;

  // Compute subsector options dynamically based on selected sector
  const subsectorOptions = useMemo(() => {
    if (!sector) return [];
    return [...(SECTOR_TAXONOMY[sector] ?? [])];
  }, [sector]);

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

  const handleValueChange = useCallback((field: string, value: string | number | null) => {
    setEditedFields((prev) => ({ ...prev, [field]: value }));
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
    { label: "Sector", value: sector },
    { label: "Subsector", value: subsector },
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
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => website && onOpenLogoPicker()}
            disabled={!website}
            className={`relative group shrink-0 ${website ? "cursor-pointer" : "cursor-default"}`}
            title={website ? "Choose logo" : "Set a website first to pick a logo"}
          >
            {logoUrl ? (
              <SmartLogo src={logoUrl} alt={`${name} logo`} className="h-8 w-8 rounded-md" fallback={<Building2 className="h-5 w-5 text-blue-500" />} />
            ) : (
              <Building2 className="h-5 w-5 text-blue-500" />
            )}
            {website && (
              <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="h-3.5 w-3.5 text-white" />
              </div>
            )}
          </button>
          <h2 className="text-xl font-bold truncate">{name}</h2>
          {status && (
            <Badge variant="outline" className="text-xs ml-1 shrink-0">
              {status}
            </Badge>
          )}
          {sector && (
            <Badge variant="secondary" className="text-xs ml-1 shrink-0">
              {sector}
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

      {/* Full profile link */}
      <Link
        href={`/app/companies/${encodeURIComponent(name)}`}
        className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
      >
        <Maximize2 className="h-3.5 w-3.5" />
        <span className="flex-1">Open full company profile</span>
        <ChevronRight className="h-3.5 w-3.5" />
      </Link>

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
          <LockableInfoRow label="Status" field="status" value={status} rawValue={status} missing={!status} locked={lockedFields.has("status")} entityType="company" entityName={name} onLockChange={handleLockChange} onValueChange={handleValueChange} fieldType="select" selectOptions={["active", "acquired", "closed"]} />
          <LockableInfoRow label="Sector" field="sector" value={sector} rawValue={sector} missing={!sector} locked={lockedFields.has("sector")} entityType="company" entityName={name} onLockChange={handleLockChange} onValueChange={handleValueChange} fieldType="select" selectOptions={SECTORS} />
          <LockableInfoRow label="Subsector" field="subsector" value={subsector} rawValue={subsector} missing={!subsector} locked={lockedFields.has("subsector")} entityType="company" entityName={name} onLockChange={handleLockChange} onValueChange={handleValueChange} fieldType="select" selectOptions={subsectorOptions} />
          <LockableInfoRow label="Country" field="country" value={country} rawValue={country} missing={!country} locked={lockedFields.has("country")} entityType="company" entityName={name} onLockChange={handleLockChange} onValueChange={handleValueChange} />
          <LockableInfoRow label="Location" field="location" value={location} rawValue={location} missing={!location} locked={lockedFields.has("location")} entityType="company" entityName={name} onLockChange={handleLockChange} onValueChange={handleValueChange} />
          <LockableInfoRow label="Founded" field="foundedYear" value={foundedYear} rawValue={foundedYear} missing={!foundedYear} locked={lockedFields.has("foundedYear")} entityType="company" entityName={name} onLockChange={handleLockChange} onValueChange={handleValueChange} fieldType="number" />
          <LockableInfoRow label="Employees" field="employeeRange" value={employeeRange} rawValue={employeeRange} missing={!employeeRange} locked={lockedFields.has("employeeRange")} entityType="company" entityName={name} onLockChange={handleLockChange} onValueChange={handleValueChange} fieldType="select" selectOptions={["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"]} />
          <LockableInfoRow
            label="Description" field="description"
            value={description ? <span className="text-xs max-w-[200px] truncate block">{description}</span> : null}
            rawValue={description}
            missing={!description} locked={lockedFields.has("description")} entityType="company" entityName={name} onLockChange={handleLockChange} onValueChange={handleValueChange} fieldType="textarea"
          />
          <LockableInfoRow
            label="Website" field="website"
            value={website ? (
              <a href={website.startsWith("http") ? website : `https://${website}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 text-xs truncate max-w-[200px] block">
                {website.replace(/^https?:\/\//, "")}
              </a>
            ) : null}
            rawValue={website}
            missing={!website} locked={lockedFields.has("website")} entityType="company" entityName={name} onLockChange={handleLockChange} onValueChange={handleValueChange}
          />
          <LockableInfoRow
            label="LinkedIn" field="linkedinUrl"
            value={linkedinUrl ? (
              <a href={linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 text-xs">View profile</a>
            ) : null}
            rawValue={linkedinUrl}
            missing={!linkedinUrl} locked={lockedFields.has("linkedinUrl")} entityType="company" entityName={name} onLockChange={handleLockChange} onValueChange={handleValueChange}
          />
          <LockableInfoRow
            label="Logo Link" field="logoUrl"
            value={logoUrl ? (
              <a href={logoUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 text-xs truncate max-w-[200px] block">
                {logoUrl.replace(/^https?:\/\//, "").substring(0, 40)}…
              </a>
            ) : null}
            rawValue={logoUrl}
            missing={!logoUrl} locked={lockedFields.has("logoUrl")} entityType="company" entityName={name} onLockChange={handleLockChange} onValueChange={handleValueChange}
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

      <Separator />

      {/* Similar Companies */}
      <SimilarCompaniesSection companyName={name} onNavigate={onNavigateToCompany} />

    </div>
  );
}

// ---------------------------------------------------------------------------
// Similar Companies Section
// ---------------------------------------------------------------------------

type SimilarCompany = {
  name: string;
  logoUrl: string | null;
  subsector: string | null;
  sector: string | null;
  country: string | null;
  totalFunding: number;
  topInvestors: string[];
  score: number;
};

function SimilarCompaniesSection({
  companyName,
  onNavigate,
}: {
  companyName: string;
  onNavigate?: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<SimilarCompany[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleToggle = useCallback(async () => {
    const next = !open;
    setOpen(next);
    if (next && data === null && !loading) {
      setLoading(true);
      try {
        const res = await fetch("/api/graph-query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: similarCompaniesQuery(companyName) }),
        });
        if (res.ok) {
          const json = (await res.json()) as DetailData;
          setData(
            (json.records ?? []).map((r: Record<string, unknown>) => ({
              name: String(r.name ?? ""),
              logoUrl: r.logoUrl ? String(r.logoUrl) : null,
              subsector: r.subsector ? String(r.subsector) : null,
              sector: r.sector ? String(r.sector) : null,
              country: r.country ? String(r.country) : null,
              totalFunding: asNumber(r.totalFunding),
              topInvestors: Array.isArray(r.topInvestors)
                ? (r.topInvestors as (string | null)[]).filter(Boolean) as string[]
                : [],
              score: asNumber(r.score),
            }))
          );
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
  }, [open, data, loading, companyName]);

  return (
    <div className="space-y-2">
      <button
        onClick={handleToggle}
        className="flex items-center gap-1.5 text-sm font-semibold tracking-wide text-muted-foreground uppercase hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        Similar Companies
      </button>

      {open && (
        <div className="space-y-2">
          {loading && (
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-lg" />
              ))}
            </div>
          )}

          {data && data.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">No similar companies found.</p>
          )}

          {data && data.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {data.map((c) => (
                <button
                  key={c.name}
                  onClick={() => onNavigate?.(c.name)}
                  className="flex flex-col gap-1.5 rounded-lg border p-2.5 text-left hover:bg-muted/60 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {c.logoUrl ? (
                      <SmartLogo src={c.logoUrl} alt={c.name} className="h-5 w-5 rounded shrink-0" fallback={<Building2 className="h-4 w-4 text-muted-foreground shrink-0" />} />
                    ) : (
                      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span className="text-xs font-medium truncate">{c.name}</span>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {c.totalFunding > 0 && (
                      <span className="text-[10px] font-semibold text-muted-foreground">
                        {formatAmount(c.totalFunding)}
                      </span>
                    )}
                    {(c.subsector || c.sector) && (
                      <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                        {c.subsector ?? c.sector}
                      </Badge>
                    )}
                    {c.country && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                        {c.country}
                      </Badge>
                    )}
                  </div>
                  {c.topInvestors.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      {c.topInvestors.map((inv) => (
                        <span key={inv} className="text-[9px] text-muted-foreground truncate max-w-[80px]">
                          {inv}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
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
        body: JSON.stringify({ investorName, force: true }),
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

function InvestorView({ data, onEnrichComplete, onOpenLogoPicker }: { data: Record<string, unknown>; onEnrichComplete: () => void; onOpenLogoPicker: () => void }) {
  const name = String(data.name ?? "");
  const [editedFields, setEditedFields] = useState<Record<string, string | number | null>>({});
  const getStr = (key: string) =>
    key in editedFields ? (editedFields[key] != null ? String(editedFields[key]) : null) : (data[key] != null ? String(data[key]) : null);
  const getNum = (key: string) =>
    key in editedFields ? (editedFields[key] != null ? Number(editedFields[key]) : null) : (data[key] != null ? asNumber(data[key]) : null);

  const type = getStr("type");
  const hqCity = getStr("hqCity");
  const hqCountry = getStr("hqCountry");
  const stageFocus = Array.isArray(data.stageFocus) ? data.stageFocus as string[] : null;
  const sectorFocus = Array.isArray(data.sectorFocus) ? data.sectorFocus as string[] : null;
  const geoFocus = Array.isArray(data.geoFocus) ? data.geoFocus as string[] : null;
  const checkSizeMinUsd = data.checkSizeMinUsd ? asNumber(data.checkSizeMinUsd) : null;
  const checkSizeMaxUsd = data.checkSizeMaxUsd ? asNumber(data.checkSizeMaxUsd) : null;
  const aum = data.aum ? asNumber(data.aum) : null;
  const foundedYear = getNum("foundedYear");
  const website = getStr("website");
  const linkedinUrl = getStr("linkedinUrl");
  const logoUrl = getStr("logoUrl");
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

  const handleValueChange = useCallback((field: string, value: string | number | null) => {
    setEditedFields((prev) => ({ ...prev, [field]: value }));
  }, []);
  const deals = asNumber(data.deals);
  const leads = asNumber(data.leads);
  const totalDeployed = asNumber(data.totalDeployed);

  const rawPortfolio = (data.portfolio as PortfolioRow[]) ?? [];
  const portfolio = rawPortfolio.filter((p) => p.company);

  // Metadata completeness
  const metaFields = [
    { label: "Type", value: type },
    { label: "HQ City", value: hqCity },
    { label: "HQ Country", value: hqCountry },
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
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => website && onOpenLogoPicker()}
            disabled={!website}
            className={`relative group shrink-0 ${website ? "cursor-pointer" : "cursor-default"}`}
            title={website ? "Choose logo" : "Set a website first to pick a logo"}
          >
            {logoUrl ? (
              <SmartLogo src={logoUrl} alt={`${name} logo`} className="h-8 w-8 rounded-md" fallback={<Briefcase className="h-5 w-5 text-green-500" />} />
            ) : (
              <Briefcase className="h-5 w-5 text-green-500" />
            )}
            {website && (
              <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="h-3.5 w-3.5 text-white" />
              </div>
            )}
          </button>
          <h2 className="text-xl font-bold truncate">{name}</h2>
          {type && (
            <Badge variant="outline" className="text-xs ml-1 shrink-0">
              {type}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {(hqCity || hqCountry) && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {[hqCity, hqCountry].filter(Boolean).join(", ")}
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
          <LockableInfoRow label="Type" field="type" value={type} rawValue={type} missing={!type} locked={lockedFields.has("type")} entityType="investor" entityName={name} onLockChange={handleLockChange} editable={false} />
          <LockableInfoRow label="HQ Stadt" field="hqCity" value={hqCity} rawValue={hqCity} missing={!hqCity} locked={lockedFields.has("hqCity")} entityType="investor" entityName={name} onLockChange={handleLockChange} onValueChange={handleValueChange} />
          <LockableInfoRow label="HQ Land" field="hqCountry" value={hqCountry} rawValue={hqCountry} missing={!hqCountry} locked={lockedFields.has("hqCountry")} entityType="investor" entityName={name} onLockChange={handleLockChange} onValueChange={handleValueChange} />
          <LockableInfoRow label="Stage Focus" field="stageFocus" value={<span className="truncate block max-w-[200px]" title={stageFocus?.join(", ")}>{stageFocus?.join(", ")}</span>} missing={!stageFocus} locked={lockedFields.has("stageFocus")} entityType="investor" entityName={name} onLockChange={handleLockChange} editable={false} />
          <LockableInfoRow label="Sector Focus" field="sectorFocus" value={<span className="truncate block max-w-[200px]" title={sectorFocus?.join(", ")}>{sectorFocus?.join(", ")}</span>} missing={!sectorFocus} locked={lockedFields.has("sectorFocus")} entityType="investor" entityName={name} onLockChange={handleLockChange} editable={false} />
          <LockableInfoRow label="Geo Focus" field="geoFocus" value={<span className="truncate block max-w-[200px]" title={geoFocus?.join(", ")}>{geoFocus?.join(", ")}</span>} missing={!geoFocus} locked={lockedFields.has("geoFocus")} entityType="investor" entityName={name} onLockChange={handleLockChange} editable={false} />
          <LockableInfoRow label="Check Size" field="checkSizeMinUsd" value={checkSizeStr} missing={!checkSizeStr} locked={lockedFields.has("checkSizeMinUsd")} entityType="investor" entityName={name} onLockChange={handleLockChange} editable={false} />
          <LockableInfoRow label="AUM" field="aum" value={aum ? formatAmount(aum) : null} missing={!aum} locked={lockedFields.has("aum")} entityType="investor" entityName={name} onLockChange={handleLockChange} editable={false} />
          <LockableInfoRow label="Founded" field="foundedYear" value={foundedYear} rawValue={foundedYear} missing={!foundedYear} locked={lockedFields.has("foundedYear")} entityType="investor" entityName={name} onLockChange={handleLockChange} onValueChange={handleValueChange} fieldType="number" />
          <LockableInfoRow
            label="Website" field="website"
            value={website ? (
              <a href={website.startsWith("http") ? website : `https://${website}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 text-xs truncate max-w-[200px] block">
                {website.replace(/^https?:\/\//, "")}
              </a>
            ) : null}
            rawValue={website}
            missing={!website} locked={lockedFields.has("website")} entityType="investor" entityName={name} onLockChange={handleLockChange} onValueChange={handleValueChange}
          />
          <LockableInfoRow
            label="LinkedIn" field="linkedinUrl"
            value={linkedinUrl ? (
              <a href={linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 text-xs">View profile</a>
            ) : null}
            rawValue={linkedinUrl}
            missing={!linkedinUrl} locked={lockedFields.has("linkedinUrl")} entityType="investor" entityName={name} onLockChange={handleLockChange} onValueChange={handleValueChange}
          />
          <LockableInfoRow
            label="Logo Link" field="logoUrl"
            value={logoUrl ? (
              <a href={logoUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 text-xs truncate max-w-[200px] block">
                {logoUrl.replace(/^https?:\/\//, "").substring(0, 40)}…
              </a>
            ) : null}
            rawValue={logoUrl}
            missing={!logoUrl} locked={lockedFields.has("logoUrl")} entityType="investor" entityName={name} onLockChange={handleLockChange} onValueChange={handleValueChange}
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
// Fund detail view
// ---------------------------------------------------------------------------

function FundView({ data }: { data: Record<string, unknown> }) {
  const name = String(data.name ?? "Unknown Fund");
  const firmName = data.firmName ? String(data.firmName) : null;
  const sizeUsd = asNumber(data.sizeUsd);
  const fundType = data.type ? String(data.type) : null;
  const vintage = data.vintage ? String(data.vintage) : null;
  const status = data.status ? String(data.status) : null;
  const country = data.country ? String(data.country) : null;
  const articles =
    (data.articles as { url: string | null; title: string | null; publishedAt: unknown }[]) ?? [];
  const validArticles = articles.filter((a) => a.url);

  const statusColor =
    status === "closed"
      ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
      : status === "fundraising"
        ? "bg-blue-500/15 text-blue-700 border-blue-500/30"
        : "bg-muted text-muted-foreground border-border";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white">
            <Briefcase className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold leading-tight truncate">{name}</h2>
            {firmName && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Users className="h-3 w-3 shrink-0" />
                {firmName}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {fundType && (
            <Badge variant="secondary" className="text-xs">{fundType}</Badge>
          )}
          {status && (
            <Badge variant="outline" className={`text-xs ${statusColor}`}>{status}</Badge>
          )}
          {vintage && (
            <Badge variant="outline" className="text-xs">
              <Calendar className="mr-1 h-2.5 w-2.5" />
              {vintage}
            </Badge>
          )}
          {country && (
            <Badge variant="outline" className="text-xs">
              <MapPin className="mr-1 h-2.5 w-2.5" />
              {country}
            </Badge>
          )}
        </div>
      </div>

      {/* Fund size hero */}
      <div className="rounded-lg border bg-gradient-to-br from-amber-500/10 to-amber-500/5 px-4 py-5 text-center">
        <span className="text-3xl font-extrabold tracking-tight">
          {formatAmount(sizeUsd)}
        </span>
        <p className="mt-0.5 text-xs text-muted-foreground">Fund Size</p>
      </div>

      {/* Fund details table */}
      <div className="space-y-1">
        <SectionHeading>Fund Data</SectionHeading>
        <div className="rounded-lg border divide-y text-sm">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> Firm
            </span>
            <span className="font-medium">{firmName ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5" /> Type
            </span>
            <span className="font-medium">{fundType ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> Vintage
            </span>
            <span className="font-medium">{vintage ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" /> Status
            </span>
            {status ? (
              <Badge variant="outline" className={`text-xs ${statusColor}`}>{status}</Badge>
            ) : (
              <span className="font-medium">—</span>
            )}
          </div>
          {country && (
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> Country
              </span>
              <span className="font-medium">{country}</span>
            </div>
          )}
        </div>
      </div>

      {/* Source articles */}
      {validArticles.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <SectionHeading>Sources</SectionHeading>
            <span className="text-xs text-muted-foreground tabular-nums">{validArticles.length} article{validArticles.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="rounded-lg border divide-y">
            {validArticles.map((a, i) => (
              <a
                key={i}
                href={a.url!}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2.5 px-3 py-2.5 text-sm hover:bg-muted/60 transition-colors group"
              >
                <FileText className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug line-clamp-2 group-hover:text-blue-600 transition-colors">
                    {a.title ?? "View Article"}
                  </p>
                  {formatDate(a.publishedAt) && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {formatDate(a.publishedAt)}
                    </p>
                  )}
                </div>
                <ExternalLink className="h-3 w-3 mt-1 shrink-0 text-muted-foreground/50 group-hover:text-blue-500 transition-colors" />
              </a>
            ))}
          </div>
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
  onNavigate,
}: EntitySheetProps) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoPickerOpen, setLogoPickerOpen] = useState(false);

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
      case "fund":
        query = fundQuery(entityName);
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
        fund: "Fund Details",
      }[entityType]
    : "Details";

  const sheetDescription = entityType === "fund" ? "" : (entityName ?? "");

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg w-full p-0 flex flex-col overflow-hidden">
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
            <CompanyView data={data} onEnrichComplete={fetchDetail} onOpenLogoPicker={() => setLogoPickerOpen(true)} onNavigateToCompany={onNavigate ? (name) => onNavigate("company", name) : undefined} />
          )}
          {data && !loading && entityType === "investor" && (
            <InvestorView data={data} onEnrichComplete={fetchDetail} onOpenLogoPicker={() => setLogoPickerOpen(true)} />
          )}
          {data && !loading && entityType === "round" && (
            <RoundView data={data} />
          )}
          {data && !loading && entityType === "fund" && (
            <FundView data={data} />
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>

    {data && (entityType === "company" || entityType === "investor") && data.website && (
      <LogoPicker
        open={logoPickerOpen}
        onOpenChange={setLogoPickerOpen}
        companyName={String(data.name ?? "")}
        website={String(data.website)}
        entityType={entityType}
        onSelect={(url) => {
          setData((prev) => prev ? { ...prev, logoUrl: url ?? null, lockedFields: [...(Array.isArray(prev.lockedFields) ? prev.lockedFields as string[] : []), "logoUrl"] } : prev);
        }}
      />
    )}
    </>
  );
}
