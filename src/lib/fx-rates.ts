// ---------------------------------------------------------------------------
// Foreign exchange rates via frankfurter.app (ECB data, free, no API key)
// ---------------------------------------------------------------------------

const CACHE = new Map<string, { rate: number; fetchedAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — historical rates don't change

/**
 * Get the USD exchange rate for a given currency on a specific date.
 * Returns the rate such that: amountUsd = originalAmount * rate
 *
 * @param currency - ISO 4217 currency code (e.g. "EUR", "GBP", "CHF")
 * @param date - Date string in YYYY-MM-DD format (for historical rate)
 * @returns Exchange rate to USD
 */
export async function getUsdRate(currency: string, date: string): Promise<number> {
  const code = currency.toUpperCase();
  if (code === "USD") return 1;

  const cacheKey = `${code}:${date}`;
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.rate;
  }

  try {
    // frankfurter.app: get rate from source currency to USD on a specific date
    const res = await fetch(
      `https://api.frankfurter.app/${date}?from=${code}&to=USD`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!res.ok) {
      console.warn(`FX rate fetch failed for ${code} on ${date}: ${res.status}`);
      return getFallbackRate(code);
    }

    const data = await res.json();
    const rate = data.rates?.USD;

    if (typeof rate !== "number") {
      console.warn(`FX rate missing for ${code} on ${date}`, data);
      return getFallbackRate(code);
    }

    CACHE.set(cacheKey, { rate, fetchedAt: Date.now() });
    return rate;
  } catch (error) {
    console.warn(`FX rate error for ${code} on ${date}:`, error);
    return getFallbackRate(code);
  }
}

/**
 * Convert an amount from a given currency to USD using the rate on a specific date.
 */
export async function convertToUsd(
  amount: number,
  currency: string,
  date: string
): Promise<number> {
  const rate = await getUsdRate(currency, date);
  return Math.round(amount * rate);
}

// ---------------------------------------------------------------------------
// Fallback rates (only used when API is unreachable)
// ---------------------------------------------------------------------------

const FALLBACK_RATES: Record<string, number> = {
  EUR: 1.08,
  GBP: 1.27,
  CHF: 1.12,
  SEK: 0.096,
  NOK: 0.094,
  DKK: 0.145,
  PLN: 0.25,
  CZK: 0.043,
  HUF: 0.0027,
  RON: 0.22,
};

function getFallbackRate(currency: string): number {
  const rate = FALLBACK_RATES[currency.toUpperCase()];
  if (rate) {
    console.warn(`Using fallback FX rate for ${currency}: ${rate}`);
    return rate;
  }
  console.warn(`No fallback rate for ${currency}, defaulting to 1`);
  return 1;
}
