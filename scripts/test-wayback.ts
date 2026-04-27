import { crawlWaybackSource, WAYBACK_SOURCES } from "../src/lib/wayback-cdx";
import { prisma } from "../src/lib/db";

async function main() {
  const sourceName = process.argv[2] || "Sifted";
  const minDate = process.argv[3] || "2026-03-01";
  const maxDate = process.argv[4] || "2026-03-31";

  const source = WAYBACK_SOURCES.find((s) => s.name === sourceName);
  if (!source) {
    console.error(`Unknown source: ${sourceName}`);
    process.exit(1);
  }

  console.log(`Crawling ${source.name} (${source.pattern}) from ${minDate} to ${maxDate}...`);
  const result = await crawlWaybackSource(source, minDate, maxDate, `test-${Date.now()}`, { maxPages: 3 });
  console.log(JSON.stringify(result, null, 2));

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
