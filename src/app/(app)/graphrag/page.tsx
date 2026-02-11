"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Database,
  FileSpreadsheet,
  Merge,
  BrainCircuit,
  RefreshCw,
  CircleDollarSign,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Layers,
  Zap,
  Server,
  Play,
  Loader2,
  Search,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

type SyncResult = {
  companies: number;
  investors: number;
  fundingRounds: number;
  articles: number;
  locations: number;
  edges: number;
  durationMs: number;
};

type QueryResult = {
  records: Record<string, unknown>[];
  count: number;
};

// ============================================================================
// DATA
// ============================================================================

type Step = {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  color: string;
  effort: "5 min" | "30 min" | "1-2h" | "2-4h" | "ongoing";
  cost: string;
  status: "recommended" | "optional" | "later";
  sections: {
    heading?: string;
    content: string;
    type?: "info" | "tip" | "warning";
  }[];
};

const STEPS: Step[] = [
  {
    id: "graph-db",
    number: 1,
    title: "Neo4j AuraDB Free aufsetzen",
    subtitle: "Gehostete Graph-DB, 200k Nodes / 400k Edges kostenlos",
    icon: Database,
    color: "bg-blue-500",
    effort: "5 min",
    cost: "$0",
    status: "recommended",
    sections: [
      {
        content: "Neo4j AuraDB Free Tier: Registrieren auf console.neo4j.io, neue Instanz erstellen, Connection-URI + Credentials speichern. Fertig.",
      },
      {
        heading: "Warum Neo4j?",
        content: "Cypher als Query-Sprache (de-facto Standard), bester Tooling-Support, kostenloser Free Tier reicht für euren Datenbestand, Browser-UI zum Explorieren.",
      },
      {
        heading: "Alternativen",
        content: "Neo4j Community Edition lokal im Docker (kostenlos, unbegrenzt, self-hosted) • Apache AGE als PostgreSQL-Extension (euer bestehender Postgres, aber eingeschränkter Cypher-Support) • Memgraph Free (in-memory, schnell, RAM-limitiert).",
      },
      {
        type: "tip",
        content: "Start mit AuraDB Free, bei Bedarf auf Community Edition im Docker wechseln — der Cypher-Code bleibt identisch.",
      },
    ],
  },
  {
    id: "csv-export",
    number: 2,
    title: "CSV-Export aus PostgreSQL",
    subtitle: "Bestehende FundingRounds, Companies, Investors als CSV exportieren",
    icon: FileSpreadsheet,
    color: "bg-emerald-500",
    effort: "30 min",
    cost: "$0",
    status: "recommended",
    sections: [
      {
        content: "5 SQL-Queries → 5 CSV-Dateien. Alles was ihr braucht liegt schon in der funding_rounds + articles Tabelle.",
      },
      {
        heading: "Welche CSVs?",
        content: "companies.csv — SELECT DISTINCT company_name, country FROM funding_rounds → Normalisierung (lowercase, Rechtsform-Strip) • rounds.csv — Gruppierte Runden (wie /api/funding/grouped es schon macht) • investors.csv — SELECT UNNEST(investors) FROM funding_rounds → Deduplizierung • locations.csv — SELECT DISTINCT country FROM funding_rounds • articles.csv — Alle Artikel die eine FundingRound haben",
      },
      {
        type: "info",
        content: "pg_dump oder COPY TO ist am einfachsten. Alternativ ein kleines Script das die Grouped-API abfragt und als CSV schreibt.",
      },
    ],
  },
  {
    id: "load-csv",
    number: 3,
    title: "LOAD CSV in Neo4j",
    subtitle: "CSV-Import per Cypher — Nodes + Edges in einem Rutsch",
    icon: Layers,
    color: "bg-violet-500",
    effort: "1-2h",
    cost: "$0",
    status: "recommended",
    sections: [
      {
        heading: "Phase A: Nodes erzeugen",
        content: "MERGE ist idempotent — existierende Nodes werden nicht dupliziert. Reihenfolge: 1) Location-Nodes 2) Company-Nodes 3) Investor-Nodes 4) FundingRound-Nodes 5) Article-Nodes",
      },
      {
        heading: "Phase B: Edges erzeugen",
        content: "(Company)-[:RAISED]->(FundingRound) — Jede Runde gehört zu einem Unternehmen • (InvestorOrg)-[:PARTICIPATED_IN {role}]->(FundingRound) — Für jeden Investor pro Runde, mit role: lead/participant • (Company)-[:HQ_IN]->(Location) — Country-Zuordnung • (FundingRound)-[:SOURCED_FROM]->(Article) — Provenienz-Link",
      },
      {
        type: "tip",
        content: "Startet nur mit Company, FundingRound, Investor, Location, Article — die 5 Core-Nodes. Die restlichen 12 Node-Typen aus der Ontologie (FundManager, LP, BoardSeat, IPO, ...) kommen später durch Enrichment.",
      },
      {
        heading: "Neo4j Browser",
        content: "Nach dem Import: In der Neo4j Browser-UI rumspielen, Cypher-Queries testen, Datenqualität prüfen. Erst wenn die Daten sauber aussehen weitermachen.",
      },
    ],
  },
  {
    id: "entity-resolution",
    number: 4,
    title: "Entity Resolution",
    subtitle: "Duplikate erkennen und mergen — das Schwierigste am ganzen Prozess",
    icon: Merge,
    color: "bg-amber-500",
    effort: "2-4h",
    cost: "$0",
    status: "recommended",
    sections: [
      {
        content: "Das Hauptproblem: \"Accel\" in einem Artikel = \"Accel Partners\" in einem anderen = \"Accel Europe\" in einem dritten. Gleiches für Companies: \"N26\" = \"N26 GmbH\" = \"Number26\".",
      },
      {
        heading: "Schritt 1: Normalisierung beim Import",
        content: "Lowercase, Suffixe strippen (Partners, Ventures, Capital, GmbH, Ltd, Inc, SAS, ...), Sonderzeichen entfernen. Das allein löst ~60% der Duplikate.",
      },
      {
        heading: "Schritt 2: Manuelles Alias-Mapping",
        content: "JSON/CSV-Datei mit den Top-50-Investoren und Top-100-Companies. Klingt unsexy, ist aber was Crunchbase am Anfang auch gemacht hat. Und es ist kostenlos.",
      },
      {
        heading: "Schritt 3: Fuzzy-Matching",
        content: "Einmal über alle Nodes: Jaro-Winkler-Similarity berechnen, bei Score > 0.92 als potentielles Duplikat flaggen → manuell reviewen → mergen.",
      },
      {
        type: "info",
        content: "Später möglich: LLM-basiertes Matching (\"Sind 'N26' und 'N26 Bank GmbH' dasselbe?\" → Claude Haiku für ~$0.001 pro Vergleich). Aber anfangs reicht die regelbasierte + manuelle Route.",
      },
    ],
  },
  {
    id: "rag-layer",
    number: 5,
    title: "RAG-Layer: Cypher-Generation",
    subtitle: "User-Fragen → Cypher-Query → Graph-Ergebnis → natürliche Antwort",
    icon: BrainCircuit,
    color: "bg-rose-500",
    effort: "2-4h",
    cost: "~$0.002/Query",
    status: "recommended",
    sections: [
      {
        heading: "Ansatz A: Cypher-Generation (einfach, günstig)",
        content: "1) User fragt: \"Wer investiert am häufigsten in deutsche Seed-Startups?\" → 2) LLM (Claude Haiku, ~$0.001) generiert Cypher-Query → 3) Query läuft gegen Neo4j → strukturiertes Ergebnis → 4) LLM formatiert als natürliche Sprache. Kosten: ~$0.002 pro Frage.",
      },
      {
        heading: "Ansatz B: Subgraph Retrieval (mächtiger)",
        content: "1) Frage kommt rein → 2) Relevante Nodes per Keyword finden (z.B. \"Celonis\" → Company-Node) → 3) N-Hop-Subgraph extrahieren (alle Runden, alle Investoren, deren andere Investments) → 4) Subgraph als Text serialisieren → 5) Als Kontext an LLM → 6) LLM reasoned über Zusammenhänge.",
      },
      {
        type: "tip",
        content: "Start mit Ansatz A (Cypher-Generation). Ist simpler, billiger, und für 80% der Fragen ausreichend. Ansatz B erst wenn Fragen kommen die über mehrere Hops gehen müssen.",
      },
      {
        heading: "Warum Graph statt normales Vektor-RAG?",
        content: "Fragen wie \"Welche Investoren investieren häufig zusammen?\" oder \"Zeig mir die Funding-Trajectory von Celonis\" — die Antwort steht in keinem einzelnen Artikel. Sie entsteht erst durch Verknüpfung über mehrere Datenpunkte. Genau da versagt Vektor-RAG und genau da hilft der Graph.",
      },
    ],
  },
  {
    id: "incremental-sync",
    number: 6,
    title: "Inkrementeller Sync",
    subtitle: "Neue Artikel automatisch in den Graph mergen",
    icon: RefreshCw,
    color: "bg-cyan-500",
    effort: "1-2h",
    cost: "$0",
    status: "later",
    sections: [
      {
        content: "Jedes Mal wenn der RSS-Sync neue FundingRounds in PostgreSQL schreibt → Delta in den Graph übertragen.",
      },
      {
        heading: "Ablauf",
        content: "1) Delta ermitteln: Neue FundingRounds seit letztem Graph-Update (Timestamp-basiert) → 2) Nodes mergen: MERGE ist idempotent → 3) Edges hinzufügen: Neue PARTICIPATED_IN, SOURCED_FROM Links.",
      },
      {
        heading: "Trigger",
        content: "Als Post-Sync-Hook: Nach jedem erfolgreichen syncAllFeeds() die neuen Runden in den Graph pushen. Oder als separater Cron-Job alle 30 Minuten.",
      },
      {
        type: "warning",
        content: "Entity Resolution muss auch inkrementell laufen — neue Investor-Namen gegen bestehende Alias-Listen prüfen. Sonst entstehen wieder Duplikate.",
      },
    ],
  },
];

