import { NextRequest, NextResponse } from "next/server";
import driver from "@/lib/neo4j";
import { prisma } from "@/lib/db";
import { generatePost, fmtEur, convertToEur } from "@/lib/post-generator";

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  if (typeof value === "object" && "toNumber" in value) {
    return (value as { toNumber(): number }).toNumber();
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { roundKey } = (await request.json()) as { roundKey: string };
    if (!roundKey) {
      return NextResponse.json({ error: "roundKey required" }, { status: 400 });
    }

    // Parse the roundKey to extract company info
    // roundKey format: normalizedcompany_stage_neo4jId
    const parts = roundKey.split("_");
    const neo4jId = parseInt(parts[parts.length - 1], 10);

    const session = driver.session({ defaultAccessMode: "READ" });
    try {
      // Fetch the specific funding round + company data
      const result = await session.run(
        `
        MATCH (c:Company)-[:RAISED]->(fr:FundingRound)
        WHERE id(fr) = $neo4jId
        OPTIONAL MATCH (lead:InvestorOrg)-[:PARTICIPATED_IN {role: 'lead'}]->(fr)
        OPTIONAL MATCH (inv:InvestorOrg)-[:PARTICIPATED_IN]->(fr)
        WITH c, fr,
             collect(DISTINCT lead.name)[0] AS leadInvestor,
             collect(DISTINCT inv.name) AS allInvestors
        RETURN c.name AS companyName,
               c.country AS country,
               c.description AS description,
               fr.amountUsd AS amountUsd,
               fr.stage AS stage,
               leadInvestor,
               allInvestors
        `,
        { neo4jId: neo4jId }
      );

      if (result.records.length === 0) {
        return NextResponse.json({ error: "Funding round not found" }, { status: 404 });
      }

      const rec = result.records[0];
      const companyName = rec.get("companyName") as string;
      const amountUsd = toNumber(rec.get("amountUsd"));
      const stage = rec.get("stage") as string | null;
      const country = rec.get("country") as string | null;
      const description = rec.get("description") as string | null;
      const leadInvestor = rec.get("leadInvestor") as string | null;
      const allInvestors = (rec.get("allInvestors") as string[]).filter(Boolean);

      // Fetch funding history for this company
      const historyResult = await session.run(
        `
        MATCH (c:Company {name: $name})-[:RAISED]->(fr:FundingRound)
        WHERE id(fr) <> $neo4jId
        OPTIONAL MATCH (fr)-[:SOURCED_FROM]->(a:Article)
        WITH fr, collect(DISTINCT a.publishedAt)[0] AS publishedAt
        RETURN fr.stage AS stage,
               fr.amountUsd AS amountUsd,
               publishedAt
        ORDER BY publishedAt ASC
        `,
        { name: companyName, neo4jId: neo4jId }
      );

      const fundingHistory = historyResult.records.map((r) => ({
        stage: (r.get("stage") as string) || "Unknown",
        amountUsd: toNumber(r.get("amountUsd")),
        date: r.get("publishedAt") as string | null,
      }));

      // Calculate total raised
      const allRoundsResult = await session.run(
        `
        MATCH (c:Company {name: $name})-[:RAISED]->(fr:FundingRound)
        RETURN sum(fr.amountUsd) AS total
        `,
        { name: companyName }
      );
      const totalRaised = toNumber(allRoundsResult.records[0]?.get("total"));

      // Generate post via LLM
      const amountEur = convertToEur(amountUsd);
      const content = await generatePost({
        companyName,
        amountUsd,
        amountEur: fmtEur(amountUsd),
        stage,
        country,
        description,
        leadInvestor,
        allInvestors,
        fundingHistory,
        totalRaised,
      });

      // Upsert post in Prisma
      const post = await prisma.post.upsert({
        where: { fundingRoundKey: roundKey },
        create: {
          fundingRoundKey: roundKey,
          companyName,
          amountEur,
          stage,
          content,
        },
        update: {
          content,
          amountEur,
        },
      });

      return NextResponse.json({
        post: {
          id: post.id,
          content: post.content,
          amountEur: post.amountEur,
          createdAt: post.createdAt,
        },
      });
    } finally {
      await session.close();
    }
  } catch (error) {
    console.error("Generate post error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate post" },
      { status: 500 }
    );
  }
}
