import { NextRequest, NextResponse } from "next/server";
import neo4j from "neo4j-driver";
import driver from "@/lib/neo4j";
import { requireApiKey } from "@/lib/api-auth";

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

    const conditions: string[] = [];
    const params: Record<string, unknown> = { skip: neo4jInt(skip), limit: neo4jInt(limit + 1) };

    if (updatedSince) { conditions.push(`c.updatedAt >= datetime($updatedSince)`); params.updatedSince = updatedSince; }
    if (nameSearch) { conditions.push(`toLower(c.name) CONTAINS toLower($nameSearch)`); params.nameSearch = nameSearch; }
    if (country) { conditions.push(`(c.country = $country OR loc.name = $country)`); params.country = country; }
    if (sector) { conditions.push(`ANY(s IN COALESCE(c.sector, []) WHERE toLower(s) CONTAINS toLower($sector))`); params.sector = sector; }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    // Stage filter is applied after aggregation
    const havingClause = stage ? `WHERE toLower(latestStage) = toLower($stage)` : "";
    if (stage) params.stage = stage;

    const sortField = sortBy === "founded" ? "c.foundedYear" : sortBy === "updated" ? "c.updatedAt" : "c.name";

    const result = await session.run(`
      MATCH (c:Company)
      OPTIONAL MATCH (c)-[:HQ_IN]->(loc:Location)
      ${whereClause}
      OPTIONAL MATCH (c)-[:RAISED]->(fr:FundingRound)
      WITH c,
           collect(DISTINCT loc.name)[0] AS hq,
           max(fr.stage) AS latestStage
      ${havingClause}
      RETURN c, hq, latestStage
      ORDER BY ${sortField} ${sortDir}
      SKIP $skip LIMIT $limit
    `, params);

    const hasMore = result.records.length > limit;
    const records = result.records.slice(0, limit);

    const data = records.map((r) => {
      const c = r.get("c").properties;
      const sector = toStrArr(c.sector);
      const subsector = toStr(c.subsector);
      if (subsector && !sector.includes(subsector)) sector.push(subsector);

      return {
        externalId: toStr(c.uuid) || toStr(c.normalizedName),
        name: toStr(c.name),
        website: toStr(c.website),
        hq: toStr(r.get("hq")) || toStr(c.country),
        description: toStr(c.description),
        foundedAt: c.foundedYear ? `${c.foundedYear}-01-01` : null,
        sector,
        stage: toStr(r.get("latestStage")),
        founders: null, // Not stored in graph yet
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
