import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const categories = [
  { name: "Pan-European", color: "#6366f1" },
  { name: "DACH", color: "#f59e0b" },
  { name: "UK & Ireland", color: "#ef4444" },
  { name: "France", color: "#3b82f6" },
  { name: "Iberia", color: "#10b981" },
  { name: "Nordics", color: "#8b5cf6" },
  { name: "Global", color: "#64748b" },
];

const feeds = [
  // Pan-European
  { title: "EU-Startups", url: "https://www.eu-startups.com/feed/", category: "Pan-European" },
  { title: "Tech.eu", url: "https://tech.eu/feed", category: "Pan-European" },
  { title: "Sifted", url: "https://sifted.eu/feed", category: "Pan-European" },
  { title: "Silicon Canals", url: "https://siliconcanals.com/feed/", category: "Pan-European" },
  { title: "ArcticStartup", url: "https://arcticstartup.com/feed/", category: "Nordics" },
  // DACH
  { title: "Deutsche Startups", url: "https://www.deutsche-startups.de/feed/", category: "DACH" },
  { title: "Startup Valley", url: "https://www.startupvalley.news/de/feed/", category: "DACH" },
  // UK
  { title: "UKTN", url: "https://www.uktech.news/feed", category: "UK & Ireland" },
  { title: "TechRound", url: "https://techround.co.uk/feed/", category: "UK & Ireland" },
  // France
  { title: "Maddyness", url: "https://www.maddyness.com/uk/feed/", category: "France" },
  // Iberia
  { title: "Novobrief", url: "https://novobrief.com/feed/", category: "Iberia" },
  // Global (Startup-focused)
  { title: "TechCrunch Startups", url: "https://techcrunch.com/category/startups/feed/", category: "Global" },
  { title: "TechCrunch Venture", url: "https://techcrunch.com/category/venture/feed/", category: "Global" },
  { title: "Crunchbase News", url: "https://news.crunchbase.com/feed/", category: "Global" },
  { title: "Pitchbook News", url: "https://pitchbook.com/rss/news", category: "Global" },
];

const defaultSettings = [
  { key: "sync_interval_minutes", value: "30" },
  { key: "articles_per_page", value: "20" },
  { key: "auto_sync_enabled", value: "true" },
  { key: "retention_days", value: "90" },
];

async function main() {
  console.log("Seeding database...");

  // Create categories
  const categoryMap = new Map<string, string>();
  for (const cat of categories) {
    const created = await prisma.category.upsert({
      where: { name: cat.name },
      update: { color: cat.color },
      create: cat,
    });
    categoryMap.set(cat.name, created.id);
  }
  console.log(`Created ${categories.length} categories`);

  // Create feeds
  for (const feed of feeds) {
    await prisma.feed.upsert({
      where: { url: feed.url },
      update: { title: feed.title, categoryId: categoryMap.get(feed.category) },
      create: {
        title: feed.title,
        url: feed.url,
        categoryId: categoryMap.get(feed.category),
      },
    });
  }
  console.log(`Created ${feeds.length} feeds`);

  // Create default settings
  for (const setting of defaultSettings) {
    await prisma.appSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: setting,
    });
  }
  console.log(`Created ${defaultSettings.length} settings`);

  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
