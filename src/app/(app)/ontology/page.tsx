"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  CircleDollarSign,
  Landmark,
  Briefcase,
  User,
  MapPin,
  Factory,
  FileText,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Handshake,
  GraduationCap,
  DollarSign,
  ShieldCheck,
  TrendingUp,
  Wallet,
  Globe,
  Tag,
  Users,
  ChevronsRight,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

type NodeDef = {
  id: string;
  label: string;
  category: string;
  icon: React.ElementType;
  color: string;
  description: string;
  properties: { name: string; type: string; description: string; required?: boolean }[];
  source: string;
  examples?: string[];
};

type EdgeDef = {
  id: string;
  label: string;
  category: string;
  from: string;
  to: string;
  description: string;
  properties?: { name: string; type: string; description: string }[];
  cardinality: string;
  temporal?: boolean;
};

// ============================================================================
// ONTOLOGY DATA — 16 Node Types, 24 Edge Types
// ============================================================================

const NODE_CATEGORIES = [
  { id: "org", label: "Organizations", description: "Alle Organisationstypen im VC-Ökosystem" },
  { id: "capital", label: "Capital Events", description: "Finanzierungsereignisse und Kapitalflüsse" },
  { id: "people", label: "People & Governance", description: "Personen, Rollen und Board-Strukturen" },
  { id: "taxonomy", label: "Taxonomy", description: "Klassifikation und Segmentierung" },
  { id: "geo", label: "Geography", description: "Geographische Hierarchie" },
  { id: "provenance", label: "Provenance", description: "Datenherkunft und Quellenverknüpfung" },
];

const EDGE_CATEGORIES = [
  { id: "funding", label: "Funding Flow" },
  { id: "org_structure", label: "Organizational Structure" },
  { id: "people_rel", label: "People & Governance" },
  { id: "classification", label: "Classification" },
  { id: "provenance", label: "Provenance & Temporal" },
];

