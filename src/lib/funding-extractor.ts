// ---------------------------------------------------------------------------
// Funding Round Extractor with Multi-Signal Confidence Scoring
// ---------------------------------------------------------------------------
// Scoring approach: Each signal contributes a weighted score to a total.
// Signals can also be negative (anti-signals that indicate noise).
// Final confidence = clamp(sum of weighted signals, 0, 1)
// ---------------------------------------------------------------------------

// === SIGNAL DEFINITIONS ===

// Tier 1: Strong funding-announcement patterns (title-level)
const TITLE_STRONG_TRIGGERS: RegExp[] = [
  /\braises?\s+[\$€£]?[\d,.]+\s*(m|mn|million|billion|b|k|mio)/i,
  /\bsecures?\s+[\$€£]?[\d,.]+\s*(m|mn|million|billion|b|k|mio)/i,
  /\braises?\s+(?:EUR|USD|GBP)\s*[\d,.]+/i,
  /\bsecures?\s+(?:EUR|USD|GBP)\s*[\d,.]+/i,
  /\bcloses?\s+[\$€£]?[\d,.]+\s*(m|mn|million|billion|b|k|mio)\s*(seed|series|round|funding)/i,
  /\b(seed|series\s+[a-e]\+?)\s+(?:round|funding)\s+of\s+[\$€£]/i,
  /\bseries\s+[a-e]\+?\b.*\braises?\b/i,
  // "[Investor] leads $Xm round for [Company]" pattern
  /\bleads?\s+[\$€£]?[\d,.]+\s*(m|mn|million|billion|b|k|mio)\s*(round|funding|investment)/i,
  /\bleads?\s+[\$€£]?[\d,.]+\s*(m|mn|million|billion|b|k|mio)/i,
];

// Tier 2: Moderate funding triggers (can appear in title or body)
const MODERATE_TRIGGERS: RegExp[] = [
  /\b(raises?|raised)\s/i,
  /\b(secures?|secured)\s/i,
  /\b(closes?|closed)\s.*\b(round|funding)\b/i,
  /\b(leads?|led)\s+[\$€£]?\s*[\d,.]+.{0,20}\b(round|funding)\b/i,
  /\bfunding\s+round\b/i,
  /\bcapital\s+raise\b/i,
  /\binvestment\s+round\b/i,
];

// Tier 3: Weak triggers (need additional signals)
const WEAK_TRIGGERS: RegExp[] = [
  /\bseries\s+[a-e]\+?\b/i,
  /\bseed\s+round\b/i,
  /\bpre[- ]?seed\b/i,
  /\bvc\s+funding\b/i,
  /\bventure\s+(?:capital|funding)\b/i,
];

