import { NextRequest, NextResponse } from "next/server";
import driver from "@/lib/neo4j";
import { requireAdmin } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_FIELDS = new Set([
  "description",
  "website",
  "foundedYear",
  "employeeRange",
  "linkedinUrl",
  "country",
  "status",
  "location",
  "logoUrl",
  "sector",
  "subsector",
]);

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;
  try {
    const { entityType, entityName, field, value } = await request.json();

    if (
      !entityType ||
      !entityName ||
      !field ||
      !["company", "investor"].includes(entityType)
    ) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid entityType, entityName, or field" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!ALLOWED_FIELDS.has(field)) {
      return new Response(
        JSON.stringify({ error: `Field "${field}" is not editable` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const label = entityType === "investor" ? "InvestorOrg" : "Company";
    const isEmpty = value === null || value === undefined || value === "";
    const session = driver().session();

    try {
      if (isEmpty) {
        // Delete field + remove from lockedFields
        if (field === "location") {
          await session.run(
            `MATCH (n:${label} {name: $name})-[r:HQ_IN]->(:Location)
             DELETE r`,
            { name: entityName }
          );
        } else {
          await session.run(
            `MATCH (n:${label} {name: $name})
             REMOVE n.${field}`,
            { name: entityName }
          );
        }
        // Remove from lockedFields
        await session.run(
          `MATCH (n:${label} {name: $name})
           SET n.lockedFields = CASE
             WHEN n.lockedFields IS NULL THEN []
             ELSE [f IN n.lockedFields WHERE f <> $field]
           END`,
          { name: entityName, field }
        );

        return new Response(
          JSON.stringify({ success: true, field, value: null, locked: false }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      // Set value
      if (field === "location") {
        // Special case: MERGE Location node + HQ_IN relation
        await session.run(
          `MATCH (n:${label} {name: $name})
           OPTIONAL MATCH (n)-[oldR:HQ_IN]->(:Location)
           DELETE oldR
           WITH n
           MERGE (l:Location {name: $loc}) SET l.type = 'city'
           WITH n, l
           MERGE (n)-[:HQ_IN]->(l)`,
          { name: entityName, loc: String(value) }
        );
      } else {
        const cyValue = field === "foundedYear" ? Number(value) : String(value);
        await session.run(
          `MATCH (n:${label} {name: $name})
           SET n.${field} = $value`,
          { name: entityName, value: cyValue }
        );
      }

      // Auto-lock the field
      await session.run(
        `MATCH (n:${label} {name: $name})
         SET n.lockedFields = CASE
           WHEN n.lockedFields IS NULL THEN [$field]
           WHEN NOT $field IN n.lockedFields THEN n.lockedFields + $field
           ELSE n.lockedFields
         END`,
        { name: entityName, field }
      );

      return new Response(
        JSON.stringify({ success: true, field, value, locked: true }),
        { headers: { "Content-Type": "application/json" } }
      );
    } finally {
      await session.close();
    }
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid request" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
}
