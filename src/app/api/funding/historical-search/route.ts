import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { searchWeb } from "@/lib/company-enricher";

// ---------------------------------------------------------------------------
// Relevance scoring — lightweight version of funding-extractor signals
// applied to search result title + description (before scraping)
// ---------------------------------------------------------------------------

// Strong funding signals in title/description
const STRONG_SIGNALS: { pattern: RegExp; score: number }[] = [
  { pattern: /\braises?\s+[\$€£]?[\d,.]+\s*(m|mn|million|billion|b|k|mio)/i, score: 0.35 },
  { pattern: /\bsecures?\s+[\$€£]?[\d,.]+\s*(m|mn|million|billion|b|k|mio)/i, score: 0.35 },
  { pattern: /\bcloses?\s+[\$€£]?[\d,.]+\s*(m|mn|million|billion|b|k|mio)\s*(seed|series|round|funding)/i, score: 0.35 },
  { pattern: /\bleads?\s+[\$€£]?[\d,.]+\s*(m|mn|million|billion|b|k|mio)/i, score: 0.30 },
  { pattern: /\bseries\s+[a-e]\+?\b.*\braises?\b/i, score: 0.30 },
  { pattern: /\b(seed|series\s+[a-e]\+?)\s+(?:round|funding)\s+of\s+[\$€£]/i, score: 0.30 },
];

// Moderate funding signals
const MODERATE_SIGNALS: { pattern: RegExp; score: number }[] = [
  { pattern: /\b(raises?|raised)\s/i, score: 0.15 },
  { pattern: /\b(secures?|secured)\s/i, score: 0.15 },
  { pattern: /\bfunding\s+round\b/i, score: 0.15 },
  { pattern: /\bcapital\s+raise\b/i, score: 0.12 },
  { pattern: /\binvestment\s+round\b/i, score: 0.12 },
  { pattern: /\bseries\s+[a-e]\+?\b/i, score: 0.10 },
  { pattern: /\bseed\s+round\b/i, score: 0.10 },
  { pattern: /\bpre[- ]?seed\b/i, score: 0.10 },
];

// Presence of monetary amounts
const AMOUNT_SIGNAL: { pattern: RegExp; score: number }[] = [
  { pattern: /[\$€£]\s*[\d,.]+\s*(m|mn|million|billion|b|mio)\b/i, score: 0.10 },
  { pattern: /[\d,.]+\s*(million|billion|mio)\s*(dollars?|euros?|usd|eur)/i, score: 0.10 },
];

