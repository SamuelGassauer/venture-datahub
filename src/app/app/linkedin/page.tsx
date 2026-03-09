"use client";

import { useState, useCallback } from "react";
import {
  Loader2,
  Copy,
  Check,
  RefreshCw,
  TrendingUp,
  Users,
  Building2,
  Globe,
  Sparkles,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Deal = {
  company: string;
  country: string;
  amountUsd: number;
  stage: string;
  date: string;
  investors: string[];
};

type Investor = { investor: string; deals: number; companies: string[] };
type StageStat = { stage: string; count: number; totalUsd: number };
type CountryStat = { country: string; deals: number; totalUsd: number };
type SectorStat = { sector: string; deals: number; totalUsd: number };

type Insights = {
  recentDeals: Deal[];
  topInvestors: Investor[];
  stageSummary: StageStat[];
  countrySummary: CountryStat[];
  sectorTrends: SectorStat[];
};

type PostStyle = "analysis" | "spotlight" | "roundup" | "general";

const STYLE_OPTIONS: { value: PostStyle; label: string; icon: typeof BarChart3 }[] = [
  { value: "roundup", label: "Wochen-Roundup", icon: TrendingUp },
  { value: "analysis", label: "Trend-Analyse", icon: BarChart3 },
  { value: "spotlight", label: "Deal-Spotlight", icon: Sparkles },
  { value: "general", label: "Frei", icon: Globe },
];

function fmtEur(usd: number): string {
  const eur = usd * 0.92;
  if (eur >= 1e9) return `${(eur / 1e9).toFixed(1).replace(".", ",")} Mrd. €`;
  if (eur >= 1e6) return `${(eur / 1e6).toFixed(1).replace(".", ",")} Mio. €`;
  if (eur >= 1e3) return `${(eur / 1e3).toFixed(0)} Tsd. €`;
  return `${Math.round(eur)} €`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LinkedInPage() {
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [post, setPost] = useState("");
  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState<PostStyle>("roundup");
  const [copied, setCopied] = useState(false);
  const [selectedDeals, setSelectedDeals] = useState<Set<number>>(new Set());
  const [usage, setUsage] = useState<{ inputTokens: number; outputTokens: number } | null>(null);

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/linkedin/insights");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setInsights(data);
    } catch {
      toast.error("Fehler beim Laden der Insights");
    } finally {
      setLoading(false);
    }
  }, []);

  const generatePost = useCallback(async () => {
    if (!insights) return;
    setGenerating(true);
    setUsage(null);
    try {
      // Build context from selected data
      const selectedDealData = selectedDeals.size > 0
        ? insights.recentDeals.filter((_, i) => selectedDeals.has(i))
        : insights.recentDeals.slice(0, 5);

      const data = {
        deals: selectedDealData,
        topInvestors: insights.topInvestors.slice(0, 5),
        stageSummary: insights.stageSummary,
        countrySummary: insights.countrySummary.slice(0, 5),
        sectorTrends: insights.sectorTrends.slice(0, 5),
      };

      const res = await fetch("/api/linkedin/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic || "Aktuelle Deals und Trends im europaeischen Startup-Oekosystem",
          data,
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
  }, [insights, selectedDeals, topic, style]);

  const copyPost = () => {
    navigator.clipboard.writeText(post);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleDeal = (index: number) => {
    setSelectedDeals((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const charCount = post.length;

  return (
    <>
      {/* Header */}
      <div className="glass-status-bar px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-foreground/40" />
          <span className="text-[13px] font-semibold tracking-[-0.01em] text-foreground/70">
            LinkedIn Post Generator
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchInsights}
            disabled={loading}
            className="glass-capsule-btn px-3 py-1 text-[12px] inline-flex items-center gap-1.5"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            {insights ? "Aktualisieren" : "Daten laden"}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-7xl mx-auto">
          {/* LEFT: Insights */}
          <div className="flex flex-col gap-4">
            {/* Style selector + Topic */}
            <div className="lg-inset rounded-[14px] p-4">
              <label className="text-[11px] uppercase tracking-[0.04em] font-medium text-foreground/35 mb-2 block">
                Post-Stil
              </label>
              <div className="flex flex-wrap gap-1.5 mb-3">
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
              <label className="text-[11px] uppercase tracking-[0.04em] font-medium text-foreground/35 mb-1.5 block">
                Thema / Fokus (optional)
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="z.B. Fintech-Deals in DACH, Seed-Runden Q1, ..."
                className="glass-search-input w-full px-3 py-2 text-[13px]"
              />
            </div>

            {/* No data loaded yet */}
            {!insights && !loading && (
              <div className="lg-inset rounded-[14px] p-8 flex flex-col items-center gap-3 text-foreground/20">
                <BarChart3 className="h-10 w-10" />
                <p className="text-[13px]">Klicke &quot;Daten laden&quot; um aktuelle Insights aus der Datenbank zu holen</p>
              </div>
            )}

            {loading && (
              <div className="lg-inset rounded-[14px] p-8 flex items-center justify-center gap-2 text-foreground/30">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-[13px]">Lade Insights aus Neo4j...</span>
              </div>
            )}

            {/* Recent Deals */}
            {insights && (
              <>
                <div className="lg-inset rounded-[14px] overflow-hidden">
                  <div className="px-3 py-2 border-b border-foreground/[0.04] flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-foreground/30" />
                    <span className="text-[11px] uppercase tracking-[0.04em] font-medium text-foreground/35">
                      Top Deals (letzte 30 Tage)
                    </span>
                    {selectedDeals.size > 0 && (
                      <span className="text-[10px] bg-blue-500/15 text-blue-500 px-2 py-0.5 rounded-full ml-auto">
                        {selectedDeals.size} ausgewählt
                      </span>
                    )}
                  </div>
                  <div className="max-h-[300px] overflow-auto">
                    {insights.recentDeals.map((deal, i) => (
                      <button
                        key={i}
                        onClick={() => toggleDeal(i)}
                        className={`w-full text-left px-3 py-2 border-b border-foreground/[0.03] flex items-center gap-3 transition-colors ${
                          selectedDeals.has(i) ? "bg-blue-500/[0.06]" : "hover:bg-foreground/[0.02]"
                        }`}
                      >
                        <div className={`h-2 w-2 rounded-full flex-shrink-0 ${selectedDeals.has(i) ? "bg-blue-500" : "bg-foreground/10"}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold text-foreground/70 truncate">{deal.company}</span>
                            <span className="text-[11px] text-foreground/30">{deal.country}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {deal.amountUsd > 0 && (
                              <span className="text-[11px] font-medium text-emerald-500">{fmtEur(deal.amountUsd)}</span>
                            )}
                            {deal.stage && (
                              <span className="text-[10px] bg-foreground/[0.04] text-foreground/40 px-1.5 py-0.5 rounded">{deal.stage}</span>
                            )}
                            {deal.investors.length > 0 && (
                              <span className="text-[10px] text-foreground/25 truncate">{deal.investors.join(", ")}</span>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                    {insights.recentDeals.length === 0 && (
                      <p className="px-3 py-4 text-[12px] text-foreground/25 text-center">Keine Deals in den letzten 30 Tagen</p>
                    )}
                  </div>
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Top Investors */}
                  <div className="lg-inset rounded-[14px] overflow-hidden">
                    <div className="px-3 py-2 border-b border-foreground/[0.04] flex items-center gap-2">
                      <Users className="h-3.5 w-3.5 text-foreground/30" />
                      <span className="text-[11px] uppercase tracking-[0.04em] font-medium text-foreground/35">
                        Aktivste Investoren
                      </span>
                    </div>
                    <div className="max-h-[200px] overflow-auto">
                      {insights.topInvestors.map((inv, i) => (
                        <div key={i} className="px-3 py-1.5 border-b border-foreground/[0.03] flex items-center justify-between">
                          <span className="text-[12px] text-foreground/55 truncate">{inv.investor}</span>
                          <span className="text-[11px] font-medium text-foreground/35 flex-shrink-0">{inv.deals} Deals</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Sector Trends */}
                  <div className="lg-inset rounded-[14px] overflow-hidden">
                    <div className="px-3 py-2 border-b border-foreground/[0.04] flex items-center gap-2">
                      <TrendingUp className="h-3.5 w-3.5 text-foreground/30" />
                      <span className="text-[11px] uppercase tracking-[0.04em] font-medium text-foreground/35">
                        Sektor-Trends
                      </span>
                    </div>
                    <div className="max-h-[200px] overflow-auto">
                      {insights.sectorTrends.map((s, i) => (
                        <div key={i} className="px-3 py-1.5 border-b border-foreground/[0.03] flex items-center justify-between">
                          <span className="text-[12px] text-foreground/55 truncate">{s.sector}</span>
                          <span className="text-[11px] font-medium text-foreground/35 flex-shrink-0">{fmtEur(s.totalUsd)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* RIGHT: Post editor */}
          <div className="flex flex-col gap-4">
            {/* Generate button */}
            <button
              onClick={generatePost}
              disabled={!insights || generating}
              className="apple-btn-blue w-full py-2.5 text-[14px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generiert mit Haiku...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  LinkedIn-Post generieren
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
