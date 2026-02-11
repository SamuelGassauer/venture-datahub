"use server";

import { prisma } from "./db";
import { revalidatePath } from "next/cache";

// Feed actions
export async function createFeed(data: {
  title: string;
  url: string;
  categoryId?: string;
  siteUrl?: string;
  description?: string;
}) {
  const feed = await prisma.feed.create({ data });
  revalidatePath("/feeds");
  return feed;
}

export async function updateFeed(
  id: string,
  data: {
    title?: string;
    url?: string;
    categoryId?: string | null;
    siteUrl?: string;
    description?: string;
    isActive?: boolean;
    syncInterval?: number;
  }
) {
  const feed = await prisma.feed.update({ where: { id }, data });
  revalidatePath("/feeds");
  return feed;
}

export async function deleteFeed(id: string) {
  await prisma.feed.delete({ where: { id } });
  revalidatePath("/feeds");
}

// Article actions
export async function markArticleRead(id: string, isRead: boolean) {
  await prisma.article.update({ where: { id }, data: { isRead } });
  revalidatePath("/feed");
}

export async function toggleBookmark(id: string) {
  const article = await prisma.article.findUniqueOrThrow({ where: { id } });
  await prisma.article.update({
    where: { id },
    data: { isBookmarked: !article.isBookmarked },
  });
  revalidatePath("/feed");
  revalidatePath("/bookmarks");
}

export async function markAllRead(feedId?: string) {
  await prisma.article.updateMany({
    where: feedId ? { feedId } : {},
    data: { isRead: true },
  });
  revalidatePath("/feed");
}

// Category actions
export async function createCategory(data: { name: string; color?: string }) {
  const category = await prisma.category.create({ data });
  revalidatePath("/feeds");
  return category;
}

// Settings actions
export async function updateSetting(key: string, value: string) {
  await prisma.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
  revalidatePath("/settings");
}

// OPML import
export async function importOpml(xmlContent: string) {
  const { XMLParser } = await import("fast-xml-parser");
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const parsed = parser.parse(xmlContent);

  const outlines = parsed?.opml?.body?.outline;
  if (!outlines) throw new Error("Invalid OPML format");

  let imported = 0;
  const items = Array.isArray(outlines) ? outlines : [outlines];

  for (const item of items) {
    const children = item.outline
      ? Array.isArray(item.outline)
        ? item.outline
        : [item.outline]
      : [item];

    const categoryName = item["@_title"] || item["@_text"] || "Imported";

    let category = await prisma.category.findUnique({
      where: { name: categoryName },
    });
    if (!category && item.outline) {
      category = await prisma.category.create({
        data: { name: categoryName },
      });
    }

    for (const child of children) {
      const xmlUrl = child["@_xmlUrl"];
      if (!xmlUrl) continue;

      try {
        await prisma.feed.upsert({
          where: { url: xmlUrl },
          update: {},
          create: {
            title: child["@_title"] || child["@_text"] || xmlUrl,
            url: xmlUrl,
            siteUrl: child["@_htmlUrl"] || null,
            categoryId: category?.id || null,
          },
        });
        imported++;
      } catch {
        // Skip duplicates
      }
    }
  }

  revalidatePath("/feeds");
  return { imported };
}
