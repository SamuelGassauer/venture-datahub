import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import driver from "@/lib/neo4j";
import { requireAdmin } from "@/lib/api-auth";

const VERCEL_BLOB_HOST = ".public.blob.vercel-storage.com";

const EXT_MAP: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
};

async function uploadLogoToBlob(
  url: string,
  entityName: string
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);

    const contentType = res.headers.get("content-type")?.split(";")[0].trim() ?? "";
    if (!contentType.startsWith("image/")) {
      throw new Error(`Not an image: ${contentType}`);
    }

    const ext = EXT_MAP[contentType] ?? "png";
    const slug = entityName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const pathname = `logos/${slug}.${ext}`;

    const blob = await put(pathname, res.body!, {
      access: "public",
      contentType,
      addRandomSuffix: true,
    });

    return blob.url;
  } finally {
    clearTimeout(timeout);
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_FIELDS = new Set([
  "description",
  "website",
  "foundedYear",
  "employeeRange",
  "linkedinUrl",
  "country",
  "hqCity",
  "hqCountry",
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

    // Upload logo to Vercel Blob if it's an external URL
    let finalValue = value;
    if (
      field === "logoUrl" &&
      typeof value === "string" &&
      value !== "" &&
      !value.includes(VERCEL_BLOB_HOST)
    ) {
      try {
        finalValue = await uploadLogoToBlob(value, entityName);
      } catch (e) {
        return new Response(
          JSON.stringify({
            error: `Logo upload failed: ${e instanceof Error ? e.message : "Unknown error"}`,
          }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    const label = entityType === "investor" ? "InvestorOrg" : "Company";
    const isEmpty = finalValue === null || finalValue === undefined || finalValue === "";
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
          { name: entityName, loc: String(finalValue) }
        );
      } else {
        const cyValue = field === "foundedYear" ? Number(finalValue) : String(finalValue);
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
        JSON.stringify({ success: true, field, value: finalValue, locked: true }),
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
