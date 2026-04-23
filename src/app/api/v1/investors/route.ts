import { NextRequest, NextResponse } from "next/server";
import neo4j from "neo4j-driver";
import driver from "@/lib/neo4j";
import { requireApiKey } from "@/lib/api-auth";
import { EUROPE_CYPHER_LIST } from "@/lib/european-countries";
import { getPostedRoundIds, parsePostedMode } from "@/lib/posted-rounds";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 250;
const DEFAULT_LIMIT = 50;

function toNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "toNumber" in v) return (v as { toNumber(): number }).toNumber();
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function toStr(v: unknown): string | null {
  if (v == null) return null;
  return String(v);
}

function toStrArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string" && v) return [v];
  return [];
}

type PortfolioCompany = {
  externalId: string | null;
  name: string | null;
  country: string | null;
  sector: string[];
  dealCount: number;
  leadCount: number;
  latestStage: string | null;
  latestAmountUsd: number | null;
  latestDate: string | null;
};

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
  const geo = searchParams.get("geo");
  const role = searchParams.get("role");
  const type = searchParams.get("type");
  const minCheck = searchParams.get("min_check");
  const maxCheck = searchParams.get("max_check");
  const sortBy = searchParams.get("sort") || "activity";
  const sortDir = searchParams.get("dir") === "asc" ? "ASC" : "DESC";

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
    } catch { /* invalid cursor, start from 0 */ }
  }

  const matchConditions: string[] = [];
  const params: Record<string, unknown> = { skip: neo4jInt(skip), limit: neo4jInt(limit + 1) };
  if (postedIds) params.postedIds = postedIds;

  if (updatedSince) { matchConditions.push(`inv.updatedAt >= datetime($updatedSince)`); params.updatedSince = updatedSince; }
  if (idSearch) { matchConditions.push(`inv.uuid = $idSearch`); params.idSearch = idSearch; }
  if (nameSearch) { matchConditions.push(`toLower(inv.name) CONTAINS toLower($nameSearch)`); params.nameSearch = nameSearch; }
  if (geo) { matchConditions.push(`ANY(g IN inv.geoFocus WHERE toLower(g) CONTAINS toLower($geo))`); params.geo = geo; }
  if (type) { matchConditions.push(`toLower(inv.type) = toLower($type)`); params.type = type; }
  if (minCheck) { matchConditions.push(`inv.checkSizeMaxUsd >= $minCheck`); params.minCheck = Number(minCheck); }
  if (maxCheck) { matchConditions.push(`inv.checkSizeMinUsd <= $maxCheck`); params.maxCheck = Number(maxCheck); }
  const matchWhereClause = matchConditions.length ? `WHERE ${matchConditions.join(" AND ")}` : "";

  // Country filter on investor HQ (explicit country param only)
  let countryFilter = "";
  if (country && country.toLowerCase() !== "all") {
    countryFilter = `WHERE (inv.country = $country OR hq = $country)`;
    params.country = country;
  }

  // Europe default: filter on the COMPANY's country (not investor HQ)
  // This ensures non-European investors who invest in Europe still appear
  const dealFilters: string[] = [];
  if (!country) dealFilters.push(`c.country IN ${EUROPE_CYPHER_LIST}`);
  if (postedIds) dealFilters.push(`id(fr) IN $postedIds`);
  const dealCountryFilter = dealFilters.length ? `WHERE ${dealFilters.join(" AND ")}` : "";

  // Sector and role filters applied after aggregation (derived from investments)
  const havingConditions: string[] = [];
  havingConditions.push(`dealCount > 0`);
  if (sector) { havingConditions.push(`ANY(s IN investedSectors WHERE toLower(s) = toLower($sector))`); params.sector = sector; }
  if (role) { havingConditions.push(`toLower(roundRole) = toLower($role)`); params.role = role; }
  const havingClause = havingConditions.length ? `WHERE ${havingConditions.join(" AND ")}` : "";

  const sortField =
    sortBy === "aum" ? "inv.aum"
    : sortBy === "name" ? "inv.name"
    : sortBy === "updated" ? "inv.updatedAt"
    : sortBy === "deployed" ? "totalDeployedUsd"
    : sortBy === "leads" ? "leadCount"
    : "dealCount";

  // Shared filter pipeline. Data query adds projections + ordering + paging;
  // count query ends with count(inv).
  const aggregationPipeline = `
    MATCH (inv:InvestorOrg)
    ${matchWhereClause}
    OPTIONAL MATCH (inv)-[:HQ_IN]->(loc:Location)
    WITH inv, collect(DISTINCT loc.name)[0] AS hq
    ${countryFilter}
    OPTIONAL MATCH (inv)-[rel:PARTICIPATED_IN]->(fr:FundingRound)<-[:RAISED]-(c:Company)
    ${dealCountryFilter}
    WITH inv, hq,
         count(DISTINCT fr) AS dealCount,
         sum(CASE WHEN toLower(rel.role) = 'lead' THEN 1 ELSE 0 END) AS leadCount,
         sum(fr.amountUsd) AS totalDeployedUsd,
         min(fr.amountUsd) AS minRoundUsd,
         max(fr.amountUsd) AS maxRoundUsd,
         max(COALESCE(fr.announcedDate, fr.date)) AS latestInvestmentDate,
         CASE
           WHEN ANY(r IN collect(rel.role) WHERE toLower(r) = 'lead') AND ANY(r IN collect(rel.role) WHERE r IS NULL OR toLower(r) <> 'lead') THEN 'both'
           WHEN ANY(r IN collect(rel.role) WHERE toLower(r) = 'lead') THEN 'lead'
           ELSE 'follow'
         END AS roundRole,
         [st IN collect(DISTINCT fr.stage) WHERE st IS NOT NULL] AS stages,
         REDUCE(acc = [], s IN collect(DISTINCT c.sector) | CASE WHEN s IS NOT NULL THEN acc + s ELSE acc END) AS rawSectors
    WITH inv, hq, dealCount, leadCount, totalDeployedUsd, minRoundUsd, maxRoundUsd,
         latestInvestmentDate, roundRole, stages,
         [s IN rawSectors WHERE s IS NOT NULL | s] AS investedSectors
    ${havingClause}
  `;

  const runRead = async (cypher: string, queryParams: Record<string, unknown>) => {
    const s = driver().session({ defaultAccessMode: "READ" });
    try {
      return await s.run(cypher, queryParams);
    } finally {
      await s.close();
    }
  };

  try {
    const [result, countResult] = await Promise.all([
      runRead(`
        ${aggregationPipeline}
        RETURN inv, hq, dealCount, leadCount, totalDeployedUsd, minRoundUsd, maxRoundUsd,
               latestInvestmentDate, roundRole, stages, investedSectors
        ORDER BY ${sortField} ${sortDir}, inv.uuid ASC
        SKIP $skip LIMIT $limit
      `, params),
      runRead(`
        ${aggregationPipeline}
        RETURN count(inv) AS total
      `, params),
    ]);

    const hasMore = result.records.length > limit;
    const records = result.records.slice(0, limit);
    const totalCount = toNum(countResult.records[0]?.get("total")) ?? 0;

    // Fetch portfolio companies for the returned investors
    const investorUuids = records
      .map((r) => toStr(r.get("inv").properties.uuid))
      .filter(Boolean) as string[];

    const portfolioByInvestor: Record<string, PortfolioCompany[]> = {};

    if (investorUuids.length > 0) {
      const portfolioParams: Record<string, unknown> = { investorUuids };
      const portfolioExtraFilters: string[] = [];
      if (!country) portfolioExtraFilters.push(`c.country IN ${EUROPE_CYPHER_LIST}`);
      else if (country.toLowerCase() !== "all") {
        portfolioExtraFilters.push(`c.country = $portfolioCountry`);
        portfolioParams.portfolioCountry = country;
      }
      if (postedIds) {
        portfolioExtraFilters.push(`id(fr) IN $postedIds`);
        portfolioParams.postedIds = postedIds;
      }
      const portfolioCountryFilter = portfolioExtraFilters.length
        ? `AND ${portfolioExtraFilters.join(" AND ")}`
        : "";

      const portfolioResult = await runRead(`
        MATCH (inv:InvestorOrg)-[rel:PARTICIPATED_IN]->(fr:FundingRound)<-[:RAISED]-(c:Company)
        WHERE inv.uuid IN $investorUuids
        ${portfolioCountryFilter}
        WITH inv.uuid AS investorUuid, c, rel, fr,
             COALESCE(fr.announcedDate, fr.date) AS roundDate
        WITH investorUuid, c,
             count(DISTINCT fr) AS dealCount,
             sum(CASE WHEN toLower(rel.role) = 'lead' THEN 1 ELSE 0 END) AS leadCount,
             collect({stage: fr.stage, amountUsd: fr.amountUsd, date: roundDate}) AS rounds
        WITH investorUuid, c, dealCount, leadCount,
             reduce(latest = {stage: null, amountUsd: null, date: null},
                    r IN rounds |
                    CASE WHEN r.date IS NOT NULL AND (latest.date IS NULL OR r.date > latest.date)
                         THEN r ELSE latest END) AS latest
        RETURN investorUuid,
               c.uuid AS companyUuid,
               c.normalizedName AS companyNormalizedName,
               c.name AS companyName,
               c.country AS companyCountry,
               COALESCE(c.sector, []) AS companySector,
               c.subsector AS companySubsector,
               dealCount, leadCount,
               latest.stage AS latestStage,
               latest.amountUsd AS latestAmountUsd,
               latest.date AS latestDate
        ORDER BY latestDate DESC
      `, portfolioParams);

      for (const r of portfolioResult.records) {
        const invUuid = toStr(r.get("investorUuid"));
        if (!invUuid) continue;
        const sector = toStrArr(r.get("companySector"));
        const subsector = toStr(r.get("companySubsector"));
        if (subsector && !sector.includes(subsector)) sector.push(subsector);
        if (!portfolioByInvestor[invUuid]) portfolioByInvestor[invUuid] = [];
        portfolioByInvestor[invUuid].push({
          externalId: toStr(r.get("companyUuid")) || toStr(r.get("companyNormalizedName")),
          name: toStr(r.get("companyName")),
          country: toStr(r.get("companyCountry")),
          sector,
          dealCount: toNum(r.get("dealCount")) ?? 0,
          leadCount: toNum(r.get("leadCount")) ?? 0,
          latestStage: toStr(r.get("latestStage")),
          latestAmountUsd: toNum(r.get("latestAmountUsd")),
          latestDate: toStr(r.get("latestDate")),
        });
      }
    }

    const data = records.map((r) => {
      const inv = r.get("inv").properties;
      const investedSectors = toStrArr(r.get("investedSectors"));
      const hqCity = toStr(inv.hqCity);
      const hqCountry = toStr(inv.hqCountry) || toStr(r.get("hq")) || toStr(inv.country);
      const hq = hqCity && hqCountry ? `${hqCity}, ${hqCountry}` : hqCity || hqCountry;
      const uuid = toStr(inv.uuid);

      return {
        externalId: uuid || toStr(inv.normalizedName),
        name: toStr(inv.name),
        logoUrl: toStr(inv.logoUrl),
        type: toStr(inv.type),
        website: toStr(inv.website),
        linkedinUrl: toStr(inv.linkedinUrl),
        description: toStr(inv.description),
        hq,
        hqCity,
        hqCountry,
        foundedAt: inv.foundedYear ? `${inv.foundedYear}-01-01` : null,
        aumUsdMillions: toNum(inv.aum),
        checkSizeMinUsd: toNum(inv.checkSizeMinUsd),
        checkSizeMaxUsd: toNum(inv.checkSizeMaxUsd),
        stageFocus: toStrArr(inv.stageFocus),
        geoFocus: toStrArr(inv.geoFocus),
        dealCount: toNum(r.get("dealCount")) ?? 0,
        leadCount: toNum(r.get("leadCount")) ?? 0,
        totalDeployedUsd: toNum(r.get("totalDeployedUsd")),
        minRoundUsd: toNum(r.get("minRoundUsd")),
        maxRoundUsd: toNum(r.get("maxRoundUsd")),
        roundRole: mapRoundRole(r.get("roundRole") as string | null),
        stages: toStrArr(r.get("stages")),
        sectorFocus: [...new Set(investedSectors)],
        latestInvestmentDate: toStr(r.get("latestInvestmentDate")),
        portfolioCompanies: uuid ? (portfolioByInvestor[uuid] ?? []) : [],
        enrichedAt: toStr(inv.enrichedAt),
        updatedAt: toStr(inv.updatedAt) || toStr(inv.enrichedAt) || new Date().toISOString(),
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
    console.error("v1/investors error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function mapRoundRole(role: string | null): string {
  if (!role) return "FOLLOW";
  const r = role.toLowerCase();
  if (r === "lead") return "LEAD";
  if (r === "both") return "BOTH";
  return "FOLLOW";
}

function neo4jInt(n: number) {
  return neo4j.int(n);
}
