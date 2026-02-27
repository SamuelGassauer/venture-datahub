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
  // ENRICHMENT — Company (DETAILLIERT)
  // ===========================================================================
  {
    id: "company-enrichment",
    title: "Company / Startup Enrichment",
    subtitle: "5-Stage Pipeline",
    icon: Building2,
    color: "text-blue-500",
    file: "src/lib/company-enricher.ts",
    overview:
      "Reichert Startup-Daten an durch Kombination von Artikel-Inhalten und der offiziellen Company-Website. 5 Stages: Articles \u2192 Website Discovery \u2192 LLM Extraction \u2192 Logo Discovery \u2192 Graph Save. Artikel und Website werden gleichberechtigt als Quellen genutzt (1 kombinierter LLM-Call). Abort-Bedingung: Wenn weder Artikel noch Website verf\u00fcgbar sind, wird abgebrochen.",
    details: [
      // ---- STAGE 1 ----
      {
        type: "text",
        title: "Stage 1 \u2014 Artikel laden",
        content: "Einstiegspunkt ist der normalisierte Firmenname (normalizeCompany: Lowercase, Suffixe wie GmbH/Inc/Ltd entfernen, Whitespace normalisieren). Damit wird in Neo4j die Graph-Traversierung ausgef\u00fchrt: Company \u2192 RAISED \u2192 FundingRound \u2192 SOURCED_FROM \u2192 Article. Ergebnis: Liste von Artikel-URLs + Titeln. Anschlie\u00dfend wird aus PostgreSQL (Prisma) der volle HTML-Content jedes Artikels geladen. Jeder Artikel wird HTML-bereinigt (alle Tags entfernen, Whitespace normalisieren) und auf 3.000 Zeichen gek\u00fcrzt. Leere Texte werden verworfen.",
      },
      {
        type: "table",
        title: "Stage 1 \u2014 Details",
        headers: ["Aspekt", "Detail"],
        rows: [
          ["Graph-Query", "MATCH (c:Company {normalizedName})-[:RAISED]->(fr)-[:SOURCED_FROM]->(a) RETURN DISTINCT a.url, a.title"],
          ["Content-Quelle", "PostgreSQL (Prisma) \u2014 articles.content (HTML)"],
          ["HTML-Bereinigung", "Alle Tags entfernen, Multi-Whitespace normalisieren, trim"],
          ["Max. pro Artikel", "3.000 Zeichen nach Bereinigung"],
          ["Ohne Content", "Nur der Titel wird als Fallback verwendet"],
          ["Abort wenn", "0 Artikel UND keine Website \u2192 Enrichment stoppt mit Fehler"],
        ],
      },
      // ---- STAGE 2 ----
      {
        type: "text",
        title: "Stage 2 \u2014 Website pr\u00fcfen oder discovern",
        content: "Zuerst wird gepr\u00fcft ob in Neo4j bereits eine Website gespeichert ist. Falls ja, durchl\u00e4uft sie drei Pr\u00fcfungen: (1) URL-Validierung \u2014 ist sie in der Blocklist (Social Media, News)? Falls ja: ignorieren. (2) HTTP-Fetch \u2014 ist die Seite erreichbar? GET-Request mit Chrome User-Agent, 6s Timeout, Follow Redirects. Mindestens 100 Zeichen HTML-Content. (3) LLM-Verifikation \u2014 geh\u00f6rt die Website tats\u00e4chlich zu diesem Startup? Falls alle 3 bestanden: Website-HTML wird gescraped (Meta-Daten, JSON-LD, Body-Text, Logo-Kandidaten). Falls Schritt 2 oder 3 fehlschl\u00e4gt: Website + Logo + LinkedIn werden aus Neo4j gel\u00f6scht und die Discovery-Pipeline startet.",
      },
      {
        type: "pipeline",
        title: "Stage 2 \u2014 Bestehende Website verifizieren",
        steps: [
          { label: "Neo4j-Lookup", detail: "c.website laden. Falls null oder Social-Media/News-Domain \u2192 direkt zu Discovery." },
          { label: "HTTP GET", detail: "Browser User-Agent, 6s Timeout, Follow Redirects. Response muss OK sein und \u2265 100 Zeichen HTML enthalten." },
          { label: "LLM-Verifikation", detail: "Pre-Check: Wenn Page Title + Meta + Body zusammen < 50 Chars \u2192 sofort ablehnen (Parking/Redirect/SPA-Shell). Sonst: Haiku pr\u00fcft ob Website-Content zur Company passt.", badge: "Haiku 4.5" },
          { label: "Match \u2192 Scrape", detail: "HTML parsen: Meta-Description, JSON-LD (foundedDate, employees, sameAs/LinkedIn), Body-Text (2.000 Chars), Logo-Kandidaten extrahieren." },
          { label: "No Match \u2192 Clear + Re-Discover", detail: "website, logoUrl, linkedinUrl in Neo4j auf null setzen. Weiter zu Discovery-Pipeline." },
          { label: "Unreachable \u2192 Re-Discover", detail: "Fetch fehlgeschlagen \u2192 Website als ung\u00fcltig behandeln, Discovery starten." },
        ],
      },
      {
        type: "text",
        title: "Stage 2 \u2014 Website Discovery Pipeline (v2)",
        content: "Wenn keine verifizierte Website existiert, startet die 4-Phasen-Discovery. Der gesamte Prozess trackt abgelehnte Domains \u2014 einmal abgelehnte Domains werden nie erneut gepr\u00fcft. NEU in v2: Phase 0 (Domain Guessing), Pre-LLM Name Matching, Candidate Scoring, erweiterte Blocklisten, VC-Domain-Erkennung.",
      },
      {
        type: "pipeline",
        title: "Discovery Phase 0 \u2014 Domain Guessing (NEU)",
        steps: [
          { label: "Slug-Generierung", detail: "Firmenname \u2192 Domain-Slugs: joined ('deepl'), hyphenated ('hello-fresh'), first-word ('klarna'), initials ('bcg')" },
          { label: "TLD-Kombination", detail: "Jeder Slug wird mit 8 TLDs kombiniert: .com, .io, .ai, .co, .tech, .de, .eu, .app" },
          { label: "Paralleler Fetch", detail: "6 Domains gleichzeitig per GET (6s Timeout). Kein Search-API-Call n\u00f6tig!" },
          { label: "Quick Name Check (Pre-Filter)", detail: "quickNameCheck(): Pr\u00fcft ob Firmenname im Page Title/Meta/JSON-LD vorkommt. Score \u2265 0.5 \u2192 wird LLM-verifiziert. NUR zum Filtern, nie zum Akzeptieren!", badge: "Kein API" },
          { label: "LLM Content Scoring", detail: "JEDER Kandidat wird per LLM inhaltlich gepr\u00fcft: Beschreibt die Website dasselbe Gesch\u00e4ft wie die Artikel? Score \u2265 60/100 \u2192 akzeptiert. Name-Match allein reicht NIE.", badge: "Haiku 4.5" },
        ],
      },
      {
        type: "pipeline",
        title: "Discovery Phase 1 \u2014 Brave Web Search",
        steps: [
          { label: "Suchanfrage", detail: "'\"[Firmenname]\" startup company official website' \u2192 8 Ergebnisse von Brave Web Search API", badge: "Brave API" },
          { label: "LinkedIn extrahieren", detail: "Erster Treffer mit linkedin.com/company/ wird als LinkedIn-URL gespeichert" },
          { label: "Kandidaten filtern", detail: "isValidWebsiteUrl(): Entfernt Social Media, News, VC-Datenbanken (60+ Domains in NEWS_DOMAINS + NOT_A_WEBSITE_DOMAINS)" },
          { label: "Candidate Scoring (NEU)", detail: "Jeder Kandidat wird vor dem Fetch gescort: +100 Domain=Firmenname, +70 Substring, +30 Homepage, +25 Name in Search-Title, -40 VC-Domain, -30 Blog-Pfad", badge: "Scoring" },
          { label: "Sortierung + Batch-Fetch", detail: "Kandidaten nach Score sortiert (h\u00f6chster zuerst). 5er-Batches parallel per GET geladen (6s Timeout)" },
          { label: "Pre-LLM Name Check (nur Reject)", detail: "quickNameCheck() auf jeder geladenen Seite. Score < 0.3 UND Domain-Score < 50 \u2192 ohne LLM abgelehnt (spart Haiku-Calls). Wird NIE zum Akzeptieren genutzt!", badge: "Kein API" },
          { label: "LLM Content Scoring (IMMER)", detail: "JEDER verbleibende Kandidat wird per LLM inhaltlich gepr\u00fcft. 5 Subscores: namePresent (0-25), businessMatch (0-35), ownWebsite (0-20), domainPlausible (0-10), entityTypeMatch (0-10). Total \u2265 60/100 \u2192 akzeptiert.", badge: "Haiku 4.5" },
        ],
      },
      {
        type: "pipeline",
        title: "Discovery Phase 2 \u2014 Artikel-URLs + LLM-Wissen",
        steps: [
          { label: "URL-Extraktion aus Artikeln", detail: "Alle <a href> und bare URLs aus Artikel-HTML extrahieren. Regex: href-Attribute + https://-Patterns." },
          { label: "Domain-Dedup", detail: "Pro Domain nur die erste URL behalten. Max. 30 Unique-URLs." },
          { label: "Filter", detail: "NEWS_DOMAINS (60+) entfernen. Artikel-Source-Domains entfernen. Bereits abgelehnte Domains entfernen." },
          { label: "LLM-Call (Attempt 1)", detail: "System: WEBSITE_DISCOVERY_PROMPT. Input: Entity-Name + Typ + extrahierte URLs + Artikel-Kontext + Rejections. LLM gibt 3\u20135 Website-Kandidaten + LinkedIn-URL zur\u00fcck.", badge: "Haiku 4.5" },
          { label: "Scored validateAndVerify()", detail: "Alle Kandidaten werden gescort, sortiert, Pre-LLM-gefiltert und dann per LLM verifiziert." },
        ],
      },
      {
        type: "pipeline",
        title: "Discovery Phase 3 \u2014 Retry mit Feedback",
        steps: [
          { label: "LLM-Call (Attempt 2)", detail: "LLM erh\u00e4lt die komplette Rejection-Liste: Welche Domains wurden abgelehnt und warum.", badge: "Haiku 4.5" },
          { label: "Anweisung", detail: "Explizite Aufforderung: 'NONE of the previous candidates were correct. Try DIFFERENT domains. Use your training knowledge.'" },
          { label: "Validierung", detail: "Neue Kandidaten durchlaufen denselben Score + Fetch + LLM-Verify Prozess." },
          { label: "Kein Treffer", detail: "Falls auch Phase 3 fehlschl\u00e4gt: website = null, nur LinkedIn falls gefunden." },
        ],
      },
      {
        type: "table",
        title: "Candidate Scoring \u2014 Gewichte (NEU)",
        headers: ["Signal", "Score", "Beschreibung"],
        rows: [
          ["Domain = Firmenname", "+100", "Domain exakt gleich dem normalisierten Namen (z.B. stripe.com f\u00fcr Stripe)"],
          ["Domain Substring", "+70", "Name als Teilstring der Domain oder umgekehrt (z.B. deepl in deepl.com)"],
          ["First Word Match", "+40", "Erstes Wort des Namens in Domain (z.B. 'klarna' in klarna.com)"],
          ["Homepage (Pfad = /)", "+30", "Startseite statt Unterseite \u2192 wahrscheinlicher die echte Website"],
          ["Name in Search-Title", "+25", "Firmenname erscheint im Brave-Search-Titel des Ergebnisses"],
          [".com TLD", "+10", "Bevorzugte TLD f\u00fcr Startups"],
          [".io / .ai / .co TLD", "+8", "Typische Startup-TLDs"],
          ["Name in Search-Description", "+10", "Firmenname im Search-Snippet"],
          ["VC-Domain-Pattern", "-40", "Domain enth\u00e4lt 'ventures', 'capital', 'partners', '.vc' \u2192 Investor-Website (wenn Startup gesucht)"],
          ["Blog/News-Pfad", "-25", "URL enth\u00e4lt /blog/, /news/, /press/, /article/"],
          ["Datums-Pfad", "-30", "URL enth\u00e4lt /2024/01/ o.\u00e4. (typisch f\u00fcr Artikel)"],
          ["Aggregator in Titel", "-30", "Crunchbase, PitchBook, Dealroom, LinkedIn, Wikipedia im Search-Titel"],
        ],
      },
      {
        type: "table",
        title: "Pre-LLM Name Check \u2014 quickNameCheck() (NEU)",
        headers: ["Signal", "Score", "Aktion"],
        rows: [
          ["Name in Page Title", "1.0", "Firmenname exakt im <title> \u2192 sehr wahrscheinlich korrekt"],
          ["Normalized Match", "0.9", "Name nach Sonderzeichen-Entfernung in Title enthalten"],
          ["JSON-LD Organization.name", "0.9", "Strukturierte Daten best\u00e4tigen den Namen"],
          ["Name in Meta Description", "0.7", "Name in <meta description> \u2192 wahrscheinlich korrekt"],
          ["First Word in Title", "0.6", "Erstes Wort des Namens im Title (z.B. 'Klarna' in 'Klarna | Buy now')"],
          ["Name in Canonical Domain", "0.5", "Name in der Domain selbst (Fallback)"],
          ["Kein Match", "0.0", "Name nirgends gefunden \u2192 Fast-Reject bei Domain-Score < 50"],
        ],
      },
      {
        type: "table",
        title: "LLM Content Scoring \u2014 5 Dimensionen (NEU)",
        headers: ["Dimension", "Max", "Beschreibung"],
        rows: [
          ["namePresent", "25", "Erscheint der Firmenname auf der Seite? 25=prominent (Title/Heading), 15=im Content, 0=nicht gefunden"],
          ["businessMatch", "35", "WICHTIGSTE Dimension: Stimmt das Gesch\u00e4ft/Produkt der Website mit den Artikeln \u00fcberein? 35=selbe Branche+Produkt, 15-25=selbe Branche, 0-10=anderes Gesch\u00e4ft (auch bei Name-Match!)"],
          ["ownWebsite", "20", "Ist es die EIGENE Website? 20=klar eigen (Produktseiten, About, Kontakt), 10=unklar, 0=Third-Party (News, DB-Profil, Wikipedia)"],
          ["domainPlausible", "10", "Passt die Domain zum Firmennamen? 10=offensichtlich, 5=plausibel, 0=unrelated"],
          ["entityTypeMatch", "10", "Richtiger Entity-Typ? 10=Startup/Company, 0=Investor-Website (und umgekehrt)"],
        ],
      },
      {
        type: "table",
        title: "Verifikation \u2014 Schwellwerte & Ablauf",
        headers: ["Parameter", "Wert", "Beschreibung"],
        rows: [
          ["Threshold", "\u2265 60/100", "Gesamtscore muss mindestens 60 sein f\u00fcr Akzeptanz"],
          ["Pre-Check", "< 50 Chars", "Seite mit weniger als 50 Chars Content \u2192 sofort Score 0 (kein LLM-Call)"],
          ["Kinderpedia-Fall", "~30/100", "Name vorhanden (25), aber businessMatch=0 (Kinder-Enzyklop\u00e4die statt EdTech-SaaS) \u2192 abgelehnt"],
          ["LLM bekommt", "Alles", "URL, Domain, Title, Meta, JSON-LD, Body (1000 Chars), Artikel-Kontext (800 Chars)"],
          ["Hinweis im Prompt", "Explizit", "'A matching name is NOT enough! The website content must describe the SAME BUSINESS as the articles.'"],
          ["Output", "JSON", "{ score, namePresent, businessMatch, ownWebsite, domainPlausible, entityTypeMatch, reason }"],
        ],
      },
      // ---- STAGE 2b: Scraping ----
      {
        type: "text",
        title: "Stage 2b \u2014 Website Scraping (scrapeHtml)",
        content: "Sobald eine verifizierte Website vorliegt (entweder gespeichert oder neu entdeckt), wird das HTML geparst. Cheerio l\u00e4dt das HTML. Zuerst werden Logo-Kandidaten extrahiert (siehe Logo Discovery). Dann werden strukturierte Daten gesammelt: Meta-Description, OG-Description, JSON-LD (foundingDate, numberOfEmployees, sameAs-LinkedIn), LinkedIn-Links im HTML. Danach werden Nav/Footer/Script/Style/Header/Aside/Noscript entfernt und der Body-Text auf 2.000 Zeichen gek\u00fcrzt.",
      },
      {
        type: "table",
        title: "Scraping \u2014 Extrahierte Datenquellen",
        headers: ["Quelle", "Was", "Beispiel"],
        rows: [
          ["<meta name='description'>", "Meta-Description", "Unternehmensbeschreibung"],
          ["<meta property='og:description'>", "OG-Description (Fallback)", "Social-Media-Beschreibung"],
          ["JSON-LD (@type: Organization)", "foundingDate", "\"2019\""],
          ["JSON-LD", "numberOfEmployees.value", "\"150\""],
          ["JSON-LD sameAs[]", "LinkedIn-URL", "https://linkedin.com/company/..."],
          ["<a href='linkedin.com/company/'>", "LinkedIn-Links im HTML", "Footer/Header Links"],
          ["<body> (bereinigt)", "Body-Text", "Max. 2.000 Chars nach Tag-Entfernung"],
        ],
      },
      // ---- STAGE 3 ----
      {
        type: "text",
        title: "Stage 3 \u2014 LLM Extraction",
        content: "Ein einzelner LLM-Call kombiniert alle verf\u00fcgbaren Quellen. Das Text-Budget ist aufgeteilt: 4.000 Chars f\u00fcr Artikel (gleichm\u00e4\u00dfig auf N Artikel verteilt: floor(4000/N) pro Artikel) und 3.000 Chars f\u00fcr Website-Content. Zusammen max. ~7.000 Chars User-Content. Das LLM extrahiert 8 Felder plus eine Confidence-Bewertung pro Feld (0.0\u20131.0). Nach der Extraktion werden Discovery-Ergebnisse gemerged: Falls das LLM keine Website/LinkedIn zur\u00fcckgibt, werden die in Phase 2 entdeckten URLs mit Confidence 0.8 \u00fcbernommen.",
      },
      {
        type: "table",
        title: "Stage 3 \u2014 LLM-Call Details",
        headers: ["Parameter", "Wert"],
        rows: [
          ["Modell", "Claude Haiku 4.5 (claude-haiku-4-5-20251001)"],
          ["Max Tokens", "512"],
          ["System Prompt", "ENRICH_SYSTEM_PROMPT: 'You are a company data enrichment engine...'"],
          ["User Content", "'Company: [Name]\\n\\n--- Article 1 ---\\n...\\n--- Company Website ---\\n...'"],
          ["Artikel-Budget", "4.000 Chars total, aufgeteilt: floor(4000/N) pro Artikel"],
          ["Website-Budget", "3.000 Chars"],
          ["Output-Format", "JSON mit 8 Feldern + fieldConfidence-Objekt"],
          ["Parse-Fehler", "Markdown-Codeblock-Wrapper werden entfernt. Bei JSON-Parse-Fehler: leeres Ergebnis."],
        ],
      },
      {
        type: "table",
        title: "Stage 3 \u2014 Extrahierte Felder",
        headers: ["Feld", "Typ", "LLM-Anweisung", "Post-Processing"],
        rows: [
          ["description", "string", "Firmenbeschreibung aus Quellen extrahieren", "null falls leer"],
          ["website", "string", "Volle URL", "isValidWebsiteUrl() \u2014 Social Media wird abgelehnt"],
          ["foundedYear", "number", "Gr\u00fcndungsjahr", "Nur wenn typeof === 'number'"],
          ["employeeRange", "enum", "Eins von: 1-10, 11-50, 51-200, 201-500, 501-1000, 1000+", "null falls nicht passend"],
          ["linkedinUrl", "string", "Volle LinkedIn-URL", "null falls leer"],
          ["country", "string", "Ländername (Germany, France, UK, ...)", "null falls leer"],
          ["status", "enum", "Eins von: active, acquired, closed", "null falls leer"],
          ["location", "string", "Stadtname", "Erstellt Location-Node + HQ_IN Relation"],
        ],
      },
      {
        type: "table",
        title: "Stage 3 \u2014 Post-Processing & Merge",
        headers: ["Schritt", "Beschreibung"],
        rows: [
          ["Website-Sanity", "Falls LLM eine Social-Media/News-URL als Website vorschl\u00e4gt \u2192 wird auf null gesetzt"],
          ["Discovery-Merge: website", "Falls LLM website=null aber Discovery hat eine gefunden \u2192 \u00fcbernehmen mit Confidence 0.8"],
          ["Discovery-Merge: linkedinUrl", "Falls LLM linkedinUrl=null aber Discovery hat eine gefunden \u2192 \u00fcbernehmen mit Confidence 0.8"],
          ["Confidence-Quelle", "Jedes Feld hat einen eigenen Confidence-Wert (0.0\u20131.0) vom LLM"],
        ],
      },
      // ---- STAGE 4 ----
      {
        type: "text",
        title: "Stage 4 \u2014 Logo Discovery",
        content: "Falls Website-HTML vorliegt, werden zuerst die HTML-Logo-Kandidaten validiert (siehe Logo Discovery Algorithmus). Falls kein valides Logo gefunden wird, oder keine Website existiert, wird Brave Image Search als Fallback genutzt: Query '[Name] startup company logo', 8 Ergebnisse. Logo-Kandidaten werden nach Relevanz gescort (+40 eigene Domain, +30 'logo' im URL, +20 SVG, etc.) und der beste per HEAD-Request validiert.",
      },
      {
        type: "pipeline",
        title: "Stage 4 \u2014 Logo-Entscheidungsbaum",
        steps: [
          { label: "HTML-Kandidaten vorhanden?", detail: "Ja + Website-URL vorhanden \u2192 findBestLogo() aufrufen (Tiered Validation, max. 8 Kandidaten, 3er-Batches)" },
          { label: "Valides Logo gefunden?", detail: "Ja \u2192 Logo-URL speichern, weiter zu Stage 5" },
          { label: "Kein HTML-Logo \u2192 Brave Image Search", detail: "Query: '[Name] startup company logo'. 8 Ergebnisse. Scoring nach Domain/Format/Gr\u00f6\u00dfe.", badge: "Brave Images" },
          { label: "Bester Image-Kandidat", detail: "Score \u2265 15 \u2192 HEAD-Request Validierung (4s Timeout, Content-Type pr\u00fcfen)" },
          { label: "Kein Logo gefunden", detail: "logoUrl bleibt null. Kein Logo wird gespeichert." },
        ],
      },
      // ---- STAGE 5 ----
      {
        type: "text",
        title: "Stage 5 \u2014 Graph Save",
        content: "Zuerst werden die aktuellen Werte der Company aus Neo4j geladen, inklusive der lockedFields-Liste. F\u00fcr jedes der 7 Skalar-Felder gilt: Wenn das Feld gelockt ist \u2192 \u00fcberspringen. Wenn der neue Wert null ist \u2192 \u00fcberspringen. Wenn der aktuelle Wert null ist ODER die neue Confidence > 0.6 \u2192 \u00fcberschreiben. Logo wird immer aktualisiert wenn ein neues gefunden wurde (au\u00dfer gelockt). Location wird separat behandelt: Bei Confidence > 0.3 wird ein Location-Node gemerged und eine HQ_IN-Relation erstellt. Zum Schluss wird enrichedAt auf datetime() gesetzt und der Artikel-Content in die Article-Nodes geschrieben (max. 5.000 Chars, f\u00fcr GraphRAG).",
      },
      {
        type: "table",
        title: "Stage 5 \u2014 Update-Regeln pro Feld",
        headers: ["Bedingung", "Aktion"],
        rows: [
          ["Feld ist in lockedFields", "\u00dcberspringen \u2014 manuell gesperrte Felder werden nie \u00fcberschrieben"],
          ["Neuer Wert = null", "\u00dcberspringen \u2014 kein Daten = kein Update"],
          ["Aktueller Wert = null", "Immer \u00fcberschreiben \u2014 auch bei niedriger Confidence"],
          ["Aktueller Wert vorhanden + Confidence > 0.6", "\u00dcberschreiben \u2014 neuer Wert hat gen\u00fcgend Vertrauen"],
          ["Aktueller Wert vorhanden + Confidence \u2264 0.6", "NICHT \u00fcberschreiben \u2014 bestehender Wert bleibt erhalten"],
          ["Logo (nicht LLM)", "Immer \u00fcberschreiben wenn gefunden (au\u00dfer gelockt). Logo kommt nicht aus LLM."],
          ["Location", "Confidence > 0.3 gen\u00fcgt. MERGE Location-Node + MERGE HQ_IN Relation."],
          ["enrichedAt", "Wird IMMER gesetzt, auch wenn keine Felder aktualisiert wurden."],
          ["Article Content", "Jeder Artikel-Content wird in den Article-Node geschrieben (max. 5.000 Chars, f\u00fcr GraphRAG)."],
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
      // ---- SCHWÄCHEN ----
      {
        type: "text",
        title: "v2 Verbesserungen (aktuell implementiert)",
        content: "1) LLM Content Scoring: Jede Website wird IMMER per LLM inhaltlich gepr\u00fcft. 5 Subscores (namePresent, businessMatch, ownWebsite, domainPlausible, entityTypeMatch), Total \u2265 60/100 f\u00fcr Akzeptanz. Name-/Domain-Match allein reicht NIE. 2) Domain Guessing: Phase 0 testet direkte Domain-Kombinationen (name.com/.io/.ai) ohne Search-API \u2014 g\u00fcnstigste Methode. Aber IMMER LLM-verifiziert. 3) Candidate Scoring: Alle Kandidaten werden VOR dem Fetch nach 12 Signalen gescort und sortiert. Nur zur Priorisierung, nie zur Akzeptanz. 4) Pre-LLM Name Check: quickNameCheck() wird NUR zum Ablehnen verwendet (Score < 0.3 + Domain < 50 \u2192 kein LLM-Call). 5) VC-Domain-Erkennung: Domains mit 'ventures', 'capital', 'partners' werden bei Startup-Suche herabgestuft (-40 Score). 6) Erweiterte Blocklisten: 60+ News/VC/Aggregator-Domains. 7) Kinderpedia-Fix: businessMatch-Score verhindert dass eine Kinder-Enzyklop\u00e4die f\u00fcr ein EdTech-Startup gehalten wird.",
      },
      {
        type: "text",
        title: "Verbleibende Schwachstellen",
        content: "1) Keine Re-Verification-Cache: Einmal verifizierte Websites werden bei jedem Enrich-Call erneut gepr\u00fcft. 2) Kein Diff-Tracking: Kein Log welche Werte sich ge\u00e4ndert haben und warum. 3) JS-SPAs: Rein client-seitig gerenderte Seiten liefern < 50 Chars und werden als leer abgelehnt. 4) employeeRange: Nur 6 Buckets. 5) Kein Batch-Enrichment: Jede Company wird einzeln angereichert.",
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
      <div className="h-2 w-16 rounded-full bg-foreground/[0.04] overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct * 2.5, 100)}%` }} />
      </div>
      <span className="font-mono text-[11px] text-foreground/35 tabular-nums w-10">{weight}</span>
    </div>
  );
}

function WeightsBlock({ block }: { block: Extract<DetailBlock, { type: "weights" }> }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">{block.title}</h4>
      <div className="space-y-1">
        {block.items.map((item) => (
          <div key={item.label} className="flex items-center gap-3 lg-inset-row px-3 py-2">
            <WeightBar weight={item.weight} color={item.color} />
            <span className="text-[13px] font-semibold tracking-[-0.01em] text-foreground/85 min-w-[180px]">{item.label}</span>
            <span className="text-[12px] text-foreground/45">{item.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SignalsBlock({ block }: { block: Extract<DetailBlock, { type: "signals" }> }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">{block.title}</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
        {block.negative.map((s) => (
          <div key={s.pattern} className="flex items-center justify-between rounded-[8px] bg-red-500/8 px-3 py-1.5" style={{ border: "0.5px solid rgba(239, 68, 68, 0.2)" }}>
            <span className="text-[13px] text-foreground/85">{s.pattern}</span>
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
      <h4 className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">{block.title}</h4>
      <div className="space-y-0">
        {block.steps.map((step, i) => (
          <div key={step.label} className="flex items-start gap-3 relative">
            {i < block.steps.length - 1 && (
              <div className="absolute left-[11px] top-[24px] bottom-0 w-px bg-foreground/[0.06]" />
            )}
            <div className="relative z-10 mt-1 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-foreground/[0.04]" style={{ border: "0.5px solid rgba(var(--foreground-rgb, 0 0 0) / 0.1)" }}>
              <span className="text-[9px] font-bold text-foreground/55">{i + 1}</span>
            </div>
            <div className="flex-1 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold tracking-[-0.01em] text-foreground/85">{step.label}</span>
                {step.badge && (
                  <span className="text-[9px] font-medium bg-foreground/[0.04] text-foreground/55 rounded-full px-1.5 py-0.5">{step.badge}</span>
                )}
              </div>
              <p className="text-[12px] text-foreground/45 mt-0.5">{step.detail}</p>
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
      <h4 className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">{block.title}</h4>
      <div className="lg-inset rounded-[10px] overflow-hidden">
        <table className="w-full text-[13px] tracking-[-0.01em]">
          <thead>
            <tr className="glass-table-header">
              {block.headers.map((h) => (
                <th key={h} className="px-3 py-1.5 text-left text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, i) => (
              <tr key={i} className="lg-inset-table-row">
                {row.map((cell, j) => (
                  <td key={j} className={`px-3 py-1.5 ${j === 0 ? "font-semibold text-foreground/85" : "text-foreground/45"}`}>
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
      <h4 className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">{block.title}</h4>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {block.tiers.map((tier) => (
          <div key={tier.name} className="lg-inset rounded-[14px] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold tracking-[-0.01em] text-foreground/85">{tier.name}</span>
              <Badge variant="outline" className="text-[10px] font-mono">{tier.score}</Badge>
            </div>
            <div className={`h-1 rounded-full ${tier.color}`} />
            <ul className="space-y-1">
              {tier.items.map((item) => (
                <li key={item} className="flex items-start gap-1.5 text-[12px] text-foreground/45">
                  <ArrowRight className="h-3 w-3 mt-0.5 shrink-0 text-foreground/15" />
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
      <h4 className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">{block.title}</h4>
      <p className="text-[13px] text-foreground/45 leading-relaxed">{block.content}</p>
    </div>
  );
}

function CodeBlock({ block }: { block: Extract<DetailBlock, { type: "code" }> }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35">{block.title}</h4>
      <pre className="lg-inset rounded-[10px] p-3 text-[12px] font-mono overflow-x-auto text-foreground/70">{block.code}</pre>
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
    <div className="lg-inset rounded-[14px] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-foreground/[0.02] transition-colors"
      >
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-foreground/[0.04] ${algo.color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-foreground/85">{algo.title}</h3>
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-normal text-foreground/45">
              {algo.subtitle}
            </Badge>
          </div>
          <p className="text-[12px] text-foreground/45 mt-0.5 line-clamp-1">{algo.overview}</p>
        </div>
        <code className="hidden lg:block text-[10px] text-foreground/30 font-mono shrink-0">
          {algo.file}
        </code>
        {open ? (
          <ChevronDown className="h-4 w-4 text-foreground/35 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-foreground/35 shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-5 py-4 space-y-5" style={{ borderTop: "0.5px solid rgba(var(--foreground-rgb, 0 0 0) / 0.06)" }}>
          <p className="text-[13px] text-foreground/45 leading-relaxed">{algo.overview}</p>
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
    <div className="flex h-[calc(100vh-1.5rem)] flex-col">
      {/* Tier 2: Toolbar */}
      <div className="glass-status-bar px-4 py-2.5 flex items-center gap-3">
        <Shield className="h-4 w-4 text-foreground/40" />
        <span className="text-[13px] font-semibold text-foreground/85">Algorithmen</span>
        <span className="text-[11px] font-medium bg-foreground/[0.04] text-foreground/55 rounded-full px-2 py-0.5 tabular-nums">
          {algorithms.length}
        </span>
        <button
          onClick={() => setExpandAll(!expandAll)}
          className="ml-auto glass-capsule-btn px-2.5 py-1 text-[12px]"
        >
          {expandAll ? "Alle zuklappen" : "Alle aufklappen"}
        </button>
      </div>

      {/* Tier 3: Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {/* Data Flow Overview */}
        <div className="lg-inset rounded-[16px] p-4 mb-3">
          <h2 className="text-[11px] tracking-[0.04em] uppercase font-medium text-foreground/35 mb-3">Data Flow</h2>
          <div className="flex items-center gap-1.5 flex-wrap text-[12px]">
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
                <div className="flex items-center gap-1.5 rounded-[8px] bg-foreground/[0.04] px-2.5 py-1.5" style={{ border: "0.5px solid rgba(var(--foreground-rgb, 0 0 0) / 0.06)" }}>
                  <step.icon className="h-3.5 w-3.5 text-foreground/40" />
                  <span className="font-medium text-foreground/70">{step.label}</span>
                </div>
                {i < arr.length - 1 && <ArrowRight className="h-3 w-3 text-foreground/15" />}
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
