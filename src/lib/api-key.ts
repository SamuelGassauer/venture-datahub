import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

const KEY_PREFIX = "orb_";
const KEY_BYTES = 32;

/** Generate a new API key. Returns { rawKey, hashedKey, prefix }. */
export function generateApiKey() {
  const raw = randomBytes(KEY_BYTES).toString("base64url");
  const rawKey = `${KEY_PREFIX}${raw}`;
  const hashedKey = hashKey(rawKey);
  const prefix = rawKey.slice(0, 12);
  return { rawKey, hashedKey, prefix };
}

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

type ValidatedKey = {
  id: string;
  name: string;
  scopes: string[];
  rateLimit: number;
};

/**
 * Validate an API key from the Authorization header.
 * Returns the key record if valid, or a NextResponse error.
 * Also logs usage and checks rate limits.
 */
export async function validateApiKey(
  request: NextRequest,
  requiredScope: string,
): Promise<ValidatedKey | NextResponse> {
  const authHeader = request.headers.get("authorization") ?? "";

  // Support both "ApiKey xxx" and "Bearer xxx" formats
  const token = authHeader.replace(/^(ApiKey|Bearer)\s+/i, "").trim();
  if (!token) {
    return NextResponse.json(
      { error: "Missing API key. Use header: Authorization: ApiKey <key>" },
      { status: 401 },
    );
  }

  const hashed = hashKey(token);

  const apiKey = await prisma.apiKey.findUnique({
    where: { hashedKey: hashed },
  });

  if (!apiKey) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  if (!apiKey.isActive) {
    return NextResponse.json(
      { error: "API key has been revoked" },
      { status: 403 },
    );
  }

  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "API key has expired" },
      { status: 403 },
    );
  }

  // Check scope
  if (!apiKey.scopes.includes(requiredScope) && !apiKey.scopes.includes("*")) {
    return NextResponse.json(
      { error: `API key does not have scope: ${requiredScope}` },
      { status: 403 },
    );
  }

  // Rate limiting: count requests in the last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentCount = await prisma.apiKeyUsageLog.count({
    where: {
      apiKeyId: apiKey.id,
      createdAt: { gte: oneHourAgo },
    },
  });

  if (recentCount >= apiKey.rateLimit) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded",
        limit: apiKey.rateLimit,
        resetAt: new Date(oneHourAgo.getTime() + 60 * 60 * 1000).toISOString(),
      },
      {
        status: 429,
        headers: {
          "Retry-After": "60",
          "X-RateLimit-Limit": String(apiKey.rateLimit),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  // Update usage stats (fire-and-forget)
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null;

  prisma.$transaction([
    prisma.apiKey.update({
      where: { id: apiKey.id },
      data: {
        lastUsedAt: new Date(),
        requestCount: { increment: 1 },
      },
    }),
    prisma.apiKeyUsageLog.create({
      data: {
        apiKeyId: apiKey.id,
        endpoint: new URL(request.url).pathname,
        method: request.method,
        status: 200,
        ip,
        userAgent: request.headers.get("user-agent")?.slice(0, 256) ?? null,
      },
    }),
  ]).catch((err) => console.error("API key usage log error:", err));

  return {
    id: apiKey.id,
    name: apiKey.name,
    scopes: apiKey.scopes,
    rateLimit: apiKey.rateLimit,
  };
}
