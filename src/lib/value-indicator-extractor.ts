// ---------------------------------------------------------------------------
// Company Value Indicator Extractor
// ---------------------------------------------------------------------------
// Extracts KPIs from news articles: valuations, revenue, ARR/MRR, users,
// growth rates. Runs independently alongside funding/fund-event extraction.
// ---------------------------------------------------------------------------

const MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  m: 1_000_000,
  mn: 1_000_000,
  million: 1_000_000,
  millionen: 1_000_000,
  "mio.": 1_000_000,
  mio: 1_000_000,
  b: 1_000_000_000,
  bn: 1_000_000_000,
  billion: 1_000_000_000,
  t: 1_000_000_000_000,
  trillion: 1_000_000_000_000,
};

const CURRENCY_TO_USD: Record<string, number> = {
  USD: 1, $: 1,
  EUR: 1.08, "\u20AC": 1.08,
  GBP: 1.27, "\u00A3": 1.27,
};

// === TYPES ===

export type ValueIndicatorExtraction = {
  companyName: string;
  metricType: string;
  value: number | null;
  currency: string;
  valueUsd: number | null;
  unit: string | null;
  period: string | null;
  confidence: number;
  rawExcerpt: string;
};

// === QUICK GATE ===

const TITLE_SIGNALS = [
  // Valuation
  /\bvaluation\b/i,
  /\bvalued\s+at\b/i,
  /\bpost[- ]?money\b/i,
  /\bpre[- ]?money\b/i,
  /\bunicorn/i,                     // catches "unicorn", "unicorns"
  /\bdecacorn/i,
  /\bat\s+[\$\u20AC\u00A3][\d,.]+\s*[btmk]/i,  // "at $5.3B"

  // Revenue / ARR / MRR
  /\barr\b/i,
  /\bmrr\b/i,
  /\brevenue\b/i,
  /\b[\$\u20AC\u00A3][\d,.]+\s*(?:trillion|billion|million|mn|m|bn|b|k)\s+(?:in\s+)?(?:annual|recurring|revenue|arr|mrr|sales)/i,
  /\bannual\s+(?:recurring\s+)?revenue\b/i,
  /\bmonthly\s+(?:recurring\s+)?revenue\b/i,
  /\brun[- ]?rate\b/i,

  // GMV
  /\bgmv\b/i,
  /\bgross\s+merchandise/i,

  // Users
  /\b[\d,.]+\s*(?:million|m|mn|billion|bn|b)\s+(?:active\s+)?(?:users?|customers?|subscribers?)\b/i,
  /\b(?:dau|mau|wau)\b/i,
  /\bmonthly\s+active\s+users\b/i,
  /\bmillion\s+users\b/i,

  // Growth
  /\bgrowing\s+\d+%/i,
  /\brevenue\s+(?:up|grew|growth)\b/i,
  /\b\d+%\s+(?:yoy|year[- ]over[- ]year|growth)\b/i,
  /\bgrew\s+\d+%/i,

  // "$XB/$XM valuation" patterns
  /[\$\u20AC\u00A3][\d,.]+\s*(?:trillion|billion|million|mn|m|bn|b|k)\s+valuation/i,
];

const BODY_SIGNALS = [
  /\bpost[- ]?money\s+valuation\b/i,
  /\bannual\s+recurring\s+revenue\b/i,
  /\bmonthly\s+active\s+users\b/i,
  /\bgross\s+merchandise\s+volume\b/i,
  /\brun[- ]?rate\b/i,
  /\brevenue\s+run[- ]?rate\b/i,
  /\bvalued\s+at\b/i,
  /\bvaluation\s+of\b/i,
  /[\$\u20AC\u00A3][\d,.]+\s*(?:trillion|billion|million|mn|m|bn|b|k)\s+valuation/i,
  /\barr\s+(?:of\s+)?[\$\u20AC\u00A3]/i,
  /[\$\u20AC\u00A3][\d,.]+\s*(?:trillion|billion|million|mn|m|bn|b|k)\s+arr\b/i,
];

