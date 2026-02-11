import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const feeds = await prisma.feed.findMany({
    include: { category: true },
    orderBy: { title: "asc" },
  });

  const grouped = new Map<string, typeof feeds>();
  for (const feed of feeds) {
    const cat = feed.category?.name || "Uncategorized";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(feed);
  }

  let opml = `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n<head><title>RSS Scraper Feeds</title></head>\n<body>\n`;

  for (const [category, catFeeds] of Array.from(grouped.entries())) {
    opml += `  <outline text="${escapeXml(category)}" title="${escapeXml(category)}">\n`;
    for (const feed of catFeeds) {
      opml += `    <outline type="rss" text="${escapeXml(feed.title)}" title="${escapeXml(feed.title)}" xmlUrl="${escapeXml(feed.url)}"${feed.siteUrl ? ` htmlUrl="${escapeXml(feed.siteUrl)}"` : ""}/>\n`;
    }
    opml += `  </outline>\n`;
  }

  opml += `</body>\n</opml>`;

  return new NextResponse(opml, {
    headers: {
      "Content-Type": "application/xml",
      "Content-Disposition": "attachment; filename=feeds.opml",
    },
  });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
