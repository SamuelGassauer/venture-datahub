// ---------------------------------------------------------------------------
// Fund Event (VC/PE Fund Closings) Extractor
// ---------------------------------------------------------------------------
// Detects articles about VC/PE fund closings. Real examples from feeds:
//   "French VC Elaia reaches €120 million first close for new multi-stage B2B technology fund"
//   "Primary Ventures raises healthy $625M Fund V to focus on seed investing"
//   "Mundi Ventures closes on €750M for Kembara, its largest deep tech and climate fund"
//   "SNAK Venture Partners raises $50M fund to back vertical marketplaces"
//   "Benchmark raises $225M in special funds to double down on Cerebras"
//   "Antler launches always-on Nordic residency and $100M+ fund"
//   "Elaia's Digital Venture Fund V reaches €120M at first close"
//
// Strategy: detect if the SUBJECT is a VC/PE firm (not a startup), then extract.
// This runs BEFORE the funding-round extractor in the sync engine.
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
};

const CURRENCY_TO_USD: Record<string, number> = {
  USD: 1, $: 1,
  EUR: 1.08, "€": 1.08,
  GBP: 1.27, "£": 1.27,
};

// === TYPES ===

export type FundEventExtraction = {
  fundName: string;
  firmName: string;
  amount: number | null;
  currency: string;
  amountUsd: number | null;
  fundType: string | null;
  vintage: string | null;
  country: string | null;
  confidence: number;
  rawExcerpt: string;
  signals: string[];
};

// === VC/PE FIRM NAME DETECTION ===
// The key insight: if the entity raising money has a VC/PE-like name, it's a fund event.

// Words that strongly indicate a VC/PE firm (as opposed to a startup)
const FIRM_SUFFIXES = /\b(?:ventures?|capital|partners?|investment(?:s)?|advisors?|management|associates?|equity|holdings?)\b/i;

// Known VC/PE firms that might not match the suffix pattern
const KNOWN_FIRMS = [
  /\bantler\b/i,
  /\bbenchmark\b/i,
  /\bsequoia\b/i,
  /\ba16z\b|\bandreessen/i,
  /\baccel\b/i,
  /\bgreylock\b/i,
  /\bkleiner/i,
  /\blightspeed\b/i,
  /\bindex\s+ventures\b/i,
  /\bbessemer\b/i,
  /\bgeneral\s+catalyst\b/i,
  /\bfounders?\s+fund\b/i,
  /\bnorthzone\b/i,
  /\batomico\b/i,
  /\bbalderston\b/i,
  /\bbalderton\b/i,
  /\bearlybird\b/i,
  /\bhv\s+capital\b/i,
  /\bproject\s+a\b/i,
  /\bcherry\s+ventures\b/i,
  /\blakestar\b/i,
  /\bcreandum\b/i,
  /\btigerglobal\b|\btiger\s+global\b/i,
  /\bsoftbank\b/i,
  /\binsight\s+partners\b/i,
  /\bgeneral\s+atlantic\b/i,
  /\bwarburg\s+pincus\b/i,
  /\bthoma\s+bravo\b/i,
  /\bvista\s+equity\b/i,
  /\bpermira\b/i,
  /\bapax\b/i,
  /\bcvc\s+capital\b/i,
  /\beqt\b/i,
  /\bbain\s+capital\b/i,
  /\bblackstone\b/i,
  /\bkkr\b/i,
  /\bcarlyle\b/i,
  /\bapollo\b/i,
  /\belaia\b/i,
  /\bmundi\b/i,
  /\bbpifrance\b/i,
];

// === FUND SIGNAL PATTERNS ===

