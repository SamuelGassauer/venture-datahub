import { NextRequest, NextResponse } from "next/server";
import neo4j from "neo4j-driver";
import driver from "@/lib/neo4j";
import { requireApiKey } from "@/lib/api-auth";
import { EUROPE_CYPHER_LIST } from "@/lib/european-countries";
import { getPostedRoundIds, parsePostedMode } from "@/lib/posted-rounds";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 50;

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "toNumber" in v) return (v as { toNumber(): number }).toNumber();
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toStr(v: unknown): string | null {
  if (v == null) return null;
  return String(v);
}

function toStrArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v) return [v];
  return [];
}

export async function GET(request: NextRequest) {
  const authError = await requireApiKey(request, "data-provider", { allowPublic: true });
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const updatedSince = searchParams.get("updated_since");
  const cursorParam = searchParams.get("cursor");
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT)) || DEFAULT_LIMIT, 1), MAX_LIMIT);

  // Filters
  const idSearch = searchParams.get("id");
  const nameSearch = searchParams.get("name");
  const country = searchParams.get("country");
  const sector = searchParams.get("sector_focus") || searchParams.get("sector");
  const stage = searchParams.get("stage");
  const sortBy = searchParams.get("sort") || "name";
  const sortDir = searchParams.get("dir") === "desc" ? "DESC" : "ASC";

  const postedMode = parsePostedMode(searchParams);
  const postedIds = postedMode === "posted" ? await getPostedRoundIds() : null;
  if (postedIds && postedIds.length === 0) {
    return NextResponse.json({
      data: [],
      pagination: { cursor: null, hasMore: false, totalCount: 0, totalCountApproximate: false },
    });
  }

  let skip = 0;
  if (cursorParam) {
    try {
      const decoded = JSON.parse(Buffer.from(cursorParam, "base64").toString());
      skip = decoded.skip || 0;
    } catch { /* invalid cursor */ }
  }

  const matchConditions: string[] = [];
  const params: Record<string, unknown> = { skip: neo4j.int(skip), limit: neo4j.int(limit + 1) };
  if (postedIds) params.postedIds = postedIds;

  if (updatedSince) { matchConditions.push(`c.updatedAt >= datetime($updatedSince)`); params.updatedSince = updatedSince; }
  if (idSearch) { matchConditions.push(`c.uuid = $idSearch`); params.idSearch = idSearch; }
  if (nameSearch) { matchConditions.push(`toLower(c.name) CONTAINS toLower($nameSearch)`); params.nameSearch = nameSearch; }
  if (sector) { matchConditions.push(`ANY(s IN COALESCE(c.sector, []) WHERE toLower(s) = toLower($sector))`); params.sector = sector; }
  const matchWhereClause = matchConditions.length ? `WHERE ${matchConditions.join(" AND ")}` : "";

  let countryFilter = "";
  if (country && country.toLowerCase() !== "all") {
    countryFilter = `WHERE (c.country = $country OR hq = $country)`;
    params.country = country;
  } else if (!country) {
    countryFilter = `WHERE c.country IN ${EUROPE_CYPHER_LIST}`;
  }

  // Post-aggregation filters: stage (latestStage) + posted-only (drop startups
  // with zero posted rounds).
  const havingBits: string[] = [];
  if (stage) { havingBits.push(`toLower(latestStage) = toLower($stage)`); params.stage = stage; }
  if (postedIds) havingBits.push(`postedRoundCount > 0`);
  const havingClause = havingBits.length ? `WHERE ${havingBits.join(" AND ")}` : "";

  const roundFilterClause = postedIds ? `WHERE id(fr0) IN $postedIds` : "";

  const sortField = sortBy === "founded" ? "c.foundedYear" : sortBy === "updated" ? "c.updatedAt" : "c.name";

  const runRead = async (cypher: string, queryParams: Record<string, unknown>) => {
    const s = driver().session({ defaultAccessMode: "READ" });
    try {
      return await s.run(cypher, queryParams);
    } finally {
      await s.close();
    }
  };

  try {
    // Data + total count run in parallel. The nested funding-rounds query
    // depends on the paginated slice of companies, so it runs after.
    const [companyResult, countResult] = await Promise.all([
      runRead(`
        MATCH (c:Company)
        ${matchWhereClause}
        OPTIONAL MATCH (c)-[:HQ_IN]->(loc:Location)
        WITH c, collect(DISTINCT loc.name)[0] AS hq
        ${countryFilter}
        OPTIONAL MATCH (c)-[:RAISED]->(fr0:FundingRound)
        ${roundFilterClause}
        WITH c, hq, max(fr0.stage) AS latestStage, count(fr0) AS postedRoundCount
        ${havingClause}
        RETURN c, hq, latestStage
        ORDER BY ${sortField} ${sortDir}
        SKIP $skip LIMIT $limit
      `, params),
      runRead(`
        MATCH (c:Company)
        ${matchWhereClause}
        OPTIONAL MATCH (c)-[:HQ_IN]->(loc:Location)
        WITH c, collect(DISTINCT loc.name)[0] AS hq
        ${countryFilter}
        OPTIONAL MATCH (c)-[:RAISED]->(fr0:FundingRound)
        ${roundFilterClause}
        WITH c, max(fr0.stage) AS latestStage, count(fr0) AS postedRoundCount
        ${havingClause}
        RETURN count(c) AS total
      `, params),
    ]);

    const hasMore = companyResult.records.length > limit;
    const companyRecords = companyResult.records.slice(0, limit);
    const totalCount = toNum(countResult.records[0]?.get("total"));

    const companyNames = companyRecords.map((r) => toStr(r.get("c").properties.name)).filter(Boolean) as string[];

    const roundsByCompany: Record<string, { roundExternalId: string | null; stage: string | null; amountUsd: number | null; date: string | null; investors: { externalId: string | null; name: string | null; role: string | null }[] }[]> = {};

    if (companyNames.length > 0) {
      const roundsParams: Record<string, unknown> = { companyNames };
      const roundsPostedClause = postedIds ? `AND id(fr) IN $postedIds` : "";
      if (postedIds) roundsParams.postedIds = postedIds;
      const roundsResult = await runRead(`
        MATCH (c:Company)-[:RAISED]->(fr:FundingRound)
        WHERE c.name IN $companyNames ${roundsPostedClause}
        OPTIONAL MATCH (inv:InvestorOrg)-[rel:PARTICIPATED_IN]->(fr)
        WITH c.name AS companyName, fr,
             collect(CASE WHEN inv.name IS NOT NULL THEN { uuid: inv.uuid, name: inv.name, role: rel.role } ELSE NULL END) AS rawInvestors
        RETURN companyName, fr.uuid AS roundUuid, fr.stage AS stage, fr.amountUsd AS amountUsd,
               COALESCE(fr.date, fr.announcedDate) AS date,
               [i IN rawInvestors WHERE i IS NOT NULL] AS investors
        ORDER BY date DESC
      `, roundsParams);

      for (const r of roundsResult.records) {
        const name = r.get("companyName") as string;
        if (!roundsByCompany[name]) roundsByCompany[name] = [];
        const invs = (r.get("investors") as { uuid: string | null; name: string | null; role: string | null }[])
          .map((i) => ({
            externalId: toStr(i.uuid),
            name: toStr(i.name),
            role: i.role ? toStr(i.role) : "participant",
          }));
        const amountRaw = r.get("amountUsd");
        roundsByCompany[name].push({
          roundExternalId: toStr(r.get("roundUuid")),
          stage: toStr(r.get("stage")),
          amountUsd: amountRaw != null ? (typeof amountRaw === "object" && "toNumber" in amountRaw ? (amountRaw as { toNumber: () => number }).toNumber() : Number(amountRaw)) : null,
          date: toStr(r.get("date")),
          investors: invs,
        });
      }
    }

    const data = companyRecords.map((r) => {
      const c = r.get("c").properties;
      const sector = toStrArr(c.sector);
      const subsector = toStr(c.subsector);
      if (subsector && !sector.includes(subsector)) sector.push(subsector);
      const name = toStr(c.name);

      return {
        externalId: toStr(c.uuid) || toStr(c.normalizedName),
        name,
        website: toStr(c.website),
        hq: toStr(r.get("hq")) || toStr(c.country),
        description: toStr(c.description),
        foundedAt: c.foundedYear ? `${c.foundedYear}-01-01` : null,
        sector,
        stage: toStr(r.get("latestStage")),
        fundingRounds: roundsByCompany[name || ""] || [],
        updatedAt: toStr(c.updatedAt) || toStr(c.enrichedAt) || new Date().toISOString(),
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
    console.error("v1/startups error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
