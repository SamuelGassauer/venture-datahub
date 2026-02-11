import { NextResponse } from "next/server";
import driver from "@/lib/neo4j";
import { prisma } from "@/lib/db";

function toNumber(value: unknown): unknown {
  return typeof value === "object" && value !== null && "toNumber" in value
    ? (value as { toNumber(): number }).toNumber()
    : value;
}

function parseRecords(records: import("neo4j-driver").Record[]) {
  return records.map((record) => {
    const obj: Record<string, unknown> = {};
    (record.keys as string[]).forEach((key) => {
      obj[key] = toNumber(record.get(key));
    });
    return obj;
  });
}

async function runQuery(query: string, params?: Record<string, unknown>) {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    return await session.run(query, params);
  } finally {
    await session.close();
  }
}

export async function GET() {
  try {
    const [
      summaryResult,
      edgesResult,
      medianResult,
      recentDealsResult,
      topCompaniesResult,
      topInvestorsResult,
      fundingByStageResult,
      fundingByCountryResult,
      fundingTimelineResult,
      totalInDb,
      ingestedCount,
    ] = await Promise.all([
      // --- summary: aggregate metrics ---
      runQuery(`
        OPTIONAL MATCH (fr:FundingRound)
        WITH sum(fr.amountUsd) AS totalFunding, count(fr) AS totalRounds,
             avg(fr.amountUsd) AS avgDealSize
        OPTIONAL MATCH (c:Company)
        WITH totalFunding, totalRounds, avgDealSize, count(c) AS totalCompanies
        OPTIONAL MATCH (inv:InvestorOrg)
        WITH totalFunding, totalRounds, avgDealSize, totalCompanies, count(inv) AS totalInvestors
        OPTIONAL MATCH (a:Article)
        WITH totalFunding, totalRounds, avgDealSize, totalCompanies, totalInvestors, count(a) AS totalArticles
        OPTIONAL MATCH (l:Location)
        RETURN totalFunding, totalRounds, avgDealSize, totalCompanies, totalInvestors, totalArticles,
               count(l) AS totalLocations
      `),

      // --- summary: total edges ---
      runQuery(`
        MATCH ()-[r]->()
        RETURN count(r) AS totalEdges
      `),

      // --- summary: median deal size (approximate via percentileDisc) ---
      runQuery(`
        MATCH (fr:FundingRound)
        WHERE fr.amountUsd IS NOT NULL
        RETURN percentileDisc(fr.amountUsd, 0.5) AS medianDealSize
      `),

      // --- recentDeals (limit 25) ---
      runQuery(`
        MATCH (c:Company)-[:RAISED]->(fr:FundingRound)
        OPTIONAL MATCH (lead:InvestorOrg)-[:PARTICIPATED_IN {role: 'lead'}]->(fr)
        OPTIONAL MATCH (participant:InvestorOrg)-[:PARTICIPATED_IN]->(fr)
        OPTIONAL MATCH (fr)-[:SOURCED_FROM]->(a:Article)
        WITH c, fr,
             collect(DISTINCT lead.name)[0] AS leadInvestor,
             count(DISTINCT participant) AS participantCount,
             collect(DISTINCT {url: a.url, title: a.title, publishedAt: a.publishedAt}) AS articles
        WITH c, fr, leadInvestor, participantCount, articles,
             articles[0].url AS articleUrl,
             articles[0].title AS articleTitle,
             articles[0].publishedAt AS publishedAt
        RETURN c.name AS company,
               c.country AS companyCountry,
               fr.amountUsd AS amount,
               fr.stage AS stage,
               leadInvestor,
               participantCount,
               articleUrl,
               articleTitle,
               publishedAt
        ORDER BY publishedAt DESC
        LIMIT 25
      `),

      // --- topCompanies (limit 20) ---
      runQuery(`
        MATCH (c:Company)
        OPTIONAL MATCH (c)-[:RAISED]->(fr:FundingRound)
        WITH c, count(fr) AS roundCount,
             collect({stage: fr.stage, amount: fr.amountUsd, roundKey: fr.roundKey}) AS rounds
        WITH c, roundCount, rounds,
             rounds[size(rounds)-1].stage AS lastRoundStage,
             rounds[size(rounds)-1].amount AS lastRoundAmount
        RETURN c.name AS name,
               c.country AS country,
               c.totalFundingUsd AS totalFunding,
               roundCount,
               lastRoundStage,
               lastRoundAmount
        ORDER BY c.totalFundingUsd DESC
        LIMIT 20
      `),

      // --- topInvestors (limit 20) ---
      runQuery(`
        MATCH (inv:InvestorOrg)-[p:PARTICIPATED_IN]->(fr:FundingRound)
        OPTIONAL MATCH (c:Company)-[:RAISED]->(fr)
        WITH inv,
             count(DISTINCT fr) AS dealCount,
             sum(CASE WHEN p.role = 'lead' THEN 1 ELSE 0 END) AS leadCount,
             sum(fr.amountUsd) AS totalDeployed,
             collect(DISTINCT c.name) AS allCompanies
        RETURN inv.name AS name,
               dealCount,
               leadCount,
               totalDeployed,
               allCompanies[0..5] AS portfolioCompanies
        ORDER BY dealCount DESC
        LIMIT 20
      `),

      // --- fundingByStage ---
      runQuery(`
        MATCH (fr:FundingRound)
        WHERE fr.stage IS NOT NULL
        RETURN fr.stage AS stage,
               count(fr) AS count,
               sum(fr.amountUsd) AS totalAmount
        ORDER BY totalAmount DESC
      `),

      // --- fundingByCountry (limit 10) ---
      runQuery(`
        MATCH (c:Company)-[:RAISED]->(fr:FundingRound)
        WHERE c.country IS NOT NULL
        WITH c.country AS country, fr, c
        RETURN country,
               sum(fr.amountUsd) AS totalAmount,
               count(fr) AS dealCount,
               count(DISTINCT c) AS companyCount
        ORDER BY totalAmount DESC
        LIMIT 10
      `),

      // --- fundingTimeline: monthly aggregation ---
      runQuery(`
        MATCH (fr:FundingRound)-[:SOURCED_FROM]->(a:Article)
        WHERE a.publishedAt IS NOT NULL
        WITH fr, substring(toString(a.publishedAt), 0, 7) AS month
        RETURN month,
               count(fr) AS dealCount,
               sum(fr.amountUsd) AS totalAmount
        ORDER BY month ASC
      `),

      // --- ingestion from Prisma ---
      prisma.fundingRound.count(),
      prisma.fundingRound.count({ where: { ingestedAt: { not: null } } }),
    ]);

    const summaryRow = summaryResult.records[0];
    const totalEdges = toNumber(edgesResult.records[0]?.get("totalEdges")) as number ?? 0;
    const medianDealSize = toNumber(medianResult.records[0]?.get("medianDealSize")) as number ?? null;

    return NextResponse.json({
      summary: {
        totalFunding: toNumber(summaryRow?.get("totalFunding")) ?? 0,
        totalCompanies: toNumber(summaryRow?.get("totalCompanies")) ?? 0,
        totalInvestors: toNumber(summaryRow?.get("totalInvestors")) ?? 0,
        totalRounds: toNumber(summaryRow?.get("totalRounds")) ?? 0,
        totalArticles: toNumber(summaryRow?.get("totalArticles")) ?? 0,
        totalLocations: toNumber(summaryRow?.get("totalLocations")) ?? 0,
        totalEdges,
        avgDealSize: toNumber(summaryRow?.get("avgDealSize")) ?? 0,
        medianDealSize,
      },
      ingestion: {
        totalInDb,
        ingested: ingestedCount,
        pending: totalInDb - ingestedCount,
      },
      recentDeals: parseRecords(recentDealsResult.records),
      topCompanies: parseRecords(topCompaniesResult.records),
      topInvestors: parseRecords(topInvestorsResult.records),
      fundingByStage: parseRecords(fundingByStageResult.records),
      fundingByCountry: parseRecords(fundingByCountryResult.records),
      fundingTimeline: parseRecords(fundingTimelineResult.records),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch graph stats" },
      { status: 500 },
    );
  }
}
