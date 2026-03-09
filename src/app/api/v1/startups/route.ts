import { NextRequest, NextResponse } from "next/server";
import neo4j from "neo4j-driver";
import driver from "@/lib/neo4j";
import { requireApiKey } from "@/lib/api-auth";
import { EUROPE_CYPHER_LIST } from "@/lib/european-countries";

export const dynamic = "force-dynamic";

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
  const sector = searchParams.get("sector");
  const stage = searchParams.get("stage");
  const sortBy = searchParams.get("sort") || "name";
  const sortDir = searchParams.get("dir") === "desc" ? "DESC" : "ASC";

  const session = driver().session({ defaultAccessMode: "READ" });
  try {
    let skip = 0;
    if (cursorParam) {
      try {
        const decoded = JSON.parse(Buffer.from(cursorParam, "base64").toString());
        skip = decoded.skip || 0;
      } catch { /* invalid cursor */ }
    }

    const matchConditions: string[] = [];
    const params: Record<string, unknown> = { skip: neo4jInt(skip), limit: neo4jInt(limit + 1) };

    if (updatedSince) { matchConditions.push(`c.updatedAt >= datetime($updatedSince)`); params.updatedSince = updatedSince; }
    if (idSearch) { matchConditions.push(`c.uuid = $idSearch`); params.idSearch = idSearch; }
    if (nameSearch) { matchConditions.push(`toLower(c.name) CONTAINS toLower($nameSearch)`); params.nameSearch = nameSearch; }
    if (sector) { matchConditions.push(`ANY(s IN COALESCE(c.sector, []) WHERE toLower(s) CONTAINS toLower($sector))`); params.sector = sector; }
    const matchWhereClause = matchConditions.length ? `WHERE ${matchConditions.join(" AND ")}` : "";

    // Country filter: defaults to Europe-only, pass country=all to disable
    let countryFilter = "";
    if (country && country.toLowerCase() !== "all") {
      countryFilter = `WHERE (c.country = $country OR hq = $country)`;
      params.country = country;
    } else if (!country) {
      countryFilter = `WHERE c.country IN ${EUROPE_CYPHER_LIST}`;
    }

    // Stage filter is applied after aggregation
    const havingClause = stage ? `WHERE toLower(latestStage) = toLower($stage)` : "";
    if (stage) params.stage = stage;

    const sortField = sortBy === "founded" ? "c.foundedYear" : sortBy === "updated" ? "c.updatedAt" : "c.name";

    // First query: get companies (paginated)
    const companyResult = await session.run(`
      MATCH (c:Company)
      ${matchWhereClause}
      OPTIONAL MATCH (c)-[:HQ_IN]->(loc:Location)
      WITH c, collect(DISTINCT loc.name)[0] AS hq
      ${countryFilter}
      OPTIONAL MATCH (c)-[:RAISED]->(fr0:FundingRound)
      WITH c, hq, max(fr0.stage) AS latestStage
      ${havingClause}
      RETURN c, hq, latestStage
      ORDER BY ${sortField} ${sortDir}
      SKIP $skip LIMIT $limit
    `, params);

    const hasMore = companyResult.records.length > limit;
    const companyRecords = companyResult.records.slice(0, limit);

    // Collect company names for funding round query
    const companyNames = companyRecords.map((r) => toStr(r.get("c").properties.name)).filter(Boolean) as string[];

    // Second query: get funding rounds with investors for these companies
    const roundsByCompany: Record<string, { roundExternalId: string | null; stage: string | null; amountUsd: number | null; date: string | null; investors: { externalId: string | null; name: string | null; role: string | null }[] }[]> = {};

    if (companyNames.length > 0) {
      const roundsResult = await session.run(`
        MATCH (c:Company)-[:RAISED]->(fr:FundingRound)
        WHERE c.name IN $companyNames
        OPTIONAL MATCH (inv:InvestorOrg)-[rel:PARTICIPATED_IN]->(fr)
        WITH c.name AS companyName, fr,
             collect(CASE WHEN inv.name IS NOT NULL THEN { uuid: inv.uuid, name: inv.name, role: rel.role } ELSE NULL END) AS rawInvestors
        RETURN companyName, fr.uuid AS roundUuid, fr.stage AS stage, fr.amountUsd AS amountUsd,
               COALESCE(fr.date, fr.announcedDate) AS date,
               [i IN rawInvestors WHERE i IS NOT NULL] AS investors
        ORDER BY date DESC
      `, { companyNames });

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
      pagination: { cursor: nextCursor, hasMore },
    });
  } catch (error) {
    console.error("v1/startups error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    await session.close();
  }
}

function neo4jInt(n: number) {
  return neo4j.int(n);
}
