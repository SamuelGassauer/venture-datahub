"use client";

import { useState, useCallback } from "react";
import {
  Loader2,
  Copy,
  Check,
  Sparkles,
  BarChart3,
  TrendingUp,
  Globe,
  Search,
  Database,
  Zap,
  ChevronDown,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type QueryBlock = {
  label: string;
  cypher: string;
  params: Record<string, unknown>;
  rowCount: number;
  error?: string;
};

type ResultBlock = {
  label: string;
  data: Record<string, unknown>[];
  error?: string;
};

type QueryResponse = {
  reasoning: string;
  queries: QueryBlock[];
  results: ResultBlock[];
  timing: { cypherGenerationMs: number; queryExecutionMs: number };
};

type PostStyle = "analysis" | "spotlight" | "roundup" | "general";

const STYLE_OPTIONS: { value: PostStyle; label: string; icon: typeof BarChart3 }[] = [
  { value: "roundup", label: "Wochen-Roundup", icon: TrendingUp },
  { value: "analysis", label: "Trend-Analyse", icon: BarChart3 },
  { value: "spotlight", label: "Deal-Spotlight", icon: Sparkles },
  { value: "general", label: "Frei", icon: Globe },
];

const QUICK_QUERIES = [
  "Top 10 Deals in Europa diese Woche nach Volumen",
  "Seed-Runden in DACH in den letzten 7 Tagen",
  "Aktivste Investoren in Europa diesen Monat",
  "Fintech-Deals in Europa letzte 2 Wochen",
  "Series A und B Runden in Deutschland dieses Jahr",
  "Klimatech-Startups mit Funding in den letzten 30 Tagen",
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LinkedInPage() {
  const [question, setQuestion] = useState("");
  const [queryResponse, setQueryResponse] = useState<QueryResponse | null>(null);
  const [querying, setQuerying] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [post, setPost] = useState("");
  const [style, setStyle] = useState<PostStyle>("roundup");
  const [copied, setCopied] = useState(false);
  const [usage, setUsage] = useState<{ inputTokens: number; outputTokens: number } | null>(null);
  const [expandedQueries, setExpandedQueries] = useState<Set<number>>(new Set());

  // Step 1: GraphRAG query
  const runQuery = useCallback(async (q?: string) => {
    const queryText = q || question;
    if (!queryText.trim()) {
      toast.error("Bitte gib eine Frage ein");
      return;
    }
    if (q) setQuestion(q);
    setQuerying(true);
    setQueryResponse(null);
    try {
      const res = await fetch("/api/linkedin/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: queryText }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Query failed");
      }
      const data: QueryResponse = await res.json();
      setQueryResponse(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler bei der Abfrage");
    } finally {
      setQuerying(false);
    }
  }, [question]);

  // Step 2: Generate post from results
  const generatePost = useCallback(async () => {
    if (!queryResponse) return;
    setGenerating(true);
    setUsage(null);
    try {
      const graphData = queryResponse.results
        .filter((r) => !r.error && r.data.length > 0)
        .map((r) => ({ label: r.label, data: r.data }));

      if (graphData.length === 0) {
        toast.error("Keine Daten vorhanden — passe die Frage an");
        return;
      }

      const res = await fetch("/api/linkedin/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: question,
          graphData,
          style,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Generation failed");
      }

      const result = await res.json();
      setPost(result.post);
      setUsage(result.usage);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Generieren");
    } finally {
      setGenerating(false);
    }
  }, [queryResponse, question, style]);

  const copyPost = () => {
    navigator.clipboard.writeText(post);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleQuery = (i: number) => {
    setExpandedQueries((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const charCount = post.length;
  const totalRows = queryResponse?.results.reduce((sum, r) => sum + r.data.length, 0) ?? 0;

  return (
    <>
      {/* Header */}
      <div className="glass-status-bar px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-foreground/40" />
          <span className="text-[13px] font-semibold tracking-[-0.01em] text-foreground/70">
            LinkedIn Post Generator
          </span>
          <span className="text-[10px] bg-blue-500/15 text-blue-500 px-2 py-0.5 rounded-full font-medium">
            GraphRAG
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-7xl mx-auto">
          {/* LEFT: Query + Results */}
          <div className="flex flex-col gap-4">
            {/* Question input */}
            <div className="lg-inset rounded-[14px] p-4">
              <label className="text-[11px] uppercase tracking-[0.04em] font-medium text-foreground/35 mb-2 block">
                Frage an den Graphen
              </label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-foreground/25" />
                  <input
                    type="text"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !querying && runQuery()}
                    placeholder="z.B. Top Seed-Runden in DACH diese Woche..."
                    className="glass-search-input w-full pl-9 pr-3 py-2.5 text-[13px]"
                  />
                </div>
                <button
                  onClick={() => runQuery()}
                  disabled={querying || !question.trim()}
                  className="apple-btn-blue px-4 py-2.5 text-[13px] font-semibold inline-flex items-center gap-2 disabled:opacity-40 flex-shrink-0"
                >
                  {querying ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Database className="h-3.5 w-3.5" />
                  )}
                  Abfragen
                </button>
              </div>

              {/* Quick queries */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {QUICK_QUERIES.map((q) => (
                  <button
                    key={q}
                    onClick={() => runQuery(q)}
                    disabled={querying}
                    className="text-[11px] bg-foreground/[0.04] text-foreground/40 hover:text-foreground/60 hover:bg-foreground/[0.06] px-2.5 py-1 rounded-full transition-colors disabled:opacity-40"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Loading state */}
            {querying && (
              <div className="lg-inset rounded-[14px] p-6 flex flex-col items-center gap-3 text-foreground/30">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-blue-500 animate-pulse" />
                  <span className="text-[13px]">Sonnet generiert Cypher-Queries...</span>
                </div>
                <div className="w-48 h-1 bg-foreground/[0.06] rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500/40 rounded-full animate-pulse" style={{ width: "60%" }} />
                </div>
              </div>
            )}

            {/* Query results */}
            {queryResponse && !querying && (
              <>
                {/* Reasoning */}
                <div className="lg-inset rounded-[14px] p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Zap className="h-3 w-3 text-blue-500" />
                    <span className="text-[11px] uppercase tracking-[0.04em] font-medium text-foreground/35">
                      Query-Strategie
                    </span>
                    <span className="text-[10px] text-foreground/20 ml-auto">
                      {queryResponse.timing.cypherGenerationMs}ms Cypher + {queryResponse.timing.queryExecutionMs}ms Neo4j
                    </span>
                  </div>
                  <p className="text-[12px] text-foreground/50 leading-relaxed">
                    {queryResponse.reasoning}
                  </p>
                </div>

                {/* Generated queries + data */}
                <div className="lg-inset rounded-[14px] overflow-hidden">
                  <div className="px-3 py-2 border-b border-foreground/[0.04] flex items-center gap-2">
                    <Database className="h-3.5 w-3.5 text-foreground/30" />
                    <span className="text-[11px] uppercase tracking-[0.04em] font-medium text-foreground/35">
                      Ergebnisse
                    </span>
                    <span className="text-[10px] bg-emerald-500/[0.08] text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full ml-auto">
                      {totalRows} Zeilen aus {queryResponse.queries.length} Queries
                    </span>
                  </div>

                  {queryResponse.queries.map((q, i) => {
                    const result = queryResponse.results[i];
                    const isExpanded = expandedQueries.has(i);

                    return (
                      <div key={i} className="border-b border-foreground/[0.03] last:border-0">
                        <button
                          onClick={() => toggleQuery(i)}
                          className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-foreground/[0.02] transition-colors"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3 w-3 text-foreground/25 flex-shrink-0" />
                          ) : (
                            <ChevronRight className="h-3 w-3 text-foreground/25 flex-shrink-0" />
                          )}
                          <span className="text-[13px] font-medium text-foreground/60 flex-1">
                            {q.label}
                          </span>
                          {q.error || result?.error ? (
                            <span className="text-[10px] bg-red-500/[0.08] text-red-500 px-2 py-0.5 rounded-full">
                              Fehler
                            </span>
                          ) : (
                            <span className="text-[10px] text-foreground/25">
                              {q.rowCount} Zeilen
                            </span>
                          )}
                        </button>

                        {isExpanded && (
                          <div className="px-3 pb-3">
                            {/* Cypher query */}
                            <pre className="text-[11px] font-mono bg-foreground/[0.03] rounded-[8px] p-2.5 mb-2 overflow-x-auto text-foreground/40 leading-relaxed">
                              {q.cypher}
                            </pre>

                            {/* Error */}
                            {(q.error || result?.error) && (
                              <div className="flex items-center gap-2 text-[12px] text-red-500 mb-2">
                                <AlertCircle className="h-3 w-3" />
                                {q.error || result?.error}
                              </div>
                            )}

                            {/* Data preview */}
                            {result && result.data.length > 0 && (
                              <div className="max-h-[200px] overflow-auto rounded-[8px] bg-foreground/[0.02]">
                                <table className="w-full text-[11px]">
                                  <thead>
                                    <tr>
                                      {Object.keys(result.data[0]).map((key) => (
                                        <th
                                          key={key}
                                          className="text-left px-2 py-1.5 text-foreground/30 font-medium border-b border-foreground/[0.04] sticky top-0 bg-foreground/[0.03]"
                                        >
                                          {key}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {result.data.map((row, ri) => (
                                      <tr key={ri} className="border-b border-foreground/[0.02]">
                                        {Object.values(row).map((val, vi) => (
                                          <td
                                            key={vi}
                                            className="px-2 py-1 text-foreground/50 max-w-[200px] truncate"
                                          >
                                            {val === null ? "—" : typeof val === "object" ? JSON.stringify(val) : String(val)}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Empty state */}
            {!queryResponse && !querying && (
              <div className="lg-inset rounded-[14px] p-8 flex flex-col items-center gap-3 text-foreground/20">
                <Database className="h-10 w-10" />
                <p className="text-[13px] text-center">
                  Stell eine Frage an den Graphen — Sonnet generiert die passenden Cypher-Queries automatisch
                </p>
              </div>
            )}
          </div>

          {/* RIGHT: Post editor */}
          <div className="flex flex-col gap-4">
            {/* Style selector */}
            <div className="lg-inset rounded-[14px] p-4">
              <label className="text-[11px] uppercase tracking-[0.04em] font-medium text-foreground/35 mb-2 block">
                Post-Stil
              </label>
              <div className="flex flex-wrap gap-1.5">
                {STYLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setStyle(opt.value)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
                      style === opt.value
                        ? "bg-blue-500/15 text-blue-500"
                        : "bg-foreground/[0.04] text-foreground/45 hover:text-foreground/60"
                    }`}
                  >
                    <opt.icon className="h-3 w-3" />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Generate button */}
            <button
              onClick={generatePost}
              disabled={!queryResponse || generating || totalRows === 0}
              className="apple-btn-blue w-full py-2.5 text-[14px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Haiku schreibt...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Post generieren
                </>
              )}
            </button>

            {/* Post editor */}
            <div className="lg-inset rounded-[14px] flex-1 flex flex-col overflow-hidden">
              <div className="px-3 py-2 border-b border-foreground/[0.04] flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-[0.04em] font-medium text-foreground/35">
                  Post
                </span>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-mono ${charCount > 3000 ? "text-red-500" : charCount > 1300 ? "text-amber-500" : "text-foreground/25"}`}>
                    {charCount.toLocaleString()} Zeichen
                  </span>
                  {post && (
                    <button
                      onClick={copyPost}
                      className="glass-capsule-btn px-2 py-0.5 text-[11px] inline-flex items-center gap-1"
                    >
                      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                      {copied ? "Kopiert" : "Kopieren"}
                    </button>
                  )}
                </div>
              </div>
              <textarea
                value={post}
                onChange={(e) => setPost(e.target.value)}
                placeholder="Hier erscheint dein LinkedIn-Post..."
                className="flex-1 w-full resize-none bg-transparent p-4 text-[14px] leading-relaxed text-foreground/70 placeholder:text-foreground/15 focus:outline-none min-h-[400px]"
              />
              {usage && (
                <div className="px-3 py-1.5 border-t border-foreground/[0.04] text-[10px] text-foreground/20">
                  Haiku: {usage.inputTokens} input + {usage.outputTokens} output tokens
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