export function hasValueSignals(title: string, content: string): boolean {
  if (TITLE_SIGNALS.some((p) => p.test(title))) return true;
  const bodyStart = content.substring(0, 2000);
  if (BODY_SIGNALS.some((p) => p.test(bodyStart))) return true;
  if (TITLE_SIGNALS.some((p) => p.test(bodyStart))) return true;
  return false;
}

// === ANTI-PATTERNS ===
// These are checked in the LOCAL CONTEXT around a match, not globally.

const ANTI_PATTERNS = [
  /\bmarket\s+size\b/i,
  /\btotal\s+addressable\s+market\b|\btam\b/i,
  /\bexpected\s+to\s+reach\b/i,
  /\bprojected\s+to\b/i,
  /\bforecast(?:ed|s)?\b/i,
  /\bindustry\s+(?:average|median)\b/i,
  /\banalysts?\s+(?:predict|expect|estimate)\b/i,
  /\bcould\s+(?:reach|hit|surpass)\b/i,
];

// GLOBAL anti-patterns: articles that should be completely skipped
const GLOBAL_ANTI_PATTERNS = [
  /^how\s+/i,                       // "How Nebius's $275M deal..."
  /\bhow\s+to\b/i,
  /\btop\s+\d+\b/i,
  /\b\d+\s+(?:tips?|ways?|trends?|tools?)\b/i,
  /\bopinion\b/i,
  /\bweekly?\s+(?:recap|digest|roundup)\b/i,
  /\bin\s+the\s+era\s+of\b/i,       // editorial
  /\bto\s+install\b/i,              // infrastructure/contract news
  /\bcalls?\s+for\b/i,              // opinion/policy
  /\beyes?\b.*\bstake\b/i,          // "MGX eyes Anthropic stake" - speculation
  /\bamid\s+record\b/i,             // "Amid record robotics funding"
];

function isAntiPattern(text: string): boolean {
  return ANTI_PATTERNS.some((p) => p.test(text));
}

// === AMOUNT PARSING ===

const AMOUNT_PATTERNS = [
  /[\$]\s*([\d,.]+)\s*(trillion|billion|million|mn|m|bn|b|k)\b/i,
  /(?:EUR|\u20AC)\s*([\d,.]+)\s*(trillion|billion|million|mn|m|bn|b|k)?\b/i,
  /(?:GBP|\u00A3)\s*([\d,.]+)\s*(trillion|billion|million|mn|m|bn|b|k)?\b/i,
  /([\d,.]+)\s*(trillion|billion|million|mn|m|bn|b)\s*(?:dollars?|euros?|pounds?|USD|EUR|GBP)/i,
];

function parseAmount(text: string): { amount: number; currency: string } | null {
  for (const pattern of AMOUNT_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;

    let currency = "USD";
    const fullMatch = match[0];
    if (/\u20AC|EUR|euro/i.test(fullMatch)) currency = "EUR";
    else if (/\u00A3|GBP|pound/i.test(fullMatch)) currency = "GBP";

    const numStr = match[1];
    const multiplierStr = (match[2] || "").toLowerCase();
    const num = parseFloat(numStr.replace(/,/g, ""));
    if (isNaN(num)) continue;

    const multiplier = MULTIPLIERS[multiplierStr] || 1;
    const amount = multiplier === 1 && num < 1000 ? num * 1_000_000 : num * multiplier;

    return { amount, currency };
  }
  return null;
}

// === COMPANY NAME EXTRACTION ===

