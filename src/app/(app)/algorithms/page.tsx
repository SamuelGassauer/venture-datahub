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
  Building2,
  Users,
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
      "Erkennt Funding-Runden in Artikeln durch gewichtete Signalanalyse. Jedes Signal (Regex-Pattern, semantische Marker) tr\u00e4gt positiv oder negativ zum Confidence-Score bei. Final: clamp(sum, 0, 1).",
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
          ["Anti-Pattern in Title", "\u00d71.0", "Volle Penalty"],
          ["Anti-Pattern in Body", "\u00d70.5", "Halbe Penalty (schw\u00e4cheres Signal)"],
          ["VC Fund Filter", "Reject", "Firmenname enth\u00e4lt 'Ventures/Capital/Fund' ohne 'startup'"],
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
      "Zweite Extraktionsstufe: Claude Haiku analysiert Artikel-Texte und cross-referenziert mehrere Quellen f\u00fcr h\u00f6here Genauigkeit. Extrahiert strukturierte Daten + Company Metadata.",
    details: [
      {
        type: "pipeline",
        title: "Extraction Pipeline",
        steps: [
          { label: "Input Budget", detail: "Single: 3.000 Chars | Multi: 6.000/N pro Quelle", badge: "Haiku 4.5" },
          { label: "System Prompt", detail: "Nur spezifische Startup-Runden. Ausschluss: Roundups, IPOs, Acquisitions, VC Funds, Events" },
          { label: "Strukturierte Ausgabe", detail: "Company, Amount, Stage, Investors, Lead, Country, Confidence (0-1)" },
          { label: "Company Metadata", detail: "Description, Website, Founded Year, Employee Range, LinkedIn" },
          { label: "Multi-Source Signal", detail: "N Quellen \u2192 Signal 'multi_source_N' f\u00fcr h\u00f6here Confidence" },
        ],
      },
      {
        type: "table",
        title: "W\u00e4hrungskonvertierung",
        headers: ["W\u00e4hrung", "Faktor \u2192 USD"],
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
          { label: "Time Proximity", weight: "15%", color: "bg-cyan-400", description: "Linearer Abfall \u00fcber 14-Tage-Fenster" },
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
          { label: "Best Name Selection", detail: "K\u00fcrzester Name aus High-Confidence Entries der Gruppe" },
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
          ["Token Min. L\u00e4nge", "3 Zeichen"],
        ],
      },
    ],
  },
  // ===========================================================================
  // ENRICHMENT — Company
  // ===========================================================================
  {
    id: "company-enrichment",
    title: "Company / Startup Enrichment",
    subtitle: "5-Stage Pipeline",
    icon: Building2,
    color: "text-blue-500",
    file: "src/lib/company-enricher.ts",
    overview:
      "Reichert Startup-Daten an durch Kombination von Artikel-Inhalten und der offiziellen Company-Website. 5 Stages: Articles \u2192 Website Discovery \u2192 LLM Extraction \u2192 Logo Discovery \u2192 Graph Save. Artikel und Website werden gleichberechtigt als Quellen genutzt (1 kombinierter LLM-Call).",
    details: [
      {
        type: "pipeline",
        title: "Pipeline",
        steps: [
          { label: "1. Articles laden", detail: "Neo4j: Company\u2192RAISED\u2192FundingRound\u2192SOURCED_FROM\u2192Article. Content aus Prisma laden. Budget: 4.000 Chars aufgeteilt auf N Artikel.", badge: "Neo4j + PG" },
          { label: "2. Website pr\u00fcfen / discovern", detail: "Bestehende Website aus Neo4j laden und per LLM verifizieren (match? \u2192 scrapen, no match? \u2192 l\u00f6schen + neu suchen). Ohne gespeicherte Website: Brave Search + LLM-Verify Discovery-Pipeline.", badge: "Brave + Haiku" },
          { label: "3. LLM Extraction", detail: "1 kombinierter LLM-Call: Artikeltexte (4.000 Chars) + Website-Content (3.000 Chars) \u2192 8 strukturierte Felder + Confidence pro Feld (0.0\u20131.0).", badge: "Haiku 4.5" },
          { label: "4. Logo Discovery", detail: "HTML-Kandidaten aus Website extrahieren (Tiered Scoring) \u2192 validieren. Fallback: Brave Image Search '[Name] startup company logo'.", badge: "Brave Images" },
          { label: "5. Graph Save", detail: "Neo4j-Update: Feld nur \u00fcberschreiben wenn Confidence > 0.6 oder Feld bisher null. LockedFields respektieren. enrichedAt Timestamp setzen.", badge: "Neo4j" },
        ],
      },
      {
        type: "table",
        title: "Extrahierte Felder (8 + Logo)",
        headers: ["Feld", "Typ", "Quelle", "Beschreibung"],
        rows: [
          ["description", "string", "Artikel + Website", "Unternehmensbeschreibung"],
          ["website", "string", "Brave Search + LLM Verify", "Offizielle Website-URL"],
          ["foundedYear", "number", "Website / Artikel", "Gr\u00fcndungsjahr"],
          ["employeeRange", "enum", "Website / Artikel", "1-10, 11-50, 51-200, 201-500, 501-1000, 1000+"],
          ["linkedinUrl", "string", "Brave / Website-Links", "LinkedIn Company Page"],
          ["country", "string", "Artikel / Website", "Land (z.B. 'Germany', 'France')"],
          ["status", "enum", "Artikel / Website", "active, acquired, closed"],
          ["location", "string", "Artikel / Website", "Stadt \u2192 erstellt HQ_IN\u2192Location Node in Neo4j"],
          ["logoUrl", "string", "Website HTML / Brave", "Bestes Logo nach Tiered Scoring"],
        ],
      },
      {
        type: "pipeline",
        title: "Website Discovery (3 Phasen)",
        steps: [
          { label: "Phase 1: Brave Search", detail: "Query: '\"[Name]\" startup company official website' \u2192 8 Ergebnisse. LinkedIn-URL extrahieren. Jede Kandidaten-URL per LLM verifiziert.", badge: "Primary" },
          { label: "Phase 2: Artikel-URLs + LLM-Wissen", detail: "URLs aus Artikel-HTML extrahieren (href + bare URLs). Kombiniert mit LLM-Vorschl\u00e4gen (Domains aus Trainingsdaten). Rejected Domains werden nicht erneut gepr\u00fcft.", badge: "Fallback" },
          { label: "Phase 3: Retry mit Feedback", detail: "Falls alles abgelehnt: LLM erh\u00e4lt Rejection-Liste und schl\u00e4gt alternative Domains vor. Max. 2 LLM-Attempts.", badge: "Fallback" },
        ],
      },
      {
        type: "table",
        title: "LLM Extraction Config",
        headers: ["Parameter", "Wert"],
        rows: [
          ["Modell", "Claude Haiku 4.5"],
          ["Max Tokens", "512"],
          ["Artikel-Budget", "4.000 Chars (aufgeteilt auf N Artikel)"],
          ["Website-Budget", "3.000 Chars"],
          ["Confidence-Threshold", "> 0.6 zum \u00dcberschreiben bestehender Werte"],
          ["Website-Sanity", "Social-Media/News-URLs werden als Website abgelehnt"],
          ["Location-Threshold", "> 0.3 f\u00fcr HQ_IN Relation"],
        ],
      },
      {
        type: "table",
        title: "Website-Verifikation (LLM)",
        headers: ["Check", "Beschreibung"],
        rows: [
          ["Pre-Filter", "< 50 Chars Content \u2192 sofort ablehnen (Parking/Redirect/SPA)"],
          ["LLM-Input", "Page Title + Meta Desc + Body (800 Chars) + Artikel-Kontext (600 Chars)"],
          ["Entscheidung", "Stimmt Website-Content mit Entity aus Artikeln \u00fcberein?"],
          ["Output", "{ match: boolean, reason: string }"],
        ],
      },
      {
        type: "table",
        title: "Enrichment Score (0\u20139)",
        headers: ["#", "Feld", "Score +1 wenn"],
        rows: [
          ["1", "description", "Nicht null"],
          ["2", "website", "Nicht null"],
          ["3", "foundedYear", "Nicht null"],
          ["4", "employeeRange", "Nicht null"],
          ["5", "linkedinUrl", "Nicht null"],
          ["6", "country", "Nicht null"],
          ["7", "status", "Nicht null"],
          ["8", "location", "HQ_IN Relation existiert"],
          ["9", "logoUrl", "Nicht null"],
        ],
      },
    ],
  },
  // ===========================================================================
  // ENRICHMENT — Investor
  // ===========================================================================
  {
    id: "investor-enrichment",
    title: "Investor / Fund Enrichment",
    subtitle: "Dual-Source Trust Model",
    icon: Users,
    color: "text-violet-500",
    file: "src/lib/investor-enricher.ts",
    overview:
      "Reichert Investoren-Daten mit einem Dual-Trust-Modell an: Die eigene Website des Investors ist die prim\u00e4re Quelle (hoher Trust), Artikel liefern nur Deal-Activity-Patterns (gedeckelter Trust bei 0.6). 2 getrennte LLM-Calls mit unterschiedlichen System-Prompts.",
    details: [
      {
        type: "pipeline",
        title: "Pipeline",
        steps: [
          { label: "1. Articles laden", detail: "Neo4j: InvestorOrg\u2192PARTICIPATED_IN\u2192FundingRound\u2192SOURCED_FROM\u2192Article. Content aus Prisma. Nur f\u00fcr Deal-Kontext, nicht prim\u00e4re Datenquelle.", badge: "Neo4j + PG" },
          { label: "2. Website Discovery", detail: "2 Brave-Search-Queries: '\"[Name]\" venture capital official website' + '\"[Name]\" investor fund website'. Pro Query 8 Ergebnisse. Jede URL per LLM verifiziert.", badge: "Brave + Haiku" },
          { label: "3a. Website Extraction (LLM-Call 1)", detail: "Investor-Website-Content (4.000 Chars) \u2192 alle 10 Felder. Hoher Trust: Website = prim\u00e4re Quelle.", badge: "Haiku 4.5" },
          { label: "3b. Article Extraction (LLM-Call 2)", detail: "Artikel-Content (4.000 Chars) \u2192 nur Activity-Felder: type, stageFocus, sectorFocus, geoFocus, checkSize. aum/foundedYear/website/linkedin sind GESPERRT.", badge: "Haiku 4.5" },
          { label: "4. Merge", detail: "Website-Daten gewinnen immer. Artikel-Daten f\u00fcllen nur L\u00fccken, max. Confidence = 0.6." },
          { label: "5. Logo + Save", detail: "Logo Discovery (identisch zu Company). Graph-Update mit Confidence-Check + LockedFields.", badge: "Neo4j" },
        ],
      },
      {
        type: "table",
        title: "Extrahierte Felder (10 + Logo)",
        headers: ["Feld", "Typ", "Website \u2713", "Artikel \u2713", "Beschreibung"],
        rows: [
          ["type", "enum", "\u2713", "\u2713", "vc, pe, cvc, angel_group, family_office, sovereign_wealth, government, accelerator, incubator, bank, hedge_fund"],
          ["stageFocus", "string[]", "\u2713", "\u2713", "Pre-Seed, Seed, Series A\u2013E, Growth"],
          ["sectorFocus", "string[]", "\u2713", "\u2713", "Fintech, SaaS, HealthTech, DeepTech, ..."],
          ["geoFocus", "string[]", "\u2713", "\u2713", "DACH, Europe, Nordics, Global, ..."],
          ["checkSizeMinUsd", "number", "\u2713", "\u2713", "Minimum Check Size in USD"],
          ["checkSizeMaxUsd", "number", "\u2713", "\u2713", "Maximum Check Size in USD"],
          ["aum", "number", "\u2713", "\u2014", "Assets Under Management (NUR von Website)"],
          ["foundedYear", "number", "\u2713", "\u2014", "Gr\u00fcndungsjahr (NUR von Website)"],
          ["website", "string", "Brave", "\u2014", "Offizielle Investor-Website"],
          ["linkedinUrl", "string", "Brave", "\u2014", "LinkedIn Company Page"],
          ["logoUrl", "string", "Website/Brave", "\u2014", "Bestes Logo"],
        ],
      },
      {
        type: "weights",
        title: "Trust-Modell",
        items: [
          { label: "Website-Daten", weight: "1.0", color: "bg-violet-500", description: "Voller Trust \u2014 direkt von der Investor-Website extrahiert. Alle Felder verf\u00fcgbar." },
          { label: "Artikel-Daten (Activity)", weight: "0.6", color: "bg-violet-300", description: "Max. Confidence = 0.6. Nur type, stage/sector/geoFocus, checkSize. Abgeleitet aus Deal-Patterns." },
          { label: "Merge-Regel", weight: "\u2014", color: "bg-violet-200", description: "Website gewinnt immer. Artikel-Daten nur wenn Website-Feld leer ist." },
        ],
      },
      {
        type: "pipeline",
        title: "Website Discovery (Investor-spezifisch)",
        steps: [
          { label: "2 Brave-Search-Queries", detail: "Verschiedene Phrasierungen f\u00fcr bessere Trefferquote. Investoren-Websites sind oft schwerer zu finden als Startup-Websites." },
          { label: "LLM-Verifikation", detail: "Spezifischer Kontext: 'This is an investment firm / VC / fund / angel investor. This must be their OWN website, not a portfolio company.'", badge: "Haiku 4.5" },
          { label: "LinkedIn-Fallback", detail: "Separate Brave-Suche: '\"[Name]\" investor linkedin' \u2192 3 Ergebnisse. Nur wenn LinkedIn nicht aus Website-Search gefunden." },
        ],
      },
      {
        type: "table",
        title: "Unterschied zum Company-Enricher",
        headers: ["Aspekt", "Company", "Investor"],
        rows: [
          ["Prim\u00e4re Datenquelle", "Artikel + Website gleichwertig", "Website prim\u00e4r, Artikel sekund\u00e4r"],
          ["LLM-Calls", "1 (kombiniert)", "2 getrennte (Website + Artikel)"],
          ["Artikel-Trust", "Volles Vertrauen", "Gedeckelt bei max. 0.6"],
          ["Brave-Search-Queries", "1 Query", "2 Queries (verschiedene Phrasierungen)"],
          ["Array-Felder", "Keine", "3 (stageFocus, sectorFocus, geoFocus)"],
          ["Location-Node", "Ja (HQ_IN Relation)", "Nein"],
          ["Status-Tracking", "Ja (active/acquired/closed)", "Nein"],
          ["Artikel-gesperrte Felder", "\u2014", "aum, foundedYear, website, linkedinUrl"],
          ["LinkedIn-Fallback", "Aus Artikel-URLs / Brave", "Separate Brave-Suche"],
          ["LLM Prompt Fokus", "Alle Company-Daten", "Artikel: nur Investment-Patterns"],
        ],
      },
      {
        type: "table",
        title: "Enrichment Score (0\u201312)",
        headers: ["#", "Feld", "Score +1 wenn"],
        rows: [
          ["1", "type", "Nicht null"],
          ["2", "website", "Nicht null"],
          ["3", "linkedinUrl", "Nicht null"],
          ["4", "foundedYear", "Nicht null"],
          ["5", "logoUrl", "Nicht null"],
          ["6", "aum", "Nicht null"],
          ["7", "hq", "Nicht null"],
          ["8", "stageFocus[]", "Array nicht leer"],
          ["9", "sectorFocus[]", "Array nicht leer"],
          ["10", "geoFocus[]", "Array nicht leer"],
          ["11", "checkSizeMinUsd", "Nicht null"],
          ["12", "checkSizeMaxUsd", "Nicht null"],
        ],
      },
    ],
  },
  // ===========================================================================
  // LOGO DISCOVERY (Shared)
  // ===========================================================================
  {
    id: "logo-discovery",
    title: "Logo Discovery",
    subtitle: "Tiered Extraction + Validation",
    icon: Image,
    color: "text-pink-500",
    file: "src/lib/company-enricher.ts",
    overview:
      "Shared zwischen Company- und Investor-Enricher. 3-stufige Logo-Erkennung aus Website-HTML mit Score-basiertem Ranking + Brave Image Search Fallback. Headshot-Detection verhindert Portrait-Fotos als Logos.",
    details: [
      {
        type: "tiers",
        title: "HTML Extraction Tiers",
        tiers: [
          {
            name: "Tier 1 \u2014 Structural",
            score: "1000+",
            color: "bg-emerald-500",
            items: [
              "JSON-LD logo/image (1095/1080)",
              "Erstes <a><img> in Header (1090)",
              "Apple Touch Icon (1075+)",
              "SVG Favicon (1070)",
            ],
          },
          {
            name: "Tier 2 \u2014 Semantic",
            score: "500+",
            color: "bg-yellow-500",
            items: [
              '<img> mit "logo" in class/id/alt (+50)',
              "In Header/Nav (+15), Home-Link (+20)",
              "Parent hat logo-Class (+30)",
              "<picture> source mit logo (+60)",
            ],
          },
          {
            name: "Tier 3 \u2014 Heuristic",
            score: "50\u2013200",
            color: "bg-orange-500",
            items: [
              "Header Home-Link <img> (200)",
              "Erstes <img> in Header/Nav (150)",
              "Regular Favicon 64px+ (100\u2013120)",
              "og:image (50, -40 bei Headshot)",
            ],
          },
        ],
      },
      {
        type: "pipeline",
        title: "Validation Pipeline",
        steps: [
          { label: "HTML Kandidaten extrahieren", detail: "Synchron: Alle Tiers durchsuchen, deduplizieren nach URL, nach Score sortieren" },
          { label: "Direct Apple-Touch-Icon", detail: "/apple-touch-icon.png als Fallback-Kandidat (Score: 900) \u2014 viele Sites haben ihn ohne <link> Tag" },
          { label: "Batch-Validierung", detail: "3er-Batches parallel, max. 8 Kandidaten. HTTP HEAD mit Browser User-Agent: Status OK, Content-Type image/*, > 200 Bytes" },
          { label: "Erster valider Kandidat gewinnt", detail: "Sortiert nach Score \u2014 h\u00f6chster Score der Validierung besteht wird ausgew\u00e4hlt" },
          { label: "Brave Image Search Fallback", detail: "'[Name] startup/VC logo' \u2192 8 Ergebnisse. Scoring: +40 eigene Domain, +30 'logo' im URL, +20 SVG, +10 PNG, -15 Bannergr\u00f6\u00dfe", badge: "Brave Images" },
        ],
      },
      {
        type: "table",
        title: "Validierung & Filter",
        headers: ["Check", "Regel"],
        rows: [
          ["HTTP HEAD", "Timeout 4s, User-Agent: Chrome. Content-Type muss image/* sein"],
          ["Min. Dateigr\u00f6\u00dfe", "200 Bytes (filtert Tracking-Pixels)"],
          ["SVG Ausnahme", "Darf kleiner als 200B sein"],
          ["Headshot Regex", "headshot|portrait|avatar|profile-pic|ceo|founder|team|people|staff|face|person"],
          ["Headshot Penalty", "Tier 1: -200 | Tier 2 img: -80 | og:image: -40"],
          ["Crop+Person", "URL enth\u00e4lt 'crop' + head/face/portrait \u2192 Headshot"],
          ["Reject Patterns", "data: URLs, pixel/tracking/spacer im Pfad"],
          ["Image Search Scoring", "+40 eigene Domain, +30 'logo', +20 SVG, +10 PNG, -10 Crunchbase/Dealroom, -15 Ratio > 5"],
        ],
      },
    ],
  },
  // ===========================================================================
  // SHARED INFRA
  // ===========================================================================
  {
    id: "website-blocklist",
    title: "Website & URL Filtering",
    subtitle: "Blocklists & Domain-Validation",
    icon: Shield,
    color: "text-red-500",
    file: "src/lib/company-enricher.ts",
    overview:
      "Gemeinsame Blocklisten f\u00fcr Company- und Investor-Enricher. Verhindert dass Social-Media-Profile, News-Seiten oder VC-Datenbanken als offizielle Websites gespeichert werden.",
    details: [
      {
        type: "table",
        title: "Niemals als Website (NOT_A_WEBSITE_DOMAINS)",
        headers: ["Kategorie", "Domains"],
        rows: [
          ["Social Media", "linkedin.com, twitter.com, x.com, facebook.com, instagram.com, youtube.com, tiktok.com"],
          ["Developer", "github.com, medium.com, substack.com"],
          ["VC-Datenbanken", "crunchbase.com, pitchbook.com, dealroom.co"],
          ["Referenz", "wikipedia.org"],
        ],
      },
      {
        type: "table",
        title: "News/RSS Blocklist (60+ Domains)",
        headers: ["Kategorie", "Beispiele"],
        rows: [
          ["US Tech News", "techcrunch.com, venturebeat.com, wired.com, theverge.com, arstechnica.com"],
          ["Finanz-Medien", "bloomberg.com, reuters.com, cnbc.com, ft.com, wsj.com, forbes.com"],
          ["EU Startup News", "sifted.eu, eu-startups.com, tech.eu, gruenderszene.de, t3n.de"],
          ["Datenbanken", "pitchbook.com, crunchbase.com, dealroom.co, cbinsights.com"],
          ["Big Tech", "google.com, apple.com, amazon.com, microsoft.com"],
        ],
      },
      {
        type: "table",
        title: "Validierungs-Regeln",
        headers: ["Regel", "Beschreibung"],
        rows: [
          ["isValidWebsiteUrl()", "Pr\u00fcft gegen NOT_A_WEBSITE_DOMAINS inkl. Subdomains"],
          ["NEWS_DOMAINS Filter", "Filtert auch Subdomains (*.techcrunch.com)"],
          ["Artikel-Source Domains", "URLs vom selben Feed/Artikel-Domain werden ignoriert"],
          ["Bereits abgelehnte Domains", "Rejected Domains werden im Discovery-Durchlauf gespeichert"],
          ["LockedFields", "Manuell gesperrte Felder werden bei Auto-Update \u00fcbersprungen"],
          ["Confidence > 0.6", "Bestehende Werte nur bei hohem Confidence \u00fcberschrieben"],
        ],
      },
    ],
  },
  // ===========================================================================
  // Post Generation & Graph Sync
  // ===========================================================================
  {
    id: "post-generation",
    title: "Post Generation",
    subtitle: "LLM-generierte deutsche Beitr\u00e4ge",
    icon: FileText,
    color: "text-orange-500",
    file: "src/lib/post-generator.ts",
    overview:
      "Generiert ca. 800-W\u00f6rter-Artikel auf Deutsch f\u00fcr jede Funding-Runde. Betr\u00e4ge werden in Euro konvertiert (USD \u00d7 0.92). 5-teilige Artikelstruktur mit striktem System-Prompt.",
    details: [
      {
        type: "pipeline",
        title: "Artikelstruktur",
        steps: [
          { label: "1. Einstieg", detail: "[Name] sammelt [Betrag] in einer [Stage]-Runde ein. Einordnung." },
          { label: "2. Unternehmen", detail: "Produkt, Gesch\u00e4ftsmodell, Zielgruppe, Branche. 2\u20133 Abs\u00e4tze." },
          { label: "3. Investoren & Runde", detail: "Lead + Beteiligte. Kapitalverwendung. 1\u20132 Abs\u00e4tze." },
          { label: "4. Kontext", detail: "Marktumfeld, Branchentrends, bisherige Runden. 1\u20132 Abs\u00e4tze." },
          { label: "5. Ausblick", detail: "Standort, Total Raised, Wachstumspl\u00e4ne. 1 Absatz." },
        ],
      },
      {
        type: "table",
        title: "Konfiguration",
        headers: ["Parameter", "Wert"],
        rows: [
          ["Modell", "Claude Haiku 4.5"],
          ["Max Tokens", "4.096"],
          ["Ziel-L\u00e4nge", "~800 W\u00f6rter"],
          ["Sprache", "Deutsch, sachlich"],
          ["EUR-Konvertierung", "USD \u00d7 0.92"],
          ["Format Betr\u00e4ge", '"X,X Mio. \u20ac" / "X,X Mrd. \u20ac"'],
          ["Upsert", "Regenerieren \u00fcberschreibt bestehenden Post"],
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
