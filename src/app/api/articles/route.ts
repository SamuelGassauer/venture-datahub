import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = parseInt(params.get("page") || "1");
  const pageSize = parseInt(params.get("pageSize") || "50");
  const feedId = params.get("feedId");
  const categoryId = params.get("categoryId");
  const isRead = params.get("isRead");
  const isBookmarked = params.get("isBookmarked");
  const search = params.get("search");
  const hasFunding = params.get("hasFunding");
  const sortBy = params.get("sortBy") || "publishedAt";
  const sortOrder = (params.get("sortOrder") || "desc") as "asc" | "desc";

  const where: Prisma.ArticleWhereInput = {};

  if (feedId) where.feedId = feedId;
  if (categoryId) where.feed = { categoryId };
  if (isRead !== null && isRead !== undefined && isRead !== "")
    where.isRead = isRead === "true";
  if (isBookmarked === "true") where.isBookmarked = true;
  if (hasFunding === "true") where.fundingRound = { isNot: null };
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { summary: { contains: search, mode: "insensitive" } },
    ];
  }

  // Build orderBy
  let orderBy: Prisma.ArticleOrderByWithRelationInput;
  if (sortBy === "amount") {
    orderBy = { fundingRound: { amountUsd: sortOrder } };
  } else if (sortBy === "confidence") {
    orderBy = { fundingRound: { confidence: sortOrder } };
  } else {
    orderBy = { publishedAt: sortOrder };
  }

  const [data, total] = await Promise.all([
    prisma.article.findMany({
      where,
      include: {
        feed: { include: { category: true } },
        fundingRound: true,
      },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.article.count({ where }),
  ]);

  return NextResponse.json({
    data,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  });
}
