import { NextRequest, NextResponse } from "next/server";
import driver from "@/lib/neo4j";
import { requireAdmin } from "@/lib/api-auth";
import { normalizeInvestor } from "@/lib/graph-sync";

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const { roundKey, investorName } = await request.json();
  if (!roundKey || !investorName) {
    return NextResponse.json(
      { error: "roundKey and investorName required" },
      { status: 400 },
    );
  }

  // Extract neo4jId from roundKey (format: companyslug_stage_neo4jId)
  const parts = roundKey.split("_");
  const neo4jId = parseInt(parts[parts.length - 1], 10);
  if (isNaN(neo4jId)) {
    return NextResponse.json({ error: "Invalid roundKey" }, { status: 400 });
  }

  const invNorm = normalizeInvestor(investorName);
  const session = driver().session();

  try {
    // Delete PARTICIPATED_IN relationship between this investor and the funding round
    const result = await session.run(
      `MATCH (i:InvestorOrg {normalizedName: $invNorm})-[r:PARTICIPATED_IN]->(fr:FundingRound)
       WHERE id(fr) = $neo4jId
       DELETE r
       RETURN count(r) AS deleted`,
      { invNorm, neo4jId },
    );

    const deleted = result.records[0]?.get("deleted")?.toNumber?.() ?? 0;

    return NextResponse.json({ success: true, deleted });
  } finally {
    await session.close();
  }
}
