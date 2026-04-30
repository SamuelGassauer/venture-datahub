import { NextRequest, NextResponse } from "next/server";
import driver from "@/lib/neo4j";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { scoreInvestor, neoToMs, neoNumber, tierOf } from "@/lib/quality";

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
      MATCH (inv:InvestorOrg)
      OPTIONAL MATCH (inv)-[p:PARTICIPATED_IN]->(fr:FundingRound)
      WITH inv,
           count(DISTINCT fr) AS dealCount,
           sum(CASE WHEN p.role = 'lead' THEN 1 ELSE 0 END) AS leadCount,
           sum(fr.amountUsd) AS totalDeployed,
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
      RETURN inv.name AS name,
             inv.normalizedName AS normalizedName,
             inv.logoUrl AS logoUrl,
             inv.type AS type,
             inv.hqCity AS hqCity,
             inv.hqCountry AS hqCountry,
             inv.website AS website,
             inv.linkedinUrl AS linkedinUrl,
             COALESCE(inv.stageFocus, []) AS stageFocus,
             COALESCE(inv.sectorFocus, []) AS sectorFocus,
             COALESCE(inv.geoFocus, []) AS geoFocus,
             inv.enrichedAt AS enrichedAt,
             dealCount,
             leadCount,
             totalDeployed,
             enrichScore
      ORDER BY dealCount DESC
      LIMIT toInteger($limit)
    `, { limit });

    const pending = await prisma.dedupCandidate.findMany({
      where: { entityType: "investor", status: "pending" },
      select: { leftKey: true, rightKey: true },
    });
    const dedupKeys = new Set<string>();
    for (const d of pending) { dedupKeys.add(d.leftKey); dedupKeys.add(d.rightKey); }

    const data = result.records.map((r) => {
      const enrichScore = neoNumber(r.get("enrichScore"));
      const dealCount = neoNumber(r.get("dealCount"));
      const enrichedAtMs = neoToMs(r.get("enrichedAt"));
      const normalizedName = (r.get("normalizedName") as string | null) ?? "";
      const stageFocus = (r.get("stageFocus") as string[] | null) ?? [];
      const sectorFocus = (r.get("sectorFocus") as string[] | null) ?? [];
      const geoFocus = (r.get("geoFocus") as string[] | null) ?? [];
      const duplicated = dedupKeys.has(normalizedName);

      const { score, breakdown } = scoreInvestor({
        enrichScore,
        dealCount,
        stageFocusFilled: stageFocus.length > 0,
        sectorFocusFilled: sectorFocus.length > 0,
        geoFocusFilled: geoFocus.length > 0,
        enrichedAtMs,
        duplicated,
      });

      const issues: string[] = [];
      if (!r.get("type")) issues.push("no-type");
      if (!r.get("hqCountry")) issues.push("no-hq-country");
      if (!r.get("website")) issues.push("no-website");
      if (!r.get("logoUrl")) issues.push("no-logo");
      if (stageFocus.length === 0) issues.push("no-stage-focus");
      if (sectorFocus.length === 0) issues.push("no-sector-focus");
      if (geoFocus.length === 0) issues.push("no-geo-focus");
      if (dealCount === 0) issues.push("no-deals");
      if (enrichedAtMs == null) issues.push("never-enriched");
      if (duplicated) issues.push("dedup-pending");

      return {
        name: r.get("name") as string | null,
        normalizedName,
        logoUrl: r.get("logoUrl") as string | null,
        type: r.get("type") as string | null,
        hqCity: r.get("hqCity") as string | null,
        hqCountry: r.get("hqCountry") as string | null,
        website: r.get("website") as string | null,
        linkedinUrl: r.get("linkedinUrl") as string | null,
        stageFocus,
        sectorFocus,
        geoFocus,
        enrichedAt: r.get("enrichedAt") ? String(r.get("enrichedAt")) : null,
        dealCount,
        leadCount: neoNumber(r.get("leadCount")),
        totalDeployed: r.get("totalDeployed") != null ? neoNumber(r.get("totalDeployed")) : 0,
        enrichScore,
        score,
        tier: tierOf(score),
        breakdown,
        issues,
      };
    });

    const filtered = tier ? data.filter((i) => i.tier === tier) : data;
    filtered.sort((a, b) => a.score - b.score); // worst first

    return NextResponse.json({ data: filtered, total: filtered.length });
  } catch (error) {
    console.error("v1/quality/investors error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compute investor quality" },
      { status: 500 }
    );
  } finally {
    await session.close();
  }
}