// Anti-signals: patterns that suggest this is NOT a specific funding announcement
const ANTI_PATTERNS: { pattern: RegExp; penalty: number }[] = [
  // Listicles / roundups
  { pattern: /\b\d+\s+(trends?|tips?|ways?|signs?|things?|reasons?|startups?|sectors?|companies|deals)\b/i, penalty: -0.25 },
  { pattern: /\btop\s+\d+\b/i, penalty: -0.20 },
  { pattern: /\bweek(?:ly|'s|s)?\s+(?:funding|round|recap|digest|\d+|top)\b/i, penalty: -0.30 },
  { pattern: /\bround[- ]?up\b/i, penalty: -0.30 },
  { pattern: /\bbest\s+of\b/i, penalty: -0.15 },
  { pattern: /\bbiggest\s+funding\s+rounds?\b/i, penalty: -0.25 },
  { pattern: /\bneed\s+to\s+know\b/i, penalty: -0.15 },
  { pattern: /\bmost\s+promising\b/i, penalty: -0.15 },
  { pattern: /\bkeep\s+an?\s+eye\s+on\b/i, penalty: -0.15 },
  // Market analysis / macro
  { pattern: /\bglobal\s+vc\b/i, penalty: -0.20 },
  { pattern: /\bmarket\s+(?:report|analysis|overview|recap|roundup)\b/i, penalty: -0.20 },
  { pattern: /\bfunding\s+(?:landscape|trends?|recap|report|roundup|review|overview|growth)\b/i, penalty: -0.25 },
  { pattern: /\bquarterly\s+(?:report|review|roundup)\b/i, penalty: -0.20 },
  { pattern: /\bstate\s+of\s+(?:vc|venture|funding|startups?)\b/i, penalty: -0.20 },
  { pattern: /\bfading\s+away\b/i, penalty: -0.20 },
  { pattern: /\btech\s+ecosystem\b/i, penalty: -0.15 },
  { pattern: /\bbroad\s+momentum\b/i, penalty: -0.15 },
  // Opinion / career / advice
  { pattern: /\bhow\s+to\b/i, penalty: -0.15 },
  { pattern: /\bwhy\s+(?:you|we|i|founders?)\b/i, penalty: -0.10 },
  { pattern: /\bQ&A\b/i, penalty: -0.15 },
  { pattern: /\binterview\b/i, penalty: -0.10 },
  { pattern: /\bopinion\b/i, penalty: -0.15 },
  { pattern: /\bbattle\s+begins\b/i, penalty: -0.10 },
  // Fund formation (VC raising their own fund, not a startup)
  { pattern: /\bjust\s+raised\s+.*\bnew\s+fund\b/i, penalty: -0.30 },
  { pattern: /\b(?:fund|partners?|ventures?)\s+(?:closes?|raises?)\s+.*\bfund\b/i, penalty: -0.25 },
  { pattern: /\bfund\s+(?:i{1,3}|iv|v|vi|1|2|3|4|5)\b/i, penalty: -0.20 },
  { pattern: /\braises?\s+.*\bfund\s+to\s+back\b/i, penalty: -0.30 },
  // Conference / event
  { pattern: /\bsummit\b.*\b(?:tickets?|join|register)\b/i, penalty: -0.25 },
  { pattern: /\bearly\s+bird\s+tickets?\b/i, penalty: -0.35 },
  { pattern: /\bjoins\s+the\b.*\bsummit\b/i, penalty: -0.30 },
  // Public company mentions (not startup funding)
  { pattern: /\$\d+T\s+company\b/i, penalty: -0.35 },
  // "startup of the week" type articles
  { pattern: /\bstartup\s+of\s+the\s+(?:week|month|year)\b/i, penalty: -0.25 },
  // "where it's going" / analysis of someone else's fund
  { pattern: /\bhere'?s\s+where\b/i, penalty: -0.15 },
  // "was by far the most active" - analysis, not funding
  { pattern: /\bmost[- ]active\b/i, penalty: -0.20 },
  // IPO / public markets (different from private funding)
  { pattern: /\bipo\b/i, penalty: -0.40 },
  // Acquisition (not funding)
  { pattern: /\bacquir(?:es?|ed|ing|ition)\b/i, penalty: -0.35 },
  { pattern: /\bmerger\b/i, penalty: -0.25 },
  // Government / policy
  { pattern: /\bminister\b/i, penalty: -0.25 },
  { pattern: /\bgovernment\b.*\bpush/i, penalty: -0.20 },
  // Ticker / newsletter digest headings
  { pattern: /^#?\s*(?:startup)?ticker\b/i, penalty: -0.35 },
  { pattern: /^\+{3}/i, penalty: -0.30 },
];

// Proximity signal: "Company raises $XM" in a single sentence is very strong
const PROXIMITY_PATTERN =
  /\b[A-Z][a-zA-Z\-']{1,30}(?:\s+[A-Z][a-zA-Z\-']{1,30}){0,3}\s+(?:raises?|secures?|closes?|bags?|lands?|nabs?|gets?|leads?)\s+[\$€£]?\s*[\d,.]+\s*(?:m|mn|million|billion|b|mio\.?|millionen?)\b/i;

// Amount close to trigger (within ~80 chars)
const AMOUNT_NEAR_TRIGGER =
  /(?:raises?|secures?|closes?|leads?|funding|round).{0,80}[\$€£]\s*[\d,.]+\s*(?:m|mn|million|billion|b)\b/i;

// === EXTRACTION PATTERNS (unchanged, refined) ===

const AMOUNT_PATTERNS = [
  /[\$]\s*([\d,.]+)\s*(billion|million|mn|m|b|k)\b/i,
  /(?:EUR|€)\s*([\d,.]+)\s*(billion|million|mn|m|b|k)?\b/i,
  /(?:GBP|£)\s*([\d,.]+)\s*(billion|million|mn|m|b|k)?\b/i,
  /([\d,.]+)\s*(billion|million|mn|m|b)\s*(?:dollars?|euros?|pounds?|USD|EUR|GBP)/i,
  /([\d,.]+)\s*(?:Mio\.?|Millionen?)\s*(?:EUR|Euro|USD|Dollar|GBP)/i,
];

const STAGE_PATTERNS: [RegExp, string][] = [
  [/\bpre[- ]?seed\b/i, "Pre-Seed"],
  [/\bseed\s+(?:round|funding|extension)\b/i, "Seed"],
  [/\bseed\b/i, "Seed"],
  [/\bseries\s+a\+?\b/i, "Series A"],
  [/\bseries\s+b\+?\b/i, "Series B"],
  [/\bseries\s+c\+?\b/i, "Series C"],
  [/\bseries\s+d\+?\b/i, "Series D"],
  [/\bseries\s+e\+?\b/i, "Series E+"],
  [/\bbr?idge\s+round\b/i, "Bridge"],
  [/\bgrowth\s+(?:round|funding|equity)\b/i, "Growth"],
  [/\bdebt\s+(?:round|funding|financing)\b/i, "Debt"],
  [/\bgrant\b/i, "Grant"],
];

const INVESTOR_PATTERNS = [
  /\bled\s+by\s+([^,.]+(?:,\s*[^,.]+)*)/i,
  /\bwith\s+participation\s+(?:from|of)\s+([^.]+)/i,
  /\bbacked\s+by\s+([^.]+)/i,
  /\binvestors?\s+(?:include|including)\s+([^.]+)/i,
  /\bjoined\s+by\s+([^.]+)/i,
];

const EUROPEAN_COUNTRIES: [RegExp, string][] = [
  [/\bgerman[ys]?\b|\bberlin\b|\bmunich\b|\bhamburg\b|\bfrankfurt\b|\bdüsseldorf\b/i, "Germany"],
  [/\bfrance\b|\bfrench\b|\bparis\b|\blyon\b/i, "France"],
  [/\buk\b|\bunited\s+kingdom\b|\bbritish\b|\blondon\b|\bmanchester\b|\bedinburgh\b/i, "UK"],
  [/\bspain\b|\bspanish\b|\bmadrid\b|\bbarcelona\b/i, "Spain"],
  [/\bitaly\b|\bitalian\b|\bmilan\b|\brome\b/i, "Italy"],
  [/\bnetherlands\b|\bdutch\b|\bamsterdam\b|\brotterdam\b/i, "Netherlands"],
  [/\bsweden\b|\bswedish\b|\bstockholm\b/i, "Sweden"],
  [/\bdenmark\b|\bdanish\b|\bcopenhagen\b/i, "Denmark"],
  [/\bnorway\b|\bnorwegian\b|\boslo\b/i, "Norway"],
  [/\bfinland\b|\bfinnish\b|\bhelsinki\b/i, "Finland"],
  [/\bswitzerland\b|\bswiss\b|\bzurich\b|\bgeneva\b/i, "Switzerland"],
  [/\baustria\b|\baustrian\b|\bvienna\b/i, "Austria"],
  [/\bbelgium\b|\bbelgian\b|\bbrussels\b/i, "Belgium"],
  [/\bportugal\b|\bportuguese\b|\blisbon\b/i, "Portugal"],
  [/\bireland\b|\birish\b|\bdublin\b/i, "Ireland"],
  [/\bpoland\b|\bpolish\b|\bwarsaw\b|\bkrakow\b/i, "Poland"],
  [/\bczech\b|\bprague\b/i, "Czech Republic"],
  [/\bromania\b|\bromanian\b|\bbucharest\b/i, "Romania"],
  [/\bestonia\b|\bestonian\b|\btallinn\b/i, "Estonia"],
  [/\blatvia\b|\blatvian\b|\briga\b/i, "Latvia"],
  [/\blithuania\b|\blithuanian\b|\bvilnius\b/i, "Lithuania"],
  [/\bhungary\b|\bhungarian\b|\bbudapest\b/i, "Hungary"],
  [/\bgreece\b|\bgreek\b|\bathens\b/i, "Greece"],
  [/\bcroatia\b|\bcroatian\b|\bzagreb\b/i, "Croatia"],
  [/\bbulgaria\b|\bbulgarian\b|\bsofia\b/i, "Bulgaria"],
];

const MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  m: 1_000_000,
  mn: 1_000_000,
  million: 1_000_000,
  millionen: 1_000_000,
  "mio.": 1_000_000,
  mio: 1_000_000,
  b: 1_000_000_000,
  billion: 1_000_000_000,
};

const CURRENCY_TO_USD: Record<string, number> = {
  USD: 1, $: 1,
  EUR: 1.08, "€": 1.08,
  GBP: 1.27, "£": 1.27,
};

// === TYPES ===

export type CompanyMeta = {
  description: string | null;
  website: string | null;
  foundedYear: number | null;
  employeeRange: string | null;
  linkedinUrl: string | null;
};

export type FundingExtraction = {
  companyName: string;
  amount: number | null;
  currency: string;
  amountUsd: number | null;
  stage: string | null;
  investors: string[];
  leadInvestor: string | null;
  country: string | null;
  confidence: number;
  rawExcerpt: string;
  signals: string[]; // debug: which signals fired
  companyMeta?: CompanyMeta;
};

// === SCORING ENGINE ===

type Signal = {
  name: string;
  weight: number;
};

function scoreArticle(title: string, text: string, extraction: {
  amount: number | null;
  stage: string | null;
  investors: string[];
  leadInvestor: string | null;
  country: string | null;
}): { confidence: number; signals: string[] } {
  const signals: Signal[] = [];

  // --- Positive signals ---

  // 1. Title contains strong funding pattern (highest weight)
  if (TITLE_STRONG_TRIGGERS.some((p) => p.test(title))) {
    signals.push({ name: "title_strong_trigger", weight: 0.35 });
  }

  // 2. Moderate trigger in title
  if (MODERATE_TRIGGERS.some((p) => p.test(title))) {
    signals.push({ name: "title_moderate_trigger", weight: 0.20 });
  }

  // 3. Proximity: "Company raises $XM" pattern
  if (PROXIMITY_PATTERN.test(title)) {
    signals.push({ name: "title_proximity", weight: 0.15 });
  }

  // 4. Moderate trigger in body
  if (MODERATE_TRIGGERS.some((p) => p.test(text))) {
    signals.push({ name: "body_trigger", weight: 0.10 });
  }

  // 5. Amount found near a trigger word
  if (AMOUNT_NEAR_TRIGGER.test(text)) {
    signals.push({ name: "amount_near_trigger", weight: 0.10 });
  }

  // 6. Amount extracted (any)
  if (extraction.amount !== null) {
    signals.push({ name: "has_amount", weight: 0.10 });
    // Reasonable funding amount (100K - 5B) is more credible
    if (extraction.amount >= 100_000 && extraction.amount <= 5_000_000_000) {
      signals.push({ name: "reasonable_amount", weight: 0.05 });
    }
    // Unreasonable amount (> $10B) is likely market cap / revenue, not a round
    if (extraction.amount > 10_000_000_000) {
      signals.push({ name: "unreasonable_amount", weight: -0.25 });
    }
  }

  // 7. Stage mentioned
  if (extraction.stage) {
    signals.push({ name: "has_stage", weight: 0.10 });
  }

  // 8. Investors mentioned
  if (extraction.investors.length > 0) {
    signals.push({ name: "has_investors", weight: 0.08 });
  }
  if (extraction.leadInvestor) {
    signals.push({ name: "has_lead_investor", weight: 0.04 });
  }

  // 9. Country mentioned
  if (extraction.country) {
    signals.push({ name: "has_country", weight: 0.05 });
  }

  // 10. Title contains a company-like proper noun before trigger
  const companyBeforeTrigger = /\b[A-Z][a-zA-Z\-']+(?:\s+[A-Z][a-zA-Z\-']+){0,2}\s+(?:raises?|secures?|closes?|gets?|lands?|announces?|leads?)/;
  if (companyBeforeTrigger.test(title)) {
    signals.push({ name: "company_before_trigger", weight: 0.08 });
  }

  // --- Negative signals (anti-patterns) ---

  const combinedText = `${title} ${text.substring(0, 500)}`;
  for (const anti of ANTI_PATTERNS) {
    if (anti.pattern.test(title)) {
      // Anti-pattern in title is a strong negative signal
      signals.push({ name: `anti_title:${anti.pattern.source.substring(0, 30)}`, weight: anti.penalty });
    } else if (anti.pattern.test(combinedText)) {
      // Anti-pattern in body is a weaker negative
      signals.push({ name: `anti_body:${anti.pattern.source.substring(0, 30)}`, weight: anti.penalty * 0.5 });
    }
  }

  // --- Aggregate ---

  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
  const confidence = Math.max(0, Math.min(1, totalWeight));

  return {
    confidence: Math.round(confidence * 100) / 100,
    signals: signals.map((s) => `${s.name}(${s.weight > 0 ? "+" : ""}${s.weight.toFixed(2)})`),
  };
}

// === EXTRACTION FUNCTIONS ===

function parseNumber(raw: string): number {
  return parseFloat(raw.replace(/,/g, ""));
}

function extractAmount(text: string): { amount: number; currency: string } | null {
  for (const pattern of AMOUNT_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;

    let currency = "USD";
    const fullMatch = match[0];
    if (/€|EUR|euro/i.test(fullMatch)) currency = "EUR";
    else if (/£|GBP|pound/i.test(fullMatch)) currency = "GBP";

    const numStr = match[1];
    const multiplierStr = (match[2] || "").toLowerCase();
    const num = parseNumber(numStr);
    if (isNaN(num)) continue;

    const multiplier = MULTIPLIERS[multiplierStr] || 1;
    // Only auto-multiply to millions if the number is small AND near a trigger word
    const amount = multiplier === 1 && num < 1000 ? num * 1_000_000 : num * multiplier;

    return { amount, currency };
  }
  return null;
}

function extractStage(text: string): string | null {
  for (const [pattern, stage] of STAGE_PATTERNS) {
    if (pattern.test(text)) return stage;
  }
  return null;
}

function extractCompanyName(title: string): string {
  // Pattern 1: "[Investor] leads $Xm round for [Company]"
  const leadsForMatch = title.match(/\bleads?\s+[\$€£]?[\d,.]+\s*(?:m|mn|million|billion|b|k|mio)\s+(?:\w+\s+)?(?:round|funding|investment)\s+(?:for|in|into)\s+(.+)/i);
  if (leadsForMatch) {
    let name = leadsForMatch[1].trim();
    name = name.replace(/^.*?(?:startup|fintech|healthtech|edtech|proptech|saas|ai|company|firm|scaleup|scale-up|platform)\s+/i, "");
    name = name.replace(/^(?:the|a|an)\s+/i, "");
    // Take up to the first punctuation or preposition clause
    name = name.split(/[,;–—|]|\s+(?:to|as|in|with|that|which)\s+/)[0].trim();
    if (name.length > 0 && name.length < 80) return name;
  }

  // Pattern 2: "CompanyName raises/secures/closes..."
  const triggerWords = /\s+(?:raises?|secures?|closes?|gets?|lands?|nabs?|bags?|announces?|receives?|leads?)\s+/i;
  const match = title.match(triggerWords);
  if (match && match.index !== undefined && match.index > 0) {
    let name = title.substring(0, match.index).trim();
    // Remove common prefixes like "German startup", "London-based"
    name = name.replace(/^.*?(?:startup|fintech|healthtech|edtech|proptech|saas|ai|company|firm|scaleup|scale-up)\s+/i, "");
    name = name.replace(/^.*?-based\s+/i, "");
    name = name.replace(/^(?:the|a|an)\s+/i, "");
    // Take last segment if title has prefix delimiter
    const parts = name.split(/[:\-–—|]/);
    name = parts[parts.length - 1].trim();
    if (name.length > 0 && name.length < 80) return name;
  }

  // Pattern 3: "$Xm round for [Company]" / "$Xm funding for [Company]"
  const roundForMatch = title.match(/(?:round|funding|investment)\s+(?:for|in|into)\s+(.+)/i);
  if (roundForMatch) {
    let name = roundForMatch[1].trim();
    name = name.replace(/^.*?(?:startup|fintech|platform|company)\s+/i, "");
    name = name.replace(/^(?:the|a|an)\s+/i, "");
    name = name.split(/[,;–—|]|\s+(?:to|as|in|with|that|which)\s+/)[0].trim();
    if (name.length > 0 && name.length < 80) return name;
  }

  // Fallback: look for "Company, a ..." pattern
  const commaPattern = title.match(/^([A-Z][a-zA-Z\-']+(?:\s+[A-Z][a-zA-Z\-']+){0,2}),/);
  if (commaPattern) return commaPattern[1];

  // Last fallback
  return title.split(/\s+/).slice(0, 3).join(" ");
}