// Anti-signals: likely not a specific funding article
const ANTI_SIGNALS: { pattern: RegExp; score: number }[] = [
  { pattern: /\btop\s+\d+\b/i, score: -0.25 },
  { pattern: /\bweek(?:ly|'s|s)?\s+(?:funding|round|recap|digest)\b/i, score: -0.30 },
  { pattern: /\bround[- ]?up\b/i, score: -0.30 },
  { pattern: /\bmarket\s+(?:report|analysis|overview|recap)\b/i, score: -0.20 },
  { pattern: /\bfunding\s+(?:landscape|trends?|recap|report|roundup|review|overview)\b/i, score: -0.25 },
  { pattern: /\bipo\b/i, score: -0.35 },
  { pattern: /\bacquir(?:es?|ed|ing|ition)\b/i, score: -0.30 },
  { pattern: /\bmerger\b/i, score: -0.25 },
  { pattern: /\bfund\s+(?:i{1,3}|iv|v|vi|1|2|3|4|5)\b/i, score: -0.20 },
  { pattern: /\bhow\s+to\b/i, score: -0.15 },
  { pattern: /\binterview\b/i, score: -0.10 },
  { pattern: /\bsummit\b.*\b(?:tickets?|join|register)\b/i, score: -0.30 },
  { pattern: /\b\d+\s+(trends?|tips?|ways?|things?|reasons?|startups?|companies)\b/i, score: -0.20 },
];

// High-quality funding news domains get a bonus
const QUALITY_DOMAINS: Record<string, number> = {
  "techcrunch.com": 0.15,
  "sifted.eu": 0.15,
  "eu-startups.com": 0.12,
  "tech.eu": 0.12,
  "bloomberg.com": 0.10,
  "reuters.com": 0.10,
  "fortune.com": 0.08,
  "businessinsider.com": 0.08,
  "venturebeat.com": 0.10,
  "thenextweb.com": 0.08,
  "wired.com": 0.06,
  "forbes.com": 0.06,
  "handelsblatt.com": 0.08,
  "gruenderszene.de": 0.12,
  "startupvalley.news": 0.10,
  "finsmes.com": 0.10,
  "prnewswire.com": 0.05,
  "businesswire.com": 0.05,
  "globenewswire.com": 0.05,
};

// Stage extraction from title/description
const STAGE_PATTERNS: { pattern: RegExp; stage: string }[] = [
  { pattern: /\bpre[- ]?seed\b/i, stage: "Pre-Seed" },
  { pattern: /\bseed\s+(?:round|funding)\b/i, stage: "Seed" },
  { pattern: /\bseed\b/i, stage: "Seed" },
  { pattern: /\bseries\s+a\+?\b/i, stage: "Series A" },
  { pattern: /\bseries\s+b\+?\b/i, stage: "Series B" },
  { pattern: /\bseries\s+c\+?\b/i, stage: "Series C" },
  { pattern: /\bseries\s+d\+?\b/i, stage: "Series D" },
  { pattern: /\bseries\s+e\+?\b/i, stage: "Series E+" },
  { pattern: /\bbridge\s+(?:round|funding)\b/i, stage: "Bridge" },
  { pattern: /\bgrowth\s+(?:round|funding|equity)\b/i, stage: "Growth" },
];

// Amount extraction from title/description
const AMOUNT_EXTRACT = [
  /[\$]\s*([\d,.]+)\s*(billion|million|mn|m|b|k)\b/i,
  /(?:EUR|€)\s*([\d,.]+)\s*(billion|million|mn|m|b|k)?\b/i,
  /(?:GBP|£)\s*([\d,.]+)\s*(billion|million|mn|m|b|k)?\b/i,
  /([\d,.]+)\s*(billion|million|mn|m|b)\s*(?:dollars?|euros?|usd|eur)/i,
  /([\d,.]+)\s*(?:Mio\.?|Millionen?)\s*(?:EUR|Euro|USD|Dollar)/i,
];

const MULTIPLIERS: Record<string, number> = {
  k: 1e3, m: 1e6, mn: 1e6, million: 1e6, millionen: 1e6, mio: 1e6,
  b: 1e9, billion: 1e9,
};

function extractAmount(text: string): string | null {
  for (const re of AMOUNT_EXTRACT) {
    const m = text.match(re);
    if (m) {
      const num = parseFloat(m[1].replace(/,/g, ""));
      const mult = m[2] ? MULTIPLIERS[m[2].toLowerCase()] ?? 1 : 1;
      const val = num * mult;
      if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
      if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
      if (val >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
      return `$${val.toFixed(0)}`;
    }
  }
  return null;
}

function extractStage(text: string): string | null {
  for (const { pattern, stage } of STAGE_PATTERNS) {
    if (pattern.test(text)) return stage;
  }
  return null;
}

function scoreDomain(url: string): number {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    for (const [domain, bonus] of Object.entries(QUALITY_DOMAINS)) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) return bonus;
    }
  } catch { /* ignore */ }
  return 0;
}

