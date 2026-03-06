/**
 * Migration: Add stable UUIDs to all Neo4j nodes that don't have one yet.
 *
 * Run with:  npx tsx scripts/migrate-add-uuids.ts
 *
 * Safe to run multiple times — only sets uuid where it's missing.
 */

import neo4j from "neo4j-driver";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env manually (no dotenv dependency)
const envPath = resolve(process.cwd(), ".env");
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^\s*([^#=]+?)\s*=\s*["']?(.*?)["']?\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
} catch { /* .env not found, rely on existing env vars */ }

const uri = process.env.NEO4J_URI!;
const password = process.env.NEO4J_PASSWORD!;

if (!uri || !password) {
  console.error("NEO4J_URI and NEO4J_PASSWORD must be set");
  process.exit(1);
}

const driver = neo4j.driver(uri, neo4j.auth.basic("neo4j", password));

const LABELS = [
  "Company",
  "InvestorOrg",
  "FundingRound",
  "Fund",
  "Valuation",
  "Article",
  "Location",
];

async function run() {
  const session = driver.session();
  try {
    for (const label of LABELS) {
      // Create uniqueness constraint on uuid (idempotent)
      await session.run(
        `CREATE CONSTRAINT ${label.toLowerCase()}_uuid IF NOT EXISTS FOR (n:${label}) REQUIRE n.uuid IS UNIQUE`
      );

      // Set uuid on all nodes that don't have one
      const result = await session.run(
        `MATCH (n:${label}) WHERE n.uuid IS NULL
         SET n.uuid = randomUUID()
         RETURN count(n) AS updated`
      );
      const updated = result.records[0].get("updated").toNumber?.() ?? result.records[0].get("updated");
      console.log(`${label}: ${updated} nodes got a uuid`);
    }
    console.log("\nDone. All nodes now have a stable uuid.");
  } finally {
    await session.close();
    await driver.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
