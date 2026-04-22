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
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50") || 50, 1), 100);

  // Filters
  const idSearch = searchParams.get("id");
  const nameSearch = searchParams.get("name");
  const country = searchParams.get("country");
  const sector = searchParams.get("sector_focus") || searchParams.get("sector");
  const geo = searchParams.get("geo");
  const role = searchParams.get("role");
  const sortBy = searchParams.get("sort") || "activity";
  const sortDir = searchParams.get("dir") === "asc" ? "ASC" : "DESC";

  const session = driver().session({ defaultAccessMode: "READ" });
  try {
    let skip = 0;
    if (cursorParam) {
      try {
        const decoded = JSON.parse(Buffer.from(cursorParam, "base64").toString());
        skip = decoded.skip || 0;
      } catch { /* invalid cursor, start from 0 */ }
    }

    const matchConditions: string[] = [];
    const params: Record<string, unknown> = { skip: neo4jInt(skip), limit: neo4jInt(limit + 1) };

    if (updatedSince) { matchConditions.push(`inv.updatedAt >= datetime($updatedSince)`); params.updatedSince = updatedSince; }
    if (idSearch) { matchConditions.push(`inv.uuid = $idSearch`); params.idSearch = idSearch; }
    if (nameSearch) { matchConditions.push(`toLower(inv.name) CONTAINS toLower($nameSearch)`); params.nameSearch = nameSearch; }
    if (geo) { matchConditions.push(`ANY(g IN inv.geoFocus WHERE toLower(g) CONTAINS toLower($geo))`); params.geo = geo; }
    const matchWhereClause = matchConditions.length ? `WHERE ${matchConditions.join(" AND ")}` : "";

    // Country filter on investor HQ (explicit country param only)
    let countryFilter = "";
    if (country && country.toLowerCase() !== "all") {
      countryFilter = `WHERE (inv.country = $country OR hq = $country)`;
      params.country = country;
    }

    // Europe default: filter on the COMPANY's country (not investor HQ)
    // This ensures non-European investors who invest in Europe still appear
    let dealCountryFilter = "";
    if (!country) {
      dealCountryFilter = `WHERE c.country IN ${EUROPE_CYPHER_LIST}`;
    }

    // Sector and role filters applied after aggregation (derived from investments)
    const havingConditions: string[] = [];
    havingConditions.push(`dealCount > 0`);
    if (sector) { havingConditions.push(`ANY(s IN sectors WHERE toLower(s) = toLower($sector))`); params.sector = sector; }
    if (role) { havingConditions.push(`toLower(roundRole) = toLower($role)`); params.role = role; }
    const havingClause = havingConditions.length ? `WHERE ${havingConditions.join(" AND ")}` : "";

    const sortField = sortBy === "aum" ? "inv.aum" : sortBy === "name" ? "inv.name" : sortBy === "updated" ? "inv.updatedAt" : "dealCount";

    const result = await session.run(`
      MATCH (inv:InvestorOrg)
      ${matchWhereClause}
      OPTIONAL MATCH (inv)-[:HQ_IN]->(loc:Location)
      WITH inv, collect(DISTINCT loc.name)[0] AS hq
      ${countryFilter}
      OPTIONAL MATCH (inv)-[rel:PARTICIPATED_IN]->(fr:FundingRound)<-[:RAISED]-(c:Company)
      ${dealCountryFilter}
      WITH inv, hq,
           count(DISTINCT fr) AS dealCount,
           min(fr.amountUsd) AS minRoundUsd,
           max(fr.amountUsd) AS maxRoundUsd,
           CASE
             WHEN ANY(r IN collect(rel.role) WHERE toLower(r) = 'lead') AND ANY(r IN collect(rel.role) WHERE r IS NULL OR toLower(r) <> 'lead') THEN 'both'
             WHEN ANY(r IN collect(rel.role) WHERE toLower(r) = 'lead') THEN 'lead'
             ELSE 'follow'
           END AS roundRole,
           [st IN collect(DISTINCT fr.stage) WHERE st IS NOT NULL] AS stages,
           REDUCE(acc = [], s IN collect(DISTINCT c.sector) | CASE WHEN s IS NOT NULL THEN acc + s ELSE acc END) AS rawSectors
      WITH inv, hq, dealCount, minRoundUsd, maxRoundUsd, roundRole, stages,
           [s IN rawSectors WHERE s IS NOT NULL | s] AS sectors
      ${havingClause}
      RETURN inv, hq, dealCount, minRoundUsd, maxRoundUsd, roundRole, stages, sectors
      ORDER BY ${sortField} ${sortDir}, inv.uuid ASC
      SKIP $skip LIMIT $limit
    `, params);

    const hasMore = result.records.length > limit;
    const records = result.records.slice(0, limit);

    const data = records.map((r) => {
      const inv = r.get("inv").properties;
      const city = toStr(inv.hqCity);
      const country = toStr(inv.hqCountry) || toStr(r.get("hq")) || toStr(inv.country);
      const hq = city && country ? `${city}, ${country}` : city || country;

      return {
        externalId: toStr(inv.uuid) || toStr(inv.normalizedName),
        name: toStr(inv.name),
        logoUrl: toStr(inv.logoUrl),
        website: toStr(inv.website),
        linkedinUrl: toStr(inv.linkedinUrl),
        hq,
        foundedAt: inv.foundedYear ? `${inv.foundedYear}-01-01` : null,
        description: toStr(inv.description),
        aumUsdMillions: toNum(inv.aum),
        minRoundUsd: toNum(r.get("minRoundUsd")),
        maxRoundUsd: toNum(r.get("maxRoundUsd")),
        dealCount: toNum(r.get("dealCount")) ?? 0,
        roundRole: mapRoundRole(r.get("roundRole") as string | null),
        stages: toStrArr(r.get("stages")),
        sectorFocus: [...new Set(toStrArr(r.get("sectors")))],
        geoFocus: toStrArr(inv.geoFocus),
        updatedAt: toStr(inv.updatedAt) || toStr(inv.enrichedAt) || new Date().toISOString(),
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
    console.error("v1/investors error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    await session.close();
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
