"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Copy,
  Check,
  X,
  SkipForward,
  RefreshCw,
  Building2,
  Users,
  Handshake,
  Sparkles,
  History,
  RotateCcw,
  Crown,
  Undo2,
  Info,
} from "lucide-react";

type EntityType = "company" | "investor" | "round";
type Status = "pending" | "confirmed" | "rejected" | "skipped";

type Candidate = {
  id: string;
  entityType: EntityType;
  leftKey: string;
  rightKey: string;
  tier: number;
  score: number;
  reasons: Record<string, unknown>;
  leftSnapshot: Record<string, unknown> | null;
  rightSnapshot: Record<string, unknown> | null;
  status: Status;
  winnerKey: string | null;
  mergeSnapshot: Record<string, unknown> | null;
  decidedAt: string | null;
  decidedBy: { name: string | null; email: string } | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

type Summary = Record<string, Record<Status, number>>;

type RunRow = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  companiesScanned: number;
  investorsScanned: number;
  roundsScanned: number;
  candidatesNew: number;
  candidatesUpdated: number;
  durationMs: number;
  errorMessage: string | null;
  triggeredBy: string;
};

const ENTITY_LABELS: Record<EntityType, string> = {
  company: "Companies",
  investor: "Investors",
  round: "Funding Rounds",
};

const ENTITY_ICONS: Record<EntityType, typeof Building2> = {
  company: Building2,
  investor: Users,
  round: Handshake,
};