type ScoredResult = {
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

function scoreResult(
  result: { url: string; title: string; description: string; query: string; searchStage: string | null },
  companyName: string
): ScoredResult {
  const text = `${result.title} ${result.description}`;
  let score = 0;
  const signals: string[] = [];

  // Company name in title is a strong signal
  if (result.title.toLowerCase().includes(companyName.toLowerCase())) {
    score += 0.15;
    signals.push("company_in_title");
  }

  // Strong funding signals
  for (const s of STRONG_SIGNALS) {
    if (s.pattern.test(text)) {
      score += s.score;
      signals.push("strong_funding");
      break; // only count once
    }
  }

  // Moderate signals
  for (const s of MODERATE_SIGNALS) {
    if (s.pattern.test(text)) {
      score += s.score;
      signals.push("moderate_funding");
      break;
    }
  }

  // Amount present
  for (const s of AMOUNT_SIGNAL) {
    if (s.pattern.test(text)) {
      score += s.score;
      signals.push("has_amount");
      break;
    }
  }

  // Anti-signals
  for (const s of ANTI_SIGNALS) {
    if (s.pattern.test(text)) {
      score += s.score;
      signals.push("anti_pattern");
    }
  }

  // Domain bonus
  const domainBonus = scoreDomain(result.url);
  if (domainBonus > 0) {
    score += domainBonus;
    signals.push("quality_domain");
  }

  // Clamp
  score = Math.max(0, Math.min(1, score));

  const domain = (() => {
    try { return new URL(result.url).hostname.replace(/^www\./, ""); }
    catch { return result.url; }
  })();

  // Use stage from text extraction, fall back to the search query's target stage
  const textStage = extractStage(text);

  return {
    ...result,
    relevance: Math.round(score * 100) / 100,
    signals,
    extractedStage: textStage ?? result.searchStage,
    extractedAmount: extractAmount(text),
    domain,
    category: score >= 0.4 ? "high" : score >= 0.15 ? "medium" : "low",
  };
}

// ---------------------------------------------------------------------------
// Blocked domains
// ---------------------------------------------------------------------------

const BLOCKED_DOMAINS = [
  "crunchbase.com", "pitchbook.com", "dealroom.co",
  "linkedin.com", "twitter.com", "x.com",
  "facebook.com", "youtube.com", "wikipedia.org",
  "glassdoor.com", "indeed.com", "angel.co", "wellfound.com",
  "tracxn.com", "cbinsights.com", "owler.com",
];

function isBlockedDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return BLOCKED_DOMAINS.some(
      (d) => hostname === d || hostname.endsWith(`.${d}`)
    );
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Deep search: multiple query variants for a single stage
// ---------------------------------------------------------------------------

const DEEP_STAGE_QUERIES: Record<string, (name: string) => string[]> = {
  "Pre-Seed": (n) => [
    `"${n}" pre-seed`,
    `"${n}" pre-seed funding`,
    `"${n}" pre-seed raises`,
    `"${n}" erste Finanzierung OR angel round`,
    `"${n}" pre-seed investment`,
    `${n} pre-seed startup`,
  ],
  "Seed": (n) => [
    `"${n}" seed round`,
    `"${n}" seed funding`,
    `"${n}" seed raise`,
    `"${n}" seed investment`,
    `"${n}" Seed-Finanzierung`,
    `${n} seed startup raises`,
    `"${n}" early stage funding`,
  ],
  "Series A": (n) => [
    `"${n}" series A`,
    `"${n}" series A funding`,
    `"${n}" series A raises`,
    `"${n}" Serie A Finanzierung`,
    `${n} "series a" round million`,
    `"${n}" series A led by`,
    `"${n}" closes series A`,
  ],
  "Series B": (n) => [
    `"${n}" series B`,
    `"${n}" series B funding`,
    `"${n}" series B raises`,
    `"${n}" Serie B Finanzierung`,
    `${n} "series b" round million`,
    `"${n}" series B led by`,
    `"${n}" closes series B`,
  ],
  "Series C": (n) => [
    `"${n}" series C`,
    `"${n}" series C funding`,
    `"${n}" series C raises`,
    `"${n}" Serie C Finanzierung`,
    `${n} "series c" round million`,
    `"${n}" series C led by`,
    `"${n}" closes series C`,
  ],
  "Series D+": (n) => [
    `"${n}" series D`,
    `"${n}" series E`,
    `"${n}" series D funding`,
    `"${n}" series E funding`,
    `"${n}" series D raises`,
    `"${n}" late stage funding`,
    `${n} "series d" OR "series e" round million`,
  ],
  "Bridge": (n) => [
    `"${n}" bridge round`,
    `"${n}" bridge funding`,
    `"${n}" bridge financing`,
    `"${n}" Brückenfinanzierung`,
    `"${n}" extension round`,
    `"${n}" bridge loan startup`,
  ],
  "Growth": (n) => [
    `"${n}" growth round`,
    `"${n}" growth equity`,
    `"${n}" growth funding`,
    `"${n}" growth stage`,
    `"${n}" Wachstumsfinanzierung`,
    `"${n}" expansion round`,
    `${n} growth investment million`,
  ],
};

function buildDeepStageQueries(name: string, stage: string): { query: string; stage: string }[] {
  const builder = DEEP_STAGE_QUERIES[stage];
  if (!builder) {
    // Fallback: generic deep search for unknown stage
    return [
      { query: `"${name}" ${stage}`, stage },
      { query: `"${name}" ${stage} funding`, stage },
      { query: `"${name}" ${stage} raises`, stage },
      { query: `${name} "${stage}" round million`, stage },
    ];
  }
  return builder(name).map((q) => ({ query: q, stage }));
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * POST /api/funding/historical-search
 *
 * Step 1 of the historical funding enrichment flow.
 * Takes a company name, runs multiple Brave Search queries,
 * scores results by funding relevance, extracts stage/amount hints,
 * and returns candidates grouped by relevance category.
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  try {
    const body = await request.json();
    const { companyName, deepSearchStage } = body as {
      companyName: string;
      deepSearchStage?: string; // optional: run extra-deep search for a specific stage
    };

    if (!companyName?.trim()) {
      return NextResponse.json(
        { error: "companyName required" },
        { status: 400 }
      );
    }

    const name = companyName.trim();

    let allQueries: { query: string; stage: string | null }[];
    let stageQueries: { query: string; stage: string }[];

    if (deepSearchStage) {
      // Deep search: multiple query variants for one specific stage
      stageQueries = buildDeepStageQueries(name, deepSearchStage);
      allQueries = stageQueries;
    } else {
      // Standard search: one query per stage + broad catch-alls
      stageQueries = [
        { query: `"${name}" pre-seed`, stage: "Pre-Seed" },
        { query: `"${name}" seed round OR seed funding OR seed raise`, stage: "Seed" },
        { query: `"${name}" series A`, stage: "Series A" },
        { query: `"${name}" series B`, stage: "Series B" },
        { query: `"${name}" series C`, stage: "Series C" },
        { query: `"${name}" series D OR series E`, stage: "Series D+" },
        { query: `"${name}" bridge round OR bridge funding`, stage: "Bridge" },
        { query: `"${name}" growth round OR growth equity OR growth funding`, stage: "Growth" },
      ];

      const broadQueries = [
        { query: `"${name}" raises OR secures million`, stage: null },
        { query: `"${name}" funding round closes`, stage: null },
      ];

      allQueries = [...stageQueries, ...broadQueries];
    }

    // Run all queries in parallel (Brave Search allows high concurrency)
    const searchResults = await Promise.all(
      allQueries.map((q) => searchWeb(q.query, 8))
    );

    // Deduplicate by URL, keep first occurrence (higher-priority query)
    const seen = new Set<string>();
    const allResults: {
      url: string;
      title: string;
      description: string;
      query: string;
      searchStage: string | null;
    }[] = [];

    for (let i = 0; i < allQueries.length; i++) {
      for (const result of searchResults[i]) {
        if (!result.url || seen.has(result.url)) continue;
        if (isBlockedDomain(result.url)) continue;
        seen.add(result.url);
        allResults.push({
          ...result,
          query: allQueries[i].query,
          searchStage: allQueries[i].stage,
        });
      }
    }

    // Score and enrich each result
    const scored = allResults
      .map((r) => scoreResult(r, name))
      .sort((a, b) => b.relevance - a.relevance);

    // Count by category
    const counts = {
      high: scored.filter((r) => r.category === "high").length,
      medium: scored.filter((r) => r.category === "medium").length,
      low: scored.filter((r) => r.category === "low").length,
      byStage: Object.fromEntries(
        stageQueries.map((sq) => [
          sq.stage,
          scored.filter((r) => r.extractedStage === sq.stage || r.searchStage === sq.stage).length,
        ])
      ) as Record<string, number>,
    };

    // Collect unique detected stages
    const detectedStages = [
      ...new Set(scored.map((r) => r.extractedStage).filter(Boolean)),
    ];

    return NextResponse.json({
      companyName: name,
      deepSearchStage: deepSearchStage ?? null,
      totalResults: scored.length,
      queriesRun: allQueries.length,
      counts,
      detectedStages,
      results: scored,
    });
  } catch (e) {
    console.error("Historical search error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
