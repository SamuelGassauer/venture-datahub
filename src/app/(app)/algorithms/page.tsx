"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  ChevronRight,
  Layers,
  BrainCircuit,
  Search,
  Sparkles,
  GitMerge,
  Image,
  Globe,
  BarChart3,
  FileText,
  Shield,
  Zap,
  ArrowRight,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

type AlgoSection = {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  color: string;
  file: string;
  overview: string;
  details: DetailBlock[];
};

type DetailBlock =
  | { type: "weights"; title: string; items: { label: string; weight: string; color: string; description: string }[] }
  | { type: "pipeline"; title: string; steps: { label: string; detail: string; badge?: string }[] }
  | { type: "table"; title: string; headers: string[]; rows: string[][] }
  | { type: "signals"; title: string; positive: { pattern: string; weight: string }[]; negative: { pattern: string; penalty: string }[] }
  | { type: "tiers"; title: string; tiers: { name: string; score: string; color: string; items: string[] }[] }
  | { type: "code"; title: string; code: string }
  | { type: "text"; title: string; content: string };

// ============================================================================
// ALGORITHM DATA
// ============================================================================

const algorithms: AlgoSection[] = [
  {
    id: "funding-extraction",
    title: "Funding Round Extraction",
    subtitle: "Multi-Signal Confidence Scoring",
    icon: Zap,
    color: "text-amber-500",
    file: "src/lib/funding-extractor.ts",
    overview:
      "Erkennt Funding-Runden in Artikeln durch gewichtete Signalanalyse. Jedes Signal (Regex-Pattern, semantische Marker) tr\u00E4gt positiv oder negativ zum Confidence-Score bei. Final: clamp(sum, 0, 1).",
    details: [
      {
        type: "weights",
        title: "Positive Signale",
        items: [
          { label: "Title Strong Trigger", weight: "0.35", color: "bg-emerald-500", description: '"raises $XM", "secures $XM Series A" \u2014 9 Regex-Patterns' },
          { label: "Title Moderate Trigger", weight: "0.20", color: "bg-emerald-400", description: '"raises", "funding round", "capital raise" \u2014 7 Patterns' },
          { label: "Title Proximity", weight: "0.15", color: "bg-emerald-300", description: "Company + Verb + Amount in einem Satz" },
          { label: "Body Trigger", weight: "0.10", color: "bg-blue-400", description: "Moderate Triggers im Artikel-Body" },
          { label: "Amount Near Trigger", weight: "0.10", color: "bg-blue-400", description: "Betrag innerhalb ~80 Zeichen eines Trigger-Worts" },
          { label: "Has Amount", weight: "0.10", color: "bg-blue-300", description: "Ein Funding-Betrag wurde extrahiert" },
          { label: "Has Stage", weight: "0.10", color: "bg-blue-300", description: "Seed, Series A-E, Bridge, Growth, Debt, Grant" },
          { label: "Has Investors", weight: "0.08", color: "bg-sky-300", description: "Investorennamen gefunden" },
          { label: "Company Before Trigger", weight: "0.08", color: "bg-sky-300", description: "Firmenname steht vor dem Trigger-Verb" },
          { label: "Reasonable Amount", weight: "0.05", color: "bg-sky-200", description: "$100K \u2013 $5B (realistischer Bereich)" },
          { label: "Has Country", weight: "0.05", color: "bg-sky-200", description: "Land/Location identifiziert" },
          { label: "Has Lead Investor", weight: "0.04", color: "bg-sky-100", description: "Expliziter Lead-Investor" },
        ],
      },
      {
        type: "signals",
        title: "Anti-Patterns (Negative Signale)",
        positive: [],
        negative: [
          { pattern: "IPO-Meldung", penalty: "-0.40" },
          { pattern: "Acquisition / Merger", penalty: "-0.35" },
          { pattern: "VC Fund Formation", penalty: "-0.30" },
          { pattern: "Weekly Roundup / Digest", penalty: "-0.30" },
          { pattern: "Early Bird Tickets (Events)", penalty: "-0.35" },
          { pattern: "Top N Listicle", penalty: "-0.20" },
          { pattern: "Market Report / Analysis", penalty: "-0.20" },
          { pattern: "Unreasonable Amount (>$10B)", penalty: "-0.25" },
          { pattern: 'Startup of Week/Month/Year"', penalty: "-0.25" },
          { pattern: "How-to / Opinion / Interview", penalty: "-0.15" },
        ],
      },
      {
        type: "table",
        title: "Decision Thresholds",
        headers: ["Parameter", "Wert", "Beschreibung"],
        rows: [
          ["Min. Confidence", "0.35", "Unter diesem Wert wird der Artikel verworfen"],
          ["No Strong Title + No Amount", "0.45", "Strengerer Threshold ohne starkes Title-Signal"],
          ["Anti-Pattern in Title", "\u00D71.0", "Volle Penalty"],
          ["Anti-Pattern in Body", "\u00D70.5", "Halbe Penalty (schw\u00E4cheres Signal)"],
          ["VC Fund Filter", "Reject", "Firmenname enth\u00E4lt 'Ventures/Capital/Fund' ohne 'startup'"],
        ],
      },
    ],
  },
  {
    id: "llm-extraction",
    title: "LLM Funding Extraction",
    subtitle: "Claude Haiku Cross-Referencing",
    icon: BrainCircuit,
    color: "text-violet-500",
    file: "src/lib/llm-funding-extractor.ts",
    overview:
      "Zweite Extraktionsstufe: Claude Haiku analysiert Artikel-Texte und cross-referenziert mehrere Quellen f\u00FCr h\u00F6here Genauigkeit. Extrahiert strukturierte Daten + Company Metadata.",
    details: [
      {
        type: "pipeline",
        title: "Extraction Pipeline",
        steps: [
          { label: "Input Budget", detail: "Single: 3.000 Chars | Multi: 6.000/N pro Quelle", badge: "Haiku 4.5" },
          { label: "System Prompt", detail: "Nur spezifische Startup-Runden. Ausschluss: Roundups, IPOs, Acquisitions, VC Funds, Events" },
          { label: "Strukturierte Ausgabe", detail: "Company, Amount, Stage, Investors, Lead, Country, Confidence (0-1)" },
          { label: "Company Metadata", detail: "Description, Website, Founded Year, Employee Range, LinkedIn" },
          { label: "Multi-Source Signal", detail: "N Quellen \u2192 Signal 'multi_source_N' f\u00FCr h\u00F6here Confidence" },
        ],
      },
      {
        type: "table",
        title: "W\u00E4hrungskonvertierung",
        headers: ["W\u00E4hrung", "Faktor \u2192 USD"],
        rows: [
          ["EUR", "1.08"],
          ["GBP", "1.27"],
          ["CHF", "1.12"],
          ["SEK", "0.096"],
          ["NOK", "0.094"],
          ["DKK", "0.145"],
          ["PLN", "0.25"],
        ],
      },
    ],
  },
  {
    id: "round-grouping",
    title: "Funding Round Grouping",
    subtitle: "Score-Based Deduplication",
    icon: GitMerge,
    color: "text-cyan-500",
    file: "src/app/api/funding/grouped/route.ts",
    overview:
      "Gruppiert Funding-Runden aus verschiedenen Quellen, die dieselbe Finanzierungsrunde beschreiben. Nutzt 7 gewichtete Signale und einen Merge-Threshold von 0.55.",
    details: [
      {
        type: "weights",
        title: "Matching-Signale (gewichtet auf 0\u20131)",
        items: [
          { label: "Company Name Similarity", weight: "40%", color: "bg-cyan-500", description: "Exakt: 0.40 | Substring: 0.35 | Token-Overlap: 0.30" },
          { label: "Time Proximity", weight: "15%", color: "bg-cyan-400", description: "Linearer Abfall \u00FCber 14-Tage-Fenster" },
          { label: "Amount Similarity", weight: "15%", color: "bg-cyan-400", description: "Ratio \u2265 0.8 = voll | 0.5\u20130.8 = anteilig" },
          { label: "Stage Match", weight: "10%", color: "bg-cyan-300", description: "Gleiche Stage = 0.10 | Mismatch = 0" },
          { label: "Lead Investor Match", weight: "10%", color: "bg-cyan-300", description: "Exakt oder Substring-Match" },
          { label: "Country Match", weight: "5%", color: "bg-cyan-200", description: "Gleiches Land" },
          { label: "Investor Overlap", weight: "5%", color: "bg-cyan-200", description: "Gemeinsame Investorennamen" },
        ],
      },
      {
        type: "pipeline",
        title: "Name Cleaning Pipeline",
        steps: [
          { label: "Noise Prefixes entfernen", detail: '"London\'s", "France\'s", "startup", "Video Startup", "How this fintech", "meet", "the"' },
          { label: "Noise Suffixes entfernen", detail: '"collects", "raises", "secures", "closes", "launches ..."' },
          { label: "Normalisierung", detail: "Lowercase + nur alphanumerische Zeichen" },
          { label: "Tokenisierung", detail: "Split auf non-alphanumerisch, Filter Tokens < 2 Zeichen" },
          { label: "Best Name Selection", detail: "K\u00FCrzester Name aus High-Confidence Entries der Gruppe" },
        ],
      },
      {
        type: "table",
        title: "Thresholds",
        headers: ["Parameter", "Wert"],
        rows: [
          ["Merge Threshold", "\u2265 0.55"],
          ["Time Window", "14 Tage"],
          ["Pre-Filter", "canMatch(): Zeitfenster + Name-Overlap"],
          ["Amount Ratio (voll)", "\u2265 0.80"],
          ["Token Min. L\u00E4nge", "3 Zeichen"],
        ],
      },
    ],
  },
  {
    id: "logo-discovery",
    title: "Logo Discovery",
    subtitle: "Tiered Extraction Pipeline",
    icon: Image,
    color: "text-pink-500",
    file: "src/lib/company-enricher.ts",
    overview:
      "3-stufige Logo-Erkennung von Unternehmens-Websites. Jede Stufe hat einen Score-Bereich \u2014 h\u00F6here Stufen werden bevorzugt. Headshot-Detection verhindert, dass Portrait-Fotos als Logos erkannt werden.",
    details: [
      {
        type: "tiers",
        title: "Extraction Tiers",
        tiers: [
          {
            name: "Tier 1 \u2014 Structural",
            score: "1000+",
            color: "bg-emerald-500",
            items: [
              "JSON-LD Logo (score: 1095)",
              "JSON-LD Organization Image (score: 1080)",
              "Apple Touch Icon (score: 1050)",
              "SVG Favicon (score: 1040)",
            ],
          },
          {
            name: "Tier 2 \u2014 Semantic",
            score: "500+",
            color: "bg-yellow-500",
            items: [
              'Images mit class/id/alt "logo"',
              "Images in Header/Nav + Home-Link",
              "og:image Tags",
              "Regular Favicon (.ico/.png)",
            ],
          },
          {
            name: "Tier 3 \u2014 Heuristic",
            score: "100+",
            color: "bg-orange-500",
            items: [
              "Erstes Bild in Header/Nav",
              "Generisches og:image",
              "Erstes Favicon",
            ],
          },
        ],
      },
      {
        type: "table",
        title: "Validierung",
        headers: ["Check", "Regel"],
        rows: [
          ["HTTP HEAD", "Timeout 4s, Content-Type muss Image sein"],
          ["Min. Dateigr\u00F6\u00DFe", "200 Bytes (filtert Tracking-Pixels)"],
          ["SVG Ausnahme", "Darf kleiner als 200B sein"],
          ["Headshot Detection", "Regex auf headshot|portrait|avatar|profile-pic|ceo|founder"],
          ["Headshot Penalty", "-200 Score-Punkte"],
          ["Reject Patterns", "data: URLs, pixel/tracking/spacer im Pfad"],
        ],
      },
    ],
  },
  {
    id: "website-discovery",
    title: "Website & LinkedIn Discovery",
    subtitle: "3-Phase Search + LLM Verification",
    icon: Globe,
    color: "text-blue-500",
    file: "src/lib/company-enricher.ts",
    overview:
      "Findet die offizielle Website und LinkedIn-Seite einer Entity. Brave Search liefert Kandidaten, ein LLM verifiziert ob die Seite tats\u00E4chlich zur Entity geh\u00F6rt.",
    details: [
      {
        type: "pipeline",
        title: "Discovery Pipeline",
        steps: [
          { label: "Phase 1: Brave Search", detail: 'Query: "[Name] startup company official website" \u2192 8 Ergebnisse', badge: "Primary" },
          { label: "LinkedIn Extract", detail: "linkedin.com/company/ URLs aus Suchergebnissen extrahieren" },
          { label: "URL Validation", detail: "Reject: Social Media, News-Sites, bereits abgelehnte Domains" },
          { label: "LLM Verification", detail: "Claude Haiku pr\u00FCft: Ist das die echte Website dieser Entity?", badge: "Haiku 4.5" },
          { label: "Phase 2: Article URLs", detail: "Fallback: URLs aus verlinkten Artikeln extrahieren + LLM-Verify" },
          { label: "Phase 3: LinkedIn Fallback", detail: 'Separate Suche: "[Name] investor linkedin" \u2192 3 Ergebnisse' },
        ],
      },
      {
        type: "table",
        title: "URL Filter",
        headers: ["Kategorie", "Aktion"],
        rows: [
          ["Social Media (Instagram, Twitter, Facebook)", "Reject"],
          ["News/Blog Sites", "Reject"],
          ["Bereits abgelehnte Domains", "Skip (kein Re-Check)"],
          ["Unreachable URLs", "Skip + Grund loggen"],
          ["LLM sagt 'nicht die Website'", "Reject + Reason speichern"],
        ],
      },
    ],
  },
  {
    id: "enrichment-scoring",
    title: "Enrichment Scoring",
    subtitle: "Attribut-Completeness f\u00FCr Companies & Investors",
    icon: BarChart3,
    color: "text-emerald-500",
    file: "src/app/api/companies/route.ts, src/app/api/investors/route.ts",
    overview:
      "Berechnet wie viele Attribute durch Enrichment gefunden wurden. Score = Anzahl vorhandener Felder / Maximum. Visualisiert als Fortschrittsbalken in der Tabelle.",
    details: [
      {
        type: "table",
        title: "Company Score (0\u20139)",
        headers: ["Feld", "Quelle"],
        rows: [
          ["description", "LLM aus Artikeln + Website"],
          ["website", "Brave Search + LLM Verify"],
          ["foundedYear", "LLM aus Website/Artikeln"],
          ["employeeRange", "LLM aus Website/LinkedIn"],
          ["linkedinUrl", "Brave Search"],
          ["country", "LLM Extraction"],
          ["status", "LLM (active/acquired/ipo/shut_down)"],
          ["location (HQ)", "Neo4j HQ_IN Relation"],
          ["logoUrl", "Tiered Logo Discovery"],
        ],
      },
      {
        type: "table",
        title: "Investor Score (0\u201312)",
        headers: ["Feld", "Quelle"],
        rows: [
          ["type", "LLM (VC, PE, Angel, Corporate, etc.)"],
          ["website", "Brave Search + LLM Verify"],
          ["linkedinUrl", "Brave Search"],
          ["foundedYear", "LLM aus Website"],
          ["logoUrl", "Tiered Logo Discovery"],
          ["aum", "LLM aus Website (Assets Under Management)"],
          ["hq", "LLM aus Website"],
          ["stageFocus[]", "LLM (Seed, Series A, etc.)"],
          ["sectorFocus[]", "LLM (FinTech, HealthTech, etc.)"],
          ["geoFocus[]", "LLM (Europe, DACH, etc.)"],
          ["checkSizeMinUsd", "LLM aus Website"],
          ["checkSizeMaxUsd", "LLM aus Website"],
        ],
      },
    ],
  },
  {
    id: "post-generation",
    title: "Post Generation",
    subtitle: "LLM-generierte deutsche Beitr\u00E4ge",
    icon: FileText,
    color: "text-orange-500",
    file: "src/lib/post-generator.ts",
    overview:
      "Generiert ca. 800-W\u00F6rter-Artikel auf Deutsch f\u00FCr jede Funding-Runde. Betr\u00E4ge werden in Euro konvertiert (USD \u00D7 0.92). 5-teilige Artikelstruktur mit striktem System-Prompt.",
    details: [
      {
        type: "pipeline",
        title: "Artikelstruktur",
        steps: [
          { label: "1. Einstieg", detail: "[Name] sammelt [Betrag] in einer [Stage]-Runde ein. Einordnung." },
          { label: "2. Unternehmen", detail: "Produkt, Gesch\u00E4ftsmodell, Zielgruppe, Branche. 2\u20133 Abs\u00E4tze." },
          { label: "3. Investoren & Runde", detail: "Lead + Beteiligte. Kapitalverwendung. 1\u20132 Abs\u00E4tze." },
          { label: "4. Kontext", detail: "Marktumfeld, Branchentrends, bisherige Runden. 1\u20132 Abs\u00E4tze." },
          { label: "5. Ausblick", detail: "Standort, Total Raised, Wachstumspl\u00E4ne. 1 Absatz." },
        ],
      },
      {
        type: "table",
        title: "Konfiguration",
        headers: ["Parameter", "Wert"],
        rows: [
          ["Modell", "Claude Haiku 4.5"],
          ["Max Tokens", "4.096"],
          ["Ziel-L\u00E4nge", "~800 W\u00F6rter"],
          ["Sprache", "Deutsch, sachlich"],
          ["EUR-Konvertierung", "USD \u00D7 0.92"],
          ["Format Betr\u00E4ge", '"X,X Mio. \u20AC" / "X,X Mrd. \u20AC"'],
          ["Upsert", "Regenerieren \u00FCberschreibt bestehenden Post"],
        ],
      },
    ],
  },
  {
    id: "graph-sync",
    title: "Graph Sync & Normalization",
    subtitle: "Neo4j Entity Resolution",
    icon: Layers,
    color: "text-indigo-500",
    file: "src/lib/graph-sync.ts",
    overview:
      "Synchronisiert extrahierte Daten in den Neo4j Knowledge Graph. Entity-Normalisierung verhindert Duplikate durch Suffix-Entfernung und String-Normalisierung.",
    details: [
      {
        type: "pipeline",
        title: "Normalisierung",
        steps: [
          { label: "Company", detail: "Entfernt: GmbH, UG, AG, SE, Inc, Ltd, LLC, Corp, SA, SAS, BV, AB, PLC, Co, Limited" },
          { label: "Investor", detail: "Entfernt: Ventures, Capital, Partners, Management, Advisors, Group, Fund, Investments, Holdings" },
          { label: "String Cleanup", detail: "Lowercase \u2192 Punktuation entfernen \u2192 Whitespace normalisieren" },
        ],
      },
      {
        type: "table",
        title: "Neo4j Unique Constraints",
        headers: ["Node", "Constraint"],
        rows: [
          ["Company", "normalizedName (unique)"],
          ["InvestorOrg", "normalizedName (unique)"],
          ["FundingRound", "roundKey (unique)"],
          ["Article", "url (unique)"],
          ["Location", "name (unique)"],
        ],
      },
      {
        type: "table",
        title: "Graph-Relationen",
        headers: ["Von", "Relation", "Nach"],
        rows: [
          ["Company", "RAISED", "FundingRound"],
          ["InvestorOrg", "PARTICIPATED_IN {role}", "FundingRound"],
          ["FundingRound", "SOURCED_FROM", "Article"],
          ["Company", "HQ_IN", "Location"],
        ],
      },
    ],
  },
];