function extractInvestors(text: string): { investors: string[]; leadInvestor: string | null } {
  const investors: string[] = [];
  let leadInvestor: string | null = null;

  for (const pattern of INVESTOR_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;

    const raw = match[1];
    const names = raw
      .split(/,\s*|\s+and\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 1 && s.length < 80)
      .filter((s) => !/\b(the|a|an|other|various|several|multiple|undisclosed|existing|new|additional|further|angel)\b/i.test(s));

    if (names.length > 0) {
      if (/led\s+by/i.test(match[0]) && !leadInvestor) {
        leadInvestor = names[0];
      }
      investors.push(...names);
    }
  }

  return {
    investors: Array.from(new Set(investors)),
    leadInvestor,
  };
}

function extractCountry(text: string): string | null {
  for (const [pattern, country] of EUROPEAN_COUNTRIES) {
    if (pattern.test(text)) return country;
  }
  return null;
}

// === QUICK GATE ===

export function hasAnyFundingSignal(title: string, text: string): boolean {
  return (
    TITLE_STRONG_TRIGGERS.some((p) => p.test(title)) ||
    MODERATE_TRIGGERS.some((p) => p.test(text)) ||
    WEAK_TRIGGERS.some((p) => p.test(text))
  );
}

// === REGEX EXTRACTOR ===

