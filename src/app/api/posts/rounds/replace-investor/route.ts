import { NextRequest, NextResponse } from "next/server";
import driver from "@/lib/neo4j";
import { requireAdmin } from "@/lib/api-auth";
import { normalizeInvestor } from "@/lib/graph-sync";

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const { roundKey, oldInvestorName, newInvestorName } = await request.json();
  if (!roundKey || !oldInvestorName || !newInvestorName) {
    return NextResponse.json(
      { error: "roundKey, oldInvestorName, and newInvestorName required" },
      { status: 400 },
    );
  }

  const parts = roundKey.split("_");
  const neo4jId = parseInt(parts[parts.length - 1], 10);
  if (isNaN(neo4jId)) {
    return NextResponse.json({ error: "Invalid roundKey" }, { status: 400 });
  }

  const oldNorm = normalizeInvestor(oldInvestorName);
  const newNorm = normalizeInvestor(newInvestorName);
  const session = driver().session();

  try {
    // Get the old relationship's role (lead/participant) before deleting
    const oldResult = await session.run(
      `MATCH (i:InvestorOrg {normalizedName: $oldNorm})-[r:PARTICIPATED_IN]->(fr:FundingRound)
       WHERE id(fr) = $neo4jId
       RETURN r.role AS role`,
      { oldNorm, neo4jId },
    );
    const role = oldResult.records[0]?.get("role") ?? "participant";

    // Delete old relationship
    await session.run(
      `MATCH (i:InvestorOrg {normalizedName: $oldNorm})-[r:PARTICIPATED_IN]->(fr:FundingRound)
       WHERE id(fr) = $neo4jId
       DELETE r`,
      { oldNorm, neo4jId },
    );

    // MERGE new investor node + create relationship with same role
    const newResult = await session.run(
      `MATCH (fr:FundingRound) WHERE id(fr) = $neo4jId
       MERGE (i:InvestorOrg {normalizedName: $newNorm})
         ON CREATE SET i.name = $newName, i.uuid = randomUUID()
       MERGE (i)-[r:PARTICIPATED_IN]->(fr)
         SET r.role = $role
       RETURN i.name AS name, i.logoUrl AS logoUrl, i.website AS website, i.hq AS hq`,
      { neo4jId, newNorm, newName: newInvestorName, role },
    );

    const rec = newResult.records[0];
    const investor = rec
      ? {
          name: rec.get("name") as string,
          logoUrl: (rec.get("logoUrl") as string | null) ?? null,
          website: (rec.get("website") as string | null) ?? null,
          hq: (rec.get("hq") as string | null) ?? null,
        }
      : { name: newInvestorName, logoUrl: null, website: null, hq: null };

    return NextResponse.json({ success: true, investor });
  } finally {
    await session.close();
  }
}
