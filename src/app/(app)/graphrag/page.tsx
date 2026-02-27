"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
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
        content: "Neo4j Community Edition lokal im Docker (kostenlos, unbegrenzt, self-hosted) \u2022 Apache AGE als PostgreSQL-Extension (euer bestehender Postgres, aber eingeschränkter Cypher-Support) \u2022 Memgraph Free (in-memory, schnell, RAM-limitiert).",
      },
      {
        type: "tip",
        content: "Start mit AuraDB Free, bei Bedarf auf Community Edition im Docker wechseln \u2014 der Cypher-Code bleibt identisch.",
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
        content: "5 SQL-Queries \u2192 5 CSV-Dateien. Alles was ihr braucht liegt schon in der funding_rounds + articles Tabelle.",
      },
      {
        heading: "Welche CSVs?",
        content: "companies.csv \u2014 SELECT DISTINCT company_name, country FROM funding_rounds \u2192 Normalisierung (lowercase, Rechtsform-Strip) \u2022 rounds.csv \u2014 Gruppierte Runden (wie /api/funding/grouped es schon macht) \u2022 investors.csv \u2014 SELECT UNNEST(investors) FROM funding_rounds \u2192 Deduplizierung \u2022 locations.csv \u2014 SELECT DISTINCT country FROM funding_rounds \u2022 articles.csv \u2014 Alle Artikel die eine FundingRound haben",
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
    subtitle: "CSV-Import per Cypher \u2014 Nodes + Edges in einem Rutsch",
    icon: Layers,
    color: "bg-violet-500",
    effort: "1-2h",
    cost: "$0",
    status: "recommended",
    sections: [
      {
        heading: "Phase A: Nodes erzeugen",
        content: "MERGE ist idempotent \u2014 existierende Nodes werden nicht dupliziert. Reihenfolge: 1) Location-Nodes 2) Company-Nodes 3) Investor-Nodes 4) FundingRound-Nodes 5) Article-Nodes",
      },
      {
        heading: "Phase B: Edges erzeugen",
        content: "(Company)-[:RAISED]->(FundingRound) \u2014 Jede Runde geh\u00f6rt zu einem Unternehmen \u2022 (InvestorOrg)-[:PARTICIPATED_IN {role}]->(FundingRound) \u2014 F\u00fcr jeden Investor pro Runde, mit role: lead/participant \u2022 (Company)-[:HQ_IN]->(Location) \u2014 Country-Zuordnung \u2022 (FundingRound)-[:SOURCED_FROM]->(Article) \u2014 Provenienz-Link",
      },
      {
        type: "tip",
        content: "Startet nur mit Company, FundingRound, Investor, Location, Article \u2014 die 5 Core-Nodes. Die restlichen 12 Node-Typen aus der Ontologie (FundManager, LP, BoardSeat, IPO, ...) kommen sp\u00e4ter durch Enrichment.",
      },
      {
        heading: "Neo4j Browser",
        content: "Nach dem Import: In der Neo4j Browser-UI rumspielen, Cypher-Queries testen, Datenqualit\u00e4t pr\u00fcfen. Erst wenn die Daten sauber aussehen weitermachen.",
      },
    ],
  },
  {
    id: "entity-resolution",
    number: 4,
    title: "Entity Resolution",
    subtitle: "Duplikate erkennen und mergen \u2014 das Schwierigste am ganzen Prozess",
    icon: Merge,
    color: "bg-amber-500",
    effort: "2-4h",
    cost: "$0",
    status: "recommended",
    sections: [
      {
        content: "Das Hauptproblem: \"Accel\" in einem Artikel = \"Accel Partners\" in einem anderen = \"Accel Europe\" in einem dritten. Gleiches f\u00fcr Companies: \"N26\" = \"N26 GmbH\" = \"Number26\".",
      },
      {
        heading: "Schritt 1: Normalisierung beim Import",
        content: "Lowercase, Suffixe strippen (Partners, Ventures, Capital, GmbH, Ltd, Inc, SAS, ...), Sonderzeichen entfernen. Das allein l\u00f6st ~60% der Duplikate.",
      },
      {
        heading: "Schritt 2: Manuelles Alias-Mapping",
        content: "JSON/CSV-Datei mit den Top-50-Investoren und Top-100-Companies. Klingt unsexy, ist aber was Crunchbase am Anfang auch gemacht hat. Und es ist kostenlos.",
      },
      {
        heading: "Schritt 3: Fuzzy-Matching",
        content: "Einmal \u00fcber alle Nodes: Jaro-Winkler-Similarity berechnen, bei Score > 0.92 als potentielles Duplikat flaggen \u2192 manuell reviewen \u2192 mergen.",
      },
      {
        type: "info",
        content: "Sp\u00e4ter m\u00f6glich: LLM-basiertes Matching (\"Sind 'N26' und 'N26 Bank GmbH' dasselbe?\" \u2192 Claude Haiku f\u00fcr ~$0.001 pro Vergleich). Aber anfangs reicht die regelbasierte + manuelle Route.",
      },
    ],
  },
  {
    id: "rag-layer",
    number: 5,
    title: "RAG-Layer: Cypher-Generation",
    subtitle: "User-Fragen \u2192 Cypher-Query \u2192 Graph-Ergebnis \u2192 nat\u00fcrliche Antwort",
    icon: BrainCircuit,
    color: "bg-rose-500",
    effort: "2-4h",
    cost: "~$0.002/Query",
    status: "recommended",
    sections: [
      {
        heading: "Ansatz A: Cypher-Generation (einfach, g\u00fcnstig)",
        content: "1) User fragt: \"Wer investiert am h\u00e4ufigsten in deutsche Seed-Startups?\" \u2192 2) LLM (Claude Haiku, ~$0.001) generiert Cypher-Query \u2192 3) Query l\u00e4uft gegen Neo4j \u2192 strukturiertes Ergebnis \u2192 4) LLM formatiert als nat\u00fcrliche Sprache. Kosten: ~$0.002 pro Frage.",
      },
      {
        heading: "Ansatz B: Subgraph Retrieval (m\u00e4chtiger)",
        content: "1) Frage kommt rein \u2192 2) Relevante Nodes per Keyword finden (z.B. \"Celonis\" \u2192 Company-Node) \u2192 3) N-Hop-Subgraph extrahieren (alle Runden, alle Investoren, deren andere Investments) \u2192 4) Subgraph als Text serialisieren \u2192 5) Als Kontext an LLM \u2192 6) LLM reasoned \u00fcber Zusammenh\u00e4nge.",
      },
      {
        type: "tip",
        content: "Start mit Ansatz A (Cypher-Generation). Ist simpler, billiger, und f\u00fcr 80% der Fragen ausreichend. Ansatz B erst wenn Fragen kommen die \u00fcber mehrere Hops gehen m\u00fcssen.",
      },
      {
        heading: "Warum Graph statt normales Vektor-RAG?",
        content: "Fragen wie \"Welche Investoren investieren h\u00e4ufig zusammen?\" oder \"Zeig mir die Funding-Trajectory von Celonis\" \u2014 die Antwort steht in keinem einzelnen Artikel. Sie entsteht erst durch Verkn\u00fcpfung \u00fcber mehrere Datenpunkte. Genau da versagt Vektor-RAG und genau da hilft der Graph.",
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
        content: "Jedes Mal wenn der RSS-Sync neue FundingRounds in PostgreSQL schreibt \u2192 Delta in den Graph \u00fcbertragen.",
      },
      {
        heading: "Ablauf",
        content: "1) Delta ermitteln: Neue FundingRounds seit letztem Graph-Update (Timestamp-basiert) \u2192 2) Nodes mergen: MERGE ist idempotent \u2192 3) Edges hinzuf\u00fcgen: Neue PARTICIPATED_IN, SOURCED_FROM Links.",
      },
      {
        heading: "Trigger",
        content: "Als Post-Sync-Hook: Nach jedem erfolgreichen syncAllFeeds() die neuen Runden in den Graph pushen. Oder als separater Cron-Job alle 30 Minuten.",
      },
      {
        type: "warning",
        content: "Entity Resolution muss auch inkrementell laufen \u2014 neue Investor-Namen gegen bestehende Alias-Listen pr\u00fcfen. Sonst entstehen wieder Duplikate.",
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
    color: "bg-foreground/[0.06]",
    items: ["RSS Feeds", "PostgreSQL", "(sp\u00e4ter: Crunchbase, LinkedIn, SEC)"],
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
    { node: "Fund", trigger: "Wenn Enrichment-API (PitchBook/Preqin) verf\u00fcgbar" },
    { node: "FundManager", trigger: "Wenn GP-Strukturen relevant werden" },
    { node: "LimitedPartner", trigger: "Wenn LP-Daten zug\u00e4nglich (Preqin, SEC)" },
    { node: "Person", trigger: "Wenn NER-Pipeline f\u00fcr Gr\u00fcnder/GPs implementiert" },
    { node: "BoardSeat", trigger: "Wenn LinkedIn-Enrichment l\u00e4uft" },
    { node: "Acquisition / IPO", trigger: "Wenn Exit-Tracking gew\u00fcnscht" },
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
    <div className="lg-inset rounded-[14px]">
      <button
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-foreground/[0.02] transition-colors rounded-[14px]"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-white ${step.color}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-foreground/30 text-[12px] font-mono">#{step.number}</span>
            <span className="font-semibold text-[13px] tracking-[-0.01em] text-foreground/85">{step.title}</span>
          </div>
          <p className="text-[12px] text-foreground/45 mt-0.5 truncate">{step.subtitle}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right hidden sm:block">
            <div className="flex items-center gap-1 text-[10px] text-foreground/30">
              <Clock className="h-2.5 w-2.5" />
              {step.effort}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-foreground/30">
              <CircleDollarSign className="h-2.5 w-2.5" />
              {step.cost}
            </div>
          </div>
          <Badge
            variant="outline"
            className={`text-[9px] ${
              step.status === "recommended"
                ? "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                : step.status === "later"
                ? "bg-blue-500/8 text-blue-600 dark:text-blue-400 border-blue-500/30"
                : "bg-foreground/[0.04] text-foreground/45"
            }`}
          >
            {step.status === "recommended" ? "Start" : step.status === "later" ? "Sp\u00e4ter" : "Optional"}
          </Badge>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-foreground/35" />
          ) : (
            <ChevronRight className="h-4 w-4 text-foreground/35" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 py-3 space-y-3" style={{ borderTop: "0.5px solid rgba(var(--foreground-rgb, 0 0 0) / 0.06)" }}>
          {step.sections.map((section, i) => (
            <div key={i}>
              {section.heading && (
                <h4 className="text-[12px] font-semibold tracking-[-0.01em] text-foreground/70 mb-1">{section.heading}</h4>
              )}
              {section.type === "tip" ? (
                <div className="flex gap-2 rounded-[8px] bg-emerald-500/8 px-3 py-2 text-[12px] text-emerald-600 dark:text-emerald-400">
                  <Zap className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{section.content}</span>
                </div>
              ) : section.type === "warning" ? (
                <div className="flex gap-2 rounded-[8px] bg-amber-500/8 px-3 py-2 text-[12px] text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{section.content}</span>
                </div>
              ) : section.type === "info" ? (
                <div className="flex gap-2 rounded-[8px] bg-blue-500/8 px-3 py-2 text-[12px] text-blue-600 dark:text-blue-400">
                  <Server className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{section.content}</span>
                </div>
              ) : (
                <p className="text-[12px] text-foreground/45 leading-relaxed">{section.content}</p>
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
    <div className="lg-inset rounded-[16px] p-4">
      <div className="flex flex-wrap items-start gap-2">
        {ARCHITECTURE_LAYERS.map((layer, i) => (
          <div key={layer.label} className="flex items-start gap-2">
            <div className="rounded-[8px] min-w-[130px] overflow-hidden" style={{ border: "0.5px solid rgba(var(--foreground-rgb, 0 0 0) / 0.06)" }}>
              <div className={`px-3 py-1.5 ${layer.color}`}>
                <span className="text-[10px] font-semibold text-white">{layer.label}</span>
              </div>
              <div className="px-3 py-2">
                {layer.items.map((item) => (
                  <p key={item} className="text-[10px] text-foreground/45 leading-relaxed">{item}</p>
                ))}
              </div>
            </div>
            {i < ARCHITECTURE_LAYERS.length - 1 && (
              <ArrowRight className="h-3.5 w-3.5 text-foreground/15 shrink-0 mt-4" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CostTable() {
  return (
    <div className="lg-inset rounded-[16px]">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="glass-table-header">
            <th className="text-left text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35 px-3 py-2">Komponente</th>
            <th className="text-right text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35 px-3 py-2 w-[80px]">Monatlich</th>
            <th className="text-left text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35 px-3 py-2">Anmerkung</th>
          </tr>
        </thead>
        <tbody>
          {COST_TABLE.map((row, i) => (
            <tr
              key={row.component}
              className={`lg-inset-table-row ${i === COST_TABLE.length - 1 ? "font-semibold" : ""}`}
            >
              <td className="px-3 py-2 text-foreground/85">{row.component}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                <span className={i === COST_TABLE.length - 1 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground/70"}>
                  {row.monthly}
                </span>
              </td>
              <td className="px-3 py-2 text-foreground/45">{row.note}</td>
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
      <div className="lg-inset rounded-[16px] overflow-hidden">
        <div className="px-3 py-2 bg-emerald-500/8 flex items-center gap-2" style={{ borderBottom: "0.5px solid rgba(var(--foreground-rgb, 0 0 0) / 0.06)" }}>
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">Phase 1 \u2014 Jetzt (aus bestehenden Daten)</span>
        </div>
        <table className="w-full text-[12px]">
          <tbody>
            {CORE_VS_LATER.now.map((row) => (
              <tr key={row.node} className="lg-inset-table-row">
                <td className="px-3 py-1.5 font-semibold text-foreground/85 w-[110px]">{row.node}</td>
                <td className="px-3 py-1.5 text-foreground/45 font-mono text-[10px]">{row.props}</td>
                <td className="px-3 py-1.5 text-foreground/45 text-[10px]">{row.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phase 2+ */}
      <div className="lg-inset rounded-[16px] overflow-hidden">
        <div className="px-3 py-2 bg-blue-500/8 flex items-center gap-2" style={{ borderBottom: "0.5px solid rgba(var(--foreground-rgb, 0 0 0) / 0.06)" }}>
          <Clock className="h-3.5 w-3.5 text-blue-500" />
          <span className="text-[12px] font-semibold text-blue-600 dark:text-blue-400">Phase 2+ \u2014 Sp\u00e4ter (Enrichment n\u00f6tig)</span>
        </div>
        <table className="w-full text-[12px]">
          <tbody>
            {CORE_VS_LATER.later.map((row) => (
              <tr key={row.node} className="lg-inset-table-row">
                <td className="px-3 py-1.5 font-semibold text-foreground/85 w-[110px]">{row.node}</td>
                <td className="px-3 py-1.5 text-foreground/45 text-[10px]">{row.trigger}</td>
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
      question: "Welche Investoren investieren h\u00e4ufig zusammen?",
      vector: "Sucht nach Artikeln die zuf\u00e4llig zwei Investoren erw\u00e4hnen \u2014 findet nur explizite Co-Investment-Mentions",
      graph: "Traversiert alle Runden, findet systematisch alle Paare die \u22652 gemeinsame Runden haben",
    },
    {
      question: "Zeig mir die Funding-Trajectory von Celonis",
      vector: "Findet einzelne Artikel zu einzelnen Runden \u2014 kein Gesamtbild",
      graph: "MATCH (c:Company {name:'Celonis'})-[:RAISED]->(r) \u2192 alle Runden chronologisch mit Investoren",
    },
    {
      question: "Welcher Investor hat die h\u00f6chste Follow-on-Rate?",
      vector: "Unm\u00f6glich \u2014 diese Information steht in keinem einzelnen Artikel",
      graph: "Berechnung \u00fcber PARTICIPATED_IN-Kanten: Anteil der Runden wo isNewInvestor=false",
    },
  ];

  return (
    <div className="lg-inset rounded-[16px] overflow-hidden">
      <div className="glass-table-header px-3 py-2">
        <span className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Warum Graph statt Vektor-RAG?</span>
      </div>
      <div>
        {comparisons.map((c, i) => (
          <div key={c.question} className={`px-3 py-2.5 ${i > 0 ? "lg-inset-table-row" : ""}`}>
            <p className="text-[13px] font-semibold tracking-[-0.01em] text-foreground/85 mb-1.5">&ldquo;{c.question}&rdquo;</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-[8px] bg-red-500/8 px-2 py-1.5">
                <span className="text-[9px] font-semibold text-red-500 uppercase tracking-[0.04em]">Vektor-RAG</span>
                <p className="text-[10px] text-foreground/45 mt-0.5 leading-relaxed">{c.vector}</p>
              </div>
              <div className="rounded-[8px] bg-emerald-500/8 px-2 py-1.5">
                <span className="text-[9px] font-semibold text-emerald-500 uppercase tracking-[0.04em]">Graph-RAG</span>
                <p className="text-[10px] text-foreground/45 mt-0.5 leading-relaxed">{c.graph}</p>
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
    <div className="lg-inset rounded-[16px] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-blue-500" />
          <span className="text-[13px] font-semibold tracking-[-0.01em] text-foreground/85">Neo4j Sync</span>
        </div>
        <button onClick={handleSync} disabled={syncing} className="apple-btn-blue flex items-center gap-1.5 px-3 py-1.5 text-[13px]">
          {syncing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <RefreshCw className="h-3.5 w-3.5" />
              Sync to Neo4j
            </>
          )}
        </button>
      </div>

      {syncError && (
        <div className="flex gap-2 rounded-[8px] bg-red-500/8 px-3 py-2 text-[12px] text-red-500">
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
              <div key={stat.label} className="rounded-[8px] bg-foreground/[0.04] px-2.5 py-1.5 text-center">
                <div className={`text-[15px] font-bold tabular-nums ${stat.color}`}>{stat.value}</div>
                <div className="text-[10px] text-foreground/35">{stat.label}</div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-foreground/30 text-right">
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
    <div className="lg-inset rounded-[16px] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-violet-500" />
        <span className="text-[13px] font-semibold tracking-[-0.01em] text-foreground/85">Cypher Query</span>
      </div>

      {/* Example query buttons */}
      <div className="flex flex-wrap gap-1.5">
        {EXAMPLE_QUERIES.map((eq) => (
          <button
            key={eq.label}
            className="glass-capsule-btn px-2.5 py-1 text-[10px] font-medium"
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
          className="glass-search-input flex-1 px-3 py-2 text-[12px] font-mono min-h-[60px] resize-y"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              handleQuery(query);
            }
          }}
        />
        <button
          onClick={() => handleQuery(query)}
          disabled={running || !query.trim()}
          className="apple-btn-blue self-end px-3 py-2"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        </button>
      </div>

      {queryError && (
        <div className="flex gap-2 rounded-[8px] bg-red-500/8 px-3 py-2 text-[12px] text-red-500">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{queryError}</span>
        </div>
      )}

      {result && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-foreground/30">{result.count} result{result.count !== 1 ? "s" : ""}</p>
          {result.count > 0 && (
            <div className="lg-inset rounded-[10px] overflow-auto max-h-[300px]">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="glass-table-header">
                    {Object.keys(result.records[0]).map((key) => (
                      <th key={key} className="text-left text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35 px-3 py-1.5 whitespace-nowrap">
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.records.map((record, i) => (
                    <tr key={i} className="lg-inset-table-row">
                      {Object.values(record).map((value, j) => (
                        <td key={j} className="px-3 py-1.5 whitespace-nowrap font-mono text-[11px] text-foreground/70">
                          {value === null ? <span className="text-foreground/30">null</span> : String(value)}
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
    <div className="flex h-[calc(100vh-1.5rem)] flex-col">
      {/* Tier 2: Toolbar */}
      <div className="glass-status-bar px-4 py-2.5">
        <div className="flex items-center gap-3 max-w-4xl">
          <BrainCircuit className="h-4 w-4 text-foreground/40" />
          <span className="text-[13px] font-semibold text-foreground/85">GraphRAG Setup</span>
          <div className="flex flex-wrap gap-3 ml-auto text-[12px] tabular-nums">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-[15px] text-emerald-500">$0</span>
              <span className="text-foreground/35">Graph-DB</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-[15px] text-blue-500">5</span>
              <span className="text-foreground/35">Core Nodes</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-[15px] text-violet-500">4</span>
              <span className="text-foreground/35">Core Edges</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-[15px] text-amber-500">&lt;$5</span>
              <span className="text-foreground/35">/Monat</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tier 3: Content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-6 max-w-4xl">
          <p className="text-[13px] text-foreground/55 tracking-[-0.01em]">
            Implementierungs-Guide: Von bestehenden RSS-Daten zum Venture Capital Knowledge Graph \u2014 mit minimalem Budget.
          </p>

          {/* Neo4j Sync & Query */}
          <section className="space-y-2">
            <h2 className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Neo4j Pipeline</h2>
            <Neo4jSyncPanel />
            <CypherQueryPanel />
          </section>

          {/* Architecture */}
          <section className="space-y-2">
            <h2 className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Architektur</h2>
            <ArchitectureDiagram />
          </section>

          {/* Why Graph */}
          <section className="space-y-2">
            <h2 className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Graph vs. Vektor</h2>
            <WhyGraphBox />
          </section>

          {/* Steps */}
          <section className="space-y-2">
            <h2 className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
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
            <h2 className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Daten-Scope: Jetzt vs. Sp\u00e4ter</h2>
            <DataScopeTable />
          </section>

          {/* Cost */}
          <section className="space-y-2">
            <h2 className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">Kosten</h2>
            <CostTable />
          </section>
        </div>
      </div>
    </div>
  );
}
