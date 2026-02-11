import type { Article, Category, Feed, FundingRound, SyncLog } from "@prisma/client";

// Composite types
export type FeedWithCategory = Feed & {
  category: Category | null;
};

export type ArticleWithFeed = Article & {
  feed: Feed & { category: Category | null };
};

export type ArticleWithFunding = Article & {
  feed: Feed & { category: Category | null };
  fundingRound: FundingRound | null;
};

export type FundingRoundWithArticle = FundingRound & {
  article: Article & { feed: Feed };
};

export type SyncLogWithFeed = SyncLog & {
  feed: Feed;
};

// API response types
export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

// Filter types
export type ArticleFilters = {
  feedId?: string;
  categoryId?: string;
  isRead?: boolean;
  isBookmarked?: boolean;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type FundingFilters = {
  stage?: string;
  country?: string;
  minAmount?: number;
  maxAmount?: number;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
};

// Dashboard stats
export type DashboardStats = {
  totalFeeds: number;
  totalArticles: number;
  unreadArticles: number;
  totalFundingRounds: number;
  totalFundingAmount: number;
  avgConfidence: number;
};

export type StageDistribution = {
  stage: string;
  count: number;
  totalAmount: number;
};

export type CountryDistribution = {
  country: string;
  count: number;
  totalAmount: number;
};

export type TimelineData = {
  month: string;
  count: number;
  totalAmount: number;
};

// Re-export Prisma types
export type { Article, Category, Feed, FundingRound, SyncLog, AppSetting } from "@prisma/client";
