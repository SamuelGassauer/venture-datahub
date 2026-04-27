import { normalizeCompany, normalizeInvestor } from "../graph-sync";

export { normalizeCompany, normalizeInvestor };

// Aggregator/research platforms that store many companies under the same root
// domain — matching on these creates false positives.
const AGGREGATOR_DOMAINS = new Set([
  "cbinsights.com",
  "crunchbase.com",
  "pitchbook.com",
  "dealroom.co",
  "tracxn.com",
  "owler.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "wikipedia.org",
  "bloomberg.com",
  "techcrunch.com",
  "sifted.eu",
  "eu-startups.com",
  "github.com",
  "medium.com",
  "notion.site",
  "gitlab.com",
]);

// LinkedIn slugs that are aggregators or unrelated entities, not the company
// being described.
const AGGREGATOR_LINKEDIN_SLUGS = new Set([
  "cb-insights",
  "crunchbase",
  "pitchbook-data",
  "dealroom-co",
  "tracxn",
  "techcrunch",
  "sifted-eu",
  "eu-startups",
]);

export function normalizeDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim().toLowerCase();
  if (!trimmed) return null;
  const stripped = trimmed
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split("?")[0]
    .split("#")[0]
    .trim();
  if (!stripped) return null;
  if (AGGREGATOR_DOMAINS.has(stripped)) return null;
  return stripped;
}

export function normalizeLinkedin(url: string | null | undefined): string | null {
  if (!url) return null;
  const u = url.trim().toLowerCase();
  const m = u.match(/linkedin\.com\/(?:company|in|school)\/([^/?#]+)/);
  if (!m) return null;
  const slug = m[1];
  if (AGGREGATOR_LINKEDIN_SLUGS.has(slug)) return null;
  return slug;
}

export function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const prev = new Array<number>(a.length + 1);
  const curr = new Array<number>(a.length + 1);
  for (let j = 0; j <= a.length; j++) prev[j] = j;

  for (let i = 1; i <= b.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= a.length; j++) {
      const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= a.length; j++) prev[j] = curr[j];
  }
  return prev[a.length];
}

export function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

export function tokenJaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersect = 0;
  for (const t of setA) if (setB.has(t)) intersect++;
  const union = setA.size + setB.size - intersect;
  return union > 0 ? intersect / union : 0;
}

export function blockKey(normalized: string, country?: string | null): string {
  const prefix = normalized.slice(0, 3);
  return `${(country || "").toLowerCase()}|${prefix}`;
}

export function candidateKeys(left: string, right: string): { leftKey: string; rightKey: string } {
  return left <= right ? { leftKey: left, rightKey: right } : { leftKey: right, rightKey: left };
}