const COST_TABLE = [
  { component: "Neo4j AuraDB Free", monthly: "$0", note: "200k Nodes, 400k Edges" },
  { component: "ETL/CSV-Import", monthly: "$0", note: "Einmalig + Cron auf eigener Infra" },
  { component: "Entity Resolution", monthly: "$0", note: "Regelbasiert + manuelles Mapping" },
  { component: "RAG-Queries (Haiku)", monthly: "~$2", note: "Bei ~1000 Queries/Monat" },
  { component: "Gesamt", monthly: "< $5", note: "Ohne Enrichment-APIs" },
];

const ARCHITECTURE_LAYERS = [
  {
    label: "Data Sources",
    color: "bg-slate-500",
    items: ["RSS Feeds", "PostgreSQL", "(später: Crunchbase, LinkedIn, SEC)"],
  },
  {
    label: "ETL / Ingestion",
    color: "bg-emerald-500",
    items: ["CSV Export", "LOAD CSV", "Inkrementeller Sync"],
  },
  {
    label: "Entity Resolution",
    color: "bg-amber-500",
    items: ["Normalisierung", "Alias-Mapping", "Fuzzy Match"],
  },
  {
    label: "Graph Storage",
    color: "bg-blue-500",
    items: ["Neo4j AuraDB Free", "5 Core Node-Typen", "4 Core Edge-Typen"],
  },
  {
    label: "Query Layer",
    color: "bg-violet-500",
    items: ["Cypher Queries", "LLM Cypher-Generation", "Subgraph Retrieval"],
  },
  {
    label: "Application",
    color: "bg-rose-500",
    items: ["Chat-Interface", "Funding Dashboard", "Investor Analytics"],
  },
];

