/**
 * Migration script: Re-calculate amountUsd for all non-USD funding rounds
 * using real historical FX rates from frankfurter.app (ECB data).
 *
 * Updates both PostgreSQL (Prisma) and Neo4j.
 *
 * Usage: npx tsx scripts/fix-fx-rates.ts [--dry-run]
 */

import { PrismaClient } from "@prisma/client";
import neo4j from "neo4j-driver";

const DRY_RUN = process.argv.includes("--dry-run");

// ---------------------------------------------------------------------------
// FX rate fetching (inline to avoid import issues with tsx)
// ---------------------------------------------------------------------------

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
    if (typeof rate !== "number") throw new Error("No rate in response");
    fxCache.set(key, rate);
    return rate;
  } catch (err) {
    console.warn(`  ⚠ FX API failed for ${code} on ${date}: ${err}`);
    // Fallback rates
    const fallbacks: Record<string, number> = {
      EUR: 1.08, GBP: 1.27, CHF: 1.12, SEK: 0.096, NOK: 0.094,
      DKK: 0.145, PLN: 0.25, AUD: 0.65, INR: 0.012,
    };
    return fallbacks[code] ?? 1;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n🔄 FX Rate Migration ${DRY_RUN ? "(DRY RUN)" : ""}\n`);

  const prisma = new PrismaClient();
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic("neo4j", process.env.NEO4J_PASSWORD!)
  );

  try {
    // Find all non-USD rounds with original amount
    const rounds = await prisma.fundingRound.findMany({
      where: {
        NOT: { currency: "USD" },
        amount: { not: null },
      },
      include: {
        article: { select: { publishedAt: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    console.log(`Found ${rounds.length} non-USD rounds to fix\n`);

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    // Rate-limit: frankfurter.app is free, but let's be polite
    // Group by currency+date to minimize API calls
    const rateRequests = new Map<string, { currency: string; date: string }>();
    for (const r of rounds) {
      const date = r.article.publishedAt?.toISOString().substring(0, 10)
        ?? r.createdAt.toISOString().substring(0, 10);
      const key = `${r.currency}:${date}`;
      if (!rateRequests.has(key)) {
        rateRequests.set(key, { currency: r.currency, date });
      }
    }

    console.log(`Fetching ${rateRequests.size} unique FX rates...\n`);

    // Pre-fetch all rates
    for (const [, { currency, date }] of rateRequests) {
      await getUsdRate(currency, date);
      // Small delay to be polite to the API
      await new Promise((r) => setTimeout(r, 100));
    }

    console.log(`Rates cached. Processing rounds...\n`);

    for (const round of rounds) {
      const date = round.article.publishedAt?.toISOString().substring(0, 10)
        ?? round.createdAt.toISOString().substring(0, 10);

      try {
        const rate = await getUsdRate(round.currency, date);
        const newAmountUsd = Math.round(round.amount! * rate);
        const oldAmountUsd = round.amountUsd ? Math.round(round.amountUsd) : null;

        if (oldAmountUsd === newAmountUsd) {
          skipped++;
          continue;
        }

        const diff = oldAmountUsd
          ? `${oldAmountUsd.toLocaleString()} → ${newAmountUsd.toLocaleString()} (${((newAmountUsd - oldAmountUsd) / oldAmountUsd * 100).toFixed(1)}%)`
          : `null → ${newAmountUsd.toLocaleString()}`;

        console.log(`  ${round.companyName}: ${round.amount!.toLocaleString()} ${round.currency} @ ${rate.toFixed(4)} = ${diff} USD (${date})`);

        if (!DRY_RUN) {
          // Update Prisma
          await prisma.fundingRound.update({
            where: { id: round.id },
            data: { amountUsd: newAmountUsd },
          });

          // Update Neo4j (find by company name + stage)
          const session = driver.session();
          try {
            await session.run(
              `MATCH (c:Company)-[:RAISED]->(fr:FundingRound)
               WHERE fr.amountUsd = $oldAmount AND fr.currency = $currency
               AND c.name = $companyName
               SET fr.amountUsd = $newAmount`,
              {
                oldAmount: round.amountUsd,
                currency: round.currency,
                companyName: round.companyName,
                newAmount: newAmountUsd,
              }
            );
          } finally {
            await session.close();
          }
        }

        updated++;
      } catch (err) {
        console.error(`  ✗ ${round.companyName}: ${err}`);
        errors++;
      }
    }

    console.log(`\n✅ Done${DRY_RUN ? " (DRY RUN — no changes written)" : ""}:`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped (same value): ${skipped}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   FX rates cached: ${fxCache.size}`);
  } finally {
    await prisma.$disconnect();
    await driver.close();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
