import { NextRequest, NextResponse } from "next/server";
import driver from "@/lib/neo4j";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const { roundKeys } = (await request.json()) as { roundKeys: string[] };
  if (!roundKeys?.length) {
    return NextResponse.json({ error: "roundKeys required" }, { status: 400 });
  }

  // Extract neo4j IDs from roundKeys (format: companyslug_stage_neo4jId)
  const neo4jIds = roundKeys
    .map((k) => {
      const parts = k.split("_");
      return parseInt(parts[parts.length - 1], 10);
    })
    .filter((id) => !isNaN(id));

  const session = driver().session({ defaultAccessMode: "WRITE" });

  try {
    // Delete FundingRound nodes + all relationships from Neo4j
    const result = await session.run(
      `UNWIND $ids AS frId
       MATCH (fr:FundingRound) WHERE id(fr) = frId
       DETACH DELETE fr
       RETURN count(*) AS deleted`,
      { ids: neo4jIds },
    );
    const deletedNeo4j = result.records[0]?.get("deleted")?.toNumber?.() ?? 0;

    // Delete associated posts from Prisma
    const deletedPosts = await prisma.post.deleteMany({
      where: { fundingRoundKey: { in: roundKeys } },
    });

    return NextResponse.json({
      success: true,
      deletedRounds: deletedNeo4j,
      deletedPosts: deletedPosts.count,
    });
  } catch (e) {
    console.error("Reject rounds error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 },
    );
  } finally {
    await session.close();
  }
}
