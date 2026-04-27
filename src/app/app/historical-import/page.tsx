"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, Search, ExternalLink, CheckCircle, XCircle, RefreshCw, Database, Scan, ArrowUpToLine } from "lucide-react";
import { toast } from "sonner";

type HistoricalUrl = {
  id: string;
  url: string;
  source: string;
  lastmod: string | null;
  matchedKeywords: string[];
  status: string;
  title: string | null;
  content: string | null;
  errorMessage: string | null;
  crawlBatch: string | null;
  createdAt: string;
};

type CrawlSourceResult = {
  source: string;
  totalUrls: number;
  filteredUrls: number;
  newUrls: number;
  skippedDuplicates: number;
  error?: string;
  durationMs: number;
};

type CrawlResponse = {
  crawlBatch: string;
  summary: {
    sourcesScanned: number;
    sourcesWithErrors: number;
    totalArticlesFound: number;
    afterDateFilter: number;
    newUrlsSaved: number;
    duplicatesSkipped: number;
  };
  results: CrawlSourceResult[];
};

type UrlsResponse = {
  urls: HistoricalUrl[];
  total: number;
  page: number;
  totalPages: number;
  statusCounts: Record<string, number>;
  sourceCounts: Record<string, number>;
};

const EU_SOURCES = [
  "EU-Startups", "Silicon Canals", "Tech Funding News", "FINSIDER",
  "Deutsche Startups", "Trending Topics", "The Recursive", "Novobrief",
  "ArcticStartup", "UKTN", "Tech.eu", "Berlin Valley",
  "Brutkasten", "Sprout", "Emerce", "EconomyUp",
  "CzechCrunch", "Moneycab", "Link to Leaders",
];

const WAYBACK_SOURCES = [
  "Sifted", "FinSMEs", "Berlin Valley", "Startupticker.ch",
  "TechCrunch", "EU-Startups", "Tech.eu",
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  discovered: { label: "Entdeckt", color: "bg-blue-500/8 text-blue-600 dark:text-blue-400" },
  scraped: { label: "Gescrapt", color: "bg-amber-500/8 text-amber-600" },
  processed: { label: "Verarbeitet", color: "bg-purple-500/8 text-purple-600" },
  imported: { label: "Importiert", color: "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400" },
  skipped: { label: "Uebersprungen", color: "bg-foreground/[0.04] text-foreground/45" },
  error: { label: "Fehler", color: "bg-red-500/8 text-red-500" },
};