const NODES: NodeDef[] = [
  // === Organizations ===
  {
    id: "company",
    label: "Company",
    category: "org",
    icon: Building2,
    color: "bg-blue-500",
    description: "Portfolio-Unternehmen / Startup, das Kapital aufnimmt",
    properties: [
      { name: "name", type: "string", description: "Kanonischer Firmenname", required: true },
      { name: "legalName", type: "string?", description: "Offizieller Handelsregistername" },
      { name: "aliases", type: "string[]", description: "Alternative Schreibweisen, frühere Namen, Marken" },
      { name: "status", type: "enum", description: "active | acquired | ipo | shut_down | unknown", required: true },
      { name: "foundedDate", type: "Date?", description: "Gründungsdatum (oder nur Jahr)" },
      { name: "employeeRange", type: "string?", description: "1-10 | 11-50 | 51-200 | 201-500 | 501-1000 | 1000+" },
      { name: "description", type: "string?", description: "Ein-Satz-Beschreibung des Geschäftsmodells" },
      { name: "website", type: "string?", description: "Primäre Domain" },
      { name: "linkedinUrl", type: "string?", description: "LinkedIn Company Page" },
      { name: "crunchbaseUrl", type: "string?", description: "Crunchbase Permalink" },
      { name: "totalFundingUsd", type: "number?", description: "Kumuliertes Funding (berechnet)" },
      { name: "lastFundingDate", type: "Date?", description: "Datum der letzten bekannten Runde" },
      { name: "lastFundingStage", type: "string?", description: "Stage der letzten Runde" },
      { name: "lastValuationUsd", type: "number?", description: "Letzte bekannte Bewertung" },
    ],
    source: "FundingRound.companyName + NER + Enrichment",
    examples: ["Celonis", "N26", "Personio", "Wefox"],
  },
  {
    id: "investorOrg",
    label: "InvestorOrg",
    category: "org",
    icon: Landmark,
    color: "bg-violet-500",
    description: "Investmentfirma / Organisation, die Kapital bereitstellt",
    properties: [
      { name: "name", type: "string", description: "Kanonischer Name", required: true },
      { name: "aliases", type: "string[]", description: "Namensvarianten (inkl. Kurzformen, frühere Namen)" },
      { name: "type", type: "enum", description: "vc | pe | cvc | angel_group | family_office | sovereign_wealth | government | accelerator | incubator | bank | hedge_fund | unknown", required: true },
      { name: "stage_focus", type: "string[]", description: "Typische Stages: [Pre-Seed, Seed, Series A, ...]" },
      { name: "sector_focus", type: "string[]", description: "Sektorfokus: [Fintech, SaaS, ...]" },
      { name: "geo_focus", type: "string[]", description: "Geofokus: [DACH, Europe, Global, ...]" },
      { name: "checkSizeMinUsd", type: "number?", description: "Typische Mindest-Ticketgröße" },
      { name: "checkSizeMaxUsd", type: "number?", description: "Typische Maximal-Ticketgröße" },
      { name: "aum", type: "number?", description: "Assets Under Management in USD" },
      { name: "foundedYear", type: "number?", description: "Gründungsjahr der Firma" },
      { name: "website", type: "string?", description: "Primäre Domain" },
      { name: "linkedinUrl", type: "string?", description: "LinkedIn Company Page" },
      { name: "totalInvestments", type: "number?", description: "Anzahl bekannter Investments (berechnet)" },
      { name: "totalExits", type: "number?", description: "Anzahl bekannter Exits (berechnet)" },
    ],
    source: "FundingRound.investors[] + FundingRound.leadInvestor + Enrichment",
    examples: ["Sequoia Capital", "Earlybird Venture Capital", "HV Capital", "Balderton Capital"],
  },
  {
    id: "fundManager",
    label: "FundManager",
    category: "org",
    icon: ShieldCheck,
    color: "bg-indigo-500",
    description: "GP-Entität, die rechtlich einen oder mehrere Fonds verwaltet (Management Company)",
    properties: [
      { name: "name", type: "string", description: "Offizielle Firma des GP", required: true },
      { name: "legalName", type: "string?", description: "Handelsregisterbezeichnung" },
      { name: "jurisdiction", type: "string?", description: "Rechtsstandort (z.B. Cayman, Luxembourg, Delaware)" },
      { name: "regulatoryStatus", type: "string?", description: "BaFin-registriert, SEC, FCA, CSSF, etc." },
      { name: "aifmLicense", type: "boolean?", description: "AIFM-Lizenz vorhanden (EU-Regulierung)" },
    ],
    source: "Enrichment (Regulierungs-Register, Handelsregister)",
    examples: ["Sequoia Capital Operations LLC", "EarlyBird DWES Management GmbH"],
  },
  {
    id: "fund",
    label: "Fund",
    category: "org",
    icon: Briefcase,
    color: "bg-amber-500",
    description: "Spezifisches Fonds-Vehikel (Limited Partnership) mit eigenem Vintage und Volumen",
    properties: [
      { name: "name", type: "string", description: "Fondsname", required: true },
      { name: "vintage", type: "number?", description: "Auflagejahr (First Close)" },
      { name: "sizeUsd", type: "number?", description: "Target-/Final-Fondsvolumen in USD" },
      { name: "status", type: "enum", description: "fundraising | investing | harvesting | fully_realized | unknown" },
      { name: "type", type: "enum", description: "venture | growth | buyout | fund_of_funds | spv | continuation | secondaries | opportunity | impact" },
      { name: "strategy", type: "string?", description: "Investment-Strategie / Thesis" },
      { name: "fundNumber", type: "number?", description: "Sequenznummer (Fund I=1, II=2, ...)" },
      { name: "firstCloseDate", type: "Date?", description: "Datum des First Close" },
      { name: "finalCloseDate", type: "Date?", description: "Datum des Final Close" },
      { name: "moic", type: "number?", description: "Multiple on Invested Capital (wenn bekannt)" },
      { name: "irr", type: "number?", description: "Internal Rate of Return in % (wenn bekannt)" },
      { name: "dpi", type: "number?", description: "Distributions to Paid-In" },
      { name: "tvpi", type: "number?", description: "Total Value to Paid-In" },
    ],
    source: "Enrichment (PitchBook, Preqin, SEC Filings, BaFin)",
    examples: ["Earlybird Digital West Fund VIII", "Sequoia Capital Fund XVI", "HV Capital Fund IX"],
  },
  {
    id: "limitedPartner",
    label: "LimitedPartner",
    category: "org",
    icon: Wallet,
    color: "bg-teal-500",
    description: "LP / Institutional Allocator — Pensionskasse, Endowment, Sovereign Wealth Fund, DFI, Family Office",
    properties: [
      { name: "name", type: "string", description: "Organisationsname", required: true },
      { name: "type", type: "enum", description: "pension | endowment | sovereign_wealth | insurance | family_office | dfi | fund_of_funds | corporate | hni | unknown", required: true },
      { name: "aum", type: "number?", description: "Verwaltetes Vermögen gesamt" },
      { name: "vcAllocationPct", type: "number?", description: "Anteil der VC-Allokation in %" },
      { name: "country", type: "string?", description: "Herkunftsland" },
    ],
    source: "Enrichment (Preqin, PitchBook, SEC 13F, öffentliche Berichte)",
    examples: ["CalPERS", "KfW Capital", "EIF", "Yale Endowment", "Norges Bank"],
  },

  // === Capital Events ===
  {
    id: "fundingRound",
    label: "FundingRound",
    category: "capital",
    icon: CircleDollarSign,
    color: "bg-emerald-500",
    description: "Einzelne Finanzierungsrunde (Equity, Convertible, Grant)",
    properties: [
      { name: "amountUsd", type: "number?", description: "Angekündigtes Rundenvolumen in USD", required: false },
      { name: "amount", type: "number?", description: "Originalwährungs-Betrag" },
      { name: "currency", type: "string", description: "Originalwährung (EUR, USD, GBP, ...)", required: true },
      { name: "stage", type: "enum", description: "Pre-Seed | Seed | Series A-E+ | Growth | Bridge | Debt | Grant | Undisclosed" },
      { name: "dealType", type: "enum", description: "equity | convertible_note | safe | revenue_based | venture_debt | grant | secondary | unknown" },
      { name: "announcedDate", type: "Date?", description: "Datum der öffentlichen Ankündigung" },
      { name: "closedDate", type: "Date?", description: "Tatsächliches Closing-Datum (oft unbekannt)" },
      { name: "preMoneyValuation", type: "number?", description: "Pre-Money-Bewertung in USD" },
      { name: "postMoneyValuation", type: "number?", description: "Post-Money-Bewertung in USD" },
      { name: "equityPct", type: "number?", description: "Verwässerung / Equity-Anteil der Runde in %" },
      { name: "isExtension", type: "boolean", description: "Ist dies eine Extension einer vorherigen Runde?" },
      { name: "isFollowOn", type: "boolean", description: "Follow-on in bestehendes Portfolio-Unternehmen?" },
      { name: "confidence", type: "number", description: "Extraktions-Konfidenz 0.0–1.0", required: true },
      { name: "sourceCount", type: "number", description: "Anzahl unabhängiger Quellen", required: true },
    ],
    source: "funding-extractor.ts (RSS) + Enrichment (Crunchbase, PitchBook)",
    examples: ["Celonis Series D $1B", "N26 Series E $900M"],
  },
  {
    id: "acquisition",
    label: "Acquisition",
    category: "capital",
    icon: Handshake,
    color: "bg-red-500",
    description: "M&A-Transaktion — vollständige Übernahme oder Mehrheitsbeteiligung",
    properties: [
      { name: "dealType", type: "enum", description: "full_acquisition | majority_stake | merger | acqui_hire | asset_purchase", required: true },
      { name: "priceUsd", type: "number?", description: "Transaktionspreis in USD" },
      { name: "announcedDate", type: "Date?", description: "Ankündigungsdatum" },
      { name: "closedDate", type: "Date?", description: "Abschlussdatum" },
      { name: "status", type: "enum", description: "announced | completed | terminated | pending_regulatory" },
      { name: "multipleOnRevenue", type: "number?", description: "Preis/Umsatz-Multiple" },
    ],
    source: "NER + Anti-Pattern-Filter aus funding-extractor + Enrichment",
    examples: ["Delivery Hero acquires Glovo", "Visa acquires Tink"],
  },
  {
    id: "ipo",
    label: "IPO",
    category: "capital",
    icon: TrendingUp,
    color: "bg-pink-500",
    description: "Börsengang (IPO, Direct Listing, SPAC Merger)",
    properties: [
      { name: "type", type: "enum", description: "ipo | direct_listing | spac_merger", required: true },
      { name: "exchange", type: "string?", description: "Börse (NYSE, NASDAQ, FSE, LSE, Euronext, ...)" },
      { name: "ticker", type: "string?", description: "Börsenkürzel" },
      { name: "offerPriceUsd", type: "number?", description: "IPO-Preis pro Aktie in USD" },
      { name: "firstDayCloseUsd", type: "number?", description: "Schlusskurs am ersten Handelstag" },
      { name: "valuationAtIpo", type: "number?", description: "Marktkapitalisierung bei IPO in USD" },
      { name: "capitalRaisedUsd", type: "number?", description: "Im IPO eingesammeltes Kapital" },
      { name: "date", type: "Date?", description: "IPO-Datum" },
    ],
    source: "Enrichment (Börsen-APIs, SEC Edgar, DGAP)",
  },
  {
    id: "spv",
    label: "SPV",
    category: "capital",
    icon: DollarSign,
    color: "bg-lime-600",
    description: "Special Purpose Vehicle — Deal-spezifisches Co-Investment-Vehikel",
    properties: [
      { name: "name", type: "string?", description: "SPV-Bezeichnung" },
      { name: "sizeUsd", type: "number?", description: "SPV-Volumen" },
      { name: "purpose", type: "string?", description: "co_invest | secondary | continuation" },
    ],
    source: "Enrichment (AngelList, Carta, SEC D-Filings)",
  },

  // === People & Governance ===
  {
    id: "person",
    label: "Person",
    category: "people",
    icon: User,
    color: "bg-rose-500",
    description: "Natürliche Person — Gründer, GP, Angel, Board Member, Executive",
    properties: [
      { name: "name", type: "string", description: "Vollständiger Name", required: true },
      { name: "aliases", type: "string[]", description: "Namensvarianten, Spitznamen" },
      { name: "gender", type: "enum?", description: "male | female | non_binary | unknown" },
      { name: "linkedinUrl", type: "string?", description: "LinkedIn-Profil" },
      { name: "twitterHandle", type: "string?", description: "X/Twitter Handle" },
      { name: "bio", type: "string?", description: "Ein-Satz-Bio" },
      { name: "isAngelInvestor", type: "boolean", description: "Tritt auch als Angel-Investor auf?" },
      { name: "educationSummary", type: "string?", description: "Höchster Abschluss + Institution" },
      { name: "notableExits", type: "string[]", description: "Bekannte Exits (als Gründer oder Investor)" },
    ],
    source: "NER aus Artikeltext + LinkedIn Enrichment",
    examples: ["Daniel Krauss (FlixBus)", "Christian Reber (Pitch)"],
  },
  {
    id: "boardSeat",
    label: "BoardSeat",
    category: "people",
    icon: Users,
    color: "bg-fuchsia-500",
    description: "Board-Mandat — zeitgebundene Governance-Position im Aufsichts-/Verwaltungsrat",
    properties: [
      { name: "seatType", type: "enum", description: "investor | founder | independent | observer", required: true },
      { name: "title", type: "string?", description: "z.B. Board Member, Board Observer, Chairperson" },
      { name: "startDate", type: "Date?", description: "Beginn des Mandats" },
      { name: "endDate", type: "Date?", description: "Ende des Mandats (null = aktiv)" },
    ],
    source: "NER + Enrichment (LinkedIn, Company Websites)",
  },

  // === Taxonomy ===
  {
    id: "sector",
    label: "Sector",
    category: "taxonomy",
    icon: Factory,
    color: "bg-orange-500",
    description: "Industrie-Sektor (hierarchisch, 3-stufig: Sector → SubSector → Vertical)",
    properties: [
      { name: "name", type: "string", description: "Sektorname", required: true },
      { name: "level", type: "enum", description: "sector | sub_sector | vertical", required: true },
      { name: "gicsCode", type: "string?", description: "GICS-Code (Global Industry Classification Standard)" },
      { name: "description", type: "string?", description: "Kurzbeschreibung" },
    ],
    source: "Curated Taxonomy + LLM-Klassifikation",
    examples: ["Financial Services → Fintech → Neobanking", "Enterprise Software → SaaS → DevTools"],
  },
  {
    id: "businessModel",
    label: "BusinessModel",
    category: "taxonomy",
    icon: Tag,
    color: "bg-sky-500",
    description: "Geschäftsmodell-Klassifikation (orthogonal zu Sektor)",
    properties: [
      { name: "name", type: "string", description: "Modellbezeichnung", required: true },
      { name: "category", type: "enum", description: "saas | marketplace | fintech | deeptech | hardware | biotech | consumer | d2c | b2b | b2b2c | platform | infra" },
      { name: "revenueType", type: "enum?", description: "subscription | transaction | usage | licensing | advertising | hybrid" },
    ],
    source: "LLM-Klassifikation aus Artikeltext + Company Description",
    examples: ["SaaS (subscription)", "Marketplace (transaction)", "DeepTech (licensing)"],
  },
  {
    id: "technology",
    label: "Technology",
    category: "taxonomy",
    icon: GraduationCap,
    color: "bg-purple-500",
    description: "Kern-Technologie / Enabling Technology des Unternehmens",
    properties: [
      { name: "name", type: "string", description: "Technologiebezeichnung", required: true },
      { name: "maturity", type: "enum?", description: "emerging | growing | mature | declining" },
    ],
    source: "NER + LLM-Klassifikation aus Artikeltext",
    examples: ["LLM / Foundation Models", "Computer Vision", "Blockchain/DLT", "Quantum Computing"],
  },

  // === Geography ===
  {
    id: "location",
    label: "Location",
    category: "geo",
    icon: MapPin,
    color: "bg-cyan-500",
    description: "Geographische Entität (5-stufige Hierarchie: Continent → Region → Country → State → City)",
    properties: [
      { name: "name", type: "string", description: "Kanonischer Ortsname", required: true },
      { name: "nameLocal", type: "string?", description: "Lokaler Name (z.B. 'München' für Munich)" },
      { name: "type", type: "enum", description: "continent | region | country | state | city", required: true },
      { name: "iso2", type: "string?", description: "ISO 3166-1 Alpha-2 bei Ländern (DE, US, ...)" },
      { name: "iso3", type: "string?", description: "ISO 3166-1 Alpha-3 (DEU, USA, ...)" },
      { name: "latitude", type: "number?", description: "Breitengrad" },
      { name: "longitude", type: "number?", description: "Längengrad" },
      { name: "timezone", type: "string?", description: "IANA Timezone" },
      { name: "ecosystemRank", type: "number?", description: "Startup Genome / ähnliches Ranking" },
    ],
    source: "FundingRound.country + City-Extraktion + GeoNames-DB",
    examples: ["Europe → DACH → Germany → Bavaria → Munich"],
  },

  // === Provenance ===
  {
    id: "article",
    label: "Article",
    category: "provenance",
    icon: FileText,
    color: "bg-slate-500",
    description: "Quellartikel — atomare Informationseinheit mit Provenienz-Tracking",
    properties: [
      { name: "title", type: "string", description: "Artikeltitel", required: true },
      { name: "url", type: "string", description: "Permalink (deduplizierender Schlüssel)", required: true },
      { name: "publishedAt", type: "Date?", description: "Veröffentlichungsdatum" },
      { name: "feedName", type: "string", description: "Quell-Feed-Name", required: true },
      { name: "feedCategory", type: "string?", description: "Feed-Kategorie (DACH, Global, ...)" },
      { name: "language", type: "string?", description: "Sprache (de, en, fr, ...)" },
      { name: "author", type: "string?", description: "Autor / Journalist" },
    ],
    source: "Article-Tabelle (RSS Sync)",
  },
  {
    id: "dataSource",
    label: "DataSource",
    category: "provenance",
    icon: Globe,
    color: "bg-gray-500",
    description: "Externe Datenquelle für Enrichment-Daten (API, Scrape, Manual)",
    properties: [
      { name: "name", type: "string", description: "Quellenname", required: true },
      { name: "type", type: "enum", description: "api | scrape | manual | rss | regulatory_filing", required: true },
      { name: "reliability", type: "number", description: "Zuverlässigkeits-Score 0.0–1.0", required: true },
      { name: "lastFetchedAt", type: "Date?", description: "Letzter erfolgreicher Abruf" },
    ],
    source: "System-Konfiguration",
    examples: ["Crunchbase API", "PitchBook", "SEC Edgar", "BaFin Register", "RSS Feeds"],
  },
];