function extractCompanyName(title: string, text: string): string | null {
  // Strip HTML entities / special chars at start
  const clean = title.replace(/^[^A-Za-z0-9]+/, "").trim();

  // "[Company] valued at $X"
  const valuedMatch = clean.match(/^(.+?)\s+(?:is\s+)?(?:now\s+)?valued\s+at\b/i);
  if (valuedMatch) return cleanCompanyName(valuedMatch[1]);

  // "[Company], valued at $X" or "[Company], now valued at $X"
  const commaValuedMatch = clean.match(/^(.+?),\s+(?:now\s+)?valued\s+at\b/i);
  if (commaValuedMatch) return cleanCompanyName(commaValuedMatch[1]);

  // "[X] ... [Company]'s $YB valuation" — possessive valuation target
  const possValMatch = clean.match(/\b(?:in\s+)?([A-Z][a-zA-Z0-9\-'.]+(?:\s+[A-Z][a-zA-Z0-9\-'.]+){0,2})[''\u2019]s\s+[\$\u20AC\u00A3][\d,.]+\s*(?:trillion|billion|million|mn|m|bn|b|k)\s+valuation/i);
  if (possValMatch) return cleanCompanyName(possValMatch[1]);

  // "[Company] raises $X at $Y valuation"
  const raisesValMatch = clean.match(/^(.+?)\s+raises?\s+/i);
  if (raisesValMatch && /valuation/i.test(clean)) return cleanCompanyName(raisesValMatch[1]);

  // "[Company] raises/bags/secures... $X ... becomes ... unicorn"
  const raisesBecomesMatch = clean.match(/^(.+?)\s+(?:raises?|bags?|secures?|closes?)\s+.*\b(?:becomes?|achieves?)\s+.*\bunicorn\b/i);
  if (raisesBecomesMatch) return cleanCompanyName(raisesBecomesMatch[1]);

  // "[Company] hits/reaches/bags/secures/posts/reports/surpasses/tops $X ..."
  const actionMatch = clean.match(/^(.+?)\s+(?:hits?|reaches?|bags?|secures?|lands?|nabs?|scores?|posts?|reports?|surpasses?|tops?|closes?|achieves?|crosses|passes)\s+/i);
  if (actionMatch) {
    // Only if there's a KPI signal in the rest of the title
    const rest = clean.substring(actionMatch[0].length);
    if (/valuation|arr\b|mrr\b|revenue|users?|gmv|growth|million|billion|[\$\u20AC\u00A3][\d]/i.test(rest)) {
      return cleanCompanyName(actionMatch[1]);
    }
  }

  // "[Company]'s revenue/ARR/valuation/unicorn"
  const possessiveMatch = clean.match(/^([A-Za-z][a-zA-Z0-9\-'. ]+?)[''\u2019]s\s+(?:revenue|arr|mrr|valuation|gmv|users?|growth|unicorn)/i);
  if (possessiveMatch) return cleanCompanyName(possessiveMatch[1]);

  // Title with colon prefix: "Getir: Uber Takes Over..."
  const colonMatch = clean.match(/^([A-Z][a-zA-Z0-9\-'.]+(?:\s+[A-Z][a-zA-Z0-9\-'.]+){0,2}):\s/);
  if (colonMatch && /valuation|unicorn|arr\b|revenue/i.test(text)) {
    return cleanCompanyName(colonMatch[1]);
  }

  // Fallback: first proper noun sequence (only if title has a clear KPI signal)
  if (/valuation|arr\b|mrr\b|revenue|users|gmv|\$[\d,.]+\s*[bmk]/i.test(clean)) {
    const nounMatch = clean.match(/^([A-Z][a-zA-Z0-9\-'.]+(?:\s+[A-Z][a-zA-Z0-9\-'.]+){0,2})/);
    if (nounMatch) {
      const candidate = cleanCompanyName(nounMatch[1]);
      // Reject generic/noise words as company names
      if (candidate && !/^(?:The|A|An|European|German|French|British|New|Meet|Almost|What|How|Why)$/i.test(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function cleanCompanyName(name: string): string {
  let cleaned = name
    .replace(/^(?:the|a|an|in)\s+/i, "")
    .replace(/^(?:european|german|french|british|london|us|american|israeli|indian|chinese|finnish|swedish|dutch|spanish|abu\s+dhabi(?:'s)?|danish|norwegian|italian)\s+/i, "")
    .replace(/^(?:gen\s+ai|ai)\s+(?:video\s+)?/i, "")
    .replace(/^(?:startup|fintech|healthtech|edtech|proptech|insurtech|saas|company|defense)\s+/i, "")
    .replace(/^(?:\w+\s+)?(?:learning\s+)?(?:marketplace|platform|firm|company)\s+/i, "")
    .trim();
  // Repeat geo cleanup (after other cleanups may have revealed it)
  cleaned = cleaned
    .replace(/^(?:european|german|french|british|finnish|swedish)\s+/i, "")
    .trim();
  return cleaned;
}

// === PERIOD EXTRACTION ===

function extractPeriod(text: string): string | null {
  // "Q4 2024", "Q1 2025"
  const quarterMatch = text.match(/\bQ([1-4])\s+(20[2-3]\d)\b/);
  if (quarterMatch) return `Q${quarterMatch[1]} ${quarterMatch[2]}`;

  // "FY2023", "FY 2024"
  const fyMatch = text.match(/\bFY\s?(20[2-3]\d)\b/);
  if (fyMatch) return `FY${fyMatch[1]}`;

  // "H1 2024", "H2 2024"
  const halfMatch = text.match(/\bH([12])\s+(20[2-3]\d)\b/);
  if (halfMatch) return `H${halfMatch[1]} ${halfMatch[2]}`;

  // "TTM", "trailing twelve months"
  if (/\bttm\b/i.test(text) || /\btrailing\s+twelve\s+months?\b/i.test(text)) return "TTM";

  // "in 2024", "for 2024"
  const yearMatch = text.match(/\b(?:in|for|during)\s+(20[2-3]\d)\b/);
  if (yearMatch) return yearMatch[1];

  return null;
}

// === METRIC TYPE EXTRACTION PATTERNS ===

type MetricPattern = {
  type: string;
  patterns: RegExp[];
  unit: string | null;
  extractValue: (text: string, match: RegExpMatchArray) => { value: number | null; currency: string; excerpt: string } | null;
};

const monetaryExtractor = (_text: string, match: RegExpMatchArray) => {
  const parsed = parseAmount(match[0]);
  if (!parsed) return null;
  return { value: parsed.amount, currency: parsed.currency, excerpt: match[0] };
};

const VALUATION_PATTERNS: MetricPattern = {
  type: "valuation",
  patterns: [
    // "valued at $X"
    /valued\s+at\s+[\$\u20AC\u00A3]?\s*[\d,.]+\s*(?:trillion|billion|million|mn|m|bn|b|k)?/i,
    // "$X valuation"
    /[\$\u20AC\u00A3]\s*[\d,.]+\s*(?:trillion|billion|million|mn|m|bn|b|k)\s+valuation/i,
    // "valuation of $X"
    /valuation\s+of\s+[\$\u20AC\u00A3]?\s*[\d,.]+\s*(?:trillion|billion|million|mn|m|bn|b|k)?/i,
    // "at $X valuation"
    /at\s+[\$\u20AC\u00A3]\s*[\d,.]+\s*(?:trillion|billion|million|mn|m|bn|b|k)\s+valuation/i,
    // "post-money valuation of $X" / "post-money $X"
    /post[- ]?money\s+(?:valuation\s+)?(?:of\s+)?[\$\u20AC\u00A3]?\s*[\d,.]+\s*(?:trillion|billion|million|mn|m|bn|b|k)?/i,
    // "pre-money valuation of $X"
    /pre[- ]?money\s+(?:valuation\s+)?(?:of\s+)?[\$\u20AC\u00A3]?\s*[\d,.]+\s*(?:trillion|billion|million|mn|m|bn|b|k)?/i,
    // "$XB valuation" (more relaxed)
    /[\$\u20AC\u00A3][\d,.]+\s*(?:trillion|billion|bn|b)\s+valuation/i,
    // "valuation ... $X" (within 20 chars)
    /valuation.{0,20}[\$\u20AC\u00A3][\d,.]+\s*(?:trillion|billion|million|mn|m|bn|b|k)/i,
  ],
  unit: null,
  extractValue: monetaryExtractor,
};

const REVENUE_PATTERNS: MetricPattern = {
  type: "revenue",
  patterns: [
    // "$X in revenue" / "$X revenue"
    /[\$\u20AC\u00A3]\s*[\d,.]+\s*(?:trillion|billion|million|mn|m|bn|b|k)\s+(?:in\s+)?(?:annual\s+)?revenue/i,
    // "revenue of $X"
    /(?:annual\s+)?revenue\s+(?:of\s+)?[\$\u20AC\u00A3]\s*[\d,.]+\s*(?:trillion|billion|million|mn|m|bn|b|k)/i,
    // "reaches $X in revenue"
    /reaches?\s+[\$\u20AC\u00A3]\s*[\d,.]+\s*(?:trillion|billion|million|mn|m|bn|b|k)\s+(?:in\s+)?revenue/i,
    // "$X revenue" (simpler)
    /[\$\u20AC\u00A3][\d,.]+\s*(?:trillion|billion|million|mn|m|bn|b|k)\s+revenue/i,
  ],
  unit: null,
  extractValue: monetaryExtractor,
};

const ARR_PATTERNS: MetricPattern = {
  type: "arr",
  patterns: [
    // "$X ARR"
    /[\$\u20AC\u00A3]\s*[\d,.]+\s*(?:trillion|billion|million|mn|m|bn|b|k)\s+arr\b/i,
    // "ARR of $X" / "ARR $X"
    /\barr\s+(?:of\s+)?[\$\u20AC\u00A3]\s*[\d,.]+\s*(?:trillion|billion|million|mn|m|bn|b|k)/i,
    // "annual recurring revenue of $X"
    /annual\s+recurring\s+revenue\s+(?:of\s+)?[\$\u20AC\u00A3]\s*[\d,.]+\s*(?:trillion|billion|million|mn|m|bn|b|k)/i,
    // "$X in annual recurring revenue"
    /[\$\u20AC\u00A3]\s*[\d,.]+\s*(?:trillion|billion|million|mn|m|bn|b|k)\s+(?:in\s+)?annual\s+recurring\s+revenue/i,
  ],
  unit: null,
  extractValue: monetaryExtractor,
};

const MRR_PATTERNS: MetricPattern = {
  type: "mrr",
  patterns: [
    /[\$\u20AC\u00A3]\s*[\d,.]+\s*(?:trillion|billion|million|mn|m|bn|b|k)\s+mrr\b/i,
    /\bmrr\s+(?:of\s+)?[\$\u20AC\u00A3]\s*[\d,.]+\s*(?:trillion|billion|million|mn|m|bn|b|k)/i,
    /monthly\s+recurring\s+revenue\s+(?:of\s+)?[\$\u20AC\u00A3]\s*[\d,.]+\s*(?:trillion|billion|million|mn|m|bn|b|k)/i,
  ],
  unit: null,
  extractValue: monetaryExtractor,
};

const GMV_PATTERNS: MetricPattern = {
  type: "gmv",
  patterns: [
    /\bgmv\s+(?:of\s+)?[\$\u20AC\u00A3]\s*[\d,.]+\s*(?:trillion|billion|million|mn|m|bn|b|k)/i,
    /[\$\u20AC\u00A3]\s*[\d,.]+\s*(?:trillion|billion|million|mn|m|bn|b|k)\s+(?:in\s+)?(?:gmv|gross\s+merchandise\s+volume)/i,
    /gross\s+merchandise\s+volume\s+(?:of\s+)?[\$\u20AC\u00A3]\s*[\d,.]+\s*(?:trillion|billion|million|mn|m|bn|b|k)/i,
  ],
  unit: null,
  extractValue: monetaryExtractor,
};

const USER_PATTERNS: MetricPattern = {
  type: "users",
  patterns: [
    // "10 million users" / "1.5B users"
    /([\d,.]+)\s*(million|m|mn|billion|bn|b|k)\s+(?:active\s+)?(?:users?|customers?|subscribers?)\b/i,
    // "X million DAU/MAU"
    /([\d,.]+)\s*(million|m|mn|billion|bn|b|k)\s+(?:dau|mau|wau|daily\s+active|monthly\s+active)/i,
    // "DAU/MAU of X"
    /(?:dau|mau|wau)\s+(?:of\s+)?([\d,.]+)\s*(million|m|mn|billion|bn|b|k)/i,
    // "monthly active users of X"
    /monthly\s+active\s+users?\s+(?:of\s+)?([\d,.]+)\s*(million|m|mn|billion|bn|b|k)/i,
    // "X million users" with "million" before "users" (wider)
    /([\d,.]+)\s+million\s+(?:active\s+)?users\b/i,
  ],
  unit: "users",
  extractValue: (_text, match) => {
    const numStr = match[1];
    const multiplierStr = (match[2] || "").toLowerCase();
    const num = parseFloat(numStr.replace(/,/g, ""));
    if (isNaN(num)) return null;
    const multiplier = MULTIPLIERS[multiplierStr] || 1;
    const value = num * multiplier;
    return { value, currency: "USD", excerpt: match[0] };
  },
};

const GROWTH_PATTERNS: MetricPattern = {
  type: "growth_rate",
  patterns: [
    /growing\s+([\d,.]+)\s*%\s*(?:yoy|year[- ]over[- ]year|annually)?/i,
    /(?:revenue|sales)\s+(?:up|grew|growth(?:\s+of)?)\s+([\d,.]+)\s*%/i,
    /([\d,.]+)\s*%\s+(?:yoy|year[- ]over[- ]year)\s+(?:growth|increase|revenue)/i,
    /([\d,.]+)\s*%\s+(?:revenue\s+)?growth/i,
    /grew\s+([\d,.]+)\s*%\s*(?:yoy|year[- ]over[- ]year)?/i,
  ],
  unit: "%",
  extractValue: (_text, match) => {
    const num = parseFloat(match[1].replace(/,/g, ""));
    if (isNaN(num)) return null;
    return { value: num, currency: "USD", excerpt: match[0] };
  },
};

const ALL_METRIC_PATTERNS: MetricPattern[] = [
  VALUATION_PATTERNS,
  ARR_PATTERNS,
  MRR_PATTERNS,
  REVENUE_PATTERNS,
  GMV_PATTERNS,
  USER_PATTERNS,
  GROWTH_PATTERNS,
];

// === UNICORN SPECIAL CASE ===

function checkUnicorn(title: string, text: string): ValueIndicatorExtraction | null {
  // "becomes a unicorn", "unicorn status", "joins unicorn club", "new unicorn"
  // Also: "new European unicorns", just "unicorn" in context of a specific company
  const unicornMatch = text.match(/\b(?:becomes?\s+a\s+unicorn|unicorn\s+status|joins?\s+(?:the\s+)?unicorn\s+club|new\s+unicorn|is\s+(?:now\s+)?a\s+unicorn)\b/i);
  if (!unicornMatch) {
    // Check if title mentions unicorn AND a specific company (not a list article)
    if (/\bunicorn\b/i.test(title) && !/\d+\s+(?:new\s+)?unicorn/i.test(title) && !/meet\s+the/i.test(title)) {
      // Unicorn in title for a single company
      const excerptMatch = text.match(/.{0,60}unicorn.{0,60}/i);
      return {
        companyName: "",
        metricType: "valuation",
        value: 1_000_000_000,
        currency: "USD",
        valueUsd: 1_000_000_000,
        unit: null,
        period: null,
        confidence: 0.6,
        rawExcerpt: excerptMatch?.[0]?.trim() || "unicorn",
      };
    }
    return null;
  }

  const excerptMatch = text.match(/.{0,60}unicorn.{0,60}/i);
  return {
    companyName: "",
    metricType: "valuation",
    value: 1_000_000_000,
    currency: "USD",
    valueUsd: 1_000_000_000,
    unit: null,
    period: null,
    confidence: 0.7,
    rawExcerpt: excerptMatch?.[0]?.trim() || unicornMatch[0],
  };
}

function checkDecacorn(text: string): ValueIndicatorExtraction | null {
  if (!/\bdecacorn\b/i.test(text)) return null;
  const excerptMatch = text.match(/.{0,60}decacorn.{0,60}/i);
  return {
    companyName: "",
    metricType: "valuation",
    value: 10_000_000_000,
    currency: "USD",
    valueUsd: 10_000_000_000,
    unit: null,
    period: null,
    confidence: 0.7,
    rawExcerpt: excerptMatch?.[0]?.trim() || "decacorn",
  };
}

// === CONFIDENCE SCORING ===

function scoreIndicator(
  metricType: string,
  inTitle: boolean,
  hasExactValue: boolean,
  hasPeriod: boolean,
): number {
  let score = 0.5;

  if (inTitle) score += 0.2;
  if (hasExactValue) score += 0.15;
  if (hasPeriod) score += 0.05;

  if (metricType === "valuation") score += 0.05;

  return Math.min(1, Math.round(score * 100) / 100);
}

// === MAIN EXPORT ===

export function extractValueIndicators(
  title: string,
  content: string
): ValueIndicatorExtraction[] {
  const rawText = `${title} ${content}`;
  const text = rawText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  if (!hasValueSignals(title, text)) return [];

  // Skip list articles, editorials etc.
  if (GLOBAL_ANTI_PATTERNS.some((p) => p.test(title))) return [];

  const companyName = extractCompanyName(title, text);
  if (!companyName) return [];

  // Reject noise company names
  if (/^(?:companies|reportedly|startup|the|was|system|finnish|french|german|british|swedish)$/i.test(companyName)) return [];
  if (/\s+(?:raises?|pumps?|bags?|eyes?|takes?)$/i.test(companyName)) return [];
  if (companyName.length < 2 || companyName.length > 40) return [];

  const results: ValueIndicatorExtraction[] = [];
  const seenTypes = new Set<string>();

  // Check special cases
  const unicorn = checkUnicorn(title, text);
  if (unicorn) {
    unicorn.companyName = companyName;
    results.push(unicorn);
    seenTypes.add("valuation");
  }
  const decacorn = checkDecacorn(text);
  if (decacorn && !seenTypes.has("valuation")) {
    decacorn.companyName = companyName;
    results.push(decacorn);
    seenTypes.add("valuation");
  }

  // Extract each metric type
  for (const metricDef of ALL_METRIC_PATTERNS) {
    if (seenTypes.has(metricDef.type)) continue;

    for (const pattern of metricDef.patterns) {
      const match = text.match(pattern);
      if (!match) continue;

      // Check if the context around the match has anti-patterns
      const contextStart = Math.max(0, (match.index ?? 0) - 100);
      const contextEnd = Math.min(text.length, (match.index ?? 0) + match[0].length + 100);
      const context = text.substring(contextStart, contextEnd);

      if (isAntiPattern(context)) continue;

      const extracted = metricDef.extractValue(text, match);
      if (!extracted) continue;

      const inTitle = pattern.test(title);
      const period = extractPeriod(context) || extractPeriod(text);

      let valueUsd: number | null = null;
      if (extracted.value !== null && metricDef.unit === null) {
        const rate = CURRENCY_TO_USD[extracted.currency] || 1;
        valueUsd = extracted.value * rate;
      }

      const confidence = scoreIndicator(
        metricDef.type,
        inTitle,
        extracted.value !== null,
        period !== null,
      );

      const excerptStart = Math.max(0, (match.index ?? 0) - 60);
      const excerptEnd = Math.min(text.length, (match.index ?? 0) + match[0].length + 60);
      const rawExcerpt = text.substring(excerptStart, excerptEnd).trim();

      results.push({
        companyName,
        metricType: metricDef.type,
        value: extracted.value,
        currency: extracted.currency,
        valueUsd,
        unit: metricDef.unit,
        period,
        confidence,
        rawExcerpt,
      });

      seenTypes.add(metricDef.type);
      break;
    }
  }

  return results;
}
