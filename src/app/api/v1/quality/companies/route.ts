import { NextRequest, NextResponse } from "next/server";
import driver from "@/lib/neo4j";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { EUROPE_CYPHER_LIST } from "@/lib/european-countries";
import { scoreCompany, neoToMs, neoNumber, tierOf } from "@/lib/quality";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authError = await requireAuth();
  if (authError instanceof NextResponse) return authError;

  const { searchParams } = new URL(request.url);
  const tier = searchParams.get("tier");
  const limit = Math.min(parseInt(searchParams.get("limit") || "300") || 300, 1000);

  const session = driver().session({ defaultAccessMode: "READ" });

  try {
    const result = await session.run(`
      MATCH (c:Company)
      WHERE c.country IN ${EUROPE_CYPHER_LIST}
      OPTIONAL MATCH (c)-[:RAISED]->(fr:FundingRound)
      WITH c, count(fr) AS roundCount, max(fr.amountUsd) AS maxRoundAmount,
           sum(COALESCE(fr.amountUsd, 0)) AS totalFunding
      OPTIONAL MATCH (c)-[:HQ_IN]->(loc:Location)
      WITH c, roundCount, totalFunding, loc,
           (CASE WHEN c.description IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN c.website IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN c.foundedYear IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN c.employeeRange IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN c.linkedinUrl IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN c.country IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN c.status IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN loc IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN c.logoUrl IS NOT NULL THEN 1 ELSE 0 END) AS enrichScore
      RETURN c.name AS name,
             c.normalizedName AS normalizedName,
             c.logoUrl AS logoUrl,
             c.country AS country,
             c.sector AS sector,
             c.status AS status,
             c.website AS website,
             c.foundedYear AS foundedYear,
             c.employeeRange AS employeeRange,
             c.linkedinUrl AS linkedinUrl,
             loc.name AS location,
             c.enrichedAt AS enrichedAt,
             roundCount,
             totalFunding,
             enrichScore
      LIMIT toInteger($limit)
    `, { limit });

    const pending = await prisma.dedupCandidate.findMany({
      where: { entityType: "company", status: "pending" },
      select: { leftKey: true, rightKey: true },
    });
    const dedupKeys = new Set<string>();
    for (const d of pending) { dedupKeys.add(d.leftKey); dedupKeys.add(d.rightKey); }

    const data = result.records.map((r) => {
      const enrichScore = neoNumber(r.get("enrichScore"));
      const roundCount = neoNumber(r.get("roundCount"));
      const enrichedAtMs = neoToMs(r.get("enrichedAt"));
      const normalizedName = (r.get("normalizedName") as string | null) ?? "";
      const duplicated = dedupKeys.has(normalizedName);

      const { score, breakdown } = scoreCompany({
        enrichScore,
        hasFundingHistory: roundCount > 0,
        enrichedAtMs,
        duplicated,
      });

      const issues: string[] = [];
      if (!r.get("country")) issues.push("no-country");
      if (!r.get("sector")) issues.push("no-sector");
      if (!r.get("website")) issues.push("no-website");
      if (!r.get("foundedYear")) issues.push("no-founded-year");
      if (!r.get("status")) issues.push("no-status");
      if (!r.get("logoUrl")) issues.push("no-logo");
      if (roundCount === 0) issues.push("no-funding-history");
      if (enrichedAtMs == null) issues.push("never-enriched");
      if (duplicated) issues.push("dedup-pending");

      return {
        name: r.get("name") as string | null,
        normalizedName,
        logoUrl: r.get("logoUrl") as string | null,
        country: r.get("country") as string | null,
        sector: r.get("sector") as string | null,
        status: r.get("status") as string | null,
        website: r.get("website") as string | null,
        foundedYear: r.get("foundedYear") != null ? neoNumber(r.get("foundedYear")) : null,
        employeeRange: r.get("employeeRange") as string | null,
        linkedinUrl: r.get("linkedinUrl") as string | null,
        location: r.get("location") as string | null,
        enrichedAt: r.get("enrichedAt") ? String(r.get("enrichedAt")) : null,
        roundCount,
        totalFunding: r.get("totalFunding") != null ? neoNumber(r.get("totalFunding")) : 0,
        enrichScore,
        score,
        tier: tierOf(score),
        breakdown,
        issues,
      };
    });

    const filtered = tier ? data.filter((c) => c.tier === tier) : data;
    filtered.sort((a, b) => a.score - b.score); // worst first

    return NextResponse.json({ data: filtered, total: filtered.length });
  } catch (error) {
    console.error("v1/quality/companies error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compute company quality" },
      { status: 500 }
    );
  } finally {
    await session.close();
  }
}