const CORE_VS_LATER = {
  now: [
    { node: "Company", props: "name, country, totalFundingUsd", source: "funding_rounds Tabelle" },
    { node: "FundingRound", props: "amountUsd, stage, date, confidence", source: "funding_rounds Tabelle" },
    { node: "InvestorOrg", props: "name, type", source: "funding_rounds.investors[]" },
    { node: "Location", props: "name, type, iso2", source: "funding_rounds.country" },
    { node: "Article", props: "title, url, publishedAt", source: "articles Tabelle" },
  ],
  later: [
    { node: "Fund", trigger: "Wenn Enrichment-API (PitchBook/Preqin) verfügbar" },
    { node: "FundManager", trigger: "Wenn GP-Strukturen relevant werden" },
    { node: "LimitedPartner", trigger: "Wenn LP-Daten zugänglich (Preqin, SEC)" },
    { node: "Person", trigger: "Wenn NER-Pipeline für Gründer/GPs implementiert" },
    { node: "BoardSeat", trigger: "Wenn LinkedIn-Enrichment läuft" },
    { node: "Acquisition / IPO", trigger: "Wenn Exit-Tracking gewünscht" },
    { node: "Sector / Technology", trigger: "Wenn LLM-Klassifikation eingebaut" },
    { node: "BusinessModel", trigger: "Wenn Company-Descriptions analysiert werden" },
  ],
};

