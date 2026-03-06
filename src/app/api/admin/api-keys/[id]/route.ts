import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

/** PATCH /api/admin/api-keys/[id] — Update key settings */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const body = await request.json();
  const { name, scopes, rateLimit, isActive, expiresAt } = body as {
    name?: string;
    scopes?: string[];
    rateLimit?: number;
    isActive?: boolean;
    expiresAt?: string | null;
  };

  const existing = await prisma.apiKey.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 });
  }

  const updated = await prisma.apiKey.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(scopes !== undefined && { scopes }),
      ...(rateLimit !== undefined && { rateLimit: Math.max(1, Math.min(10000, rateLimit)) }),
      ...(isActive !== undefined && { isActive }),
      ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
    },
  });

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    isActive: updated.isActive,
    scopes: updated.scopes,
    rateLimit: updated.rateLimit,
    expiresAt: updated.expiresAt?.toISOString() ?? null,
  });
}

/** DELETE /api/admin/api-keys/[id] — Delete key and all usage logs */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;

  const existing = await prisma.apiKey.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 });
  }

  await prisma.apiKey.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
