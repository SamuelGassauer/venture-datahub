import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { XMLParser } from "fast-xml-parser";
import { prisma } from "../src/lib/db";

type Outline = {
  "@_type"?: string;
  "@_text"?: string;
  "@_title"?: string;
  "@_xmlUrl"?: string;
  "@_htmlUrl"?: string;
  outline?: Outline | Outline[];
};

async function importOpmlFile(path: string) {
  const xml = await readFile(path, "utf-8");
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const parsed = parser.parse(xml);

  const root = parsed?.opml?.body?.outline;
  if (!root) throw new Error(`Invalid OPML: ${path}`);

  const groups: Outline[] = Array.isArray(root) ? root : [root];

  let created = 0;
  let skipped = 0;

  async function walk(node: Outline, parentCategory: string | null) {
    const xmlUrl = node["@_xmlUrl"];
    const isFeed = node["@_type"] === "rss" && xmlUrl;

    if (isFeed) {
      const categoryName = parentCategory || "Imported";
      const category = await prisma.category.upsert({
        where: { name: categoryName },
        update: {},
        create: { name: categoryName },
      });

      const existing = await prisma.feed.findUnique({ where: { url: xmlUrl } });
      if (existing) {
        skipped++;
        return;
      }

      await prisma.feed.create({
        data: {
          title: node["@_title"] || node["@_text"] || xmlUrl,
          url: xmlUrl,
          siteUrl: node["@_htmlUrl"] || null,
          categoryId: category.id,
        },
      });
      created++;
      console.log(`+ ${categoryName}: ${node["@_title"] || xmlUrl}`);
      return;
    }

    const childCategory = node["@_title"] || node["@_text"] || parentCategory;
    const kids = node.outline ? (Array.isArray(node.outline) ? node.outline : [node.outline]) : [];
    for (const kid of kids) await walk(kid, childCategory);
  }

  for (const group of groups) await walk(group, null);

  return { created, skipped };
}

async function main() {
  const files = process.argv.slice(2).map((p) => resolve(p));
  if (files.length === 0) {
    console.error("Usage: pnpm tsx scripts/import-opml.ts <opml-file> [more-files...]");
    process.exit(1);
  }

  let totalCreated = 0;
  let totalSkipped = 0;
  for (const file of files) {
    console.log(`\n== ${file} ==`);
    const { created, skipped } = await importOpmlFile(file);
    console.log(`  created=${created} skipped=${skipped}`);
    totalCreated += created;
    totalSkipped += skipped;
  }

  console.log(`\nDone. created=${totalCreated} skipped=${totalSkipped}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