// ============================================================================
// COMPONENTS
// ============================================================================

function StepCard({ step }: { step: Step }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = step.icon;

  return (
    <div className="rounded-lg border bg-card">
      <button
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white ${step.color}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs font-mono">#{step.number}</span>
            <span className="font-semibold text-sm">{step.title}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{step.subtitle}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right hidden sm:block">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="h-2.5 w-2.5" />
              {step.effort}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <CircleDollarSign className="h-2.5 w-2.5" />
              {step.cost}
            </div>
          </div>
          <Badge
            variant="outline"
            className={`text-[9px] ${
              step.status === "recommended"
                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                : step.status === "later"
                ? "bg-blue-500/10 text-blue-600 border-blue-500/30"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {step.status === "recommended" ? "Start" : step.status === "later" ? "Später" : "Optional"}
          </Badge>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t px-4 py-3 space-y-3">
          {step.sections.map((section, i) => (
            <div key={i}>
              {section.heading && (
                <h4 className="text-xs font-semibold mb-1">{section.heading}</h4>
              )}
              {section.type === "tip" ? (
                <div className="flex gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
                  <Zap className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{section.content}</span>
                </div>
              ) : section.type === "warning" ? (
                <div className="flex gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{section.content}</span>
                </div>
              ) : section.type === "info" ? (
                <div className="flex gap-2 rounded-md bg-blue-500/10 px-3 py-2 text-xs text-blue-700 dark:text-blue-400">
                  <Server className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{section.content}</span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground leading-relaxed">{section.content}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ArchitectureDiagram() {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start gap-2">
        {ARCHITECTURE_LAYERS.map((layer, i) => (
          <div key={layer.label} className="flex items-start gap-2">
            <div className="rounded-lg border min-w-[130px] overflow-hidden">
              <div className={`px-3 py-1.5 ${layer.color}`}>
                <span className="text-[10px] font-semibold text-white">{layer.label}</span>
              </div>
              <div className="px-3 py-2">
                {layer.items.map((item) => (
                  <p key={item} className="text-[10px] text-muted-foreground leading-relaxed">{item}</p>
                ))}
              </div>
            </div>
            {i < ARCHITECTURE_LAYERS.length - 1 && (
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 mt-4" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CostTable() {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/50">
            <th className="text-left font-medium px-3 py-2">Komponente</th>
            <th className="text-right font-medium px-3 py-2 w-[80px]">Monatlich</th>
            <th className="text-left font-medium px-3 py-2">Anmerkung</th>
          </tr>
        </thead>
        <tbody>
          {COST_TABLE.map((row, i) => (
            <tr
              key={row.component}
              className={`border-t border-border/50 ${i === COST_TABLE.length - 1 ? "font-semibold bg-muted/30" : ""}`}
            >
              <td className="px-3 py-2">{row.component}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                <span className={i === COST_TABLE.length - 1 ? "text-emerald-600 dark:text-emerald-400" : ""}>
                  {row.monthly}
                </span>
              </td>
              <td className="px-3 py-2 text-muted-foreground">{row.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DataScopeTable() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {/* Phase 1 */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="px-3 py-2 bg-emerald-500/10 border-b flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Phase 1 — Jetzt (aus bestehenden Daten)</span>
        </div>
        <table className="w-full text-xs">
          <tbody>
            {CORE_VS_LATER.now.map((row) => (
              <tr key={row.node} className="border-t border-border/50">
                <td className="px-3 py-1.5 font-medium w-[110px]">{row.node}</td>
                <td className="px-3 py-1.5 text-muted-foreground font-mono text-[10px]">{row.props}</td>
                <td className="px-3 py-1.5 text-muted-foreground text-[10px]">{row.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phase 2+ */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="px-3 py-2 bg-blue-500/10 border-b flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-blue-500" />
          <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">Phase 2+ — Später (Enrichment nötig)</span>
        </div>
        <table className="w-full text-xs">
          <tbody>
            {CORE_VS_LATER.later.map((row) => (
              <tr key={row.node} className="border-t border-border/50">
                <td className="px-3 py-1.5 font-medium w-[110px]">{row.node}</td>
                <td className="px-3 py-1.5 text-muted-foreground text-[10px]">{row.trigger}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WhyGraphBox() {
  const comparisons = [
    {
      question: "Welche Investoren investieren häufig zusammen?",
      vector: "Sucht nach Artikeln die zufällig zwei Investoren erwähnen — findet nur explizite Co-Investment-Mentions",
      graph: "Traversiert alle Runden, findet systematisch alle Paare die ≥2 gemeinsame Runden haben",
    },
    {
      question: "Zeig mir die Funding-Trajectory von Celonis",
      vector: "Findet einzelne Artikel zu einzelnen Runden — kein Gesamtbild",
      graph: "MATCH (c:Company {name:'Celonis'})-[:RAISED]->(r) → alle Runden chronologisch mit Investoren",
    },
    {
      question: "Welcher Investor hat die höchste Follow-on-Rate?",
      vector: "Unmöglich — diese Information steht in keinem einzelnen Artikel",
      graph: "Berechnung über PARTICIPATED_IN-Kanten: Anteil der Runden wo isNewInvestor=false",
    },
  ];

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="px-3 py-2 bg-muted/50 text-xs font-semibold">Warum Graph statt Vektor-RAG?</div>
      <div className="divide-y divide-border/50">
        {comparisons.map((c) => (
          <div key={c.question} className="px-3 py-2.5">
            <p className="text-xs font-medium mb-1.5">&ldquo;{c.question}&rdquo;</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded bg-red-500/5 px-2 py-1.5">
                <span className="text-[9px] font-semibold text-red-500 uppercase">Vektor-RAG</span>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{c.vector}</p>
              </div>
              <div className="rounded bg-emerald-500/5 px-2 py-1.5">
                <span className="text-[9px] font-semibold text-emerald-500 uppercase">Graph-RAG</span>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{c.graph}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// EXAMPLE QUERIES
// ============================================================================

const EXAMPLE_QUERIES = [
  {
    label: "Top Companies by Funding",
    query: "MATCH (c:Company)-[:RAISED]->(f:FundingRound) RETURN c.name AS company, f.amountUsd AS amount, f.stage AS stage ORDER BY f.amountUsd DESC LIMIT 10",
  },
  {
    label: "Most Active Investors",
    query: "MATCH (i:InvestorOrg)-[:PARTICIPATED_IN]->(f:FundingRound) RETURN i.name AS investor, count(f) AS rounds ORDER BY rounds DESC LIMIT 10",
  },
  {
    label: "Seed Rounds in DACH",
    query: "MATCH (c:Company)-[:RAISED]->(f:FundingRound), (c)-[:HQ_IN]->(l:Location) WHERE f.stage = 'Seed' AND l.name IN ['Germany', 'Austria', 'Switzerland', 'DE', 'AT', 'CH'] RETURN c.name AS company, f.amountUsd AS amount, l.name AS country ORDER BY f.amountUsd DESC LIMIT 10",
  },
  {
    label: "Node Counts",
    query: "MATCH (n) RETURN labels(n)[0] AS type, count(n) AS count ORDER BY count DESC",
  },
];

// ============================================================================
// NEO4J SYNC & QUERY COMPONENTS
// ============================================================================

function Neo4jSyncPanel() {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    setSyncResult(null);
    try {
      const res = await fetch("/api/graph-sync", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data: SyncResult = await res.json();
      setSyncResult(data);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-blue-500" />
          <span className="text-sm font-semibold">Neo4j Sync</span>
        </div>
        <Button size="sm" onClick={handleSync} disabled={syncing}>
          {syncing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Sync to Neo4j
            </>
          )}
        </Button>
      </div>

      {syncError && (
        <div className="flex gap-2 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{syncError}</span>
        </div>
      )}

      {syncResult && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {[
              { label: "Companies", value: syncResult.companies, color: "text-blue-500" },
              { label: "Investors", value: syncResult.investors, color: "text-violet-500" },
              { label: "Rounds", value: syncResult.fundingRounds, color: "text-emerald-500" },
              { label: "Articles", value: syncResult.articles, color: "text-amber-500" },
              { label: "Locations", value: syncResult.locations, color: "text-cyan-500" },
              { label: "Edges", value: syncResult.edges, color: "text-rose-500" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-md bg-muted/50 px-2.5 py-1.5 text-center">
                <div className={`text-base font-bold tabular-nums ${stat.color}`}>{stat.value}</div>
                <div className="text-[10px] text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground text-right">
            Completed in {(syncResult.durationMs / 1000).toFixed(1)}s
          </p>
        </div>
      )}
    </div>
  );
}

function CypherQueryPanel() {
  const [query, setQuery] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);

  async function handleQuery(cypher: string) {
    const q = cypher || query;
    if (!q.trim()) return;
    setRunning(true);
    setQueryError(null);
    setResult(null);
    try {
      const res = await fetch("/api/graph-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data: QueryResult = await res.json();
      setResult(data);
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : "Query failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-violet-500" />
        <span className="text-sm font-semibold">Cypher Query</span>
      </div>

      {/* Example query buttons */}
      <div className="flex flex-wrap gap-1.5">
        {EXAMPLE_QUERIES.map((eq) => (
          <button
            key={eq.label}
            className="rounded-md bg-muted/50 px-2.5 py-1 text-[10px] font-medium hover:bg-muted transition-colors"
            onClick={() => {
              setQuery(eq.query);
              handleQuery(eq.query);
            }}
          >
            {eq.label}
          </button>
        ))}
      </div>

      {/* Query input */}
      <div className="flex gap-2">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="MATCH (n) RETURN labels(n)[0] AS type, count(n) AS count"
          className="flex-1 rounded-md border bg-background px-3 py-2 text-xs font-mono min-h-[60px] resize-y focus:outline-none focus:ring-1 focus:ring-ring"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              handleQuery(query);
            }
          }}
        />
        <Button
          size="sm"
          onClick={() => handleQuery(query)}
          disabled={running || !query.trim()}
          className="self-end"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {queryError && (
        <div className="flex gap-2 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{queryError}</span>
        </div>
      )}

      {result && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground">{result.count} result{result.count !== 1 ? "s" : ""}</p>
          {result.count > 0 && (
            <div className="rounded-md border overflow-auto max-h-[300px]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50">
                    {Object.keys(result.records[0]).map((key) => (
                      <th key={key} className="text-left font-medium px-3 py-1.5 whitespace-nowrap">
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.records.map((record, i) => (
                    <tr key={i} className="border-t border-border/50">
                      {Object.values(record).map((value, j) => (
                        <td key={j} className="px-3 py-1.5 whitespace-nowrap font-mono text-[11px]">
                          {value === null ? <span className="text-muted-foreground">null</span> : String(value)}
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
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function GraphRAGPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">GraphRAG Setup</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Implementierungs-Guide: Von bestehenden RSS-Daten zum Venture Capital Knowledge Graph — mit minimalem Budget.
        </p>
        <div className="flex flex-wrap gap-3 mt-3 text-xs tabular-nums">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-base text-emerald-500">$0</span>
            <span className="text-muted-foreground">Graph-DB</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-base text-blue-500">5</span>
            <span className="text-muted-foreground">Core Node-Typen</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-base text-violet-500">4</span>
            <span className="text-muted-foreground">Core Edges</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-base text-amber-500">&lt;$5</span>
            <span className="text-muted-foreground">/Monat total</span>
          </div>
        </div>
      </div>

      {/* Neo4j Sync & Query */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Neo4j Pipeline</h2>
        <Neo4jSyncPanel />
        <CypherQueryPanel />
      </section>

      {/* Architecture */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Architektur</h2>
        <ArchitectureDiagram />
      </section>

      {/* Why Graph */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Graph vs. Vektor</h2>
        <WhyGraphBox />
      </section>

      {/* Steps */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Implementierung (6 Schritte)
        </h2>
        <div className="space-y-1.5">
          {STEPS.map((step) => (
            <StepCard key={step.id} step={step} />
          ))}
        </div>
      </section>

      {/* Data Scope */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Daten-Scope: Jetzt vs. Später</h2>
        <DataScopeTable />
      </section>

      {/* Cost */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Kosten</h2>
        <CostTable />
      </section>
    </div>
  );
}