// ============================================================================
// EDGES — 24 Beziehungstypen
// ============================================================================

const EDGES: EdgeDef[] = [
  // --- Funding Flow ---
  {
    id: "raised",
    label: "RAISED",
    category: "funding",
    from: "company",
    to: "fundingRound",
    description: "Unternehmen hat diese Finanzierungsrunde aufgenommen",
    cardinality: "1:N",
  },
  {
    id: "participated_in",
    label: "PARTICIPATED_IN",
    category: "funding",
    from: "investorOrg",
    to: "fundingRound",
    description: "Investor hat an dieser Runde teilgenommen",
    properties: [
      { name: "role", type: "enum", description: "lead | co_lead | participant | follow_on" },
      { name: "allocationUsd", type: "number?", description: "Individueller Investment-Betrag (selten bekannt)" },
      { name: "isNewInvestor", type: "boolean", description: "Erstinvestment in dieses Unternehmen?" },
      { name: "isProRata", type: "boolean", description: "Pro-rata Follow-on ohne neues Kapital?" },
    ],
    cardinality: "N:M",
  },
  {
    id: "angel_invested",
    label: "ANGEL_INVESTED",
    category: "funding",
    from: "person",
    to: "fundingRound",
    description: "Person hat als Angel-Investor in diese Runde investiert",
    properties: [
      { name: "allocationUsd", type: "number?", description: "Individueller Angel-Betrag" },
    ],
    cardinality: "N:M",
  },
  {
    id: "deployed_from",
    label: "DEPLOYED_FROM",
    category: "funding",
    from: "fundingRound",
    to: "fund",
    description: "Kapital dieser Runde kam aus diesem Fonds-Vehikel",
    properties: [
      { name: "allocationUsd", type: "number?", description: "Betrag aus diesem spezifischen Fonds" },
    ],
    cardinality: "N:M",
  },
  {
    id: "committed_to",
    label: "COMMITTED_TO",
    category: "funding",
    from: "limitedPartner",
    to: "fund",
    description: "LP hat Kapital in diesen Fonds committed",
    properties: [
      { name: "commitmentUsd", type: "number?", description: "Commitment-Betrag" },
      { name: "commitmentDate", type: "Date?", description: "Datum des Commitments" },
      { name: "isAnchor", type: "boolean", description: "Anchor-LP?" },
    ],
    cardinality: "N:M",
  },
  {
    id: "co_invested_via",
    label: "CO_INVESTED_VIA",
    category: "funding",
    from: "fundingRound",
    to: "spv",
    description: "SPV wurde für Co-Investment in diese Runde aufgesetzt",
    cardinality: "N:1",
  },
  {
    id: "acquired_by",
    label: "ACQUIRED_BY",
    category: "funding",
    from: "company",
    to: "acquisition",
    description: "Unternehmen wurde in dieser M&A-Transaktion übernommen",
    cardinality: "1:N",
  },
  {
    id: "acquirer",
    label: "ACQUIRER",
    category: "funding",
    from: "company",
    to: "acquisition",
    description: "Unternehmen war der Käufer in dieser M&A-Transaktion",
    cardinality: "1:N",
  },
  {
    id: "went_public",
    label: "WENT_PUBLIC",
    category: "funding",
    from: "company",
    to: "ipo",
    description: "Unternehmen ging über dieses IPO an die Börse",
    cardinality: "1:1",
  },

  // --- Organizational Structure ---
  {
    id: "manages_fund",
    label: "MANAGES",
    category: "org_structure",
    from: "fundManager",
    to: "fund",
    description: "GP/Management Company verwaltet diesen Fonds",
    cardinality: "1:N",
  },
  {
    id: "gp_of",
    label: "GP_OF",
    category: "org_structure",
    from: "investorOrg",
    to: "fundManager",
    description: "Investmentfirma operiert über diese Management Company",
    cardinality: "1:N",
  },
  {
    id: "spv_managed_by",
    label: "MANAGED_BY",
    category: "org_structure",
    from: "spv",
    to: "investorOrg",
    description: "SPV wird von diesem Investor verwaltet",
    cardinality: "N:1",
  },
  {
    id: "subsidiary_of",
    label: "SUBSIDIARY_OF",
    category: "org_structure",
    from: "company",
    to: "company",
    description: "Unternehmen ist Tochtergesellschaft eines anderen (nach Akquisition, Spin-off)",
    cardinality: "N:1",
  },

  // --- People & Governance ---
  {
    id: "founded",
    label: "FOUNDED",
    category: "people_rel",
    from: "person",
    to: "company",
    description: "Person hat das Unternehmen gegründet",
    cardinality: "N:M",
    temporal: true,
  },
  {
    id: "employed_at",
    label: "EMPLOYED_AT",
    category: "people_rel",
    from: "person",
    to: "company",
    description: "Person ist/war angestellt beim Unternehmen (C-Level, VP, ...)",
    properties: [
      { name: "title", type: "string", description: "Jobtitel (CEO, CTO, VP Engineering, ...)" },
      { name: "startDate", type: "Date?", description: "Startdatum" },
      { name: "endDate", type: "Date?", description: "Enddatum (null = aktuell)" },
      { name: "isCurrent", type: "boolean", description: "Aktive Position?" },
      { name: "seniority", type: "enum", description: "c_level | vp | director | other" },
    ],
    cardinality: "N:M",
    temporal: true,
  },
  {
    id: "partner_at",
    label: "PARTNER_AT",
    category: "people_rel",
    from: "person",
    to: "investorOrg",
    description: "Person ist GP/Partner/Principal bei der Investmentfirma",
    properties: [
      { name: "title", type: "string", description: "General Partner, Managing Director, Partner, Principal, VP, Analyst" },
      { name: "startDate", type: "Date?", description: "Startdatum" },
      { name: "endDate", type: "Date?", description: "Enddatum (null = aktuell)" },
      { name: "isCurrent", type: "boolean", description: "Aktive Position?" },
    ],
    cardinality: "N:M",
    temporal: true,
  },
  {
    id: "holds_board_seat",
    label: "HOLDS_SEAT",
    category: "people_rel",
    from: "person",
    to: "boardSeat",
    description: "Person hält dieses Board-Mandat",
    cardinality: "1:N",
  },
  {
    id: "board_at",
    label: "BOARD_AT",
    category: "people_rel",
    from: "boardSeat",
    to: "company",
    description: "Board-Seat ist bei diesem Unternehmen",
    cardinality: "N:1",
  },
  {
    id: "represents",
    label: "REPRESENTS",
    category: "people_rel",
    from: "boardSeat",
    to: "investorOrg",
    description: "Board-Seat repräsentiert diesen Investor (Investor Director)",
    cardinality: "N:1",
  },

  // --- Classification ---
  {
    id: "operates_in",
    label: "OPERATES_IN",
    category: "classification",
    from: "company",
    to: "sector",
    description: "Unternehmen operiert in diesem Sektor",
    properties: [
      { name: "isPrimary", type: "boolean", description: "Primärsektor des Unternehmens?" },
    ],
    cardinality: "N:M",
  },
  {
    id: "has_business_model",
    label: "HAS_MODEL",
    category: "classification",
    from: "company",
    to: "businessModel",
    description: "Unternehmen verfolgt dieses Geschäftsmodell",
    cardinality: "N:M",
  },
  {
    id: "uses_technology",
    label: "USES_TECH",
    category: "classification",
    from: "company",
    to: "technology",
    description: "Unternehmen baut auf dieser Technologie auf",
    properties: [
      { name: "isCore", type: "boolean", description: "Kerntechnologie vs. unterstützend?" },
    ],
    cardinality: "N:M",
  },
  {
    id: "sector_parent",
    label: "PARENT_SECTOR",
    category: "classification",
    from: "sector",
    to: "sector",
    description: "Hierarchie: Vertical → SubSector → Sector",
    cardinality: "N:1",
  },
  {
    id: "headquartered_in",
    label: "HQ_IN",
    category: "classification",
    from: "company",
    to: "location",
    description: "Hauptsitz des Unternehmens",
    cardinality: "N:1",
  },
  {
    id: "investor_hq",
    label: "HQ_IN",
    category: "classification",
    from: "investorOrg",
    to: "location",
    description: "Hauptsitz der Investmentfirma",
    cardinality: "N:1",
  },
  {
    id: "geo_hierarchy",
    label: "PART_OF",
    category: "classification",
    from: "location",
    to: "location",
    description: "Geographische Hierarchie: City → State → Country → Region → Continent",
    cardinality: "N:1",
  },

  // --- Provenance ---
  {
    id: "sourced_from",
    label: "SOURCED_FROM",
    category: "provenance",
    from: "fundingRound",
    to: "article",
    description: "Diese Runde wurde aus diesem Artikel extrahiert",
    properties: [
      { name: "confidence", type: "number", description: "Extraktions-Konfidenz 0.0–1.0" },
      { name: "extractedAt", type: "Date", description: "Zeitpunkt der Extraktion" },
    ],
    cardinality: "N:M",
  },
  {
    id: "enriched_by",
    label: "ENRICHED_BY",
    category: "provenance",
    from: "company",
    to: "dataSource",
    description: "Entity-Daten wurden durch diese Quelle angereichert",
    properties: [
      { name: "lastEnrichedAt", type: "Date", description: "Letzter Enrichment-Zeitpunkt" },
      { name: "fieldsEnriched", type: "string[]", description: "Welche Felder wurden angereichert" },
    ],
    cardinality: "N:M",
  },
];

