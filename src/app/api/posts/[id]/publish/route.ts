import { NextRequest, NextResponse } from "next/server";
import driver from "@/lib/neo4j";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const INVENTURE_API_URL =
  process.env.INVENTURE_API_URL || "https://www.inventure.capital";
const INVENTURE_API_KEY = process.env.INVENTURE_API_KEY || "";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;

  try {
    // Load the post from Prisma
    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Parse neo4jId from fundingRoundKey (format: normalizedcompany_stage_neo4jId)
    const parts = post.fundingRoundKey.split("_");
    const neo4jId = parseInt(parts[parts.length - 1], 10);

    // Fetch company + investor data from Neo4j
    const session = driver.session({ defaultAccessMode: "READ" });
    try {
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
               c.logoUrl AS logoUrl,
               fr.amountUsd AS amountUsd,
               fr.stage AS stage,
               leadInvestor,
               allInvestors
        `,
        { neo4jId }
      );

      if (result.records.length === 0) {
        return NextResponse.json(
          { error: "Funding round not found in Neo4j" },
          { status: 404 }
        );
      }

      const rec = result.records[0];
      const companyName = rec.get("companyName") as string;
      const country = rec.get("country") as string | null;
      const description = rec.get("description") as string | null;
      const logoUrl = rec.get("logoUrl") as string | null;
      const stage = rec.get("stage") as string | null;
      const leadInvestor = rec.get("leadInvestor") as string | null;
      const allInvestors = (rec.get("allInvestors") as string[]).filter(
        Boolean
      );

      // Build payload for inventure.capital API
      const payload = {
        startup: {
          name: companyName,
          description: description || undefined,
          logoUrl: logoUrl || undefined,
          country: country || undefined,
        },
        funding: {
          round: stage || undefined,
          amount: post.amountEur || undefined,
          currency: "EUR",
        },
        investors: allInvestors.map((name) => ({
          name,
          leadInvestor: name === leadInvestor,
        })),
        article: {
          content: post.content,
        },
      };

      // Send to inventure.capital
      const url = `${INVENTURE_API_URL}/api/funding-rounds`;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (INVENTURE_API_KEY) {
        headers["Authorization"] = `Bearer ${INVENTURE_API_KEY}`;
      }
      console.log("[publish] POST", url);
      console.log("[publish] Authorization header:", headers["Authorization"]?.slice(0, 30) + "...");
      console.log("[publish] Full payload:", JSON.stringify(payload, null, 2));
      const apiRes = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      const responseBody = await apiRes.text();
      console.log("[publish] response:", apiRes.status, apiRes.statusText);
      console.log("[publish] response headers:", Object.fromEntries(apiRes.headers.entries()));
      console.log("[publish] response body:", responseBody.slice(0, 500));

      // Re-parse for downstream logic
      const apiResOk = apiRes.status === 201 || (apiRes.status >= 200 && apiRes.status < 300);

      if (apiResOk) {
        // Success: update publishedAt
        const updated = await prisma.post.update({
          where: { id },
          data: { publishedAt: new Date(), publishError: null },
        });
        return NextResponse.json({
          success: true,
          publishedAt: updated.publishedAt,
        });
      } else {
        // Error from external API
        await prisma.post.update({
          where: { id },
          data: { publishError: `${apiRes.status}: ${responseBody}` },
        });
        return NextResponse.json(
          { error: `Publish failed: ${apiRes.status}`, details: responseBody },
          { status: 502 }
        );
      }
    } finally {
      await session.close();
    }
  } catch (error) {
    console.error("Publish error:", error);
    // Store error on the post
    await prisma.post
      .update({
        where: { id },
        data: {
          publishError:
            error instanceof Error ? error.message : "Unknown error",
        },
      })
      .catch(() => {});
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to publish post",
      },
      { status: 500 }
    );
  }
}
