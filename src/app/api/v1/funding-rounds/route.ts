import { NextRequest, NextResponse } from "next/server";
import neo4j from "neo4j-driver";
import driver from "@/lib/neo4j";
import { requireApiKey } from "@/lib/api-auth";
import { EUROPE_CYPHER_LIST } from "@/lib/european-countries";
import { getPostedRoundIds, parsePostedMode } from "@/lib/posted-rounds";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 50;

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
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT)) || DEFAULT_LIMIT, 1), MAX_LIMIT);

  // Filters
  const investor = searchParams.get("investor");
  const startup = searchParams.get("startup");
  const stage = searchParams.get("stage");
  const country = searchParams.get("country");
  const minAmount = searchParams.get("min_amount");
  const maxAmount = searchParams.get("max_amount");
  const sortBy = searchParams.get("sort") || "date";
  const sortDir = searchParams.get("dir") === "asc" ? "ASC" : "DESC";

  let skip = 0;
  if (cursorParam) {
    try {
      const decoded = JSON.parse(Buffer.from(cursorParam, "base64").toString());
      skip = decoded.skip || 0;
    } catch { /* invalid cursor */ }
  }

  const postedMode = parsePostedMode(searchParams);
  const conditions: string[] = [];
  const params: Record<string, unknown> = { skip: neo4j.int(skip), limit: neo4j.int(limit + 1) };

  if (postedMode === "posted") {
    const postedIds = await getPostedRoundIds();
    if (postedIds.length === 0) {
      return NextResponse.json({
        data: [],
        pagination: { cursor: null, hasMore: false, totalCount: 0, totalCountApproximate: false },
      });
    }
    conditions.push(`id(fr) IN $postedIds`);
    params.postedIds = postedIds;
  }

  if (updatedSince) { conditions.push(`(fr.updatedAt >= datetime($updatedSince) OR fr.createdAt >= datetime($updatedSince))`); params.updatedSince = updatedSince; }
  if (stage) { conditions.push(`toLower(fr.stage) = toLower($stage)`); params.stage = stage; }
  if (minAmount) { conditions.push(`fr.amountUsd >= $minAmount`); params.minAmount = parseFloat(minAmount); }
  if (maxAmount) { conditions.push(`fr.amountUsd <= $maxAmount`); params.maxAmount = parseFloat(maxAmount); }

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

  const sortField = sortBy === "amount" ? "amountUsd" : "effectiveDate";

  // One session per concurrent query — serialized session + Promise.all throws 50N42.
  const runRead = async (cypher: string, queryParams: Record<string, unknown>) => {
    const s = driver().session({ defaultAccessMode: "READ" });
    try {
      return await s.run(cypher, queryParams);
    } finally {
      await s.close();
    }
  };

  try {
    const [dataRes, countRes] = await Promise.all([
      runRead(`
        MATCH (fr:FundingRound)<-[:RAISED]-(c:Company)
        ${whereClause}
        OPTIONAL MATCH (fr)-[:SOURCED_FROM]->(a:Article)
        WITH fr, c, min(a.publishedAt) AS articleDate
        OPTIONAL MATCH (allInv:InvestorOrg)-[rel:PARTICIPATED_IN]->(fr)
        WITH fr.uuid AS roundUuid, fr.amount AS originalAmount, fr.amountUsd AS amountUsd,
             fr.currency AS currency, fr.fxRate AS fxRate,
             fr.stage AS stage, fr.confidence AS confidence,
             fr.announcedDate AS announcedDate,
             c.uuid AS startupUuid, c.name AS startupName, c.normalizedName AS startupNormalizedName,
             COALESCE(fr.announcedDate, articleDate) AS effectiveDate,
             articleDate,
             collect({ uuid: allInv.uuid, name: allInv.name, role: rel.role }) AS investors
        ${investorCondition}
        RETURN roundUuid, startupUuid, startupName, startupNormalizedName,
               originalAmount, amountUsd, currency, fxRate, stage, confidence,
               announcedDate, articleDate, effectiveDate, investors
        ORDER BY ${sortField} ${sortDir}
        SKIP $skip LIMIT $limit
      `, params),
      // totalCount: full filter pipeline, but no per-round projection — just count.
      // When `investor` filter is set, we must still resolve the investors list
      // to apply the post-collect predicate, so we replay the same pipeline.
      runRead(`
        MATCH (fr:FundingRound)<-[:RAISED]-(c:Company)
        ${whereClause}
        OPTIONAL MATCH (allInv:InvestorOrg)-[rel:PARTICIPATED_IN]->(fr)
        WITH fr,
             collect({ uuid: allInv.uuid, name: allInv.name, role: rel.role }) AS investors
        ${investorCondition}
        RETURN count(fr) AS total
      `, params),
    ]);

    const hasMore = dataRes.records.length > limit;
    const records = dataRes.records.slice(0, limit);
    const totalCount = toNum(countRes.records[0]?.get("total")) ?? 0;

    const data = records.map((r) => {
      const roundUuid = toStr(r.get("roundUuid"));
      const startupUuid = toStr(r.get("startupUuid"));
      const startupId = startupUuid || toStr(r.get("startupNormalizedName"));
      const announcedDate = toStr(r.get("announcedDate"));
      const articleDate = toStr(r.get("articleDate"));
      const effectiveDate = announcedDate || (articleDate ? articleDate.substring(0, 10) : null);
      const rawInvestors = r.get("investors") as { uuid: string | null; name: string | null; role: string | null }[];

      return {
        roundExternalId: roundUuid,
        startupExternalId: startupId,
        startupName: toStr(r.get("startupName")),
        investmentDate: effectiveDate,
        originalAmount: toNum(r.get("originalAmount")) || null,
        totalRoundSizeUsd: toNum(r.get("amountUsd")),
        currency: toStr(r.get("currency")),
        fxRate: toNum(r.get("fxRate")) || null,
        stage: toStr(r.get("stage")),
        confidence: toNum(r.get("confidence")),
        investors: rawInvestors
          .filter((i) => i.name)
          .map((i) => ({
            externalId: toStr(i.uuid),
            name: toStr(i.name),
            role: mapRole(i.role),
          })),
        updatedAt: effectiveDate || new Date().toISOString(),
      };
    });

    const nextCursor = hasMore
      ? Buffer.from(JSON.stringify({ skip: skip + limit })).toString("base64")
      : null;

    return NextResponse.json({
      data,
      pagination: { cursor: nextCursor, hasMore, totalCount, totalCountApproximate: false },
    });
  } catch (error) {
    console.error("v1/funding-rounds error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function mapRole(role: string | null): string {
  if (!role) return "FOLLOW";
  if (role.toLowerCase() === "lead") return "LEAD";
  return "FOLLOW";
}
