import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/api-key";

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session;
}

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return session;
}

/**
 * Validate API key from Authorization header.
 * Uses DB-based API keys with scope checking, rate limiting, and usage logging.
 *
 * Falls back to legacy PUBLIC_API_KEY env var for backwards compatibility.
 */
export async function requireApiKey(
  request: NextRequest,
  scope = "funding-rounds",
  { allowPublic = false }: { allowPublic?: boolean } = {},
): Promise<NextResponse | null> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^(ApiKey|Bearer)\s+/i, "").trim();

  if (!token) {
    if (allowPublic) return null;
    return NextResponse.json(
      { error: "Missing API key. Use header: Authorization: ApiKey <key>" },
      { status: 401 },
    );
  }

  // Legacy: check against env var for backwards compatibility
  const legacyKey = process.env.PUBLIC_API_KEY;
  if (legacyKey && token === legacyKey) {
    return null; // legacy key OK
  }

  // DB-based validation
  const result = await validateApiKey(request, scope);
  if (result instanceof NextResponse) return result;

  return null; // DB key OK
}