export function extractFundingRegex(title: string, content: string): FundingExtraction | null {
  const text = `${title} ${content}`.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  if (!hasAnyFundingSignal(title, text)) return null;

  // Extract structured data
  const companyName = extractCompanyName(title);
  const amountInfo = extractAmount(text);
  const stage = extractStage(text);
  const { investors, leadInvestor } = extractInvestors(text);
  const country = extractCountry(text);

  // Calculate USD amount
  let amountUsd: number | null = null;
  if (amountInfo) {
    const rate = CURRENCY_TO_USD[amountInfo.currency] || 1;
    amountUsd = amountInfo.amount * rate;
  }

  // Score confidence
  const { confidence, signals } = scoreArticle(title, text, {
    amount: amountInfo?.amount ?? null,
    stage,
    investors,
    leadInvestor,
    country,
  });

  // Threshold: need at least 0.35 confidence to be considered a funding article
  if (confidence < 0.35) return null;

  // Additional guard: without a strong title trigger, require higher bar
  const hasStrongTitle = TITLE_STRONG_TRIGGERS.some((p) => p.test(title));
  if (!hasStrongTitle && confidence < 0.45 && amountInfo === null) return null;

  // Filter out VC fund formation: company name contains VC-like terms
  if (/\b(?:venture\s+partners|capital|fund\b|a16z|andreessen|sequoia|benchmark|accel|greylock|kleiner)/i.test(companyName) && !/\bstartup\b/i.test(title)) {
    return null;
  }

  // Extract relevant excerpt
  const excerptMatch = text.match(/.{0,100}(?:raises?|secures?|funding|round|series).{0,100}/i);
  const rawExcerpt = excerptMatch ? excerptMatch[0].trim() : text.substring(0, 200);

  return {
    companyName,
    amount: amountInfo?.amount ?? null,
    currency: amountInfo?.currency ?? "USD",
    amountUsd,
    stage,
    investors,
    leadInvestor,
    country,
    confidence,
    rawExcerpt,
    signals,
  };
}

// === MAIN EXPORT (async, LLM with regex fallback) ===

export async function extractFunding(
  title: string,
  content: string
): Promise<FundingExtraction | null> {
  const text = `${title} ${content}`.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  // Quick gate: skip articles without any funding signals
  if (!hasAnyFundingSignal(title, text)) return null;

  // Try LLM extraction if API key is available
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const { extractFundingWithLLM } = await import("./llm-funding-extractor");
      const result = await extractFundingWithLLM(title, content);
      if (result) return result;
    } catch (error) {
      console.warn("LLM funding extraction failed, falling back to regex:", error);
    }
  }

  // Fallback: regex extractor
  return extractFundingRegex(title, content);
}