// Words/phrases that indicate this is about a fund (not a startup round)
const FUND_KEYWORDS = [
  /\bfund\s+(?:i{1,4}|iv|v|vi{0,3}|ix|x|xi{0,3}|[1-9]\d?)\b/i,  // Fund I-XIII, Fund 1-99
  /\bnew\s+fund\b/i,
  /\bdebut\s+fund\b/i,
  /\blatest\s+fund\b/i,
  /\binaugural\s+fund\b/i,
  /\bflagship\s+fund\b/i,
  /\b(?:first|second|third|final|initial)\s+close\b/i,
  /\bfund\s+close\b/i,
  /\bfund\s*(?:raising|raise)\b/i,
  /\bfund\s+(?:launch|formation)\b/i,
  /\bfund\s+to\s+(?:back|invest|deploy|target|support|focus)\b/i,
  /\b(?:vehicle|strategy)\b.*\braises?\b/i,
  /\braises?\b.*\b(?:vehicle|strategy)\b/i,
  /\bto\s+back\s+(?:\w+\s+){0,3}(?:startups?|companies|founders?)\b/i,
  /\bto\s+invest\s+in\b/i,
  /\bto\s+deploy\b/i,
  /\bdry\s+powder\b/i,
  /\blimited\s+partners?\b|\bLP\b/i,
  /\baum\b/i,
  /\bfund\s+(?:size|target)\b/i,
  /\boversubscribed\b/i,
  /\bhard\s+cap\b/i,
  /\b(?:anchor|cornerstone)\s+(?:investor|commitment)\b/i,
];

// Patterns that combine a money action with "fund" in any order
const FUND_MONEY_PATTERNS = [
  // "[Firm] raises/closes $X ... fund"
  /\b(?:raises?|closes?|closed|launched?|secures?|hits?|reached?|announces?)\s+[\$€£]?[\d,.]+\s*(?:m|mn|million|billion|bn|b|mio|k)\+?\b.*\bfund\b/i,
  // "$X fund" / "$X ... fund"
  /[\$€£][\d,.]+\s*(?:m|mn|million|billion|bn|b|mio|k)\+?\s+(?:\w+\s+){0,5}fund\b/i,
  // "fund ... $X" / "Fund V reaches €120M"
  /\bfund\b.*[\$€£][\d,.]+\s*(?:m|mn|million|billion|bn|b|mio|k)\b/i,
  // "raises $X to back/invest"
  /\b(?:raises?|closes?|secures?)\s+[\$€£]?[\d,.]+\s*(?:m|mn|million|billion|bn|b|mio|k)\+?\s+(?:to\s+)?(?:back|invest|deploy|target|focus|support)/i,
  // "closes on €750M for [name]"
  /\bcloses?\s+on\s+[\$€£]?[\d,.]+\s*(?:m|mn|million|billion|bn|b|mio|k)\b/i,
  // "reaches €120M at first close"
  /\breaches?\s+[\$€£]?[\d,.]+\s*(?:m|mn|million|billion|bn|b|mio|k).*\bclose\b/i,
  // "$X+ fund"
  /[\$€£][\d,.]+\s*(?:m|mn|million|billion|bn|b|mio|k)\+\s+fund\b/i,
  // "special funds"
  /\bspecial\s+funds?\b/i,
];

