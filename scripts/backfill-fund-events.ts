import { prisma } from "../src/lib/db";
import { extractFundEvent, isFundEvent } from "../src/lib/fund-event-extractor";

async function backfill() {
  // Step 0: Clear existing fund events (full re-scan)
  const deleted = await prisma.fundEvent.deleteMany({});
  console.log("Cleared existing fund events:", deleted.count);

  // Step 1: Scan ALL articles (including those with funding rounds)
  const articles = await prisma.article.findMany({
    select: { id: true, title: true, content: true, summary: true },
  });
  console.log("Total articles to scan:", articles.length);

  let created = 0;
  for (const a of articles) {
    const text = a.content || a.summary || "";
    if (!isFundEvent(a.title, text)) continue;
    const result = extractFundEvent(a.title, text);
    if (!result) continue;

    // Check if this article already has a funding round
    const hasFR = await prisma.fundingRound.findUnique({ where: { articleId: a.id } });

    if (hasFR) {
      // Move: delete funding round, create fund event
      await prisma.$transaction([
        prisma.fundingRound.delete({ where: { articleId: a.id } }),
        prisma.fundEvent.create({
          data: {
            articleId: a.id,
            fundName: result.fundName,
            firmName: result.firmName,
            amount: result.amount,
            currency: result.currency,
            amountUsd: result.amountUsd,
            fundType: result.fundType,
            vintage: result.vintage,
            country: result.country,
            confidence: result.confidence,
            rawExcerpt: result.rawExcerpt,
          },
        }),
      ]);
      console.log("  Moved:", result.firmName, "|", result.fundName, "| conf:", result.confidence, "| title:", a.title.substring(0, 60));
    } else {
      // Create new fund event
      try {
        await prisma.fundEvent.create({
          data: {
            articleId: a.id,
            fundName: result.fundName,
            firmName: result.firmName,
            amount: result.amount,
            currency: result.currency,
            amountUsd: result.amountUsd,
            fundType: result.fundType,
            vintage: result.vintage,
            country: result.country,
            confidence: result.confidence,
            rawExcerpt: result.rawExcerpt,
          },
        });
        console.log("  Created:", result.firmName, "|", result.fundName, "| conf:", result.confidence, "| title:", a.title.substring(0, 60));
        created++;
      } catch {
        // Skip duplicate
      }
    }
  }

  const total = await prisma.fundEvent.count();
  console.log("\nTotal fund events in DB:", total);

  await prisma.$disconnect();
}

backfill().catch((e) => {
  console.error(e);
  process.exit(1);
});
