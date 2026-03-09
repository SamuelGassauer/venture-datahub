import { NextRequest, NextResponse } from "next/server";
import neo4j from "neo4j-driver";
import driver from "@/lib/neo4j";
import { requireApiKey } from "@/lib/api-auth";
import { EUROPE_CYPHER_LIST } from "@/lib/european-countries";

export const dynamic = "force-dynamic";

function toNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "toNumber" in v) return (v as { toNumber(): number }).toNumber();
  return null;
}

function toStr(v: unknown): string | null {
  if (v == null) return null;
  return String(v);
}

export async function GET(request: NextRequest) {
  const authError = await requireApiKey(request, "data-provider", { allowPublic: true });
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const updatedSince = searchParams.get("updated_since");
  const cursorParam = searchParams.get("cursor");
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50") || 50, 1), 100);

  // Filters
  const investor = searchParams.get("investor");
  const startup = searchParams.get("startup");
  const stage = searchParams.get("stage");
  const country = searchParams.get("country");
  const minAmount = searchParams.get("min_amount");
  const maxAmount = searchParams.get("max_amount");
  const sortBy = searchParams.get("sort") || "date";
  const sortDir = searchParams.get("dir") === "asc" ? "ASC" : "DESC";

  const session = driver().session({ defaultAccessMode: "READ" });
  try {
    let skip = 0;
    if (cursorParam) {
      try {
        const decoded = JSON.parse(Buffer.from(cursorParam, "base64").toString());
        skip = decoded.skip || 0;
      } catch { /* invalid cursor */ }
    }

    const conditions: string[] = [];
    const params: Record<string, unknown> = { skip: neo4jInt(skip), limit: neo4jInt(limit + 1) };

    if (updatedSince) { conditions.push(`(fr.updatedAt >= datetime($updatedSince) OR fr.createdAt >= datetime($updatedSince))`); params.updatedSince = updatedSince; }
    if (stage) { conditions.push(`toLower(fr.stage) = toLower($stage)`); params.stage = stage; }
    if (minAmount) { conditions.push(`fr.amountUsd >= $minAmount`); params.minAmount = parseFloat(minAmount); }
    if (maxAmount) { conditions.push(`fr.amountUsd <= $maxAmount`); params.maxAmount = parseFloat(maxAmount); }

    // Country filter: defaults to Europe-only, pass country=all to disable
    if (country && country.toLowerCase() !== "all") {
      conditions.push(`c.country = $country`);
      params.country = country;
    } else if (!country) {
      conditions.push(`c.country IN ${EUROPE_CYPHER_LIST}`);
    }

    const investorCondition = investor ? `WHERE ANY(i IN investors WHERE i.uuid = $investor OR toLower(i.name) CONTAINS toLower($investor))` : "";
    if (investor) { params.investor = investor; }
    if (startup) { params.startup = startup; }

    const whereClause = conditions.length || startup
      ? `WHERE ${[...conditions, ...(startup ? [`(c.uuid = $startup OR toLower(c.name) CONTAINS toLower($startup))`] : [])].join(" AND ")}`
      : "";

    const sortField = sortBy === "amount" ? "amountUsd" : "articleDate";

    const result = await session.run(`
      MATCH (fr:FundingRound)<-[:RAISED]-(c:Company)
      ${whereClause}
      OPTIONAL MATCH (fr)-[:SOURCED_FROM]->(a:Article)
      WITH fr, c, min(a.publishedAt) AS articleDate
      OPTIONAL MATCH (allInv:InvestorOrg)-[rel:PARTICIPATED_IN]->(fr)
      WITH fr.uuid AS roundUuid, fr.amountUsd AS amountUsd, fr.currency AS currency,
           fr.stage AS stage, fr.confidence AS confidence,
           c.uuid AS startupUuid, c.name AS startupName, c.normalizedName AS startupNormalizedName,
           articleDate,
           collect({ uuid: allInv.uuid, name: allInv.name, role: rel.role }) AS investors
      ${investorCondition}
      RETURN roundUuid, startupUuid, startupName, startupNormalizedName,
             amountUsd, currency, stage, confidence, articleDate, investors
      ORDER BY ${sortField} ${sortDir}
      SKIP $skip LIMIT $limit
    `, params);

    const hasMore = result.records.length > limit;
    const records = result.records.slice(0, limit);

    const data = records.map((r) => {
      const roundUuid = toStr(r.get("roundUuid"));
      const startupUuid = toStr(r.get("startupUuid"));
      const startupId = startupUuid || toStr(r.get("startupNormalizedName"));
      const articleDate = toStr(r.get("articleDate"));
      const rawInvestors = r.get("investors") as { uuid: string | null; name: string | null; role: string | null }[];

      return {
        roundExternalId: roundUuid,
        startupExternalId: startupId,
        startupName: toStr(r.get("startupName")),
        investmentDate: articleDate ? articleDate.substring(0, 10) : null,
        totalRoundSizeUsd: toNum(r.get("amountUsd")),
        currency: toStr(r.get("currency")),
        stage: toStr(r.get("stage")),
        confidence: toNum(r.get("confidence")),
        investors: rawInvestors
          .filter((i) => i.name)
          .map((i) => ({
            externalId: toStr(i.uuid),
            name: toStr(i.name),
            role: mapRole(i.role),
          })),
        updatedAt: articleDate || new Date().toISOString(),
      };
    });

    const nextCursor = hasMore
      ? Buffer.from(JSON.stringify({ skip: skip + limit })).toString("base64")
      : null;

    return NextResponse.json({
      data,
      pagination: { cursor: nextCursor, hasMore },
    });
  } catch (error) {
    console.error("v1/funding-rounds error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    await session.close();
  }
}

function mapRole(role: string | null): string {
  if (!role) return "FOLLOW";
  if (role.toLowerCase() === "lead") return "LEAD";
  return "FOLLOW";
}

function neo4jInt(n: number) {
  return neo4j.int(n);
}