// Anti-patterns: startup funding rounds or unrelated content
const FUND_ANTI: { pattern: RegExp; penalty: number }[] = [
  // Startup round stages → this is a startup, not a fund
  { pattern: /\bseries\s+[a-e]\+?\s+(?:round|funding)\b/i, penalty: -0.40 },
  { pattern: /\bseed\s+round\b/i, penalty: -0.30 },
  { pattern: /\bpre[- ]?seed\b/i, penalty: -0.30 },
  // Listicles & roundups
  { pattern: /\b\d+\s+(?:trends?|tips?|ways?|startups?|companies|deals)\b/i, penalty: -0.25 },
  { pattern: /\btop\s+\d+\b/i, penalty: -0.20 },
  { pattern: /\bweek(?:ly|'s)?\s+(?:funding|recap|digest)\b/i, penalty: -0.30 },
  { pattern: /\bround[- ]?up\b/i, penalty: -0.30 },
  // Analysis/editorial
  { pattern: /\bmarket\s+(?:report|analysis|overview)\b/i, penalty: -0.20 },
  { pattern: /\bhow\s+to\b/i, penalty: -0.15 },
  { pattern: /\bopinion\b/i, penalty: -0.15 },
  // IPO/M&A
  { pattern: /\bipo\b/i, penalty: -0.30 },
  { pattern: /\bacquir(?:es?|ed|ing|ition)\b/i, penalty: -0.25 },
  // Conferences
  { pattern: /\bsummit\b.*\b(?:tickets?|join|register)\b/i, penalty: -0.25 },
  { pattern: /\bearly\s+bird\b/i, penalty: -0.35 },
  // Ticker/digest
  { pattern: /^#?\s*(?:startup)?ticker\b/i, penalty: -0.35 },
  // "could run the fund" — editorial about policy
  { pattern: /\bcould\s+run\b/i, penalty: -0.25 },
  { pattern: /\bactively\s+looking\b/i, penalty: -0.15 },
];

// === FUND TYPE PATTERNS ===

const FUND_TYPE_PATTERNS: [RegExp, string][] = [
  [/\bgrowth\s+equity\b/i, "Growth Equity"],
  [/\bgrowth\s+fund\b/i, "Growth"],
  [/\bventure\s+(?:capital|fund)\b|\bvc\s+fund\b|\bvc\b/i, "VC"],
  [/\bprivate\s+equity\b|\bpe\s+fund\b|\bbuyout\b/i, "PE"],
  [/\bdebt\s+fund\b|\bcredit\s+fund\b|\blending\b/i, "Debt"],
  [/\binfrastructure\b/i, "Infrastructure"],
  [/\breal\s+estate\b/i, "Real Estate"],
  [/\bimpact\s+fund\b|\bimpact\b/i, "Impact"],
  [/\bcrypto\b|\bweb3\b|\bblockchain\b|\bdigital\s+assets?\b/i, "Crypto"],
  [/\bclimate\b|\bcleantech\b|\bgreen\b/i, "Climate"],
  [/\bhealthcare\b|\blife\s+sciences?\b|\bbiotech\b/i, "Healthcare"],
  [/\bdeep\s+tech\b/i, "Deep Tech"],
  [/\bearly[- ]?stage\b/i, "Early-Stage VC"],
  [/\blate[- ]?stage\b/i, "Late-Stage"],
  [/\bseed\s+(?:fund|investing|investment)\b/i, "Seed"],
  [/\bmulti[- ]?stage\b/i, "Multi-Stage"],
  [/\bb2b\b/i, "B2B"],
  [/\bfund\s+of\s+funds\b|\bfof\b/i, "Fund of Funds"],
  [/\bsecondaries\b|\bsecondary\s+fund\b/i, "Secondaries"],
  [/\bspecial\s+(?:fund|purpose|situation)/i, "Special Situations"],
];

// === AMOUNT PATTERNS ===

const AMOUNT_PATTERNS = [
  /[\$]\s*([\d,.]+)\s*(billion|million|mn|m|bn|b|k)\b/i,
  /(?:EUR|€)\s*([\d,.]+)\s*(billion|million|mn|m|bn|b|k)?\b/i,
  /(?:GBP|£)\s*([\d,.]+)\s*(billion|million|mn|m|bn|b|k)?\b/i,
  /([\d,.]+)\s*(billion|million|mn|m|bn|b)\s*(?:dollars?|euros?|pounds?|USD|EUR|GBP)/i,
  /([\d,.]+)\s*(?:Mio\.?|Millionen?)\s*(?:EUR|Euro|USD|Dollar|GBP)/i,
];

// === EUROPEAN COUNTRIES ===

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
  [/\bnordic\b|\bscandinavian?\b/i, "Nordics"],
];

// US states/cities for non-European fund events
const US_PATTERNS: [RegExp, string][] = [
  [/\bnew\s+york\b|\bnyc\b|\bmanhattan\b/i, "US"],
  [/\bsan\s+francisco\b|\bsf\b|\bsilicon\s+valley\b|\bbay\s+area\b/i, "US"],
  [/\bboston\b|\baustin\b|\bchicago\b|\blos\s+angeles\b|\bseattle\b/i, "US"],
];

// === EXTRACTION HELPERS ===

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
    const amount = multiplier === 1 && num < 1000 ? num * 1_000_000 : num * multiplier;

    return { amount, currency };
  }
  return null;
}

function extractFundType(text: string): string | null {
  for (const [pattern, type] of FUND_TYPE_PATTERNS) {
    if (pattern.test(text)) return type;
  }
  return null;
}

