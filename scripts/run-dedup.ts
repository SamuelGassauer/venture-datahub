/**
 * Manual one-off dedup scan trigger.
 * Usage: pnpm tsx scripts/run-dedup.ts
 */
import { runDedup } from "../src/lib/dedup/run";

async function main() {
  console.log("Starting manual dedup scan...");
  const start = Date.now();
  const summary = await runDedup("manual:cli");
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log("\nDone in", elapsed, "s");
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error("Dedup scan failed:", err);
  process.exit(1);
});
