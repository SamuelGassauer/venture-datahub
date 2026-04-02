import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import driver from "@/lib/neo4j";

/**
 * PATCH /api/graph-funding-rounds/[roundKey]
 *
 * Update editable properties of a FundingRound node.
 * Allowed fields: announcedDate, stage, amountUsd, amount, currency
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ roundKey: string }> }
) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const { roundKey } = await params;
  if (!roundKey) {
    return NextResponse.json({ error: "roundKey required" }, { status: 400 });
  }

  const body = await request.json();
  const ALLOWED_FIELDS = ["announcedDate", "stage", "amountUsd", "amount", "currency"] as const;

  // Build dynamic SET clauses from allowed fields only
  const setClauses: string[] = [];
  const queryParams: Record<string, unknown> = { roundKey: decodeURIComponent(roundKey) };

  for (const field of ALLOWED_FIELDS) {
    if (field in body) {
      const value = body[field];
      // Allow null to clear a field, otherwise validate type
      if (value !== null) {
        if (["amountUsd", "amount"].includes(field) && typeof value !== "number") continue;
        if (["announcedDate", "stage", "currency"].includes(field) && typeof value !== "string") continue;
      }
      setClauses.push(`fr.${field} = $${field}`);
      queryParams[field] = value;
    }
  }

  if (setClauses.length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const session = driver().session();
  try {
    const result = await session.run(
      `MATCH (fr:FundingRound {roundKey: $roundKey})
       SET ${setClauses.join(", ")}
       RETURN fr.roundKey AS roundKey, fr.stage AS stage, fr.amountUsd AS amountUsd,
              fr.amount AS amount, fr.currency AS currency, fr.announcedDate AS announcedDate`,
      queryParams
    );

    if (result.records.length === 0) {
      return NextResponse.json({ error: "FundingRound not found" }, { status: 404 });
    }

    const rec = result.records[0];
    return NextResponse.json({
      roundKey: rec.get("roundKey"),
      stage: rec.get("stage"),
      amountUsd: rec.get("amountUsd"),
      amount: rec.get("amount"),
      currency: rec.get("currency"),
      announcedDate: rec.get("announcedDate"),
    });
  } catch (e) {
    console.error("FundingRound PATCH error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  } finally {
    await session.close();
  }
}