// ============================================================================
// ENTITY RESOLUTION
// ============================================================================

const ER_ROWS = [
  { entity: "Company", strategy: "Normalisierung (lowercase, Rechtsform-Strip: GmbH/UG/AG/SE/Ltd/Inc/SAS) + Fuzzy Match (Jaro-Winkler ≥ 0.92) + Domain-Match", example: '"N26 GmbH" = "N26 Bank" = "Number26" → n26', priority: "critical" },
  { entity: "InvestorOrg", strategy: 'Alias-DB + Suffix-Strip ("Partners", "Ventures", "Capital", "VC") + Fuzzy Match + Crunchbase-ID-Join', example: '"Accel Partners" = "Accel" = "Accel Europe" → accel', priority: "critical" },
  { entity: "Fund", strategy: "InvestorOrg-Match + Fund-Nummer-Extraktion (Roman/Arabic) + Vintage-Match", example: '"EB DWES Fund VIII" → earlybird + fund_number=8', priority: "high" },
  { entity: "Person", strategy: "Vorname+Nachname normalisiert + Disambiguierung über Kontext (Organisation, Rolle, LinkedIn-URL)", example: '"Daniel Krauss" @ FlixBus ≠ "Daniel Krauss" @ andere Firma', priority: "critical" },
  { entity: "Location", strategy: "GeoNames-Lookup + Alias-Mapping (München=Munich, Zürich=Zurich) + Hierarchie-Ableitung", example: '"München" → Munich → Bavaria → Germany → Europe', priority: "high" },
  { entity: "Sector", strategy: "3-stufige kuratierte Taxonomie (170+ Verticals) + LLM-Zuordnung aus Company Description", example: '"neobank" → Neobanking → Fintech → Financial Services', priority: "medium" },
];

