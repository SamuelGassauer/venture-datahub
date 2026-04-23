import { NextRequest, NextResponse } from "next/server";
import neo4j from "neo4j-driver";
import driver from "@/lib/neo4j";
import { requireApiKey } from "@/lib/api-auth";
import { EUROPE_CYPHER_LIST } from "@/lib/european-countries";

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
  const fund = searchParams.get("fund");
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

  const conditions: string[] = [];
  const params: Record<string, unknown> = { skip: neo4j.int(skip), limit: neo4j.int(limit + 1) };

  if (updatedSince) { conditions.push(`(fr.updatedAt >= datetime($updatedSince) OR fr.createdAt >= datetime($updatedSince))`); params.updatedSince = updatedSince; }
  if (stage) { conditions.push(`toLower(fr.stage) = toLower($stage)`); params.stage = stage; }
  if (minAmount) { conditions.push(`fr.amountUsd >= $minAmount`); params.minAmount = parseFloat(minAmount); }
  if (maxAmount) { conditions.push(`fr.amountUsd <= $maxAmount`); params.maxAmount = parseFloat(maxAmount); }
  if (fund) { conditions.push(`(inv.uuid = $fund OR toLower(inv.name) CONTAINS toLower($fund))`); params.fund = fund; }
  if (startup) { conditions.push(`(c.uuid = $startup OR toLower(c.name) CONTAINS toLower($startup))`); params.startup = startup; }

  if (country && country.toLowerCase() !== "all") {
    conditions.push(`c.country = $country`);
    params.country = country;
  } else if (!country) {
    conditions.push(`c.country IN ${EUROPE_CYPHER_LIST}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const sortField = sortBy === "amount" ? "fr.amountUsd" : "effectiveDate";

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
        MATCH (inv:InvestorOrg)-[rel:PARTICIPATED_IN]->(fr:FundingRound)<-[:RAISED]-(c:Company)
        ${whereClause}
        OPTIONAL MATCH (fr)-[:SOURCED_FROM]->(a:Article)
        WITH inv, rel, fr, c, min(a.publishedAt) AS articleDate
        OPTIONAL MATCH (coInv:InvestorOrg)-[:PARTICIPATED_IN]->(fr)
        WHERE coInv.name <> inv.name
        WITH inv.uuid AS fundUuid, inv.name AS fundName,
             rel.role AS role,
             fr.uuid AS roundUuid, fr.amountUsd AS amountUsd, fr.currency AS currency,
             fr.stage AS stage, fr.confidence AS confidence,
             fr.announcedDate AS announcedDate,
             c.uuid AS startupUuid, c.name AS startupName, c.normalizedName AS startupNormalizedName,
             COALESCE(fr.announcedDate, articleDate) AS effectiveDate,
             articleDate,
             collect(DISTINCT coInv.name) AS coInvestorNames
        RETURN fundUuid, fundName, role, roundUuid, startupUuid, startupName, startupNormalizedName,
               amountUsd, currency, stage, confidence, announcedDate, articleDate, effectiveDate, coInvestorNames
        ORDER BY ${sortField} ${sortDir}
        SKIP $skip LIMIT $limit
      `, params),
      runRead(`
        MATCH (inv:InvestorOrg)-[rel:PARTICIPATED_IN]->(fr:FundingRound)<-[:RAISED]-(c:Company)
        ${whereClause}
        RETURN count(*) AS total
      `, params),
    ]);

    const hasMore = dataRes.records.length > limit;
    const records = dataRes.records.slice(0, limit);
    const totalCount = toNum(countRes.records[0]?.get("total")) ?? 0;

    const data = records.map((r) => {
      const fundUuid = toStr(r.get("fundUuid"));
      const roundUuid = toStr(r.get("roundUuid"));
      const startupUuid = toStr(r.get("startupUuid"));
      const startupId = startupUuid || toStr(r.get("startupNormalizedName"));
      const announcedDate = toStr(r.get("announcedDate"));
      const articleDate = toStr(r.get("articleDate"));
      const effectiveDate = announcedDate || (articleDate ? articleDate.substring(0, 10) : null);
      const coInvestorNames = (r.get("coInvestorNames") as (string | null)[]).filter(Boolean) as string[];

      return {
        externalId: fundUuid && roundUuid ? `${fundUuid}__${roundUuid}` : null,
        fundExternalId: fundUuid,
        fundName: toStr(r.get("fundName")),
        startupExternalId: startupId,
        startupName: toStr(r.get("startupName")),
        investmentDate: effectiveDate,
        investmentAmountUsd: null,
        totalRoundSizeUsd: toNum(r.get("amountUsd")),
        stage: toStr(r.get("stage")),
        role: mapRole(r.get("role") as string | null),
        confidence: toNum(r.get("confidence")),
        coInvestors: coInvestorNames,
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
    console.error("v1/investments error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function mapRole(role: string | null): string {
  if (!role) return "FOLLOW";
  if (role.toLowerCase() === "lead") return "LEAD";
  return "FOLLOW";
}
