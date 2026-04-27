import driver from "../neo4j";
import {
  normalizeDomain,
  normalizeLinkedin,
  tokenize,
  levenshteinSimilarity,
  tokenJaccard,
  blockKey,
  candidateKeys,
} from "./normalize";
import type { DedupPair } from "./types";
import { TIER2_THRESHOLD } from "./types";

type CompanyNode = {
  uuid: string;
  normalizedName: string;
  name: string;
  country: string | null;
  website: string | null;
  linkedinUrl: string | null;
};

async function loadCompanies(): Promise<CompanyNode[]> {
  const session = driver().session();
  try {
    const result = await session.run(
      `MATCH (c:Company)
       RETURN c.uuid AS uuid,
              c.normalizedName AS normalizedName,
              c.name AS name,
              c.country AS country,
              c.website AS website,
              c.linkedinUrl AS linkedinUrl`
    );
    return result.records.map((r) => ({
      uuid: r.get("uuid"),
      normalizedName: r.get("normalizedName") || "",
      name: r.get("name") || "",
      country: r.get("country") || null,
      website: r.get("website") || null,
      linkedinUrl: r.get("linkedinUrl") || null,
    }));
  } finally {
    await session.close();
  }
}

function snapshot(c: CompanyNode): Record<string, unknown> {
  return {
    uuid: c.uuid,
    name: c.name,
    normalizedName: c.normalizedName,
    country: c.country,
    website: c.website,
    linkedinUrl: c.linkedinUrl,
  };
}

export async function detectCompanyDuplicates(): Promise<{ pairs: DedupPair[]; scanned: number }> {
  const companies = await loadCompanies();
  const pairs = new Map<string, DedupPair>();

  function emit(
    a: CompanyNode,
    b: CompanyNode,
    tier: 1 | 2 | 3,
    score: number,
    reasons: Record<string, unknown>,
  ) {
    if (a.uuid === b.uuid) return;
    const { leftKey, rightKey } = candidateKeys(a.uuid, b.uuid);
    const key = `${leftKey}::${rightKey}`;
    const left = leftKey === a.uuid ? a : b;
    const right = leftKey === a.uuid ? b : a;
    const existing = pairs.get(key);
    if (!existing || tier < existing.tier || (tier === existing.tier && score > existing.score)) {
      pairs.set(key, {
        entityType: "company",
        leftKey,
        rightKey,
        tier,
        score,
        reasons,
        leftSnapshot: snapshot(left),
        rightSnapshot: snapshot(right),
      });
    }
  }

  // Tier 1: domain match
  const byDomain = new Map<string, CompanyNode[]>();
  for (const c of companies) {
    const dom = normalizeDomain(c.website);
    if (!dom) continue;
    const list = byDomain.get(dom) ?? [];
    list.push(c);
    byDomain.set(dom, list);
  }
  for (const [domain, list] of byDomain) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        emit(list[i], list[j], 1, 1.0, { match: "domain", domain });
      }
    }
  }

  // Tier 1: linkedin match
  const byLinkedin = new Map<string, CompanyNode[]>();
  for (const c of companies) {
    const li = normalizeLinkedin(c.linkedinUrl);
    if (!li) continue;
    const list = byLinkedin.get(li) ?? [];
    list.push(c);
    byLinkedin.set(li, list);
  }
  for (const [slug, list] of byLinkedin) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        emit(list[i], list[j], 1, 1.0, { match: "linkedin", slug });
      }
    }
  }

  // Tier 2: blocked fuzzy match
  const blocks = new Map<string, CompanyNode[]>();
  for (const c of companies) {
    if (c.normalizedName.length < 3) continue;
    const k = blockKey(c.normalizedName, c.country);
    const list = blocks.get(k) ?? [];
    list.push(c);
    blocks.set(k, list);
    // Cross-country block: in case country missing on one side
    const k2 = blockKey(c.normalizedName, null);
    if (k2 !== k) {
      const list2 = blocks.get(k2) ?? [];
      list2.push(c);
      blocks.set(k2, list2);
    }
  }

  for (const list of blocks.values()) {
    if (list.length < 2) continue;
    if (list.length > 200) continue; // skip pathological blocks
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.uuid === b.uuid) continue;

        const lev = levenshteinSimilarity(a.normalizedName, b.normalizedName);
        const tokA = tokenize(a.name);
        const tokB = tokenize(b.name);
        const jacc = tokenJaccard(tokA, tokB);
        const score = Math.max(lev, jacc);

        if (score >= TIER2_THRESHOLD) {
          const sameCountry = !!(a.country && b.country && a.country === b.country);
          emit(a, b, 2, score, {
            match: "fuzzy_name",
            levenshtein: Number(lev.toFixed(3)),
            jaccard: Number(jacc.toFixed(3)),
            sameCountry,
          });
        }
      }
    }
  }

  return { pairs: Array.from(pairs.values()), scanned: companies.length };
}