export default function DedupReviewPage() {
  const [activeTab, setActiveTab] = useState<EntityType>("company");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("pending");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [summary, setSummary] = useState<Summary>({});
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [runs, setRuns] = useState<RunRow[]>([]);

  async function fetchCandidates() {
    setLoading(true);
    const params = new URLSearchParams({
      type: activeTab,
      status: statusFilter,
      limit: "100",
    });
    const res = await fetch(`/api/admin/dedup/candidates?${params.toString()}`);
    const data = await res.json();
    setCandidates(data.items ?? []);
    setSummary(data.summary ?? {});
    setLoading(false);
  }

  async function fetchRuns() {
    const res = await fetch("/api/admin/dedup/run");
    const data = await res.json();
    setRuns(data.runs ?? []);
  }

  useEffect(() => {
    fetchCandidates();
  }, [activeTab, statusFilter]);

  async function handleDecide(
    id: string,
    action: "confirm" | "reject" | "skip" | "reopen",
    winnerKey?: string,
  ) {
    const labelMap = {
      confirm: "Merge läuft...",
      reject: "Verwerfen...",
      skip: "Überspringen...",
      reopen: "Wieder öffnen...",
    };
    const t = action === "confirm" ? toast.loading(labelMap.confirm) : null;

    const res = await fetch(`/api/admin/dedup/candidates/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, winnerKey }),
    });
    if (res.ok) {
      const data = await res.json();
      const successMap = {
        confirm: data.merged ? "Gemerged" : "Bestätigt",
        reject: "Verworfen",
        skip: "Übersprungen",
        reopen: "Wieder geöffnet",
      };
      if (t) toast.success(successMap[action], { id: t });
      else toast.success(successMap[action]);
      fetchCandidates();
    } else {
      const err = await res.json();
      const msg = err.error || "Fehler";
      if (t) toast.error(msg, { id: t });
      else toast.error(msg);
    }
  }

  async function handleUnmerge(id: string) {
    if (!confirm("Merge wirklich rückgängig machen? Loser-Datensatz wird wiederhergestellt, alle Postgres- und Neo4j-Änderungen aus diesem Merge werden zurückgespielt.")) {
      return;
    }
    const t = toast.loading("Unmerge läuft...");
    const res = await fetch(`/api/admin/dedup/candidates/${id}/unmerge`, {
      method: "POST",
    });
    if (res.ok) {
      toast.success("Merge rückgängig gemacht", { id: t });
      fetchCandidates();
    } else {
      const err = await res.json();
      toast.error(err.error || "Unmerge fehlgeschlagen", { id: t });
    }
  }

  async function handleRunNow() {
    if (running) return;
    setRunning(true);
    const t = toast.loading("Dedup-Lauf gestartet — kann ein paar Minuten dauern...");
    try {
      const res = await fetch("/api/admin/dedup/run", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast.success(
          `Fertig: ${data.summary.candidatesNew} neue / ${data.summary.candidatesUpdated} aktualisiert (${(data.summary.durationMs / 1000).toFixed(1)}s)`,
          { id: t },
        );
        fetchCandidates();
      } else {
        toast.error(data.error || "Lauf fehlgeschlagen", { id: t });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lauf fehlgeschlagen", { id: t });
    } finally {
      setRunning(false);
    }
  }

  async function toggleHistory() {
    if (!showHistory) await fetchRuns();
    setShowHistory(!showHistory);
  }

  const pendingCounts = {
    company: summary.company?.pending ?? 0,
    investor: summary.investor?.pending ?? 0,
    round: summary.round?.pending ?? 0,
  };

  return (
    <div className="flex h-[calc(100vh-1.5rem)] flex-col">
      {/* Toolbar */}
      <div className="glass-status-bar px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Copy className="h-4 w-4 text-foreground/40" />
          <span className="text-[17px] font-semibold tracking-[-0.02em] text-foreground/85">
            Dedup Review
          </span>
          <span className="text-[11px] text-foreground/35 tabular-nums">
            {pendingCounts.company + pendingCounts.investor + pendingCounts.round} offen
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleHistory}
            className="glass-capsule-btn flex items-center gap-1.5 px-3 py-1.5 text-[12px]"
          >
            <History className="h-3.5 w-3.5" />
            Historie
          </button>
          <button
            onClick={handleRunNow}
            disabled={running}
            className="apple-btn-blue flex items-center gap-1.5 px-3 py-1.5 text-[13px] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
            {running ? "Läuft..." : "Jetzt scannen"}
          </button>
        </div>
      </div>

      {/* History panel */}
      {showHistory && (
        <div className="border-b border-foreground/[0.06] bg-foreground/[0.02] px-4 py-3 max-h-48 overflow-auto">
          <p className="mb-2 text-[11px] uppercase tracking-[0.04em] font-medium text-foreground/35">
            Letzte Läufe
          </p>
          {runs.length === 0 ? (
            <p className="text-[12px] text-foreground/30">Noch keine Läufe.</p>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-foreground/30">
                  <th className="text-left px-2 py-1">Start</th>
                  <th className="text-left px-2 py-1">Status</th>
                  <th className="text-left px-2 py-1">Trigger</th>
                  <th className="text-right px-2 py-1">Companies</th>
                  <th className="text-right px-2 py-1">Investors</th>
                  <th className="text-right px-2 py-1">Rounds</th>
                  <th className="text-right px-2 py-1">Neu / Upd</th>
                  <th className="text-right px-2 py-1">Dauer</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-foreground/[0.04]">
                    <td className="px-2 py-1 text-foreground/55">
                      {new Date(r.startedAt).toLocaleString("de-DE")}
                    </td>
                    <td className="px-2 py-1">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-2 py-1 text-foreground/45">{r.triggeredBy}</td>
                    <td className="px-2 py-1 tabular-nums text-foreground/45 text-right">
                      {r.companiesScanned}
                    </td>
                    <td className="px-2 py-1 tabular-nums text-foreground/45 text-right">
                      {r.investorsScanned}
                    </td>
                    <td className="px-2 py-1 tabular-nums text-foreground/45 text-right">
                      {r.roundsScanned}
                    </td>
                    <td className="px-2 py-1 tabular-nums text-foreground/45 text-right">
                      {r.candidatesNew} / {r.candidatesUpdated}
                    </td>
                    <td className="px-2 py-1 tabular-nums text-foreground/45 text-right">
                      {(r.durationMs / 1000).toFixed(1)}s
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-foreground/[0.06] px-4 flex items-center gap-1">
        {(Object.keys(ENTITY_LABELS) as EntityType[]).map((type) => {
          const Icon = ENTITY_ICONS[type];
          const isActive = activeTab === type;
          return (
            <button
              key={type}
              onClick={() => setActiveTab(type)}
              className={`flex items-center gap-1.5 px-3 py-2 text-[13px] tracking-[-0.01em] border-b-2 transition-colors ${
                isActive
                  ? "border-blue-500 text-foreground/85 font-semibold"
                  : "border-transparent text-foreground/45 hover:text-foreground/70"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {ENTITY_LABELS[type]}
              {pendingCounts[type] > 0 && (
                <span className="rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 tabular-nums">
                  {pendingCounts[type]}
                </span>
              )}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-1">
          {(["pending", "confirmed", "rejected", "skipped"] as Status[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                statusFilter === s
                  ? "bg-foreground/[0.08] text-foreground/85"
                  : "text-foreground/45 hover:bg-foreground/[0.04]"
              }`}
            >
              {s === "pending" ? "Offen" : s === "confirmed" ? "Bestätigt" : s === "rejected" ? "Verworfen" : "Übersprungen"}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {loading ? (
          <p className="text-[13px] text-foreground/45">Lade...</p>
        ) : candidates.length === 0 ? (
          <div className="lg-inset rounded-[16px] flex flex-col items-center justify-center py-16 gap-3">
            <Sparkles className="h-8 w-8 text-foreground/15" />
            <p className="text-[13px] text-foreground/40">
              {statusFilter === "pending"
                ? "Keine offenen Kandidaten — saubere Daten oder noch kein Scan gelaufen."
                : "Nichts in dieser Ansicht."}
            </p>
          </div>
        ) : (
          candidates.map((c) => (
            <CandidateCard
              key={c.id}
              candidate={c}
              onDecide={(action, winnerKey) => handleDecide(c.id, action, winnerKey)}
              onUnmerge={() => handleUnmerge(c.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    ok: { bg: "bg-emerald-500/8", text: "text-emerald-600 dark:text-emerald-400", label: "OK" },
    running: { bg: "bg-blue-500/8", text: "text-blue-600 dark:text-blue-400", label: "Läuft" },
    error: { bg: "bg-red-500/8", text: "text-red-500", label: "Fehler" },
  };
  const m = map[status] ?? map.error;
  return (
    <span className={`rounded-full ${m.bg} px-2 py-0.5 text-[10px] font-medium ${m.text}`}>
      {m.label}
    </span>
  );
}

function CandidateCard({
  candidate,
  onDecide,
  onUnmerge,
}: {
  candidate: Candidate;
  onDecide: (
    action: "confirm" | "reject" | "skip" | "reopen",
    winnerKey?: string,
  ) => void;
  onUnmerge: () => void;
}) {
  const tierLabel = candidate.tier === 1 ? "Hard-Match" : candidate.tier === 2 ? "Fuzzy-Match" : "Embedding";
  const tierColor =
    candidate.tier === 1
      ? "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400"
      : candidate.tier === 2
        ? "bg-blue-500/8 text-blue-600 dark:text-blue-400"
        : "bg-violet-500/8 text-violet-600 dark:text-violet-400";

  const isDecided = candidate.status !== "pending";
  const isRound = candidate.entityType === "round";
  const winnerIsLeft = !!candidate.winnerKey && candidate.winnerKey === candidate.leftKey;
  const winnerIsRight = !!candidate.winnerKey && candidate.winnerKey === candidate.rightKey;
  const canUnmerge = candidate.status === "confirmed" && !!candidate.mergeSnapshot;

  return (
    <div className="lg-inset rounded-[16px] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${tierColor}`}>
            T{candidate.tier} {tierLabel}
          </span>
          <span className="text-[12px] tabular-nums text-foreground/55">
            score {candidate.score.toFixed(3)}
          </span>
          {isDecided && (
            <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] font-medium text-foreground/55">
              {candidate.status === "confirmed" ? (canUnmerge ? "Gemerged" : "Bestätigt") : candidate.status === "rejected" ? "Verworfen" : "Übersprungen"}
              {candidate.decidedBy ? ` · ${candidate.decidedBy.name || candidate.decidedBy.email}` : ""}
              {candidate.decidedAt ? ` · ${new Date(candidate.decidedAt).toLocaleDateString("de-DE")}` : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!isDecided ? (
            <>
              {isRound && (
                <button
                  onClick={() => onDecide("confirm")}
                  className="glass-capsule-btn flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-emerald-600 hover:bg-emerald-500/10"
                >
                  <Check className="h-3.5 w-3.5" />
                  Dublette
                </button>
              )}
              <button
                onClick={() => onDecide("reject")}
                className="glass-capsule-btn flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-red-500 hover:bg-red-500/10"
              >
                <X className="h-3.5 w-3.5" />
                Keine Dublette
              </button>
              <button
                onClick={() => onDecide("skip")}
                className="glass-capsule-btn flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-foreground/45"
              >
                <SkipForward className="h-3.5 w-3.5" />
                Skip
              </button>
            </>
          ) : (
            <>
              {canUnmerge && (
                <button
                  onClick={onUnmerge}
                  className="glass-capsule-btn flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-amber-600 hover:bg-amber-500/10"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  Merge rückgängig
                </button>
              )}
              <button
                onClick={() => onDecide("reopen")}
                className="glass-capsule-btn flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-foreground/45"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Wieder öffnen
              </button>
            </>
          )}
        </div>
      </div>

      {isRound && !isDecided && (
        <div className="flex items-start gap-2 rounded-[10px] bg-blue-500/[0.06] p-2.5">
          <Info className="h-3.5 w-3.5 text-blue-600 mt-0.5 shrink-0" />
          <p className="text-[11px] leading-relaxed text-foreground/70">
            Round-Dubletten können nicht direkt gemerged werden. Sie lösen sich automatisch auf, sobald die zugehörigen <strong>Companies</strong> gemerged sind (gleicher Company-Name → gleicher Round-Key).
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <SnapshotPanel
          snapshot={candidate.leftSnapshot}
          entityType={candidate.entityType}
          isWinner={winnerIsLeft}
          isLoser={isDecided && winnerIsRight}
          showKeepButton={!isDecided && !isRound}
          onKeep={() => onDecide("confirm", candidate.leftKey)}
        />
        <SnapshotPanel
          snapshot={candidate.rightSnapshot}
          entityType={candidate.entityType}
          isWinner={winnerIsRight}
          isLoser={isDecided && winnerIsLeft}
          showKeepButton={!isDecided && !isRound}
          onKeep={() => onDecide("confirm", candidate.rightKey)}
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {Object.entries(candidate.reasons).map(([k, v]) => (
          <span
            key={k}
            className="rounded-full bg-foreground/[0.04] px-2 py-0.5 text-[10px] font-medium text-foreground/55"
          >
            <span className="text-foreground/35">{k}:</span> {String(v)}
          </span>
        ))}
      </div>
    </div>
  );
}

function SnapshotPanel({
  snapshot,
  entityType,
  isWinner,
  isLoser,
  showKeepButton,
  onKeep,
}: {
  snapshot: Record<string, unknown> | null;
  entityType: EntityType;
  isWinner?: boolean;
  isLoser?: boolean;
  showKeepButton?: boolean;
  onKeep?: () => void;
}) {
  if (!snapshot) {
    return (
      <div className="rounded-[10px] bg-foreground/[0.02] p-3">
        <p className="text-[12px] text-foreground/30">Kein Snapshot</p>
      </div>
    );
  }

  const fields: { key: string; label: string }[] =
    entityType === "company"
      ? [
          { key: "name", label: "Name" },
          { key: "normalizedName", label: "Normalized" },
          { key: "country", label: "Country" },
          { key: "website", label: "Website" },
          { key: "linkedinUrl", label: "LinkedIn" },
        ]
      : entityType === "investor"
        ? [
            { key: "name", label: "Name" },
            { key: "normalizedName", label: "Normalized" },
          ]
        : [
            { key: "company", label: "Company" },
            { key: "amountUsd", label: "Amount (USD)" },
            { key: "stage", label: "Stage" },
            { key: "announcedDate", label: "Announced" },
            { key: "country", label: "Country" },
            { key: "roundKey", label: "Round Key" },
          ];

  function fmt(v: unknown): string {
    if (v == null) return "—";
    if (typeof v === "number") return v.toLocaleString("de-DE");
    return String(v);
  }

  const containerClass = isWinner
    ? "ring-1 ring-emerald-500/40 bg-emerald-500/[0.05]"
    : isLoser
      ? "bg-foreground/[0.02] opacity-60"
      : "bg-foreground/[0.02]";

  return (
    <div className={`rounded-[10px] p-3 space-y-1.5 ${containerClass}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] text-foreground/30 truncate flex-1">
          {String(snapshot.uuid ?? "")}
        </p>
        {isWinner && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 shrink-0">
            <Crown className="h-3 w-3" />
            Master
          </span>
        )}
        {isLoser && (
          <span className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] font-medium text-foreground/55 shrink-0">
            absorbiert
          </span>
        )}
        {showKeepButton && onKeep && (
          <button
            onClick={onKeep}
            className="glass-capsule-btn inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-emerald-600 hover:bg-emerald-500/10 shrink-0"
            title="Diesen Datensatz behalten, anderen mergen"
          >
            <Crown className="h-3 w-3" />
            Diese behalten
          </button>
        )}
      </div>
      {fields.map((f) => (
        <div key={f.key} className="flex items-baseline gap-2">
          <span className="text-[10px] uppercase tracking-[0.04em] font-medium text-foreground/30 w-20 shrink-0">
            {f.label}
          </span>
          <span className="text-[12px] text-foreground/85 truncate">{fmt(snapshot[f.key])}</span>
        </div>
      ))}
    </div>
  );
}