function extractCountry(text: string): string | null {
  for (const [pattern, country] of EUROPEAN_COUNTRIES) {
    if (pattern.test(text)) return country;
  }
  for (const [pattern, country] of US_PATTERNS) {
    if (pattern.test(text)) return country;
  }
  return null;
}

function extractFundName(title: string, text: string): string {
  // "Fund VII", "Fund III", "Fund 2", "Fund V" etc.
  const romanMatch = text.match(/\bfund\s+(i{1,4}|iv|v|vi{0,3}|ix|x|xi{0,3}|[1-9]\d?)\b/i);
  if (romanMatch) return `Fund ${romanMatch[1].toUpperCase()}`;

  // Named fund: "Kembara" in "for Kembara, its largest..."
  const forNameMatch = title.match(/\bfor\s+([A-Z][a-zA-Z]+)(?:\s*,|\s+(?:its|the|a))/);
  if (forNameMatch) return forNameMatch[1];

  // "Digital Venture Fund V", "Growth Fund", etc.
  const namedFundMatch = text.match(/\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3}\s+Fund(?:\s+(?:I{1,4}|IV|V|VI{0,3}|IX|X|[1-9]\d?))?)\b/);
  if (namedFundMatch) return namedFundMatch[1];

  // "new fund", "debut fund", "latest fund"
  if (/\bnew\s+fund\b/i.test(text)) return "New Fund";
  if (/\bdebut\s+fund\b/i.test(text)) return "Debut Fund";
  if (/\bflagship\s+fund\b/i.test(text)) return "Flagship Fund";
  if (/\bspecial\s+funds?\b/i.test(text)) return "Special Fund";

  // Generic fallback
  if (/\bfund\b/i.test(text)) return "Fund";
  return "Fund";
}

function extractVintage(text: string): string | null {
  const year = new Date().getFullYear();
  const vintageMatch = text.match(/\b(20[1-3]\d)\b/);
  if (vintageMatch) {
    const y = parseInt(vintageMatch[1]);
    if (y >= 2020 && y <= year + 1) return vintageMatch[1];
  }
  return null;
}

// === FIRM NAME EXTRACTION ===

function extractFirmName(title: string, text: string): string {
  // Pattern 1: "[Adjective] VC/PE [Firm] raises/closes/launches..."
  // e.g. "French VC Elaia reaches €120 million..."
  // Note: only match "VC"/"PE" as prefix labels, NOT "venture"/"partners" which are part of firm names
  const vcFirmMatch = title.match(/\b(?:vc|pe)\s+(?:firm\s+)?([A-Z][a-zA-Z\-']+(?:\s+[A-Z][a-zA-Z\-']+){0,3})\s+(?:raises?|closes?|reaches?|launches?|announces?|secures?|hits?|unveils?)/i);
  if (vcFirmMatch) return vcFirmMatch[1].trim();

  // Pattern 2: "Firm's [Fund Name]" — possessive
  // e.g. "Elaia's Digital Venture Fund V reaches €120M"
  const possessiveMatch = title.match(/^([A-Z][a-zA-Z\-']+(?:\s+[A-Z][a-zA-Z\-']+){0,3})['']s\s/);
  if (possessiveMatch) return possessiveMatch[1].trim();

  // Pattern 3: "[Firm] raises/closes/launches/just raised..."
  const triggerWords = /\s+(?:closes?|closed|raises?|raised|launches?|launched|announces?|announced|unveils?|secures?|secured|hits?|reached?|just\s+raised)\s+/i;
  const match = title.match(triggerWords);
  if (match && match.index !== undefined && match.index > 0) {
    let name = title.substring(0, match.index).trim();
    // Remove leading descriptors: "French VC Elaia" → "Elaia"
    // But only strip "VC"/"PE" as standalone prefixes, not firm-name words like "Ventures"/"Partners"
    name = name.replace(/^.*?\b(?:vc|pe)\s+(?:firm\s+)?/i, "");
    name = name.replace(/^.*?-based\s+/i, "");
    name = name.replace(/^(?:the|a|an)\s+/i, "");
    name = name.replace(/^(?:european|german|french|british|london|us|american)\s+/i, "");
    // Take last segment after delimiter
    const parts = name.split(/[:\-–—|]/);
    name = parts[parts.length - 1].trim();
    if (name.length > 0 && name.length < 80) return name;
  }

  // Pattern 4: "... by [Firm]"
  const byMatch = title.match(/\bby\s+([A-Z][a-zA-Z\-']+(?:\s+[A-Z][a-zA-Z\-']+){0,4})/);
  if (byMatch) return byMatch[1];

  // Pattern 5: "... for [Firm]" (at end)
  const forMatch = title.match(/\bfor\s+([A-Z][a-zA-Z\-']+(?:\s+[A-Z][a-zA-Z\-']+){0,4})\s*$/);
  if (forMatch) return forMatch[1];

  // Fallback: first proper noun sequence
  const nounMatch = title.match(/^([A-Z][a-zA-Z\-']+(?:\s+[A-Z][a-zA-Z\-']+){0,3})/);
  if (nounMatch) return nounMatch[1];

  return title.split(/\s+/).slice(0, 3).join(" ");
}