// ============================================================================
// COMPONENTS
// ============================================================================

function WeightBar({ weight, color }: { weight: string; color: string }) {
  const pct = parseFloat(weight) * (weight.includes("%") ? 1 : 100);
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="h-2 w-16 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct * 2.5, 100)}%` }} />
      </div>
      <span className="font-mono text-[11px] text-muted-foreground tabular-nums w-10">{weight}</span>
    </div>
  );
}

function WeightsBlock({ block }: { block: Extract<DetailBlock, { type: "weights" }> }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{block.title}</h4>
      <div className="space-y-1">
        {block.items.map((item) => (
          <div key={item.label} className="flex items-center gap-3 rounded-md border border-border/50 bg-card px-3 py-2">
            <WeightBar weight={item.weight} color={item.color} />
            <span className="text-sm font-medium min-w-[180px]">{item.label}</span>
            <span className="text-xs text-muted-foreground">{item.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SignalsBlock({ block }: { block: Extract<DetailBlock, { type: "signals" }> }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{block.title}</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
        {block.negative.map((s) => (
          <div key={s.pattern} className="flex items-center justify-between rounded-md border border-red-500/20 bg-red-500/5 px-3 py-1.5">
            <span className="text-sm">{s.pattern}</span>
            <Badge variant="outline" className="text-[10px] font-mono border-red-500/30 text-red-600 dark:text-red-400">
              {s.penalty}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function PipelineBlock({ block }: { block: Extract<DetailBlock, { type: "pipeline" }> }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{block.title}</h4>
      <div className="space-y-0">
        {block.steps.map((step, i) => (
          <div key={step.label} className="flex items-start gap-3 relative">
            {i < block.steps.length - 1 && (
              <div className="absolute left-[11px] top-[24px] bottom-0 w-px bg-border" />
            )}
            <div className="relative z-10 mt-1 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 border-primary/30 bg-background">
              <span className="text-[9px] font-bold text-primary">{i + 1}</span>
            </div>
            <div className="flex-1 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{step.label}</span>
                {step.badge && (
                  <Badge variant="secondary" className="text-[9px] h-4 px-1.5">{step.badge}</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{step.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TableBlock({ block }: { block: Extract<DetailBlock, { type: "table" }> }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{block.title}</h4>
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              {block.headers.map((h) => (
                <th key={h} className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, i) => (
              <tr key={i} className="border-t border-border/50">
                {row.map((cell, j) => (
                  <td key={j} className={`px-3 py-1.5 ${j === 0 ? "font-medium" : "text-muted-foreground"}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TiersBlock({ block }: { block: Extract<DetailBlock, { type: "tiers" }> }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{block.title}</h4>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {block.tiers.map((tier) => (
          <div key={tier.name} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{tier.name}</span>
              <Badge variant="outline" className="text-[10px] font-mono">{tier.score}</Badge>
            </div>
            <div className={`h-1 rounded-full ${tier.color}`} />
            <ul className="space-y-1">
              {tier.items.map((item) => (
                <li key={item} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <ArrowRight className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground/50" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function TextBlock({ block }: { block: Extract<DetailBlock, { type: "text" }> }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{block.title}</h4>
      <p className="text-sm text-muted-foreground leading-relaxed">{block.content}</p>
    </div>
  );
}

function CodeBlock({ block }: { block: Extract<DetailBlock, { type: "code" }> }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{block.title}</h4>
      <pre className="rounded-md border bg-muted/50 p-3 text-xs font-mono overflow-x-auto">{block.code}</pre>
    </div>
  );
}

function DetailRenderer({ block }: { block: DetailBlock }) {
  switch (block.type) {
    case "weights": return <WeightsBlock block={block} />;
    case "signals": return <SignalsBlock block={block} />;
    case "pipeline": return <PipelineBlock block={block} />;
    case "table": return <TableBlock block={block} />;
    case "tiers": return <TiersBlock block={block} />;
    case "text": return <TextBlock block={block} />;
    case "code": return <CodeBlock block={block} />;
  }
}

function AlgorithmCard({ algo, forceOpen }: { algo: AlgoSection; forceOpen?: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (forceOpen !== undefined) setOpen(forceOpen);
  }, [forceOpen]);
  const Icon = algo.icon;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-accent/30 transition-colors"
      >
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted ${algo.color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{algo.title}</h3>
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-normal text-muted-foreground">
              {algo.subtitle}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{algo.overview}</p>
        </div>
        <code className="hidden lg:block text-[10px] text-muted-foreground/60 font-mono shrink-0">
          {algo.file}
        </code>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>
      {open && (
        <div className="border-t px-5 py-4 space-y-5">
          <p className="text-sm text-muted-foreground leading-relaxed">{algo.overview}</p>
          {algo.details.map((block, i) => (
            <DetailRenderer key={i} block={block} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PAGE
// ============================================================================

export default function AlgorithmsPage() {
  const [expandAll, setExpandAll] = useState(false);

  return (
    <div className="flex h-[calc(100vh-1.5rem)] flex-col gap-3">
      <div className="flex items-center gap-3 shrink-0">
        <Shield className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Algorithmen</h1>
        <Badge variant="secondary" className="text-[10px]">
          {algorithms.length} Algorithmen
        </Badge>
        <button
          onClick={() => setExpandAll(!expandAll)}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expandAll ? "Alle zuklappen" : "Alle aufklappen"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {/* Data Flow Overview */}
        <div className="rounded-lg border bg-gradient-to-r from-card to-muted/30 p-4 mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Data Flow</h2>
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            {[
              { label: "RSS Feeds", icon: Search },
              { label: "Regex Extraction", icon: Zap },
              { label: "LLM Extraction", icon: BrainCircuit },
              { label: "Round Grouping", icon: GitMerge },
              { label: "Graph Sync", icon: Layers },
              { label: "Enrichment", icon: Sparkles },
              { label: "Post Generation", icon: FileText },
            ].map((step, i, arr) => (
              <div key={step.label} className="flex items-center gap-1.5">
                <div className="flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5">
                  <step.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{step.label}</span>
                </div>
                {i < arr.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground/50" />}
              </div>
            ))}
          </div>
        </div>

        {algorithms.map((algo) => (
          <AlgorithmCard key={algo.id} algo={algo} forceOpen={expandAll} />
        ))}
      </div>
    </div>
  );
}
