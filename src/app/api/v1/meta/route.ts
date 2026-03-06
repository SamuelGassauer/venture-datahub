import { NextResponse } from "next/server";
import driver from "@/lib/neo4j";
import { SECTOR_TAXONOMY } from "@/lib/taxonomy";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = driver().session({ defaultAccessMode: "READ" });
  try {
    const countriesRes = await session.run(`
      MATCH (l:Location)
      RETURN DISTINCT l.name AS name
      ORDER BY l.name ASC
    `);
    // Sectors that actually have investments (from Company nodes via FundingRounds)
    const activeSectorsRes = await session.run(`
      MATCH (inv:InvestorOrg)-[:PARTICIPATED_IN]->(fr:FundingRound)<-[:RAISED]-(c:Company)
      WHERE c.sector IS NOT NULL
      UNWIND c.sector AS s
      RETURN DISTINCT s AS name
      ORDER BY s ASC
    `);
    const stagesRes = await session.run(`
      MATCH (fr:FundingRound)
      WHERE fr.stage IS NOT NULL
      RETURN DISTINCT fr.stage AS name
      ORDER BY fr.stage ASC
    `);
    const geoRes = await session.run(`
      MATCH (inv:InvestorOrg)
      WHERE inv.geoFocus IS NOT NULL
      UNWIND inv.geoFocus AS g
      RETURN DISTINCT g AS name
      ORDER BY g ASC
    `);

    const activeSectors = activeSectorsRes.records.map((r) => r.get("name") as string);

    return NextResponse.json({
      countries: countriesRes.records.map((r) => r.get("name") as string),
      sectors: activeSectors,
      sectorTaxonomy: SECTOR_TAXONOMY,
      stages: stagesRes.records.map((r) => r.get("name") as string),
      geoFocus: geoRes.records.map((r) => r.get("name") as string),
    });
  } catch (error) {
    console.error("v1/meta error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    await session.close();
  }
}
