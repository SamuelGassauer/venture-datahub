import { NextResponse } from "next/server";
import driver from "@/lib/neo4j";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { EUROPE_CYPHER_LIST } from "@/lib/european-countries";
import {
  scoreRound,
  scoreCompany,
  scoreInvestor,
  neoToMs,
  neoNumber,
} from "@/lib/quality";

export const dynamic = "force-dynamic";

const STALE_MS = 1000 * 60 * 60 * 24 * 30 * 6; // 6 months

export async function GET() {
  const authError = await requireAuth();
  if (authError instanceof NextResponse) return authError;

  // One Neo4j session per concurrent query — sharing a session across
  // Promise.all triggers 50N42 (see v1/funding-rounds/route.ts:92).
  const runRead = async (cypher: string) => {
    const s = driver().session({ defaultAccessMode: "READ" });
    try {
      return await s.run(cypher);
    } finally {
      await s.close();
    }
  };

  try {
    const [roundsRes, companiesRes, investorsRes, dedupPending] = await Promise.all([
      runRead(`
        MATCH (fr:FundingRound)<-[:RAISED]-(c:Company)
        WHERE c.country IN ${EUROPE_CYPHER_LIST}
        OPTIONAL MATCH (fr)-[:SOURCED_FROM]->(a:Article)
        WITH fr, c, count(DISTINCT a) AS sourceCount, min(a.publishedAt) AS articleDate
        OPTIONAL MATCH (lead:InvestorOrg)-[lr:PARTICIPATED_IN {role:'lead'}]->(fr)
        OPTIONAL MATCH (allInv:InvestorOrg)-[:PARTICIPATED_IN]->(fr)
        WITH fr, c, sourceCount, articleDate,
             count(DISTINCT allInv) AS investorCount,
             count(DISTINCT lead) AS leadCount
        RETURN fr.confidence AS confidence,
               sourceCount,
               fr.stage AS stage,
               leadCount,
               c.country AS country,
               investorCount,
               COALESCE(fr.announcedDate, articleDate) AS effectiveDate
      `),
      runRead(`
        MATCH (c:Company)
        WHERE c.country IN ${EUROPE_CYPHER_LIST}
        OPTIONAL MATCH (c)-[:RAISED]->(fr:FundingRound)
        WITH c, count(fr) > 0 AS hasFunding
        OPTIONAL MATCH (c)-[:HQ_IN]->(loc:Location)
        WITH c, hasFunding, loc,
             (CASE WHEN c.description IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN c.website IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN c.foundedYear IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN c.employeeRange IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN c.linkedinUrl IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN c.country IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN c.status IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN loc IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN c.logoUrl IS NOT NULL THEN 1 ELSE 0 END) AS enrichScore
        RETURN c.normalizedName AS normalizedName,
               enrichScore,
               hasFunding,
               c.enrichedAt AS enrichedAt,
               c.country AS country,
               c.sector AS sector,
               c.website AS website
      `),
      runRead(`
        MATCH (inv:InvestorOrg)
        OPTIONAL MATCH (inv)-[p:PARTICIPATED_IN]->(fr:FundingRound)
        WITH inv, count(DISTINCT fr) AS dealCount,
             (CASE WHEN inv.type IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN inv.website IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN inv.linkedinUrl IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN inv.foundedYear IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN inv.logoUrl IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN inv.aum IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN inv.hqCity IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN inv.hqCountry IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN size(COALESCE(inv.stageFocus, [])) > 0 THEN 1 ELSE 0 END +
              CASE WHEN size(COALESCE(inv.sectorFocus, [])) > 0 THEN 1 ELSE 0 END +
              CASE WHEN size(COALESCE(inv.geoFocus, [])) > 0 THEN 1 ELSE 0 END +
              CASE WHEN inv.checkSizeMinUsd IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN inv.checkSizeMaxUsd IS NOT NULL THEN 1 ELSE 0 END) AS enrichScore
        RETURN inv.normalizedName AS normalizedName,
               enrichScore,
               dealCount,
               inv.enrichedAt AS enrichedAt,
               size(COALESCE(inv.stageFocus, [])) > 0 AS stageFocusFilled,
               size(COALESCE(inv.sectorFocus, [])) > 0 AS sectorFocusFilled,
               size(COALESCE(inv.geoFocus, [])) > 0 AS geoFocusFilled,
               inv.hqCountry AS hqCountry,
               inv.type AS type
      `),
      prisma.dedupCandidate.groupBy({
        by: ["entityType"],
        where: { status: "pending" },
        _count: { _all: true },
      }),
    ]);

    // Pending dedup keys per entity (for "duplicated" flag in scoring)
    const pendingDedup = await prisma.dedupCandidate.findMany({
      where: { status: "pending" },
      select: { entityType: true, leftKey: true, rightKey: true },
    });
    const dedupKeys = {
      company: new Set<string>(),
      investor: new Set<string>(),
      round: new Set<string>(),
    };
    for (const d of pendingDedup) {
      dedupKeys[d.entityType].add(d.leftKey);
      dedupKeys[d.entityType].add(d.rightKey);
    }

    // Round metrics
    const roundScores: number[] = [];
    let lowConfRounds = 0;
    let singleSourceRounds = 0;
    let missingLeadRounds = 0;
    for (const r of roundsRes.records) {
      const sourceCount = neoNumber(r.get("sourceCount"));
      const investorCount = neoNumber(r.get("investorCount"));
      const leadCount = neoNumber(r.get("leadCount"));
      const conf = (r.get("confidence") as number | null) ?? null;
      const stage = r.get("stage") as string | null;
      const country = r.get("country") as string | null;
      const effDate = neoToMs(r.get("effectiveDate"));
      const { score } = scoreRound({
        llmConfidence: conf,
        sourceCount,
        hasStage: !!stage,
        hasLead: leadCount > 0,
        hasCountry: !!country,
        investorCount,
        effectiveDateMs: effDate,
      });
      roundScores.push(score);
      if ((conf ?? 0) < 0.6) lowConfRounds++;
      if (sourceCount <= 1) singleSourceRounds++;
      if (leadCount === 0) missingLeadRounds++;
    }

    // Company metrics
    const companyScores: number[] = [];
    let missingCountry = 0;
    let missingSector = 0;
    let missingWebsite = 0;
    let staleCompanies = 0;
    const totalCompanies = companiesRes.records.length;
    for (const r of companiesRes.records) {
      const enrichScore = neoNumber(r.get("enrichScore"));
      const hasFunding = !!r.get("hasFunding");
      const enrichedAtMs = neoToMs(r.get("enrichedAt"));
      const normalizedName = (r.get("normalizedName") as string | null) ?? "";
      const country = r.get("country");
      const sector = r.get("sector");
      const website = r.get("website");
      const { score } = scoreCompany({
        enrichScore,
        hasFundingHistory: hasFunding,
        enrichedAtMs,
        duplicated: dedupKeys.company.has(normalizedName),
      });
      companyScores.push(score);
      if (!country) missingCountry++;
      if (!sector) missingSector++;
      if (!website) missingWebsite++;
      if (enrichedAtMs == null || Date.now() - enrichedAtMs > STALE_MS) staleCompanies++;
    }

    // Investor metrics
    const investorScores: number[] = [];
    let missingHq = 0;
    let missingType = 0;
    let staleInvestors = 0;
    const totalInvestors = investorsRes.records.length;
    for (const r of investorsRes.records) {
      const enrichScore = neoNumber(r.get("enrichScore"));
      const dealCount = neoNumber(r.get("dealCount"));
      const enrichedAtMs = neoToMs(r.get("enrichedAt"));
      const normalizedName = (r.get("normalizedName") as string | null) ?? "";
      const hqCountry = r.get("hqCountry");
      const type = r.get("type");
      const { score } = scoreInvestor({
        enrichScore,
        dealCount,
        stageFocusFilled: !!r.get("stageFocusFilled"),
        sectorFocusFilled: !!r.get("sectorFocusFilled"),
        geoFocusFilled: !!r.get("geoFocusFilled"),
        enrichedAtMs,
        duplicated: dedupKeys.investor.has(normalizedName),
      });
      investorScores.push(score);
      if (!hqCountry) missingHq++;
      if (!type) missingType++;
      if (enrichedAtMs == null || Date.now() - enrichedAtMs > STALE_MS) staleInvestors++;
    }

    const avg = (xs: number[]) =>
      xs.length === 0 ? 0 : Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);

    const dedupCounts = Object.fromEntries(
      dedupPending.map((d) => [d.entityType, d._count._all])
    ) as Record<string, number>;

    return NextResponse.json({
      rounds: {
        total: roundScores.length,
        avgScore: avg(roundScores),
        issues: {
          lowConfidence: lowConfRounds,
          singleSource: singleSourceRounds,
          missingLead: missingLeadRounds,
          dedupPending: dedupCounts.round ?? 0,
        },
      },
      companies: {
        total: totalCompanies,
        avgScore: avg(companyScores),
        issues: {
          missingCountry,
          missingSector,
          missingWebsite,
          stale: staleCompanies,
          dedupPending: dedupCounts.company ?? 0,
        },
      },
      investors: {
        total: totalInvestors,
        avgScore: avg(investorScores),
        issues: {
          missingHq,
          missingType,
          stale: staleInvestors,
          dedupPending: dedupCounts.investor ?? 0,
        },
      },
    });
  } catch (error) {
    console.error("v1/quality/overview error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compute overview" },
      { status: 500 }
    );
  }
}
