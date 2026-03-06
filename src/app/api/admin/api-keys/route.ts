import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { generateApiKey } from "@/lib/api-key";

const AVAILABLE_SCOPES = [
  "funding-rounds",
  "companies",
  "fund-events",
  "value-indicators",
  "data-provider",
  "*",
];

/** GET /api/admin/api-keys — List all API keys (without the actual key) */
export async function GET() {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const keys = await prisma.apiKey.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { name: true, email: true } },
      _count: { select: { usageLogs: true } },
    },
  });

  return NextResponse.json({
    keys: keys.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      scopes: k.scopes,
      rateLimit: k.rateLimit,
      isActive: k.isActive,
      expiresAt: k.expiresAt?.toISOString() ?? null,
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      requestCount: k.requestCount,
      createdBy: k.createdBy,
      createdAt: k.createdAt.toISOString(),
    })),
    availableScopes: AVAILABLE_SCOPES,
  });
}

/** POST /api/admin/api-keys — Create a new API key */
export async function POST(request: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const body = await request.json();
  const { name, scopes, rateLimit, expiresAt } = body as {
    name: string;
    scopes?: string[];
    rateLimit?: number;
    expiresAt?: string | null;
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const selectedScopes = scopes?.length ? scopes : ["funding-rounds"];
  const invalidScopes = selectedScopes.filter((s) => !AVAILABLE_SCOPES.includes(s));
  if (invalidScopes.length) {
    return NextResponse.json(
      { error: `Invalid scopes: ${invalidScopes.join(", ")}` },
      { status: 400 },
    );
  }

  const { rawKey, hashedKey, prefix } = generateApiKey();

  const apiKey = await prisma.apiKey.create({
    data: {
      name: name.trim(),
      prefix,
      hashedKey,
      scopes: selectedScopes,
      rateLimit: Math.max(1, Math.min(10000, rateLimit ?? 100)),
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      createdById: authResult.user!.id!,
    },
  });

  // Return the raw key ONLY on creation — it can never be retrieved again
  return NextResponse.json({
    id: apiKey.id,
    name: apiKey.name,
    prefix: apiKey.prefix,
    rawKey,
    scopes: apiKey.scopes,
    rateLimit: apiKey.rateLimit,
    expiresAt: apiKey.expiresAt?.toISOString() ?? null,
    createdAt: apiKey.createdAt.toISOString(),
    message: "Speichere den API Key jetzt — er wird nie wieder angezeigt.",
  });
}
