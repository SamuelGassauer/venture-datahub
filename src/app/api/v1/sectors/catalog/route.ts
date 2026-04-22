import { NextRequest, NextResponse } from "next/server";
import driver from "@/lib/neo4j";
import { requireApiKey } from "@/lib/api-auth";
import { EUROPE_CYPHER_LIST } from "@/lib/european-countries";

export const dynamic = "force-dynamic";
export const revalidate = 1800;

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

type SubEntry = { label: string; startupCount: number; recentRoundCount: number };
type Entry = {
  primary: string;
  startupCount: number;
  recentRoundCount: number;
  recentAmountUsd: number;
  subsectors: SubEntry[];
};

export async function GET(request: NextRequest) {
  const authError = await requireApiKey(request, "data-provider", { allowPublic: true });
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const windowDaysRaw = parseInt(searchParams.get("window_days") || "90", 10);
  const windowDays = Number.isFinite(windowDaysRaw) && windowDaysRaw > 0
    ? Math.min(windowDaysRaw, 365 * 5)
    : 90;
  const country = searchParams.get("country");

  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const sinceYmd = since.toISOString().slice(0, 10);

  // Country filter: Europe by default, pass country=all to disable
  let countryClause = "";
  const params: Record<string, unknown> = { sinceYmd };
  if (country && country.toLowerCase() !== "all") {
    countryClause = "AND c.country = $country";
    params.country = country;
  } else if (!country) {
    countryClause = `AND c.country IN ${EUROPE_CYPHER_LIST}`;
  }

  const session = driver().session({ defaultAccessMode: "READ" });
  try {
    // Primary-sector stats + total startups, in a single round-trip.
    const primaryQuery = session.run(
      `
      MATCH (c:Company)
      WHERE c.sector IS NOT NULL AND size(c.sector) > 0 ${countryClause}
      WITH c, c.sector[0] AS primary
      OPTIONAL MATCH (c)-[:RAISED]->(fr:FundingRound)
        WHERE fr.announcedDate IS NOT NULL AND fr.announcedDate >= $sinceYmd
      WITH primary, c, collect(DISTINCT fr) AS recentRounds
      RETURN primary,
             count(DISTINCT c) AS startupCount,
             sum(size(recentRounds)) AS recentRoundCount,
             sum(reduce(acc = 0.0, r IN recentRounds | acc + COALESCE(r.amountUsd, 0.0))) AS recentAmountUsd
      ORDER BY recentRoundCount DESC, startupCount DESC
      `,
      params,
    );

    // Subsector breakdown: each non-primary sector tag credited once per tagged startup,
    // rounds credited to each non-primary tag on the startup's sector[].
    const subsectorQuery = session.run(
      `
      MATCH (c:Company)
      WHERE c.sector IS NOT NULL AND size(c.sector) >= 2 ${countryClause}
      WITH c, c.sector[0] AS primary, c.sector[1..] AS subs
      UNWIND subs AS sub
      WITH primary, sub, c
      OPTIONAL MATCH (c)-[:RAISED]->(fr:FundingRound)
        WHERE fr.announcedDate IS NOT NULL AND fr.announcedDate >= $sinceYmd
      WITH primary, sub, c, collect(DISTINCT fr) AS recentRounds
      RETURN primary, sub AS label,
             count(DISTINCT c) AS startupCount,
             sum(size(recentRounds)) AS recentRoundCount
      `,
      params,
    );

    const totalsQuery = session.run(
      `
      MATCH (c:Company) ${countryClause ? `WHERE 1=1 ${countryClause}` : ""}
      RETURN count(c) AS total
      `,
      params,
    );

    const [primaryRes, subRes, totalsRes] = await Promise.all([
      primaryQuery,
      subsectorQuery,
      totalsQuery,
    ]);

    const entriesMap = new Map<string, Entry>();
    for (const rec of primaryRes.records) {
      const primary = toStr(rec.get("primary"));
      if (!primary) continue;
      entriesMap.set(primary, {
        primary,
        startupCount: toNum(rec.get("startupCount")),
        recentRoundCount: toNum(rec.get("recentRoundCount")),
        recentAmountUsd: toNum(rec.get("recentAmountUsd")),
        subsectors: [],
      });
    }

    for (const rec of subRes.records) {
      const primary = toStr(rec.get("primary"));
      const label = toStr(rec.get("label"));
      if (!primary || !label) continue;
      const entry = entriesMap.get(primary);
      if (!entry) continue;
      entry.subsectors.push({
        label,
        startupCount: toNum(rec.get("startupCount")),
        recentRoundCount: toNum(rec.get("recentRoundCount")),
      });
    }

    const entries = Array.from(entriesMap.values())
      .sort((a, b) => b.recentRoundCount - a.recentRoundCount || b.startupCount - a.startupCount);
    for (const entry of entries) {
      entry.subsectors.sort(
        (a, b) => b.recentRoundCount - a.recentRoundCount || b.startupCount - a.startupCount,
      );
    }

    return NextResponse.json(
      {
        entries,
        totalStartups: toNum(totalsRes.records[0]?.get("total")),
        windowDays,
        generatedAt: new Date().toISOString(),
      },
      {
        headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=300" },
      },
    );
  } catch (error) {
    console.error("v1/sectors/catalog error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    await session.close();
  }
}
