import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = parseInt(params.get("page") || "1");
  const pageSize = parseInt(params.get("pageSize") || "20");
  const stage = params.get("stage");
  const country = params.get("country");
  const minAmount = params.get("minAmount");
  const maxAmount = params.get("maxAmount");
  const search = params.get("search");
  const sortBy = params.get("sortBy") || "createdAt";
  const sortOrder = (params.get("sortOrder") || "desc") as "asc" | "desc";

  const where: Prisma.FundingRoundWhereInput = {};

  if (stage) where.stage = stage;
  if (country) where.country = country;
  if (minAmount) where.amountUsd = { ...((where.amountUsd as Prisma.FloatNullableFilter) || {}), gte: parseFloat(minAmount) };
  if (maxAmount) where.amountUsd = { ...((where.amountUsd as Prisma.FloatNullableFilter) || {}), lte: parseFloat(maxAmount) };
  if (search) {
    where.OR = [
      { companyName: { contains: search, mode: "insensitive" } },
      { article: { title: { contains: search, mode: "insensitive" } } },
    ];
  }

  const orderBy: Prisma.FundingRoundOrderByWithRelationInput = {};
  if (sortBy === "amount") orderBy.amountUsd = sortOrder;
  else if (sortBy === "company") orderBy.companyName = sortOrder;
  else if (sortBy === "confidence") orderBy.confidence = sortOrder;
  else orderBy.createdAt = sortOrder;

  const [data, total] = await Promise.all([
    prisma.fundingRound.findMany({
      where,
      include: { article: { include: { feed: true } } },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.fundingRound.count({ where }),
  ]);

  return NextResponse.json({
    data,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  });
}