// ============================================================================
// HELPERS
// ============================================================================

function getNode(id: string): NodeDef | undefined {
  return NODES.find((n) => n.id === id);
}

function NodeBadge({ nodeId }: { nodeId: string }) {
  const node = getNode(nodeId);
  if (!node) return <code className="text-[10px] text-muted-foreground">{nodeId}</code>;
  const Icon = node.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-white ${node.color}`}>
      <Icon className="h-2.5 w-2.5" />
      {node.label}
    </span>
  );
}

// ============================================================================
// COMPONENTS
// ============================================================================

function NodeCard({ node, isExpanded, onToggle }: { node: NodeDef; isExpanded: boolean; onToggle: () => void }) {
  const Icon = node.icon;
  return (
    <div className="rounded-lg border bg-card">
      <button
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-accent/50 transition-colors"
        onClick={onToggle}
      >
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white ${node.color}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{node.label}</span>
            <span className="text-xs text-muted-foreground truncate">{node.description}</span>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] shrink-0 tabular-nums">
          {node.properties.length}
        </Badge>
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t px-4 py-3 space-y-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left font-medium pb-1.5 w-[160px]">Property</th>
                <th className="text-left font-medium pb-1.5 w-[100px]">Typ</th>
                <th className="text-left font-medium pb-1.5">Beschreibung</th>
              </tr>
            </thead>
            <tbody>
              {node.properties.map((p) => (
                <tr key={p.name} className="border-t border-border/50">
                  <td className="py-1.5 font-mono text-[11px]">
                    {p.name}
                    {p.required && <span className="text-red-400 ml-0.5">*</span>}
                  </td>
                  <td className="py-1.5 text-muted-foreground font-mono text-[11px]">{p.type}</td>
                  <td className="py-1.5 text-muted-foreground">{p.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/50">
            <span>Quelle: {node.source}</span>
            {node.examples && (
              <span>z.B. {node.examples.join(", ")}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EdgeRow({ edge }: { edge: EdgeDef }) {
  const [expanded, setExpanded] = useState(false);
  const hasMeta = edge.properties || edge.temporal;

  return (
    <div className="rounded border bg-card">
      <button
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent/50 transition-colors"
        onClick={() => hasMeta && setExpanded(!expanded)}
      >
        <NodeBadge nodeId={edge.from} />
        <ChevronsRight className="h-3 w-3 text-muted-foreground/60 shrink-0" />
        <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap">
          {edge.label}
        </code>
        <ChevronsRight className="h-3 w-3 text-muted-foreground/60 shrink-0" />
        <NodeBadge nodeId={edge.to} />
        <span className="ml-auto flex items-center gap-1.5 shrink-0">
          {edge.temporal && (
            <Badge variant="outline" className="text-[9px] h-4 px-1 bg-blue-500/10 text-blue-600 border-blue-500/30">
              temporal
            </Badge>
          )}
          <span className="text-muted-foreground text-[10px] tabular-nums">{edge.cardinality}</span>
          {hasMeta ? (
            expanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )
          ) : (
            <span className="w-3" />
          )}
        </span>
      </button>

      {expanded && (
        <div className="border-t px-3 py-2 text-xs space-y-1.5">
          <p className="text-muted-foreground">{edge.description}</p>
          {edge.properties && (
            <table className="w-full">
              <tbody>
                {edge.properties.map((p) => (
                  <tr key={p.name} className="border-t border-border/30">
                    <td className="py-1 font-mono text-[11px] w-[140px]">{p.name}</td>
                    <td className="py-1 text-muted-foreground font-mono text-[11px] w-[80px]">{p.type}</td>
                    <td className="py-1 text-muted-foreground">{p.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function GraphDiagram() {
  const positions: Record<string, { x: number; y: number }> = {
    limitedPartner:  { x: 860, y: 20 },
    fundManager:     { x: 860, y: 130 },
    fund:            { x: 700, y: 75 },
    investorOrg:     { x: 540, y: 130 },
    person:          { x: 340, y: 20 },
    company:         { x: 170, y: 130 },
    fundingRound:    { x: 340, y: 255 },
    acquisition:     { x: 50, y: 255 },
    ipo:             { x: 50, y: 355 },
    spv:             { x: 540, y: 255 },
    boardSeat:       { x: 340, y: 130 },
    article:         { x: 540, y: 385 },
    dataSource:      { x: 700, y: 385 },
    sector:          { x: 170, y: 385 },
    businessModel:   { x: 50, y: 455 },
    technology:      { x: 170, y: 455 },
    location:        { x: 340, y: 385 },
  };

  const edgeLines: { from: string; to: string; label: string; dashed?: boolean }[] = [
    { from: "company", to: "fundingRound", label: "RAISED" },
    { from: "investorOrg", to: "fundingRound", label: "PARTICIPATED" },
    { from: "person", to: "fundingRound", label: "ANGEL" },
    { from: "fund", to: "investorOrg", label: "MANAGES" },
    { from: "fundManager", to: "fund", label: "MANAGES" },
    { from: "limitedPartner", to: "fund", label: "COMMITTED" },
    { from: "person", to: "company", label: "FOUNDED" },
    { from: "person", to: "investorOrg", label: "PARTNER_AT" },
    { from: "boardSeat", to: "company", label: "BOARD_AT" },
    { from: "person", to: "boardSeat", label: "HOLDS" },
    { from: "company", to: "acquisition", label: "ACQUIRED" },
    { from: "company", to: "ipo", label: "IPO" },
    { from: "fundingRound", to: "spv", label: "CO_INVEST" },
    { from: "company", to: "sector", label: "OPERATES_IN" },
    { from: "company", to: "location", label: "HQ_IN" },
    { from: "fundingRound", to: "article", label: "SOURCED" },
    { from: "company", to: "dataSource", label: "ENRICHED", dashed: true },
    { from: "company", to: "technology", label: "USES_TECH" },
    { from: "company", to: "businessModel", label: "HAS_MODEL" },
  ];

  const nodeColors: Record<string, string> = {};
  for (const n of NODES) {
    const match = n.color.match(/bg-(\w+)-(\d+)/);
    if (match) {
      const colorMap: Record<string, string> = {
        "blue-500": "#3b82f6", "violet-500": "#8b5cf6", "indigo-500": "#6366f1",
        "amber-500": "#f59e0b", "teal-500": "#14b8a6", "emerald-500": "#10b981",
        "red-500": "#ef4444", "pink-500": "#ec4899", "lime-600": "#65a30d",
        "rose-500": "#f43f5e", "fuchsia-500": "#d946ef", "orange-500": "#f97316",
        "sky-500": "#0ea5e9", "purple-500": "#a855f7", "cyan-500": "#06b6d4",
        "slate-500": "#64748b", "gray-500": "#6b7280",
      };
      nodeColors[n.id] = colorMap[`${match[1]}-${match[2]}`] || "#6b7280";
    }
  }

  const W = 960;
  const H = 510;
  const NW = 88;
  const NH = 28;

  return (
    <div className="rounded-lg border bg-card p-3 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 700 }}>
        <defs>
          <marker id="ah" markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto">
            <polygon points="0 0, 6 2.5, 0 5" className="fill-muted-foreground/30" />
          </marker>
          <marker id="ah-dash" markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto">
            <polygon points="0 0, 6 2.5, 0 5" className="fill-muted-foreground/20" />
          </marker>
        </defs>

        {edgeLines.map((e) => {
          const from = positions[e.from];
          const to = positions[e.to];
          if (!from || !to) return null;
          const mx = (from.x + to.x) / 2;
          const my = (from.y + to.y) / 2;
          return (
            <g key={`${e.from}-${e.to}-${e.label}`}>
              <line
                x1={from.x + NW / 2}
                y1={from.y + NH / 2}
                x2={to.x + NW / 2}
                y2={to.y + NH / 2}
                className={e.dashed ? "stroke-muted-foreground/15" : "stroke-muted-foreground/25"}
                strokeWidth={1}
                strokeDasharray={e.dashed ? "4 3" : undefined}
                markerEnd={e.dashed ? "url(#ah-dash)" : "url(#ah)"}
              />
              <text
                x={mx + NW / 2}
                y={my + NH / 2 + 3}
                textAnchor="middle"
                className="fill-muted-foreground/60 text-[6px] font-mono"
              >
                {e.label}
              </text>
            </g>
          );
        })}

        {NODES.map((node) => {
          const pos = positions[node.id];
          if (!pos) return null;
          return (
            <g key={node.id}>
              <rect
                x={pos.x}
                y={pos.y}
                width={NW}
                height={NH}
                rx={6}
                fill={nodeColors[node.id] || "#6b7280"}
                opacity={0.85}
              />
              <text
                x={pos.x + NW / 2}
                y={pos.y + NH / 2 + 4}
                textAnchor="middle"
                className="text-[8px] font-semibold"
                fill="white"
              >
                {node.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function EntityResolutionTable() {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/50">
            <th className="text-left font-medium px-3 py-2 w-[100px]">Entität</th>
            <th className="text-left font-medium px-3 py-2 w-[60px]">Priorität</th>
            <th className="text-left font-medium px-3 py-2">Strategie</th>
            <th className="text-left font-medium px-3 py-2 w-[240px]">Beispiel</th>
          </tr>
        </thead>
        <tbody>
          {ER_ROWS.map((r) => (
            <tr key={r.entity} className="border-t border-border/50">
              <td className="px-3 py-2 font-medium">{r.entity}</td>
              <td className="px-3 py-2">
                <Badge
                  variant="outline"
                  className={`text-[9px] ${
                    r.priority === "critical"
                      ? "bg-red-500/10 text-red-600 border-red-500/30"
                      : r.priority === "high"
                      ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                      : "bg-blue-500/10 text-blue-600 border-blue-500/30"
                  }`}
                >
                  {r.priority}
                </Badge>
              </td>
              <td className="px-3 py-2 text-muted-foreground">{r.strategy}</td>
              <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{r.example}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DataFlowDiagram() {
  const phases = [
    {
      label: "Ingestion",
      color: "bg-slate-500",
      steps: ["RSS Sync", "API Fetch", "Scraping"],
    },
    {
      label: "Extraction",
      color: "bg-emerald-500",
      steps: ["NLP / NER", "funding-extractor.ts", "Amount/Stage/Investor Parsing"],
    },
    {
      label: "Resolution",
      color: "bg-violet-500",
      steps: ["Entity Dedup", "Alias Matching", "Cross-Reference"],
    },
    {
      label: "Construction",
      color: "bg-blue-500",
      steps: ["Node Upsert", "Edge Creation", "Confidence Propagation"],
    },
    {
      label: "Enrichment",
      color: "bg-amber-500",
      steps: ["Crunchbase API", "LinkedIn", "Regulatory Filings"],
    },
    {
      label: "Embedding",
      color: "bg-rose-500",
      steps: ["Node2Vec", "Subgraph Descriptions", "Vector Index"],
    },
  ];

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-start gap-2">
        {phases.map((phase, i) => (
          <div key={phase.label} className="flex items-start gap-2">
            <div className="rounded-lg border px-3 py-2 min-w-[130px]">
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className={`h-2 w-2 rounded-full ${phase.color}`} />
                <span className="text-xs font-semibold">{phase.label}</span>
              </div>
              {phase.steps.map((s) => (
                <p key={s} className="text-[10px] text-muted-foreground leading-relaxed">
                  {s}
                </p>
              ))}
            </div>
            {i < phases.length - 1 && (
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 mt-3" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatsBar() {
  const nodeCount = NODES.length;
  const edgeCount = EDGES.length;
  const totalProps = NODES.reduce((sum, n) => sum + n.properties.length, 0);
  const edgeProps = EDGES.reduce((sum, e) => sum + (e.properties?.length || 0), 0);
  const temporalEdges = EDGES.filter((e) => e.temporal).length;

  return (
    <div className="flex flex-wrap gap-4 text-xs tabular-nums">
      {[
        { label: "Node-Typen", value: nodeCount, color: "text-blue-500" },
        { label: "Edge-Typen", value: edgeCount, color: "text-emerald-500" },
        { label: "Node-Properties", value: totalProps, color: "text-violet-500" },
        { label: "Edge-Properties", value: edgeProps, color: "text-amber-500" },
        { label: "Temporale Edges", value: temporalEdges, color: "text-rose-500" },
      ].map((s) => (
        <div key={s.label} className="flex items-center gap-1.5">
          <span className={`font-bold text-base ${s.color}`}>{s.value}</span>
          <span className="text-muted-foreground">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function OntologyPage() {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [activeNodeCat, setActiveNodeCat] = useState<string | null>(null);
  const [activeEdgeCat, setActiveEdgeCat] = useState<string | null>(null);

  function toggleNode(id: string) {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setExpandedNodes(new Set(NODES.map((n) => n.id)));
  }

  function collapseAll() {
    setExpandedNodes(new Set());
  }

  const filteredNodes = activeNodeCat
    ? NODES.filter((n) => n.category === activeNodeCat)
    : NODES;

  const filteredEdges = activeEdgeCat
    ? EDGES.filter((e) => e.category === activeEdgeCat)
    : EDGES;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">GraphRAG Ontologie</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Venture Capital Knowledge Graph — Ontologie für Startups, Finanzierungsrunden, Fonds, Investoren und das gesamte VC-Ökosystem.
        </p>
        <div className="mt-3">
          <StatsBar />
        </div>
      </div>

      {/* Graph Diagram */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Graph-Übersicht</h2>
        <GraphDiagram />
      </section>

      {/* Nodes */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Nodes ({filteredNodes.length}{activeNodeCat ? ` / ${NODES.length}` : ""})
          </h2>
          <div className="flex items-center gap-1">
            <button onClick={expandAll} className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-accent">
              Alle öffnen
            </button>
            <span className="text-muted-foreground/30">|</span>
            <button onClick={collapseAll} className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-accent">
              Alle schließen
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1 mb-1">
          <button
            onClick={() => setActiveNodeCat(null)}
            className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
              !activeNodeCat ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            Alle
          </button>
          {NODE_CATEGORIES.map((cat) => {
            const count = NODES.filter((n) => n.category === cat.id).length;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveNodeCat(activeNodeCat === cat.id ? null : cat.id)}
                className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
                  activeNodeCat === cat.id ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {cat.label} ({count})
              </button>
            );
          })}
        </div>
        <div className="space-y-1.5">
          {filteredNodes.map((node) => (
            <NodeCard
              key={node.id}
              node={node}
              isExpanded={expandedNodes.has(node.id)}
              onToggle={() => toggleNode(node.id)}
            />
          ))}
        </div>
      </section>

      {/* Edges */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Edges ({filteredEdges.length}{activeEdgeCat ? ` / ${EDGES.length}` : ""})
        </h2>
        <div className="flex flex-wrap gap-1 mb-1">
          <button
            onClick={() => setActiveEdgeCat(null)}
            className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
              !activeEdgeCat ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            Alle
          </button>
          {EDGE_CATEGORIES.map((cat) => {
            const count = EDGES.filter((e) => e.category === cat.id).length;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveEdgeCat(activeEdgeCat === cat.id ? null : cat.id)}
                className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
                  activeEdgeCat === cat.id ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {cat.label} ({count})
              </button>
            );
          })}
        </div>
        <div className="space-y-1">
          {filteredEdges.map((edge) => (
            <EdgeRow key={edge.id} edge={edge} />
          ))}
        </div>
      </section>

      {/* Data Flow */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Datenfluss-Pipeline</h2>
        <DataFlowDiagram />
      </section>

      {/* Entity Resolution */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Entity Resolution</h2>
        <EntityResolutionTable />
      </section>

      {/* Example Queries */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Beispiel-Queries (Cypher)</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            {
              title: "Top Seed-Investoren in DACH",
              query: `MATCH (i:InvestorOrg)-[p:PARTICIPATED_IN]->(r:FundingRound)<-[:RAISED]-(c:Company)-[:HQ_IN]->(l:Location)\nWHERE r.stage = "Seed" AND l.name IN ["Germany","Austria","Switzerland"]\nRETURN i.name, COUNT(r) AS deals\nORDER BY deals DESC LIMIT 10`,
            },
            {
              title: "Co-Investor-Netzwerk",
              query: `MATCH (i1:InvestorOrg)-[:PARTICIPATED_IN]->(r:FundingRound)<-[:PARTICIPATED_IN]-(i2:InvestorOrg)\nWHERE id(i1) < id(i2)\nRETURN i1.name, i2.name, COUNT(r) AS coDeals\nORDER BY coDeals DESC LIMIT 20`,
            },
            {
              title: "LP → Fund → Company Kapitalfluss",
              query: `MATCH (lp:LimitedPartner)-[:COMMITTED_TO]->(f:Fund)<-[:DEPLOYED_FROM]-(r:FundingRound)<-[:RAISED]-(c:Company)\nWHERE lp.name = "KfW Capital"\nRETURN c.name, r.stage, r.amountUsd, f.name`,
            },
            {
              title: "Board-Netzwerk eines Investors",
              query: `MATCH (i:InvestorOrg)<-[:REPRESENTS]-(bs:BoardSeat)<-[:HOLDS_SEAT]-(p:Person),\n(bs)-[:BOARD_AT]->(c:Company)\nWHERE i.name = "Earlybird"\nRETURN p.name, c.name, bs.seatType`,
            },
            {
              title: "Funding-Trajectory + Bewertung",
              query: `MATCH (c:Company {name:"Celonis"})-[:RAISED]->(r:FundingRound)\nOPTIONAL MATCH (i:InvestorOrg)-[p:PARTICIPATED_IN]->(r)\nRETURN r.stage, r.amountUsd, r.postMoneyValuation,\n  COLLECT({name:i.name, role:p.role}) AS investors\nORDER BY r.announcedDate`,
            },
            {
              title: "Follow-on-Rate pro Investor",
              query: `MATCH (i:InvestorOrg)-[p:PARTICIPATED_IN]->(r:FundingRound)\nWITH i, COUNT(r) AS total,\n  SUM(CASE WHEN p.isNewInvestor = false THEN 1 ELSE 0 END) AS followOns\nRETURN i.name, total, followOns,\n  toFloat(followOns)/total AS followOnRate\nORDER BY total DESC LIMIT 20`,
            },
          ].map((q) => (
            <div key={q.title} className="rounded-lg border bg-card overflow-hidden">
              <div className="px-3 py-2 bg-muted/50 text-xs font-medium">{q.title}</div>
              <pre className="px-3 py-2 text-[10px] text-muted-foreground font-mono overflow-x-auto leading-relaxed whitespace-pre-wrap">{q.query}</pre>
            </div>
          ))}
        </div>
      </section>

      {/* Open Decisions */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Offene Design-Entscheidungen</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { q: "Graph-DB", desc: "Neo4j (Cypher, reif, AuraDB Cloud) vs. Memgraph (in-memory, Cypher-kompatibel) vs. Apache AGE (PostgreSQL Extension) vs. Amazon Neptune" },
            { q: "Embedding-Strategie", desc: "Node2Vec / GraphSAGE für strukturelle Embeddings vs. LLM-generierte Subgraph-Descriptions als Text-Embeddings vs. Hybrid" },
            { q: "Entity Resolution Pipeline", desc: "Dedupe-Library + Blocking vs. LLM-basiertes Matching vs. Hybrid mit manueller Review-Queue für Low-Confidence-Matches" },
            { q: "Inkrementelles Update", desc: "Upsert-Semantik pro Entity mit Conflict-Resolution (neuere Quelle gewinnt? Höhere Confidence gewinnt? Merge-Strategie?)" },
            { q: "Confidence-Propagation", desc: "Wie propagiert Extraktions-Confidence über Kanten? Min/Max/Weighted Average? Threshold für Graph-Aufnahme?" },
            { q: "Temporal Modeling", desc: "Bi-temporal (valid-time + transaction-time) vs. einfache Start/End-Dates auf Edges? Event-Sourcing für Änderungshistorie?" },
          ].map((item) => (
            <div key={item.q} className="rounded-lg border bg-card px-3 py-2">
              <span className="text-xs font-medium">{item.q}</span>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
