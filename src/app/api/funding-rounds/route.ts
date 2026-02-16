import { NextRequest, NextResponse } from "next/server";
import driver from "@/lib/neo4j";
import { prisma } from "@/lib/db";
import { requireApiKey } from "@/lib/api-auth";
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

/**
 * GET /api/funding-rounds
 *
 * Public API (API-key protected) that returns all funding rounds
 * ready for display on the news website, including company info,
 * investors with logos, and post content.
 *
 * Auth: Authorization: ApiKey <PUBLIC_API_KEY>
 *
 * Query params:
 *   ?status=published  — only rounds with published posts
 *   ?status=all        — all rounds (default)
 *   ?since=2026-01-01  — only rounds with articleDate >= since
 */
export async function GET(request: NextRequest) {
  const authError = requireApiKey(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "all";
  const since = searchParams.get("since");

  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(`
      MATCH (c:Company)-[:RAISED]->(fr:FundingRound)
      OPTIONAL MATCH (inv:InvestorOrg)-[pi:PARTICIPATED_IN]->(fr)
      OPTIONAL MATCH (fr)-[:SOURCED_FROM]->(a:Article)
      WITH c, fr,
           collect(DISTINCT {
             name: inv.name,
             logoUrl: inv.logoUrl,
             role: pi.role
           }) AS investorDetails,
           max(a.publishedAt) AS articleDate,
           collect(DISTINCT a.url)[0] AS sourceUrl
      RETURN c.name AS companyName,
             c.country AS country,
             c.description AS description,
             c.logoUrl AS logoUrl,
             c.website AS companyWebsite,
             fr.amountUsd AS amountUsd,
             fr.stage AS stage,
             investorDetails,
             articleDate,
             sourceUrl,
             id(fr) AS neo4jId
      ORDER BY articleDate DESC, fr.amountUsd DESC
    `);

    const rounds = result.records.map((r) => {
      const companyName = r.get("companyName") as string;
      const amountUsd = toNumber(r.get("amountUsd"));
      const stage = r.get("stage") as string | null;
      const neo4jId = toNumber(r.get("neo4jId"));
      const roundKey = `${companyName.toLowerCase().replace(/[^a-z0-9]/g, "")}_${(stage || "unknown").toLowerCase()}_${neo4jId}`;
      const rawDate = r.get("articleDate");

      // Parse investor details
      const rawInvestors = r.get("investorDetails") as Array<{
        name: string | null;
        logoUrl: string | null;
        role: string | null;
      }>;
      const investors = rawInvestors
        .filter((i) => i.name)
        .reduce<Array<{ name: string; logoUrl: string | null; isLead: boolean }>>(
          (acc, i) => {
            const existing = acc.find((x) => x.name === i.name);
            if (existing) {
              if (i.role === "lead") existing.isLead = true;
            } else {
              acc.push({
                name: i.name!,
                logoUrl: i.logoUrl ?? null,
                isLead: i.role === "lead",
              });
            }
            return acc;
          },
          []
        );

      return {
        roundKey,
        company: {
          name: companyName,
          description: r.get("description") as string | null,
          logoUrl: r.get("logoUrl") as string | null,
          website: r.get("companyWebsite") as string | null,
          country: r.get("country") as string | null,
        },
        funding: {
          amountUsd,
          amountEur: convertToEur(amountUsd),
          stage,
          currency: "EUR",
        },
        investors,
        articleDate: rawDate ? String(rawDate) : null,
        sourceUrl: r.get("sourceUrl") as string | null,
      };
    });

    // Enrich with post data from Prisma
    const roundKeys = rounds.map((r) => r.roundKey);
    const posts = await prisma.post.findMany({
      where: { fundingRoundKey: { in: roundKeys } },
      select: {
        fundingRoundKey: true,
        content: true,
        publishedAt: true,
      },
    });
    const postMap = new Map(posts.map((p) => [p.fundingRoundKey, p]));

    let data = rounds.map((r) => {
      const post = postMap.get(r.roundKey);
      return {
        ...r,
        post: post
          ? {
              content: post.content,
              publishedAt: post.publishedAt?.toISOString() ?? null,
            }
          : null,
      };
    });

    // Filter by status
    if (status === "published") {
      data = data.filter((r) => r.post?.publishedAt);
    } else if (status === "with_post") {
      data = data.filter((r) => r.post);
    }

    // Filter by since
    if (since) {
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate.getTime())) {
        data = data.filter(
          (r) => r.articleDate && new Date(r.articleDate) >= sinceDate
        );
      }
    }

    return NextResponse.json({ data, total: data.length });
  } catch (error) {
    console.error("Public funding-rounds API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch funding rounds" },
      { status: 500 }
    );
  } finally {
    await session.close();
  }
}
