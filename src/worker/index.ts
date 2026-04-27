import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { syncAllFeeds } from "../lib/sync-engine";
import { runDedup } from "../lib/dedup/run";

const prisma = new PrismaClient();

async function getInterval(): Promise<string> {
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: "sync_interval_minutes" },
    });
    const minutes = parseInt(setting?.value || "30", 10);
    return `*/${minutes} * * * *`;
  } catch {
    return "*/30 * * * *";
  }
}

async function runSync() {
  console.log(`[${new Date().toISOString()}] Starting sync...`);
  try {
    const results = await syncAllFeeds();
    const successful = results.filter((r) => r.status === "success").length;
    const totalNew = results.reduce((sum, r) => sum + r.articlesNew, 0);
    const totalFunding = results.reduce((sum, r) => sum + r.fundingFound, 0);
    console.log(
      `[${new Date().toISOString()}] Sync complete: ${successful}/${results.length} feeds, ${totalNew} new articles, ${totalFunding} funding rounds`
    );
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Sync error:`, error);
  }
}

async function runDedupJob() {
  console.log(`[${new Date().toISOString()}] Starting dedup scan...`);
  try {
    const summary = await runDedup("cron");
    console.log(
      `[${new Date().toISOString()}] Dedup complete: companies=${summary.companiesScanned} investors=${summary.investorsScanned} rounds=${summary.roundsScanned} new=${summary.candidatesNew} updated=${summary.candidatesUpdated} (${(summary.durationMs / 1000).toFixed(1)}s)`,
    );
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Dedup error:`, error);
  }
}

async function main() {
  console.log("RSS Scraper Worker starting...");

  // Run initial sync
  await runSync();

  // Schedule recurring sync
  const interval = await getInterval();
  console.log(`Scheduling sync with cron: ${interval}`);

  cron.schedule(interval, runSync);

  // Daily dedup scan at 03:00 UTC
  const dedupSchedule = "0 3 * * *";
  console.log(`Scheduling dedup with cron: ${dedupSchedule}`);
  cron.schedule(dedupSchedule, runDedupJob);

  console.log("Worker running. Press Ctrl+C to stop.");
}

main().catch((error) => {
  console.error("Worker failed to start:", error);
  process.exit(1);
});