// === DETECTION: IS THIS ABOUT A FUND? ===

/**
 * Extracts the SUBJECT of the title (entity before the action verb).
 * "Primary Ventures raises $625M" → "Primary Ventures"
 * "Balderton leads $6M round into Mozart AI" → "Balderton"
 */
function extractSubject(title: string): string {
  // Handle possessive: "Elaia's Digital Venture Fund V reaches €120M"
  const possessive = title.match(/^([A-Z][a-zA-Z\-'']+(?:\s+[A-Z][a-zA-Z\-'']+){0,3})['']s\s/);
  if (possessive) return possessive[1];

  // Standard: text before trigger verb (includes past tense: raised, closed, launched, etc.)
  const triggerMatch = title.match(/^(.+?)\s+(?:raises?|raised|closes?|closed|launches?|launched|announces?|announced|secures?|secured|reaches?|reached|hits?|unveils?|leads?|led|collects?|just\s+raised)\s/i);
  if (triggerMatch) return triggerMatch[1];

  return title;
}

/**
 * Checks if the SUBJECT of the title (the entity doing the action) is a VC/PE firm.
 * IMPORTANT: Only checks the subject, not investors mentioned later in the title.
 * "Balderton leads $6M into Mozart AI" → Balderton is subject, but this is a startup round
 * "Primary Ventures raises $625M Fund V" → Primary Ventures is subject AND it's a fund event
 */
function subjectIsFirm(title: string): boolean {
  const subject = extractSubject(title);

  // Check if subject contains VC/PE firm suffix words
  if (FIRM_SUFFIXES.test(subject)) return true;

  // Check if subject is a known firm
  if (KNOWN_FIRMS.some((p) => p.test(subject))) return true;

  // "French VC [Name]" pattern — only if VC/PE label is before the subject
  if (/\b(?:vc|pe|venture\s+capital|private\s+equity)\s+(?:firm\s+)?[A-Z]/i.test(subject)) return true;

  return false;
}

/**
 * Checks if a known firm appears ONLY as an investor (not as the subject).
 * "Balderton leads $6M round into Mozart AI" → true (Balderton invests in Mozart)
 * "ElevenLabs raises $500M from Sequoia" → true (Sequoia invests in ElevenLabs)
 */
function firmIsInvestorNotSubject(title: string): boolean {
  // "[Firm] leads $X round for/into [Startup]"
  if (/\bleads?\s+[\$€£]?[\d,.]+.*\b(?:round|funding|investment)\s+(?:for|into|in)\b/i.test(title)) return true;
  // "[Startup] raises $X from [Firm]"
  if (/\braises?\s+.*\bfrom\s+/i.test(title) && !subjectIsFirm(title)) return true;
  // "[Firm] backs [Startup]" — but not "to back" which is a fund goal
  if (/\b(?:backs?)\s+(?!.*\bfund\b)/i.test(title) && !/\bto\s+back\b/i.test(title)) return true;
  // "[Firm] invests in [Startup]"
  if (/\binvests?\s+in\s+/i.test(title)) return true;
  return false;
}

// === QUICK GATE: should we even try extracting? ===

