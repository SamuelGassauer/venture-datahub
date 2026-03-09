/**
 * Backfill amount (original) and fxRate on Neo4j FundingRound nodes.
 * Reads from PostgreSQL (Prisma) where amount + currency exist,
 * calculates fxRate, and patches Neo4j.
 *
 * Usage: npx tsx scripts/backfill-neo4j-fx.ts [--dry-run]
 */

import { PrismaClient } from "@prisma/client";
import neo4j from "neo4j-driver";

const DRY_RUN = process.argv.includes("--dry-run");

const fxCache = new Map<string, number>();

async function getUsdRate(currency: string, date: string): Promise<number> {
  const code = currency.toUpperCase();
  if (code === "USD") return 1;
  const key = `${code}:${date}`;
  if (fxCache.has(key)) return fxCache.get(key)!;
  try {
    const res = await fetch(
      `https://api.frankfurter.app/${date}?from=${code}&to=USD`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const rate = data.rates?.USD;
    if (typeof rate !== "number") throw new Error("No rate");
    fxCache.set(key, rate);
    return rate;
  } catch {
    const fallbacks: Record<string, number> = {
      EUR: 1.08, GBP: 1.27, CHF: 1.12, AUD: 0.65, INR: 0.012,
    };
    return fallbacks[code] ?? 1;
  }
}

async function main() {
  console.log(`\n🔄 Backfill Neo4j amount + fxRate ${DRY_RUN ? "(DRY RUN)" : ""}\n`);

  const prisma = new PrismaClient();
  const neoDriver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic("neo4j", process.env.NEO4J_PASSWORD!)
  );

  try {
    // ALL rounds with amount (including USD — they need fxRate=1 and amount set)
    const rounds = await prisma.fundingRound.findMany({
      where: { amount: { not: null } },
      include: { article: { select: { publishedAt: true } } },
    });

    console.log(`Found ${rounds.length} rounds with original amount\n`);

    // Pre-fetch FX rates
    const rateKeys = new Set<string>();
    for (const r of rounds) {
      if (r.currency === "USD") continue;
      const date = r.article.publishedAt?.toISOString().substring(0, 10)
        ?? r.createdAt.toISOString().substring(0, 10);
      rateKeys.add(`${r.currency}:${date}`);
    }

    console.log(`Fetching ${rateKeys.size} FX rates...`);
    for (const key of rateKeys) {
      const [currency, date] = key.split(":");
      await getUsdRate(currency, date);
      await new Promise((r) => setTimeout(r, 80));
    }

    let updated = 0;
    let errors = 0;

    for (const round of rounds) {
      const date = round.article.publishedAt?.toISOString().substring(0, 10)
        ?? round.createdAt.toISOString().substring(0, 10);

      try {
        const rate = round.currency === "USD" ? 1 : await getUsdRate(round.currency, date);

        if (!DRY_RUN) {
          const session = neoDriver.session();
          try {
            const res = await session.run(
              `MATCH (c:Company)-[:RAISED]->(fr:FundingRound)
               WHERE c.name = $companyName AND fr.currency = $currency
               SET fr.amount = $amount, fr.fxRate = $fxRate`,
              {
                companyName: round.companyName,
                currency: round.currency,
                amount: round.amount,
                fxRate: rate,
              }
            );
            if (res.summary.counters.updates().propertiesSet > 0) updated++;
          } finally {
            await session.close();
          }
        } else {
          updated++;
        }
      } catch (err) {
        console.error(`  ✗ ${round.companyName}: ${err}`);
        errors++;
      }
    }

    console.log(`\n✅ Done${DRY_RUN ? " (DRY RUN)" : ""}:`);
    console.log(`   Patched: ${updated}`);
    console.log(`   Errors: ${errors}`);
  } finally {
    await prisma.$disconnect();
    await neoDriver.close();
  }
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
