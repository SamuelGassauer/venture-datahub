import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const [
    totalFeeds,
    totalArticles,
    unreadArticles,
    totalFundingRounds,
    fundingAgg,
    stageDistribution,
    countryDistribution,
    timeline,
    recentRounds,
  ] = await Promise.all([
    prisma.feed.count({ where: { isActive: true } }),
    prisma.article.count(),
    prisma.article.count({ where: { isRead: false } }),
    prisma.fundingRound.count(),
    prisma.fundingRound.aggregate({
      _sum: { amountUsd: true },
      _avg: { confidence: true },
    }),
    prisma.$queryRaw`
      SELECT stage, COUNT(*)::int as count, COALESCE(SUM(amount_usd), 0)::float as "totalAmount"
      FROM funding_rounds
      WHERE stage IS NOT NULL
      GROUP BY stage
      ORDER BY count DESC
    `,
    prisma.$queryRaw`
      SELECT country, COUNT(*)::int as count, COALESCE(SUM(amount_usd), 0)::float as "totalAmount"
      FROM funding_rounds
      WHERE country IS NOT NULL
      GROUP BY country
      ORDER BY count DESC
      LIMIT 15
    `,
    prisma.$queryRaw`
      SELECT TO_CHAR(created_at, 'YYYY-MM') as month, COUNT(*)::int as count, COALESCE(SUM(amount_usd), 0)::float as "totalAmount"
      FROM funding_rounds
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      ORDER BY month DESC
      LIMIT 12
    `,
    prisma.fundingRound.findMany({
      include: { article: { include: { feed: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  return NextResponse.json({
    stats: {
      totalFeeds,
      totalArticles,
      unreadArticles,
      totalFundingRounds,
      totalFundingAmount: fundingAgg._sum.amountUsd || 0,
      avgConfidence: fundingAgg._avg.confidence || 0,
    },
    stageDistribution,
    countryDistribution,
    timeline: (timeline as Array<{ month: string; count: number; totalAmount: number }>).reverse(),
    recentRounds,
  });
}