export function isFundEvent(title: string, content: string): boolean {
  const text = `${title} ${content}`.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  // Quick reject: newsletter digests, listicles, editorials
  if (/^[^\w]/.test(title)) return false;  // starts with emoji or special char
  if (/\bwhy\s+/i.test(title) && /\?$/.test(title.trim())) return false;  // "Why X?" questions
  if (/\bhow\s+this\b/i.test(title)) return false;  // "How this fintech..."
  if (/\bcan\s+\w+'s\b/i.test(title)) return false;  // "Can Bpifrance's..."

  // If a known firm is mentioned but is clearly an INVESTOR (not the subject raising a fund),
  // this is a startup round, not a fund event
  if (firmIsInvestorNotSubject(title)) return false;

  // Path 1: Subject is a VC/PE firm + title mentions "fund" keyword
  if (subjectIsFirm(title) && /\bfund\b/i.test(title)) return true;

  // Path 2: Subject is a VC/PE firm + "to back/invest" pattern
  if (subjectIsFirm(title) && /\bto\s+(?:back|invest|deploy|support|fund|target|focus)\b/i.test(title)) return true;

  // Path 3: "first close" / "final close" in title (always a fund event)
  if (/\b(?:first|second|third|final|initial)\s+close\b/i.test(title)) return true;

  // Path 4: Title has "fund" + money action + NO startup round indicators
  if (/\bfund\b/i.test(title) && /[\$€£][\d,.]+\s*(?:m|mn|million|billion|bn|b|mio|k)/i.test(title)) {
    const hasStartupSignal = /\bseries\s+[a-e]/i.test(title) || /\bseed\s+round/i.test(title) || /\bpre[- ]?seed/i.test(title);
    if (!hasStartupSignal) return true;
  }

  // Path 5: Title contains FUND_MONEY_PATTERNS (fund + money in close proximity)
  if (FUND_MONEY_PATTERNS.some((p) => p.test(title))) {
    // But only if the subject is a firm OR "fund" appears explicitly
    if (subjectIsFirm(title) || /\bfund\b/i.test(title)) return true;
  }

  // Path 6: Subject is a known firm + "closes" pattern (without "round")
  if (subjectIsFirm(title) && /\bcloses?\s+(?:on\s+)?[\$€£]?[\d,.]+/i.test(title)) {
    if (!/\bround\b/i.test(title) && !/\bseries\b/i.test(title)) return true;
  }

  // Path 7: Subject is a known firm + large amount raised (> $100M) without startup signals
  // e.g. "A16z just raised $1.7B for AI infrastructure"
  if (subjectIsFirm(title)) {
    const amountMatch = title.match(/[\$€£]([\d,.]+)\s*(?:b|bn|billion)/i);
    if (amountMatch) {
      const hasStartupSignal = /\bseries\b/i.test(title) || /\bseed\b/i.test(title) ||
                               /\bstartup\b/i.test(title) || /\bvaluation\b/i.test(title);
      if (!hasStartupSignal) return true;
    }
  }

  // Path 8: "[Name] closes €X to back [target]" — fund-like closing pattern
  if (/\bcloses?\s+[\$€£]?[\d,.]+\s*(?:m|mn|million|billion|bn|b|mio|k)\s+to\s+(?:back|invest|deploy|support|fund|target)\b/i.test(title)) {
    return true;
  }

  return false;
}

// === SCORING ===

type Signal = { name: string; weight: number };

function scoreFundEvent(title: string, text: string, extraction: {
  firmName: string;
  amount: number | null;
  fundType: string | null;
  fundName: string;
  country: string | null;
}): { confidence: number; signals: Signal[] } {
  const signals: Signal[] = [];

  // --- Positive signals ---

  // Subject is a VC/PE firm (strongest signal)
  if (subjectIsFirm(title)) {
    signals.push({ name: "subject_is_firm", weight: 0.30 });
  }

  // Known firm name as subject
  const subject = extractSubject(title);
  if (KNOWN_FIRMS.some((p) => p.test(subject))) {
    signals.push({ name: "known_firm", weight: 0.10 });
  }

  // Firm suffix in subject
  if (FIRM_SUFFIXES.test(subject)) {
    signals.push({ name: "firm_suffix_in_title", weight: 0.08 });
  }

  // Fund money pattern in title
  if (FUND_MONEY_PATTERNS.some((p) => p.test(title))) {
    signals.push({ name: "fund_money_pattern", weight: 0.20 });
  }

  // Fund keyword in title
  if (FUND_KEYWORDS.some((p) => p.test(title))) {
    signals.push({ name: "fund_keyword_title", weight: 0.15 });
  }

  // Fund keywords in body
  const bodyKeywords = FUND_KEYWORDS.filter((p) => p.test(text)).length;
  if (bodyKeywords >= 2) {
    signals.push({ name: "fund_keywords_body_many", weight: 0.10 });
  } else if (bodyKeywords >= 1) {
    signals.push({ name: "fund_keyword_body", weight: 0.05 });
  }

  // Amount found
  if (extraction.amount !== null) {
    signals.push({ name: "has_amount", weight: 0.08 });
    // Fund amounts are typically $10M+
    if (extraction.amount >= 10_000_000) {
      signals.push({ name: "large_amount", weight: 0.05 });
    }
  }

  // Fund type detected
  if (extraction.fundType) {
    signals.push({ name: "has_fund_type", weight: 0.05 });
  }

  // Fund name is specific (not just "Fund")
  if (extraction.fundName !== "Fund") {
    signals.push({ name: "specific_fund_name", weight: 0.05 });
  }

  // "first close" / "final close" (very strong signal)
  if (/\b(?:first|final|initial)\s+close\b/i.test(title)) {
    signals.push({ name: "close_in_title", weight: 0.20 });
  }

  // "to back startups/companies"
  if (/\bto\s+(?:back|invest\s+in|support|fund)\s/i.test(title)) {
    signals.push({ name: "to_back_pattern", weight: 0.10 });
  }

  // Country mentioned
  if (extraction.country) {
    signals.push({ name: "has_country", weight: 0.02 });
  }

  // --- Negative signals ---
  const combinedText = `${title} ${text.substring(0, 500)}`;
  for (const anti of FUND_ANTI) {
    if (anti.pattern.test(title)) {
      signals.push({ name: `anti:${anti.pattern.source.substring(0, 25)}`, weight: anti.penalty });
    } else if (anti.pattern.test(combinedText)) {
      signals.push({ name: `anti_body:${anti.pattern.source.substring(0, 25)}`, weight: anti.penalty * 0.4 });
    }
  }

  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
  const confidence = Math.max(0, Math.min(1, totalWeight));

  return {
    confidence: Math.round(confidence * 100) / 100,
    signals,
  };
}

// === MAIN EXPORT ===

export function extractFundEvent(
  title: string,
  content: string
): FundEventExtraction | null {
  const text = `${title} ${content}`.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  // Quick gate
  if (!isFundEvent(title, content)) return null;

  const firmName = extractFirmName(title, text);
  const fundName = extractFundName(title, text);
  const amountInfo = extractAmount(text);
  const fundType = extractFundType(text);
  const vintage = extractVintage(text);
  const country = extractCountry(text);

  let amountUsd: number | null = null;
  if (amountInfo) {
    const rate = CURRENCY_TO_USD[amountInfo.currency] || 1;
    amountUsd = amountInfo.amount * rate;
  }

  const { confidence, signals } = scoreFundEvent(title, text, {
    firmName,
    amount: amountInfo?.amount ?? null,
    fundType,
    fundName,
    country,
  });

  // Lower threshold — we'd rather capture and let user filter
  if (confidence < 0.30) return null;

  // Extract relevant excerpt
  const excerptMatch = text.match(/.{0,120}(?:fund|closes?|raises?|vehicle|launch|close).{0,120}/i);
  const rawExcerpt = excerptMatch ? excerptMatch[0].trim() : text.substring(0, 250);

  return {
    fundName,
    firmName,
    amount: amountInfo?.amount ?? null,
    currency: amountInfo?.currency ?? "USD",
    amountUsd,
    fundType,
    vintage,
    country,
    confidence,
    rawExcerpt,
    signals: signals.map((s) => `${s.name}(${s.weight > 0 ? "+" : ""}${s.weight.toFixed(2)})`),
  };
}
