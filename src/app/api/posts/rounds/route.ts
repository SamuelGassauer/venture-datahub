import { NextResponse } from "next/server";
import driver from "@/lib/neo4j";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { convertToEur } from "@/lib/post-generator";

export const dynamic = "force-dynamic";

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  if (typeof value === "object" && "toNumber" in value) {
    return (value as { toNumber(): number }).toNumber();
  }
  return null;
}

export type RoundWithPostStatus = {
  roundKey: string;
  companyName: string;
  amountUsd: number | null;
  amountEur: number | null;
  stage: string | null;
  country: string | null;
  leadInvestor: string | null;
  allInvestors: string[];
  logoUrl: string | null;
  description: string | null;
  articleDate: string | null;
  hasPost: boolean;
  postId: string | null;
  postContent: string | null;
  publishedAt: string | null;
};

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(`
      MATCH (c:Company)-[:RAISED]->(fr:FundingRound)
      OPTIONAL MATCH (lead:InvestorOrg)-[:PARTICIPATED_IN {role: 'lead'}]->(fr)
      OPTIONAL MATCH (inv:InvestorOrg)-[:PARTICIPATED_IN]->(fr)
      OPTIONAL MATCH (fr)-[:SOURCED_FROM]->(a:Article)
      WITH c, fr,
           collect(DISTINCT lead.name)[0] AS leadInvestor,
           collect(DISTINCT inv.name) AS allInvestors,
           max(a.publishedAt) AS articleDate
      RETURN c.name AS companyName,
             c.country AS country,
             c.description AS description,
             c.logoUrl AS logoUrl,
             fr.amountUsd AS amountUsd,
             fr.stage AS stage,
             leadInvestor,
             allInvestors,
             articleDate,
             id(fr) AS neo4jId
      ORDER BY articleDate DESC, fr.amountUsd DESC
    `);

    const rounds = result.records.map((r) => {
      const companyName = r.get("companyName") as string;
      const amountUsd = toNumber(r.get("amountUsd"));
      const stage = r.get("stage") as string | null;
      const neo4jId = toNumber(r.get("neo4jId"));

      // Build a stable key from company + stage + neo4jId
      const roundKey = `${companyName.toLowerCase().replace(/[^a-z0-9]/g, "")}_${(stage || "unknown").toLowerCase()}_${neo4jId}`;

      const rawDate = r.get("articleDate");
      const articleDate = rawDate ? String(rawDate) : null;

      return {
        roundKey,
        companyName,
        amountUsd,
        amountEur: convertToEur(amountUsd),
        stage,
        country: r.get("country") as string | null,
        leadInvestor: r.get("leadInvestor") as string | null,
        allInvestors: (r.get("allInvestors") as string[]).filter(Boolean),
        logoUrl: r.get("logoUrl") as string | null,
        description: r.get("description") as string | null,
        articleDate,
      };
    });

    // Match with existing posts
    const roundKeys = rounds.map((r) => r.roundKey);
    const existingPosts = await prisma.post.findMany({
      where: { fundingRoundKey: { in: roundKeys } },
      select: { id: true, fundingRoundKey: true, content: true, publishedAt: true },
    });
    const postMap = new Map(existingPosts.map((p) => [p.fundingRoundKey, p]));

    const data: RoundWithPostStatus[] = rounds.map((r) => {
      const post = postMap.get(r.roundKey);
      return {
        ...r,
        articleDate: r.articleDate,
        hasPost: !!post,
        postId: post?.id ?? null,
        postContent: post?.content ?? null,
        publishedAt: post?.publishedAt?.toISOString() ?? null,
      };
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Posts rounds error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch rounds" },
      { status: 500 }
    );
  } finally {
    await session.close();
  }
}
