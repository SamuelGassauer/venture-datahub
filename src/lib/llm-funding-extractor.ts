import Anthropic from "@anthropic-ai/sdk";
import type { FundingExtraction } from "./funding-extractor";

// Approximate rates for initial LLM extraction. Real FX rates are applied
// at ingest time via fx-rates.ts (frankfurter.app ECB data).
const CURRENCY_TO_USD: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  CHF: 1.12,
  SEK: 0.096,
  NOK: 0.094,
  DKK: 0.145,
  PLN: 0.25,
};

const SYSTEM_PROMPT = `You are a funding round extraction engine. Given one or more news articles about the same funding round, extract structured funding data by cross-referencing all sources.

Rules:
- Only extract SPECIFIC startup/company funding announcements (Seed, Series A-E, Growth, Bridge, etc.)
- Do NOT extract: funding roundups/listicles, market analysis, IPOs, acquisitions/mergers, VC fund formations, government grants, conference announcements
- If multiple sources report on the same round, combine information: one source may name investors another missed, or provide a more precise amount
- If sources conflict, prefer the most specific/detailed source and reflect uncertainty in the confidence score
- For investors, extract individual investor names, not descriptions like "existing investors"
- For country, use the country name (e.g. "Germany", "France", "UK")
- Confidence should reflect how certain you are this is a specific funding announcement (0.0-1.0). Multiple corroborating sources should increase confidence.
- Amount should be a raw number (e.g. 10000000 for $10M)

Also extract any available company metadata from the article(s).

Respond with ONLY a JSON object, no markdown, no explanation:
{
  "isFundingArticle": boolean,
  "companyName": string | null,
  "amount": number | null,
  "currency": "USD" | "EUR" | "GBP" | other,
  "stage": "Pre-Seed" | "Seed" | "Series A" | "Series B" | "Series C" | "Series D" | "Series E+" | "Bridge" | "Growth" | "Debt" | "Grant" | null,
  "investors": string[],
  "leadInvestor": string | null,
  "country": string | null,
  "confidence": number,
  "companyMeta": {
    "description": string | null,
    "website": string | null,
    "foundedYear": number | null,
    "employeeRange": "1-10" | "11-50" | "51-200" | "201-500" | "501-1000" | "1000+" | null,
    "linkedinUrl": string | null
  }
}`;

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

type ArticleSource = {
  title: string;
  content: string;
};

/** Pre-extracted data from regex that the LLM should validate and enhance */
export type ExistingExtraction = {
  companyName: string;
  amount: number | null;
  currency: string;
  amountUsd: number | null;
  stage: string | null;
  investors: string[];
  leadInvestor: string | null;
  country: string | null;
  confidence: number;
};

function parseLLMResponse(text: string | null): FundingExtraction | null {
  if (!text) return null;

  // Strip markdown code fences if present (e.g. ```json ... ```)
  text = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

  const parsed = JSON.parse(text);

  if (!parsed.isFundingArticle || !parsed.companyName) return null;

  const currency = parsed.currency || "USD";
  const amount: number | null =
    typeof parsed.amount === "number" ? parsed.amount : null;

  let amountUsd: number | null = null;
  if (amount !== null) {
    const rate = CURRENCY_TO_USD[currency] || 1;
    amountUsd = amount * rate;
  }

  const meta = parsed.companyMeta;

  return {
    companyName: parsed.companyName,
    amount,
    currency,
    amountUsd,
    stage: parsed.stage || null,
    investors: Array.isArray(parsed.investors) ? parsed.investors : [],
    leadInvestor: parsed.leadInvestor || null,
    country: parsed.country || null,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    rawExcerpt: parsed.companyName,
    signals: ["llm_extraction"],
    companyMeta: meta
      ? {
          description: meta.description || null,
          website: meta.website || null,
          foundedYear: typeof meta.foundedYear === "number" ? meta.foundedYear : null,
          employeeRange: meta.employeeRange || null,
          linkedinUrl: meta.linkedinUrl || null,
        }
      : undefined,
  };
}

export async function extractFundingWithLLM(
  title: string,
  content: string
): Promise<FundingExtraction | null> {
  return extractFundingFromSources([{ title, content }]);
}

