"use client";

import { useCallback, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Circle,
  ExternalLink,
  Loader2,
  Search,
  Sparkles,
  Database,
  AlertTriangle,
  X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SearchResult = {
  url: string;
  title: string;
  description: string;
  query: string;
  searchStage: string | null;
  relevance: number;
  signals: string[];
  extractedStage: string | null;
  extractedAmount: string | null;
  domain: string;
  category: "high" | "medium" | "low";
};

type ExtractedRound = {
  stage: string | null;
  amount: number | null;
  amountUsd: number | null;
  currency: string;
  fxRate: number | null;
  investors: string[];
  leadInvestor: string | null;
  country: string | null;
  confidence: number;
  announcedDate: string | null;
  companyName: string;
  articles: { url: string; title: string }[];
  existsInDb: boolean;
};

type IngestResult = {
  stage: string | null;
  companyName: string;
  success: boolean;
  error?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAmount(amount: number | null | undefined): string {
  if (!amount) return "N/A";
  if (amount >= 1e9) return `$${(amount / 1e9).toFixed(1)}B`;
  if (amount >= 1e6) return `$${(amount / 1e6).toFixed(1)}M`;
  if (amount >= 1e3) return `$${(amount / 1e3).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

function confidenceColor(c: number): string {
  if (c >= 0.8) return "text-emerald-600 bg-emerald-500/8";
  if (c >= 0.6) return "text-amber-600 bg-amber-500/8";
  return "text-red-500 bg-red-500/8";
}

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

const STEPS = [
  { id: 1, label: "Suche", icon: Search },
  { id: 2, label: "Auswahl", icon: ChevronRight },
  { id: 3, label: "Extraktion", icon: Sparkles },
  { id: 4, label: "Ingest", icon: Database },
] as const;

function StepIndicator({
  currentStep,
  completedSteps,
}: {
  currentStep: number;
  completedSteps: Set<number>;
}) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((step, i) => {
        const isCompleted = completedSteps.has(step.id);
        const isCurrent = step.id === currentStep;
        const Icon = isCompleted ? Check : step.icon;

        return (
          <div key={step.id} className="flex items-center gap-2">
            {i > 0 && (
              <div
                className={`h-px w-6 ${
                  isCompleted ? "bg-emerald-500/40" : "bg-foreground/[0.08]"
                }`}
              />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={`h-6 w-6 rounded-full flex items-center justify-center ${
                  isCompleted
                    ? "bg-emerald-500/8"
                    : isCurrent
                      ? "bg-blue-500/8"
                      : "bg-foreground/[0.04]"
                }`}
              >
                <Icon
                  className={`h-3 w-3 ${
                    isCompleted
                      ? "text-emerald-600"
                      : isCurrent
                        ? "text-blue-600"
                        : "text-foreground/35"
                  }`}
                />
              </div>
              <span
                className={`text-[11px] tracking-[0.04em] uppercase font-medium ${
                  isCompleted
                    ? "text-emerald-600"
                    : isCurrent
                      ? "text-blue-600"
                      : "text-foreground/35"
                }`}
              >
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function HistoricalFundingPage() {
  const params = useParams();
  const router = useRouter();
  const companyName = decodeURIComponent((params?.name as string) ?? "");

  // Wizard state
  const [step, setStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  // Step 1: Search
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchCounts, setSearchCounts] = useState<{ high: number; medium: number; low: number; byStage?: Record<string, number> } | null>(null);

  // Step 2: Selection
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [filterCategory, setFilterCategory] = useState<"all" | "high" | "medium" | "low">("all");
  const [deepSearching, setDeepSearching] = useState<string | null>(null); // stage being deep-searched

  // Step 3: Extraction
  const [extracting, setExtracting] = useState(false);
  const [extractedRounds, setExtractedRounds] = useState<ExtractedRound[]>([]);
  const [extractStats, setExtractStats] = useState<{
    articlesScraped: number;
    articlesFailed: number;
    existingRoundsInDb: number;
  } | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);

  // Step 4: Ingest
  const [selectedRounds, setSelectedRounds] = useState<Set<string>>(new Set());
  const [ingesting, setIngesting] = useState(false);
  const [ingestResults, setIngestResults] = useState<IngestResult[] | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Step 1: Run search
  // -------------------------------------------------------------------------
  const runSearch = useCallback(async () => {
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch("/api/funding/historical-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setSearchResults(data.results ?? []);
      setSearchCounts(data.counts ?? null);
      // Pre-select high + medium relevance results
      const preSelected = (data.results ?? [])
        .filter((r: SearchResult) => r.category !== "low")
        .map((r: SearchResult) => r.url);
      setSelectedUrls(new Set(preSelected));
      setCompletedSteps((prev) => new Set([...prev, 1]));
      setStep(2);
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Suche fehlgeschlagen");
    } finally {
      setSearching(false);
    }
  }, [companyName]);

  // -------------------------------------------------------------------------
  // Deep search for a specific missing stage
  // -------------------------------------------------------------------------
  const runDeepSearch = useCallback(async (stage: string) => {
    setDeepSearching(stage);
    try {
      const res = await fetch("/api/funding/historical-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, deepSearchStage: stage }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const newResults: SearchResult[] = data.results ?? [];

      // Merge into existing results (deduplicate by URL)
      setSearchResults((prev) => {
        const existingUrls = new Set(prev.map((r) => r.url));
        const unique = newResults.filter((r: SearchResult) => !existingUrls.has(r.url));
        return [...prev, ...unique];
      });

      // Pre-select new high+medium results
      setSelectedUrls((prev) => {
        const next = new Set(prev);
        for (const r of newResults) {
          if (r.category !== "low") next.add(r.url);
        }
        return next;
      });

      // Update stage counts
      setSearchCounts((prev) => {
        if (!prev) return prev;
        const newHigh = newResults.filter((r: SearchResult) => r.category === "high").length;
        const newMedium = newResults.filter((r: SearchResult) => r.category === "medium").length;
        const newLow = newResults.filter((r: SearchResult) => r.category === "low").length;
        return {
          high: prev.high + newHigh,
          medium: prev.medium + newMedium,
          low: prev.low + newLow,
          byStage: {
            ...prev.byStage,
            [stage]: (prev.byStage?.[stage] ?? 0) + newResults.length,
          },
        };
      });
    } catch {
      // silently fail deep search
    } finally {
      setDeepSearching(null);
    }
  }, [companyName]);

  // -------------------------------------------------------------------------
  // Step 3: Run extraction
  // -------------------------------------------------------------------------
  const runExtraction = useCallback(async () => {
    const selected = searchResults.filter((r) => selectedUrls.has(r.url));
    if (selected.length === 0) return;

    setExtracting(true);
    setExtractError(null);
    setCompletedSteps((prev) => new Set([...prev, 2]));
    setStep(3);

    try {
      const res = await fetch("/api/funding/historical-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          articles: selected.map((r) => ({ url: r.url, title: r.title })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setExtractedRounds(data.rounds ?? []);
      setExtractStats({
        articlesScraped: data.articlesScraped,
        articlesFailed: data.articlesFailed,
        existingRoundsInDb: data.existingRoundsInDb,
      });
      // Pre-select new rounds (not already in DB)
      const newRoundKeys = (data.rounds ?? [])
        .filter((r: ExtractedRound) => !r.existsInDb)
        .map((r: ExtractedRound) => r.stage ?? "unknown");
      setSelectedRounds(new Set(newRoundKeys));
      setCompletedSteps((prev) => new Set([...prev, 3]));
      setStep(4);
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : "Extraktion fehlgeschlagen");
    } finally {
      setExtracting(false);
    }
  }, [companyName, searchResults, selectedUrls]);

  // -------------------------------------------------------------------------
  // Step 4: Run ingest
  // -------------------------------------------------------------------------
  const runIngest = useCallback(async () => {
    const selected = extractedRounds.filter((r) =>
      selectedRounds.has(r.stage ?? "unknown")
    );
    if (selected.length === 0) return;

    setIngesting(true);
    setIngestError(null);

    try {
      const res = await fetch("/api/funding/historical-ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rounds: selected }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setIngestResults(data.results ?? []);
      setCompletedSteps((prev) => new Set([...prev, 4]));
    } catch (e) {
      setIngestError(e instanceof Error ? e.message : "Ingest fehlgeschlagen");
    } finally {
      setIngesting(false);
    }
  }, [extractedRounds, selectedRounds]);

  // -------------------------------------------------------------------------
  // Toggle helpers
  // -------------------------------------------------------------------------
  const toggleUrl = (url: string) => {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const toggleAllUrls = () => {
    if (selectedUrls.size === searchResults.length) {
      setSelectedUrls(new Set());
    } else {
      setSelectedUrls(new Set(searchResults.map((r) => r.url)));
    }
  };

  const toggleRound = (stageKey: string) => {
    setSelectedRounds((prev) => {
      const next = new Set(prev);
      if (next.has(stageKey)) next.delete(stageKey);
      else next.add(stageKey);
      return next;
    });
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex flex-col min-h-screen">
      {/* Tier 2: Navigation bar */}
      <div className="glass-status-bar px-4 py-2.5 shrink-0 flex items-center justify-between">
        <button
          onClick={() =>
            router.push(
              `/app/companies/${encodeURIComponent(companyName)}`
            )
          }
          className="glass-capsule-btn flex items-center gap-2 px-3 py-1 text-[13px] tracking-[-0.01em] text-foreground/55 hover:text-foreground/85 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Zurück zu {companyName}
        </button>
        <StepIndicator currentStep={step} completedSteps={completedSteps} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Header */}
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground/85">
              Historische Rounds
            </h1>
            <p className="text-[13px] tracking-[-0.01em] text-foreground/45">
              {companyName} — Funding-Historie über Websuche anreichern
            </p>
          </div>

          {/* ============================================================= */}
          {/* Step 1: Search trigger                                        */}
          {/* ============================================================= */}
          {step === 1 && (
            <div className="lg-inset rounded-[16px] p-6 space-y-4">
              <div className="flex items-center gap-3">
                <Search className="h-5 w-5 text-foreground/40" />
                <div>
                  <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-foreground/85">
                    Schritt 1: Web-Suche
                  </h2>
                  <p className="text-[13px] text-foreground/45">
                    Brave Search durchsucht das Web nach Funding-Artikeln zu{" "}
                    <span className="font-semibold text-foreground/70">{companyName}</span>.
                  </p>
                </div>
              </div>

              {searchError && (
                <div className="rounded-[10px] bg-red-500/8 px-4 py-3 text-[13px] text-red-500 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {searchError}
                </div>
              )}

              <button
                onClick={runSearch}
                disabled={searching}
                className="apple-btn-blue px-5 py-2 text-[13px] font-semibold rounded-[14px] flex items-center gap-2 disabled:opacity-50"
              >
                {searching ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Suche läuft...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4" />
                    Suche starten
                  </>
                )}
              </button>
            </div>
          )}

          {/* ============================================================= */}
          {/* Step 2: Article selection                                     */}
          {/* ============================================================= */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Summary bar */}
              {searchCounts && (
                <div className="space-y-3">
                  {/* Relevance summary */}
                  <div className="flex items-center gap-2 text-[12px]">
                    <span className="rounded-full bg-emerald-500/8 px-2 py-0.5 text-emerald-600 font-medium">
                      {searchCounts.high} hohe Relevanz
                    </span>
                    <span className="rounded-full bg-amber-500/8 px-2 py-0.5 text-amber-600 font-medium">
                      {searchCounts.medium} mittlere
                    </span>
                    <span className="rounded-full bg-foreground/[0.04] px-2 py-0.5 text-foreground/45 font-medium">
                      {searchCounts.low} niedrige
                    </span>
                  </div>

                  {/* Stage coverage grid */}
                  {searchCounts.byStage && (
                    <div className="lg-inset rounded-[14px] p-3">
                      <p className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35 mb-2">
                        Stage-Abdeckung
                        <span className="normal-case tracking-normal ml-2 text-foreground/25">
                          Klicke fehlende Stages für Tiefensuche
                        </span>
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {Object.entries(searchCounts.byStage).map(([stage, count]) => {
                          const isMissing = count === 0;
                          const isSearching = deepSearching === stage;

                          if (isMissing) {
                            return (
                              <button
                                key={stage}
                                onClick={() => runDeepSearch(stage)}
                                disabled={isSearching}
                                className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-foreground/[0.04] text-foreground/30 hover:bg-blue-500/8 hover:text-blue-600 transition-colors disabled:opacity-50"
                              >
                                {isSearching ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Search className="h-3 w-3" />
                                )}
                                {stage}
                                <span className="tabular-nums">0</span>
                              </button>
                            );
                          }

                          return (
                            <div
                              key={stage}
                              className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-emerald-500/8 text-emerald-600"
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              {stage}
                              <span className="tabular-nums">{count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="lg-inset rounded-[16px] p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ChevronRight className="h-5 w-5 text-foreground/40" />
                    <div>
                      <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-foreground/85">
                        Schritt 2: Artikel auswählen
                      </h2>
                      <p className="text-[13px] text-foreground/45">
                        {searchResults.length} Artikel gefunden — {selectedUrls.size} ausgewählt
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={toggleAllUrls}
                    className="glass-capsule-btn px-3 py-1 text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/55"
                  >
                    {selectedUrls.size === searchResults.length
                      ? "Keine"
                      : "Alle"}
                  </button>
                </div>

                {/* Category filter tabs */}
                <div className="flex items-center gap-1">
                  {(["all", "high", "medium", "low"] as const).map((cat) => {
                    const count =
                      cat === "all"
                        ? searchResults.length
                        : searchResults.filter((r) => r.category === cat).length;
                    const label =
                      cat === "all" ? "Alle" : cat === "high" ? "Hoch" : cat === "medium" ? "Mittel" : "Niedrig";
                    return (
                      <button
                        key={cat}
                        onClick={() => setFilterCategory(cat)}
                        className={`px-3 py-1 rounded-full text-[11px] font-medium transition-colors ${
                          filterCategory === cat
                            ? "bg-blue-500/8 text-blue-600"
                            : "text-foreground/40 hover:text-foreground/60"
                        }`}
                      >
                        {label} ({count})
                      </button>
                    );
                  })}
                </div>

                {searchResults.length === 0 ? (
                  <div className="text-center py-8">
                    <Search className="h-8 w-8 text-foreground/15 mx-auto mb-2" />
                    <p className="text-[13px] text-foreground/40">
                      Keine Artikel gefunden. Versuche einen anderen Suchbegriff.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-0">
                    {searchResults
                      .filter(
                        (r) => filterCategory === "all" || r.category === filterCategory
                      )
                      .map((result) => (
                        <button
                          key={result.url}
                          onClick={() => toggleUrl(result.url)}
                          className={`lg-inset-row w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${
                            selectedUrls.has(result.url)
                              ? "bg-blue-500/[0.03]"
                              : ""
                          }`}
                        >
                          {/* Checkbox */}
                          <div
                            className={`mt-0.5 h-4 w-4 rounded-[4px] border flex items-center justify-center shrink-0 ${
                              selectedUrls.has(result.url)
                                ? "border-blue-500 bg-blue-500"
                                : "border-foreground/20 bg-transparent"
                            }`}
                          >
                            {selectedUrls.has(result.url) && (
                              <Check className="h-3 w-3 text-white" />
                            )}
                          </div>

                          {/* Relevance dot */}
                          <div
                            className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
                              result.category === "high"
                                ? "bg-emerald-500"
                                : result.category === "medium"
                                  ? "bg-amber-500"
                                  : "bg-foreground/20"
                            }`}
                            title={`Relevanz: ${Math.round(result.relevance * 100)}%`}
                          />

                          {/* Content */}
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-semibold tracking-[-0.01em] text-foreground/85 truncate">
                              {result.title}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="text-[11px] text-foreground/35">
                                {result.domain}
                              </span>
                              {result.extractedStage && (
                                <span className="rounded-full bg-blue-500/8 px-1.5 py-0 text-[10px] font-medium text-blue-600">
                                  {result.extractedStage}
                                </span>
                              )}
                              {result.extractedAmount && (
                                <span className="text-[11px] font-semibold text-foreground/55 tabular-nums">
                                  {result.extractedAmount}
                                </span>
                              )}
                              <span
                                className={`text-[10px] font-medium ${
                                  result.relevance >= 0.4
                                    ? "text-emerald-600"
                                    : result.relevance >= 0.15
                                      ? "text-amber-600"
                                      : "text-foreground/30"
                                }`}
                              >
                                {Math.round(result.relevance * 100)}%
                              </span>
                            </div>
                            {result.description && (
                              <p className="text-[12px] text-foreground/35 line-clamp-1 mt-1">
                                {result.description}
                              </p>
                            )}
                          </div>

                          {/* External link */}
                          <a
                            href={result.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-blue-600 hover:text-blue-500 mt-0.5 shrink-0"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </button>
                      ))}
                  </div>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={() => setStep(1)}
                    className="glass-capsule-btn px-4 py-2 text-[13px] text-foreground/55"
                  >
                    Zurück
                  </button>
                  <button
                    onClick={runExtraction}
                    disabled={selectedUrls.size === 0 || extracting}
                    className="apple-btn-blue px-5 py-2 text-[13px] font-semibold rounded-[14px] flex items-center gap-2 disabled:opacity-50"
                  >
                    {extracting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Extrahiere...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        {selectedUrls.size} Artikel extrahieren
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================= */}
          {/* Step 3: Extracting (loading state)                            */}
          {/* ============================================================= */}
          {step === 3 && extracting && (
            <div className="lg-inset rounded-[16px] p-6">
              <div className="flex flex-col items-center gap-4 py-8">
                <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
                <div className="text-center space-y-1">
                  <p className="text-[15px] font-semibold tracking-[-0.02em] text-foreground/85">
                    Artikel werden gescraped & analysiert...
                  </p>
                  <p className="text-[13px] text-foreground/45">
                    {selectedUrls.size} Artikel werden durch die LLM-Pipeline geschickt.
                    Das kann etwas dauern.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Extraction error */}
          {step === 3 && !extracting && extractError && (
            <div className="lg-inset rounded-[16px] p-6 space-y-4">
              <div className="rounded-[10px] bg-red-500/8 px-4 py-3 text-[13px] text-red-500 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {extractError}
              </div>
              <button
                onClick={() => setStep(2)}
                className="glass-capsule-btn px-4 py-2 text-[13px] text-foreground/55"
              >
                Zurück zur Auswahl
              </button>
            </div>
          )}

          {/* ============================================================= */}
          {/* Step 4: Review & Ingest                                       */}
          {/* ============================================================= */}
          {step === 4 && (
            <div className="space-y-4">
              {/* Stats bar */}
              {extractStats && (
                <div className="flex items-center gap-4 text-[12px] text-foreground/45">
                  <span>
                    {extractStats.articlesScraped} Artikel gescraped
                  </span>
                  {extractStats.articlesFailed > 0 && (
                    <span className="text-amber-600">
                      {extractStats.articlesFailed} fehlgeschlagen
                    </span>
                  )}
                  <span>
                    {extractStats.existingRoundsInDb} Rounds bereits in DB
                  </span>
                </div>
              )}

              {/* Rounds review */}
              <div className="lg-inset rounded-[16px] p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <Database className="h-5 w-5 text-foreground/40" />
                  <div>
                    <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-foreground/85">
                      Schritt 4: Review & Ingest
                    </h2>
                    <p className="text-[13px] text-foreground/45">
                      {extractedRounds.length} Rounds erkannt —{" "}
                      {selectedRounds.size} zum Ingest ausgewählt
                    </p>
                  </div>
                </div>

                {extractedRounds.length === 0 ? (
                  <div className="text-center py-8">
                    <Circle className="h-8 w-8 text-foreground/15 mx-auto mb-2" />
                    <p className="text-[13px] text-foreground/40">
                      Keine Funding Rounds in den Artikeln erkannt.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-0">
                    {extractedRounds.map((round) => {
                      const stageKey = round.stage ?? "unknown";
                      const isSelected = selectedRounds.has(stageKey);

                      return (
                        <button
                          key={stageKey}
                          onClick={() => toggleRound(stageKey)}
                          className={`lg-inset-row w-full text-left px-4 py-4 flex items-center gap-4 transition-colors ${
                            isSelected ? "bg-blue-500/[0.03]" : ""
                          }`}
                        >
                          {/* Checkbox */}
                          <div
                            className={`h-4 w-4 rounded-[4px] border flex items-center justify-center shrink-0 ${
                              isSelected
                                ? "border-blue-500 bg-blue-500"
                                : "border-foreground/20 bg-transparent"
                            }`}
                          >
                            {isSelected && (
                              <Check className="h-3 w-3 text-white" />
                            )}
                          </div>

                          {/* Stage badge */}
                          <span className="rounded-full bg-foreground/[0.04] px-2.5 py-0.5 text-[10px] font-medium text-foreground/55 shrink-0 min-w-[70px] text-center">
                            {round.stage ?? "Unknown"}
                          </span>

                          {/* Amount */}
                          <span className="font-bold text-[17px] tracking-[-0.02em] tabular-nums text-foreground/85 min-w-[80px]">
                            {formatAmount(round.amountUsd)}
                          </span>

                          {/* Investors */}
                          <div className="flex-1 min-w-0">
                            {round.leadInvestor && (
                              <span className="text-[13px] text-foreground/70 truncate block">
                                {round.leadInvestor}
                                {round.investors.length > 1 && (
                                  <span className="text-foreground/35">
                                    {" "}
                                    +{round.investors.length - 1}
                                  </span>
                                )}
                              </span>
                            )}
                            {round.announcedDate && (
                              <span className="text-[11px] text-foreground/40 tabular-nums">
                                {round.announcedDate}
                              </span>
                            )}
                            <span className="text-[11px] text-foreground/30">
                              {round.articles.length} Artikel
                            </span>
                          </div>

                          {/* Confidence */}
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 ${confidenceColor(round.confidence)}`}
                          >
                            {Math.round(round.confidence * 100)}%
                          </span>

                          {/* DB status */}
                          {round.existsInDb ? (
                            <span className="rounded-full bg-amber-500/8 px-2 py-0.5 text-[10px] font-medium text-amber-600 shrink-0 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              existiert
                            </span>
                          ) : (
                            <span className="rounded-full bg-emerald-500/8 px-2 py-0.5 text-[10px] font-medium text-emerald-600 shrink-0 flex items-center gap-1">
                              <Check className="h-3 w-3" />
                              neu
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Ingest results */}
                {ingestResults && (
                  <div className="space-y-2 pt-2">
                    <h3 className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
                      Ergebnis
                    </h3>
                    {ingestResults.map((r, i) => (
                      <div
                        key={i}
                        className={`rounded-[10px] px-4 py-2 text-[13px] flex items-center gap-2 ${
                          r.success
                            ? "bg-emerald-500/8 text-emerald-600"
                            : "bg-red-500/8 text-red-500"
                        }`}
                      >
                        {r.success ? (
                          <Check className="h-4 w-4 shrink-0" />
                        ) : (
                          <X className="h-4 w-4 shrink-0" />
                        )}
                        <span className="font-medium">{r.stage ?? "Unknown"}</span>
                        <span className="text-foreground/45">— {r.companyName}</span>
                        {r.error && (
                          <span className="text-red-500 ml-auto text-[12px]">
                            {r.error}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {ingestError && (
                  <div className="rounded-[10px] bg-red-500/8 px-4 py-3 text-[13px] text-red-500 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {ingestError}
                  </div>
                )}

                {/* Actions */}
                {!ingestResults && (
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={() => setStep(2)}
                      className="glass-capsule-btn px-4 py-2 text-[13px] text-foreground/55"
                    >
                      Zurück
                    </button>
                    <button
                      onClick={runIngest}
                      disabled={selectedRounds.size === 0 || ingesting}
                      className="apple-btn-blue px-5 py-2 text-[13px] font-semibold rounded-[14px] flex items-center gap-2 disabled:opacity-50"
                    >
                      {ingesting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Synce...
                        </>
                      ) : (
                        <>
                          <Database className="h-4 w-4" />
                          {selectedRounds.size} Rounds syncen
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Done */}
                {ingestResults && (
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={() =>
                        router.push(
                          `/app/companies/${encodeURIComponent(companyName)}`
                        )
                      }
                      className="apple-btn-blue px-5 py-2 text-[13px] font-semibold rounded-[14px] flex items-center gap-2"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Zurück zum Profil
                    </button>
                    <button
                      onClick={() => {
                        setStep(1);
                        setCompletedSteps(new Set());
                        setSearchResults([]);
                        setSelectedUrls(new Set());
                        setSearchCounts(null);
                        setFilterCategory("all");
                        setDeepSearching(null);
                        setExtractedRounds([]);
                        setSelectedRounds(new Set());
                        setIngestResults(null);
                        setExtractStats(null);
                      }}
                      className="glass-capsule-btn px-4 py-2 text-[13px] text-foreground/55"
                    >
                      Nochmal suchen
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