export default function HistoricalImportPage() {
  const [crawling, setCrawling] = useState(false);
  const [crawlResult, setCrawlResult] = useState<CrawlResponse | null>(null);
  const [minDate, setMinDate] = useState("2024-01-01");
  const [crawlMode, setCrawlMode] = useState<"sitemap" | "wayback">("sitemap");
  const [selectedSources, setSelectedSources] = useState<string[]>(EU_SOURCES);
  const [selectedWaybackSources, setSelectedWaybackSources] = useState<string[]>(WAYBACK_SOURCES);

  const activeSourceList = crawlMode === "sitemap" ? EU_SOURCES : WAYBACK_SOURCES;
  const activeSelected = crawlMode === "sitemap" ? selectedSources : selectedWaybackSources;
  const setActiveSelected = crawlMode === "sitemap" ? setSelectedSources : setSelectedWaybackSources;

  // DB state
  const [urlsData, setUrlsData] = useState<UrlsResponse | null>(null);
  const [loadingUrls, setLoadingUrls] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterSource, setFilterSource] = useState<string>("");
  const [filterSearch, setFilterSearch] = useState<string>("");
  const [filterMinDate, setFilterMinDate] = useState<string>("");
  const [filterMaxDate, setFilterMaxDate] = useState<string>("");
  const [page, setPage] = useState(1);
  const [scrapingId, setScrapingId] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [lastScrapeResult, setLastScrapeResult] = useState<Record<string, unknown> | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0, success: 0, skipped: 0, errors: 0 });

  const loadUrls = useCallback(async () => {
    setLoadingUrls(true);
    const params = new URLSearchParams();
    if (filterStatus) params.set("status", filterStatus);
    if (filterSource) params.set("source", filterSource);
    if (filterSearch) params.set("search", filterSearch);
    if (filterMinDate) params.set("minDate", filterMinDate);
    if (filterMaxDate) params.set("maxDate", filterMaxDate);
    params.set("page", String(page));
    params.set("limit", "50");

    const res = await fetch(`/api/historical-import/urls?${params}`);
    if (res.ok) {
      setUrlsData(await res.json());
    }
    setLoadingUrls(false);
  }, [filterStatus, filterSource, filterSearch, filterMinDate, filterMaxDate, page]);

  useEffect(() => {
    loadUrls();
  }, [loadUrls]);

  async function handleCrawl() {
    setCrawling(true);
    setCrawlResult(null);
    try {
      const endpoint =
        crawlMode === "sitemap" ? "/api/historical-import/crawl" : "/api/historical-import/wayback";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minDate, sources: activeSelected }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Crawl fehlgeschlagen");
        return;
      }
      setCrawlResult(data);
      toast.success(`${data.summary.newUrlsSaved} neue URLs gespeichert`);
      loadUrls();
    } catch {
      toast.error("Crawl fehlgeschlagen");
    } finally {
      setCrawling(false);
    }
  }

  function toggleSource(name: string) {
    setActiveSelected((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]
    );
  }

  function toggleAll() {
    setActiveSelected((prev) =>
      prev.length === activeSourceList.length ? [] : [...activeSourceList]
    );
  }

  function downloadCsv() {
    if (!urlsData) return;
    // Fetch all URLs (not just current page) for export
    const params = new URLSearchParams();
    if (filterStatus) params.set("status", filterStatus);
    if (filterSource) params.set("source", filterSource);
    if (filterSearch) params.set("search", filterSearch);
    params.set("limit", "10000");
    params.set("page", "1");

    fetch(`/api/historical-import/urls?${params}`)
      .then((r) => r.json())
      .then((data: UrlsResponse) => {
        const header = "url,lastmod,source,status,keywords\n";
        const rows = data.urls
          .map((u) => `"${u.url}","${u.lastmod || ""}","${u.source}","${u.status}","${u.matchedKeywords.join(";")}"`)
          .join("\n");
        const blob = new Blob([header + rows], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `historical-urls-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  async function handleScrapeHead(id: string) {
    setScrapingId(id);
    setLastScrapeResult(null);
    try {
      const res = await fetch("/api/historical-import/scrape-head", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      setLastScrapeResult(data);
      if (data.extraction) {
        toast.success(`${data.extraction.companyName || "?"} — ${data.extraction.stage || "?"} — Confidence: ${(data.extraction.confidence * 100).toFixed(0)}%`);
      } else if (data.status === "skipped") {
        toast(`Kein Funding erkannt: "${data.title?.slice(0, 60) || "?"}"`);
      } else {
        toast.error(data.error || "Fehler");
      }
      loadUrls();
    } catch {
      toast.error("Scrape fehlgeschlagen");
    } finally {
      setScrapingId(null);
    }
  }

  async function handleImport(id: string) {
    setImportingId(id);
    setLastScrapeResult(null);
    try {
      const res = await fetch("/api/historical-import/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      setLastScrapeResult(data);
      if (data.duplicateOfId) {
        toast(`Duplikat erkannt — Runde existiert bereits`);
      } else if (data.fundingCreated) {
        toast.success(`Funding importiert: "${data.title?.slice(0, 50)}"`);
      } else if (data.fundEventCreated) {
        toast.success(`Fund Event importiert: "${data.title?.slice(0, 50)}"`);
      } else if (data.status === "imported" && data.message) {
        toast(`Artikel existierte bereits`);
      } else if (data.status === "skipped") {
        toast(`Kein Funding erkannt: "${data.title?.slice(0, 50)}"`);
      } else {
        toast.error(data.error || "Fehler beim Import");
      }
      loadUrls();
    } catch {
      toast.error("Import fehlgeschlagen");
    } finally {
      setImportingId(null);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!urlsData) return;
    const pageIds = urlsData.urls.map((u) => u.id);
    setSelectedIds((prev) => {
      const allSelected = pageIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  const selectedUrls = urlsData?.urls.filter((u) => selectedIds.has(u.id)) || [];
  const selectedDiscovered = selectedUrls.filter((u) => u.status === "discovered");
  const selectedProcessed = selectedUrls.filter((u) => u.status === "processed");

  async function handleBatchScan() {
    const ids = selectedDiscovered.map((u) => u.id);
    if (ids.length === 0) return;
    setBatchRunning(true);
    setBatchProgress({ done: 0, total: ids.length, success: 0, skipped: 0, errors: 0 });

    let success = 0, skipped = 0, errors = 0;
    for (const id of ids) {
      try {
        const res = await fetch("/api/historical-import/scrape-head", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        const data = await res.json();
        if (data.status === "processed" || data.extraction) success++;
        else if (data.status === "skipped") skipped++;
        else errors++;
      } catch {
        errors++;
      }
      setBatchProgress({ done: success + skipped + errors, total: ids.length, success, skipped, errors });
    }

    toast.success(`Batch-Scan: ${success} Funding, ${skipped} uebersprungen, ${errors} Fehler`);
    setSelectedIds(new Set());
    setBatchRunning(false);
    loadUrls();
  }

  async function handleBatchImport() {
    const ids = selectedProcessed.map((u) => u.id);
    if (ids.length === 0) return;
    setBatchRunning(true);
    setBatchProgress({ done: 0, total: ids.length, success: 0, skipped: 0, errors: 0 });

    let success = 0, skipped = 0, errors = 0;
    for (const id of ids) {
      try {
        const res = await fetch("/api/historical-import/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        const data = await res.json();
        if (data.fundingCreated || data.fundEventCreated) success++;
        else if (data.status === "skipped" || data.status === "imported") skipped++;
        else errors++;
      } catch {
        errors++;
      }
      setBatchProgress({ done: success + skipped + errors, total: ids.length, success, skipped, errors });
    }

    toast.success(`Batch-Import: ${success} importiert, ${skipped} uebersprungen, ${errors} Fehler`);
    setSelectedIds(new Set());
    setBatchRunning(false);
    loadUrls();
  }

  const totalUrls = urlsData ? Object.values(urlsData.statusCounts).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="glass-status-bar px-4 py-2.5 flex items-center justify-between">
        <div>
          <h1 className="text-[17px] tracking-[-0.02em] font-semibold text-foreground/85">
            Historischer Import
          </h1>
          <p className="text-[12px] tracking-[-0.01em] text-foreground/45">
            EU-Funding-Artikel via Sitemap-Crawling entdecken
          </p>
        </div>
        <div className="flex items-center gap-2">
          {totalUrls > 0 && (
            <button onClick={downloadCsv} className="glass-capsule-btn px-3 py-1.5 text-[13px] flex items-center gap-1.5">
              <Download className="h-3.5 w-3.5" />
              CSV
            </button>
          )}
          <button
            onClick={handleCrawl}
            disabled={crawling || activeSelected.length === 0}
            className="apple-btn-blue px-4 py-1.5 text-[13px] font-semibold flex items-center gap-1.5"
          >
            {crawling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            {crawling
              ? "Crawlt..."
              : crawlMode === "sitemap"
              ? "Sitemaps crawlen"
              : "Wayback crawlen"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Crawl Config */}
        <div className="lg-inset rounded-[16px] p-4 space-y-4">
          <div className="flex items-center gap-4">
            <div className="space-y-1">
              <label className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
                Ab Datum
              </label>
              <input
                type="date"
                value={minDate}
                onChange={(e) => setMinDate(e.target.value)}
                className="glass-search-input px-3 py-1.5 text-[13px]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
                Modus
              </label>
              <div className="flex gap-1">
                <button
                  onClick={() => setCrawlMode("sitemap")}
                  className={`px-3 py-1.5 rounded-[10px] text-[12px] font-medium transition-colors ${
                    crawlMode === "sitemap"
                      ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                      : "bg-foreground/[0.04] text-foreground/45"
                  }`}
                >
                  Sitemap
                </button>
                <button
                  onClick={() => setCrawlMode("wayback")}
                  className={`px-3 py-1.5 rounded-[10px] text-[12px] font-medium transition-colors ${
                    crawlMode === "wayback"
                      ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                      : "bg-foreground/[0.04] text-foreground/45"
                  }`}
                >
                  Wayback
                </button>
              </div>
            </div>
            <div className="space-y-1 flex-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
                  Quellen ({activeSelected.length}/{activeSourceList.length})
                </label>
                <button onClick={toggleAll} className="text-[11px] text-foreground/45 hover:text-foreground/70">
                  {activeSelected.length === activeSourceList.length ? "Keine" : "Alle"}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {activeSourceList.map((name) => (
                  <button
                    key={name}
                    onClick={() => toggleSource(name)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                      activeSelected.includes(name)
                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        : "bg-foreground/[0.04] text-foreground/40"
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Crawl Results (after crawl) */}
        {crawlResult && (
          <div className="lg-inset rounded-[16px]">
            <div className="px-4 py-2.5 flex items-center justify-between border-b border-foreground/[0.04]">
              <span className="text-[13px] font-semibold text-foreground/85">Letzter Crawl</span>
              <span className="text-[11px] text-foreground/40">{crawlResult.crawlBatch}</span>
            </div>
            <div className="grid grid-cols-6 gap-2 p-3">
              {[
                { label: "Quellen", value: crawlResult.summary.sourcesScanned },
                { label: "Fehler", value: crawlResult.summary.sourcesWithErrors },
                { label: "Alle Artikel", value: crawlResult.summary.totalArticlesFound.toLocaleString("de-DE") },
                { label: "Ab Datum", value: crawlResult.summary.afterDateFilter.toLocaleString("de-DE") },
                { label: "Neue URLs", value: crawlResult.summary.newUrlsSaved.toLocaleString("de-DE") },
                { label: "Duplikate", value: crawlResult.summary.duplicatesSkipped.toLocaleString("de-DE") },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="text-[17px] tracking-[-0.02em] font-bold text-foreground/85">{stat.value}</div>
                  <div className="text-[10px] tracking-[0.04em] uppercase font-medium text-foreground/35">{stat.label}</div>
                </div>
              ))}
            </div>
            {/* Source breakdown */}
            <div className="px-4 pb-3">
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-2 py-1.5 border-b border-foreground/[0.04]">
                <span className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Quelle</span>
                <span className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Gesamt</span>
                <span className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Ab Datum</span>
                <span className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Neu</span>
                <span className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Duplikate</span>
                <span className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Status</span>
              </div>
              {crawlResult.results.map((r) => (
                <div key={r.source} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-2 py-2 border-b border-foreground/[0.02]">
                  <span className="text-[13px] font-semibold text-foreground/85">{r.source}</span>
                  <span className="text-[13px] text-foreground/55">{r.totalUrls.toLocaleString("de-DE")}</span>
                  <span className="text-[13px] text-foreground/55">{r.filteredUrls.toLocaleString("de-DE")}</span>
                  <span className="text-[13px] font-semibold text-foreground/85">{r.newUrls.toLocaleString("de-DE")}</span>
                  <span className="text-[13px] text-foreground/40">{r.skippedDuplicates.toLocaleString("de-DE")}</span>
                  <span className="flex items-center gap-1.5">
                    {r.error ? (
                      <>
                        <XCircle className="h-3.5 w-3.5 text-red-500" />
                        <span className="text-[11px] text-red-500 truncate" title={r.error}>{r.error}</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="text-[11px] text-foreground/40">{(r.durationMs / 1000).toFixed(1)}s</span>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DB Overview */}
        <div className="flex items-center gap-3">
          <Database className="h-4 w-4 text-foreground/40" />
          <span className="text-[15px] tracking-[-0.02em] font-semibold text-foreground/85">
            Gespeicherte URLs
          </span>
          <span className="text-[13px] text-foreground/45">
            {totalUrls.toLocaleString("de-DE")} gesamt
          </span>
          <button onClick={loadUrls} className="ml-auto glass-capsule-btn px-2 py-1 text-[11px] flex items-center gap-1">
            <RefreshCw className={`h-3 w-3 ${loadingUrls ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Status Tabs */}
        {urlsData && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => { setFilterStatus(""); setPage(1); }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                !filterStatus ? "bg-foreground/[0.08] text-foreground/85" : "bg-foreground/[0.03] text-foreground/40"
              }`}
            >
              Alle ({totalUrls.toLocaleString("de-DE")})
            </button>
            {Object.entries(urlsData.statusCounts).map(([status, count]) => {
              const info = STATUS_LABELS[status] || { label: status, color: "bg-foreground/[0.04] text-foreground/45" };
              return (
                <button
                  key={status}
                  onClick={() => { setFilterStatus(status); setPage(1); }}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                    filterStatus === status ? info.color : "bg-foreground/[0.03] text-foreground/40"
                  }`}
                >
                  {info.label} ({count.toLocaleString("de-DE")})
                </button>
              );
            })}
          </div>
        )}

        {/* Source + Date + Search Filter */}
        <div className="flex items-center gap-2">
          <select
            value={filterSource}
            onChange={(e) => { setFilterSource(e.target.value); setPage(1); }}
            className="glass-search-input px-3 py-1.5 text-[13px]"
          >
            <option value="">Alle Quellen</option>
            {urlsData && Object.entries(urlsData.sourceCounts)
              .sort(([, a], [, b]) => b - a)
              .map(([source, count]) => (
                <option key={source} value={source}>{source} ({count})</option>
              ))}
          </select>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-foreground/35">Von</span>
            <input
              type="date"
              value={filterMinDate}
              onChange={(e) => { setFilterMinDate(e.target.value); setPage(1); }}
              className="glass-search-input px-2 py-1.5 text-[13px]"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-foreground/35">Bis</span>
            <input
              type="date"
              value={filterMaxDate}
              onChange={(e) => { setFilterMaxDate(e.target.value); setPage(1); }}
              className="glass-search-input px-2 py-1.5 text-[13px]"
            />
          </div>
          <input
            type="text"
            placeholder="URL suchen..."
            value={filterSearch}
            onChange={(e) => { setFilterSearch(e.target.value); setPage(1); }}
            className="glass-search-input px-3 py-1.5 text-[13px] flex-1"
          />
        </div>

        {/* Scrape Result Detail */}
        {lastScrapeResult && (
          <div className="lg-inset rounded-[14px] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Letztes Scrape-Ergebnis</span>
              <button onClick={() => setLastScrapeResult(null)} className="text-[11px] text-foreground/40 hover:text-foreground/70">Schliessen</button>
            </div>
            <pre className="text-[12px] text-foreground/55 whitespace-pre-wrap overflow-auto max-h-48 bg-foreground/[0.02] rounded-[8px] p-2">
              {JSON.stringify(lastScrapeResult, null, 2)}
            </pre>
          </div>
        )}

        {/* Batch Action Bar */}
        {selectedIds.size > 0 && (
          <div className="glass-status-bar rounded-[14px] px-4 py-2.5 flex items-center gap-3">
            <span className="text-[13px] font-semibold text-foreground/85">
              {selectedIds.size} ausgewaehlt
            </span>
            {selectedDiscovered.length > 0 && (
              <button
                onClick={handleBatchScan}
                disabled={batchRunning}
                className="glass-capsule-btn px-3 py-1.5 text-[12px] flex items-center gap-1.5 disabled:opacity-30"
              >
                {batchRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Scan className="h-3 w-3" />}
                {selectedDiscovered.length} scannen
              </button>
            )}
            {selectedProcessed.length > 0 && (
              <button
                onClick={handleBatchImport}
                disabled={batchRunning}
                className="apple-btn-blue px-3 py-1.5 text-[12px] font-semibold flex items-center gap-1.5 disabled:opacity-30"
              >
                {batchRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowUpToLine className="h-3 w-3" />}
                {selectedProcessed.length} importieren
              </button>
            )}
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-[12px] text-foreground/40 hover:text-foreground/70 ml-auto"
            >
              Auswahl aufheben
            </button>
            {batchRunning && (
              <div className="flex items-center gap-2 ml-2">
                <div className="w-32 h-1.5 rounded-full bg-foreground/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                    style={{ width: `${batchProgress.total ? (batchProgress.done / batchProgress.total) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-[11px] text-foreground/45">
                  {batchProgress.done}/{batchProgress.total}
                </span>
              </div>
            )}
          </div>
        )}

        {/* URL Table */}
        {urlsData && urlsData.urls.length > 0 && (
          <div className="lg-inset rounded-[16px]">
            <div className="glass-table-header px-4 py-2 grid grid-cols-[auto_2.5fr_2fr_0.8fr_1fr_0.8fr_0.5fr] gap-2 items-center">
              <input
                type="checkbox"
                checked={urlsData.urls.length > 0 && urlsData.urls.every((u) => selectedIds.has(u.id))}
                onChange={toggleSelectAll}
                className="h-3.5 w-3.5 rounded accent-blue-500"
              />
              <span className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">URL</span>
              <span className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Titel</span>
              <span className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Datum</span>
              <span className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Quelle</span>
              <span className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Status</span>
              <span className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35"></span>
            </div>
            {urlsData.urls.map((u) => {
              const statusInfo = STATUS_LABELS[u.status] || { label: u.status, color: "" };
              const isScraping = scrapingId === u.id;
              return (
                <div key={u.id} className="lg-inset-table-row px-4 py-2 grid grid-cols-[auto_2.5fr_2fr_0.8fr_1fr_0.8fr_0.5fr] gap-2 items-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(u.id)}
                    onChange={() => toggleSelect(u.id)}
                    className="h-3.5 w-3.5 rounded accent-blue-500"
                  />
                  <a
                    href={u.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] text-blue-600 dark:text-blue-400 hover:underline truncate flex items-center gap-1"
                  >
                    <span className="truncate">{u.url.replace(/^https?:\/\/(www\.)?/, "")}</span>
                    <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-40" />
                  </a>
                  <span className="text-[12px] text-foreground/55 truncate" title={u.title || ""}>
                    {u.title || "–"}
                  </span>
                  <span className="text-[12px] text-foreground/45">
                    {u.lastmod ? new Date(u.lastmod).toLocaleDateString("de-DE") : "–"}
                  </span>
                  <span className="text-[12px] text-foreground/55">{u.source}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium w-fit ${statusInfo.color}`}>
                    {statusInfo.label}
                  </span>
                  <div className="flex items-center gap-1">
                    {u.status === "discovered" && (
                      <button
                        onClick={() => handleScrapeHead(u.id)}
                        disabled={isScraping || batchRunning}
                        className="glass-capsule-btn px-2 py-1 text-[11px] flex items-center gap-1 disabled:opacity-30"
                        title="Head scrapen + Funding pruefen"
                      >
                        {isScraping ? <Loader2 className="h-3 w-3 animate-spin" /> : <Scan className="h-3 w-3" />}
                      </button>
                    )}
                    {u.status === "processed" && (
                      <button
                        onClick={() => handleImport(u.id)}
                        disabled={importingId === u.id || batchRunning}
                        className="apple-btn-blue px-2 py-1 text-[11px] flex items-center gap-1 disabled:opacity-30"
                        title="Full-Scrape + Import"
                      >
                        {importingId === u.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowUpToLine className="h-3 w-3" />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {urlsData && urlsData.totalPages > 1 && (
          <div className="glass-status-bar px-4 py-2 flex items-center justify-between rounded-[14px]">
            <span className="text-[12px] text-foreground/40">
              Seite {urlsData.page} von {urlsData.totalPages} ({urlsData.total.toLocaleString("de-DE")} URLs)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="glass-capsule-btn px-3 py-1 text-[12px] disabled:opacity-30"
              >
                Zurueck
              </button>
              <button
                disabled={page >= urlsData.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="glass-capsule-btn px-3 py-1 text-[12px] disabled:opacity-30"
              >
                Weiter
              </button>
            </div>
          </div>
        )}

        {/* Empty / Loading States */}
        {loadingUrls && !urlsData && (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-8 w-8 text-foreground/20 animate-spin" />
          </div>
        )}

        {!loadingUrls && totalUrls === 0 && !crawling && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="h-12 w-12 text-foreground/15 mb-4" />
            <p className="text-[15px] font-semibold text-foreground/55">
              Noch keine historischen URLs
            </p>
            <p className="text-[13px] text-foreground/40 mt-1">
              Waehle Quellen und Zeitraum, dann starte den Crawl
            </p>
          </div>
        )}

        {crawling && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Loader2 className="h-10 w-10 text-foreground/30 animate-spin mb-4" />
            <p className="text-[15px] font-semibold text-foreground/55">
              Crawle {selectedSources.length} Sitemaps...
            </p>
            <p className="text-[13px] text-foreground/40 mt-1">
              Das kann 1-2 Minuten dauern
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
