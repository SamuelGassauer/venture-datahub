import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

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
 * Validate API key from Authorization header: `ApiKey <key>`
 * Checks against the PUBLIC_API_KEY env var.
 */
export function requireApiKey(request: NextRequest): NextResponse | null {
  const key = process.env.PUBLIC_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "API key not configured" },
      { status: 500 }
    );
  }
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^ApiKey\s+/i, "");
  if (!token || token !== key) {
    return NextResponse.json(
      { error: "Invalid or missing API key" },
      { status: 401 }
    );
  }
  return null; // auth OK
}
