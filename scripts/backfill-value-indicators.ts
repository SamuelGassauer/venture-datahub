import { PrismaClient } from "@prisma/client";
import { extractValueIndicators } from "../src/lib/value-indicator-extractor";

const prisma = new PrismaClient();

async function main() {
  // Find articles that have NOT yet been scanned for value indicators
  const articles = await prisma.article.findMany({
    where: {
      companyValueIndicators: { none: {} },
    },
    select: {
      id: true,
      title: true,
      content: true,
      summary: true,
    },
  });

  console.log(`Scanning ${articles.length} articles for value indicators...`);

  let extracted = 0;
  let indicators = 0;

  for (const article of articles) {
    const articleText = article.content || article.summary || "";
    const results = extractValueIndicators(article.title, articleText);

    if (results.length > 0) {
      await prisma.companyValueIndicator.createMany({
        data: results.map((vi) => ({
          articleId: article.id,
          companyName: vi.companyName,
          metricType: vi.metricType,
          value: vi.value,
          currency: vi.currency,
          valueUsd: vi.valueUsd,
          unit: vi.unit,
          period: vi.period,
          confidence: vi.confidence,
          rawExcerpt: vi.rawExcerpt,
        })),
      });
      extracted++;
      indicators += results.length;
      console.log(`  ${article.title}`);
      for (const r of results) {
        console.log(`    → ${r.metricType}: ${r.value} ${r.currency} (${r.companyName}, conf=${r.confidence})`);
      }
    }
  }

  console.log(`\nDone: ${extracted} articles with indicators, ${indicators} total indicators created`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
