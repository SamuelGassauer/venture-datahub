import { NextRequest, NextResponse } from "next/server";
import driver from "@/lib/neo4j";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { EUROPE_CYPHER_LIST } from "@/lib/european-countries";
import { scoreRound, neoToMs, neoNumber, tierOf } from "@/lib/quality";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authError = await requireAuth();
  if (authError instanceof NextResponse) return authError;

  const { searchParams } = new URL(request.url);
  const tier = searchParams.get("tier"); // good|ok|poor
  const limit = Math.min(parseInt(searchParams.get("limit") || "200") || 200, 1000);

  const session = driver().session({ defaultAccessMode: "READ" });

  try {
    const result = await session.run(`
      MATCH (fr:FundingRound)<-[:RAISED]-(c:Company)
      WHERE c.country IN ${EUROPE_CYPHER_LIST}
      OPTIONAL MATCH (fr)-[:SOURCED_FROM]->(a:Article)
      WITH fr, c, count(DISTINCT a) AS sourceCount,
           min(a.publishedAt) AS articleDate
      OPTIONAL MATCH (lead:InvestorOrg)-[:PARTICIPATED_IN {role:'lead'}]->(fr)
      OPTIONAL MATCH (allInv:InvestorOrg)-[:PARTICIPATED_IN]->(fr)
      WITH fr, c, sourceCount, articleDate,
           count(DISTINCT lead) AS leadCount,
           count(DISTINCT allInv) AS investorCount,
           collect(DISTINCT lead.name)[0] AS leadName
      RETURN fr.uuid AS uuid,
             c.name AS companyName,
             c.normalizedName AS companyKey,
             c.logoUrl AS companyLogoUrl,
             fr.amountUsd AS amountUsd,
             fr.stage AS stage,
             c.country AS country,
             fr.confidence AS confidence,
             sourceCount,
             leadCount,
             investorCount,
             leadName,
             COALESCE(fr.announcedDate, articleDate) AS effectiveDate
      LIMIT toInteger($limit)
    `, { limit });

    // Pending dedup keys for rounds (uses round uuid as key)
    const pending = await prisma.dedupCandidate.findMany({
      where: { entityType: "round", status: "pending" },
      select: { leftKey: true, rightKey: true },
    });
    const dedupKeys = new Set<string>();
    for (const d of pending) { dedupKeys.add(d.leftKey); dedupKeys.add(d.rightKey); }

    const data = result.records.map((r) => {
      const sourceCount = neoNumber(r.get("sourceCount"));
      const investorCount = neoNumber(r.get("investorCount"));
      const leadCount = neoNumber(r.get("leadCount"));
      const conf = (r.get("confidence") as number | null) ?? null;
      const stage = r.get("stage") as string | null;
      const country = r.get("country") as string | null;
      const effDate = neoToMs(r.get("effectiveDate"));
      const uuid = (r.get("uuid") as string | null) ?? "";

      const { score, breakdown } = scoreRound({
        llmConfidence: conf,
        sourceCount,
        hasStage: !!stage,
        hasLead: leadCount > 0,
        hasCountry: !!country,
        investorCount,
        effectiveDateMs: effDate,
      });

      const issues: string[] = [];
      if ((conf ?? 0) < 0.6) issues.push("low-confidence");
      if (sourceCount <= 1) issues.push("single-source");
      if (leadCount === 0) issues.push("no-lead");
      if (!stage) issues.push("no-stage");
      if (!country) issues.push("no-country");
      if (investorCount === 0) issues.push("no-investors");
      if (dedupKeys.has(uuid)) issues.push("dedup-pending");

      return {
        uuid,
        companyName: r.get("companyName") as string | null,
        companyKey: r.get("companyKey") as string | null,
        companyLogoUrl: r.get("companyLogoUrl") as string | null,
        amountUsd: r.get("amountUsd") != null ? neoNumber(r.get("amountUsd")) : null,
        stage,
        country,
        leadName: r.get("leadName") as string | null,
        confidence: conf,
        sourceCount,
        investorCount,
        effectiveDate: r.get("effectiveDate") ? String(r.get("effectiveDate")) : null,
        score,
        tier: tierOf(score),
        breakdown,
        issues,
      };
    });

    const filtered = tier ? data.filter((r) => r.tier === tier) : data;
    filtered.sort((a, b) => a.score - b.score); // worst first

    return NextResponse.json({ data: filtered, total: filtered.length });
  } catch (error) {
    console.error("v1/quality/rounds error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compute round quality" },
      { status: 500 }
    );
  } finally {
    await session.close();
  }
}
