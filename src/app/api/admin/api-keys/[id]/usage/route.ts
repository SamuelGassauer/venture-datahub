import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

/** GET /api/admin/api-keys/[id]/usage — Usage logs for a specific key */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAdmin();
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const { searchParams } = request.nextUrl;
  const days = Math.min(90, Math.max(1, parseInt(searchParams.get("days") || "7")));

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [logs, dailyCounts] = await Promise.all([
    prisma.apiKeyUsageLog.findMany({
      where: { apiKeyId: id, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.$queryRaw<Array<{ day: string; count: bigint }>>`
      SELECT DATE(created_at) as day, COUNT(*) as count
      FROM api_key_usage_logs
      WHERE api_key_id = ${id} AND created_at >= ${since}
      GROUP BY DATE(created_at)
      ORDER BY day DESC
    `,
  ]);

  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l.id,
      endpoint: l.endpoint,
      method: l.method,
      status: l.status,
      ip: l.ip,
      userAgent: l.userAgent,
      createdAt: l.createdAt.toISOString(),
    })),
    dailyCounts: dailyCounts.map((d) => ({
      day: String(d.day),
      count: Number(d.count),
    })),
  });
}
