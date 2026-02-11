import { NextRequest } from "next/server";
import driver from "@/lib/neo4j";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { entityType, entityName, field, locked } = await request.json();

    if (!entityType || !entityName || !field || typeof locked !== "boolean") {
      return new Response(
        JSON.stringify({ error: "Missing entityType, entityName, field, or locked" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const label = entityType === "investor" ? "InvestorOrg" : "Company";
    const session = driver.session();

    try {
      if (locked) {
        // Add field to lockedFields array
        await session.run(
          `MATCH (n:${label} {name: $name})
           SET n.lockedFields = CASE
             WHEN n.lockedFields IS NULL THEN [$field]
             WHEN NOT $field IN n.lockedFields THEN n.lockedFields + $field
             ELSE n.lockedFields
           END`,
          { name: entityName, field }
        );
      } else {
        // Remove field from lockedFields array
        await session.run(
          `MATCH (n:${label} {name: $name})
           SET n.lockedFields = CASE
             WHEN n.lockedFields IS NULL THEN []
             ELSE [f IN n.lockedFields WHERE f <> $field]
           END`,
          { name: entityName, field }
        );
      }

      return new Response(
        JSON.stringify({ success: true, field, locked }),
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
