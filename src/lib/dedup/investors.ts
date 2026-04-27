import driver from "../neo4j";
import {
  tokenize,
  levenshteinSimilarity,
  tokenJaccard,
  blockKey,
  candidateKeys,
} from "./normalize";
import type { DedupPair } from "./types";
import { TIER2_THRESHOLD } from "./types";

type InvestorNode = {
  uuid: string;
  normalizedName: string;
  name: string;
};

async function loadInvestors(): Promise<InvestorNode[]> {
  const session = driver().session();
  try {
    const result = await session.run(
      `MATCH (i:InvestorOrg)
       RETURN i.uuid AS uuid,
              i.normalizedName AS normalizedName,
              i.name AS name`
    );
    return result.records.map((r) => ({
      uuid: r.get("uuid"),
      normalizedName: r.get("normalizedName") || "",
      name: r.get("name") || "",
    }));
  } finally {
    await session.close();
  }
}

function snapshot(i: InvestorNode): Record<string, unknown> {
  return { uuid: i.uuid, name: i.name, normalizedName: i.normalizedName };
}

export async function detectInvestorDuplicates(): Promise<{ pairs: DedupPair[]; scanned: number }> {
  const investors = await loadInvestors();
  const pairs = new Map<string, DedupPair>();

  function emit(
    a: InvestorNode,
    b: InvestorNode,
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
        entityType: "investor",
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

  // Tier 2: blocked fuzzy match (Tier 1 not applicable — InvestorOrg has no domain/linkedin in graph)
  const blocks = new Map<string, InvestorNode[]>();
  for (const inv of investors) {
    if (inv.normalizedName.length < 2) continue;
    const k = blockKey(inv.normalizedName, null);
    const list = blocks.get(k) ?? [];
    list.push(inv);
    blocks.set(k, list);
  }

  for (const list of blocks.values()) {
    if (list.length < 2) continue;
    if (list.length > 300) continue; // skip pathological blocks
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];

        const lev = levenshteinSimilarity(a.normalizedName, b.normalizedName);
        const tokA = tokenize(a.name);
        const tokB = tokenize(b.name);
        const jacc = tokenJaccard(tokA, tokB);
        const score = Math.max(lev, jacc);

        if (score >= TIER2_THRESHOLD) {
          emit(a, b, 2, score, {
            match: "fuzzy_name",
            levenshtein: Number(lev.toFixed(3)),
            jaccard: Number(jacc.toFixed(3)),
          });
        }
      }
    }
  }

  return { pairs: Array.from(pairs.values()), scanned: investors.length };
}