export async function extractFundingFromSources(
  sources: ArticleSource[],
  existingData?: ExistingExtraction[],
): Promise<FundingExtraction | null> {
  const anthropic = getClient();

  // Build user message with all sources
  let userContent: string;
  if (sources.length === 1) {
    const s = sources[0];
    const truncated = (s.content || s.title).slice(0, 8000);
    userContent = `Title: ${s.title}\n\nContent: ${truncated}`;
  } else {
    // Budget per source scales down with more articles, keeping total under ~12000 chars
    const budgetPerSource = Math.floor(12000 / sources.length);
    const parts = sources.map((s, i) => {
      const truncated = (s.content || s.title).slice(0, budgetPerSource);
      return `--- Source ${i + 1} ---\nTitle: ${s.title}\n\nContent: ${truncated}`;
    });
    userContent = `${sources.length} news articles report on the same funding round. Cross-reference all sources to extract the most complete and accurate data.\n\n${parts.join("\n\n")}`;
  }

  // Append pre-extracted regex data as reference for the LLM
  if (existingData?.length) {
    const merged = mergeExistingExtractions(existingData);
    const hint = [
      "\n\n--- Pre-extracted data (from regex, may be incomplete — validate and enhance) ---",
      `Company: ${merged.companyName}`,
      merged.amount ? `Amount: ${merged.amount} ${merged.currency}` : null,
      merged.stage ? `Stage: ${merged.stage}` : null,
      merged.investors.length ? `Investors: ${merged.investors.join(", ")}` : null,
      merged.leadInvestor ? `Lead investor: ${merged.leadInvestor}` : null,
      merged.country ? `Country: ${merged.country}` : null,
    ].filter(Boolean).join("\n");
    userContent += hint;
  }

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : null;

  let result = parseLLMResponse(text);

  // Merge LLM result with existing regex data — fill gaps, union investors
  if (result && existingData?.length) {
    const merged = mergeExistingExtractions(existingData);
    result = mergeLlmWithRegex(result, merged);
  } else if (!result && existingData?.length) {
    // LLM didn't identify a round but regex did — use regex as fallback
    const merged = mergeExistingExtractions(existingData);
    if (merged.companyName && merged.confidence >= 0.35) {
      result = {
        companyName: merged.companyName,
        amount: merged.amount,
        currency: merged.currency,
        amountUsd: merged.amountUsd,
        stage: merged.stage,
        investors: merged.investors,
        leadInvestor: merged.leadInvestor,
        country: merged.country,
        confidence: merged.confidence,
        rawExcerpt: sources[0].title,
        signals: ["regex_fallback"],
      };
    }
  }

  if (result) {
    result.rawExcerpt = sources[0].title;
    if (sources.length > 1) {
      result.signals = [...(result.signals || []), "llm_extraction", `multi_source_${sources.length}`];
    }
  }
  return result;
}

/** Merge multiple regex extractions from different articles about the same round */
function mergeExistingExtractions(extractions: ExistingExtraction[]): ExistingExtraction {
  // Pick the one with highest confidence as base
  const sorted = [...extractions].sort((a, b) => b.confidence - a.confidence);
  const base = { ...sorted[0] };

  // Union all investors across all extractions
  const allInvestors = new Set<string>();
  let bestLead: string | null = null;

  for (const e of extractions) {
    for (const inv of e.investors) allInvestors.add(inv);
    if (e.leadInvestor && !bestLead) bestLead = e.leadInvestor;
    // Fill gaps from other extractions
    if (!base.stage && e.stage) base.stage = e.stage;
    if (!base.country && e.country) base.country = e.country;
    if (!base.amount && e.amount) {
      base.amount = e.amount;
      base.currency = e.currency;
      base.amountUsd = e.amountUsd;
    }
  }

  base.investors = [...allInvestors];
  base.leadInvestor = bestLead ?? base.leadInvestor;
  return base;
}

/** Merge LLM output with regex data: LLM wins on most fields, but investors are unioned */
function mergeLlmWithRegex(llm: FundingExtraction, regex: ExistingExtraction): FundingExtraction {
  // Union investors: LLM + regex, deduplicated by normalized name
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const investorMap = new Map<string, string>();
  for (const inv of [...regex.investors, ...llm.investors]) {
    const key = normalize(inv);
    if (!investorMap.has(key)) investorMap.set(key, inv);
  }
  const mergedInvestors = [...investorMap.values()];

  return {
    ...llm,
    // LLM wins for most fields, but fill gaps from regex
    companyName: llm.companyName || regex.companyName,
    amount: llm.amount ?? regex.amount,
    currency: llm.currency || regex.currency,
    amountUsd: llm.amountUsd ?? regex.amountUsd,
    stage: llm.stage || regex.stage,
    investors: mergedInvestors,
    leadInvestor: llm.leadInvestor || regex.leadInvestor,
    country: llm.country || regex.country,
    signals: [...(llm.signals || []), "merged_with_regex"],
  };
}
