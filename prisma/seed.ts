import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";

const prisma = new PrismaClient();

const categories = [
  // Europe
  { name: "Pan-European", color: "#6366f1" },
  { name: "DACH", color: "#f59e0b" },
  { name: "UK & Ireland", color: "#ef4444" },
  { name: "France", color: "#3b82f6" },
  { name: "Nordics", color: "#8b5cf6" },
  { name: "Southern Europe", color: "#10b981" },
  { name: "CEE & Baltics", color: "#14b8a6" },
  // Global & Americas
  { name: "Global", color: "#64748b" },
  { name: "Latin America", color: "#f97316" },
  // Asia
  { name: "Asia", color: "#ec4899" },
  { name: "India", color: "#e11d48" },
  // MEA
  { name: "Middle East", color: "#0ea5e9" },
  { name: "Africa", color: "#84cc16" },
  // Oceania
  { name: "Oceania", color: "#06b6d4" },
  // Sectors
  { name: "Sector: FinTech", color: "#22c55e" },
  { name: "Sector: HealthTech", color: "#a855f7" },
  { name: "Sector: Climate", color: "#16a34a" },
  { name: "Sector: AI & DeepTech", color: "#7c3aed" },
  { name: "Sector: Crypto & Web3", color: "#eab308" },
  // VC Firms
  { name: "VC Firms", color: "#94a3b8" },
];

const feeds = [
  // ── Global / US ──────────────────────────────────────────────────────────
  { title: "TechCrunch", url: "https://techcrunch.com/feed/", category: "Global" },
  { title: "TechCrunch - Venture", url: "https://techcrunch.com/category/venture/feed/", category: "Global" },
  { title: "TechCrunch - Startups", url: "https://techcrunch.com/category/startups/feed/", category: "Global" },
  { title: "TechCrunch - Funding", url: "https://techcrunch.com/tag/funding/feed/", category: "Global" },
  { title: "Crunchbase News", url: "https://news.crunchbase.com/feed/", category: "Global" },
  { title: "PitchBook Blog", url: "https://pitchbook.com/blog/rss", category: "Global" },
  { title: "PitchBook News", url: "https://pitchbook.com/rss/news", category: "Global" },
  { title: "VentureBeat", url: "https://venturebeat.com/feed/", category: "Global" },
  { title: "FinSMEs", url: "https://www.finsmes.com/feed", category: "Global" },
  { title: "Dealroom Blog", url: "https://dealroom.co/blog/feed", category: "Global" },
  { title: "PYMNTS", url: "https://www.pymnts.com/feed/", category: "Global" },

  // ── Pan-European ─────────────────────────────────────────────────────────
  { title: "Sifted", url: "https://sifted.eu/feed", category: "Pan-European" },
  { title: "Tech.eu", url: "https://tech.eu/feed", category: "Pan-European" },
  { title: "EU-Startups", url: "https://www.eu-startups.com/feed/", category: "Pan-European" },
  { title: "Silicon Canals", url: "https://siliconcanals.com/feed/", category: "Pan-European" },
  { title: "Tech Funding News", url: "https://techfundingnews.com/feed/", category: "Pan-European" },
  { title: "AltFi", url: "https://www.altfi.com/rss", category: "Pan-European" },

  // ── DACH ──────────────────────────────────────────────────────────────────
  { title: "Deutsche Startups", url: "https://www.deutsche-startups.de/feed/", category: "DACH" },
  { title: "Gruenderszene", url: "https://www.businessinsider.de/gruenderszene/feed/", category: "DACH" },
  { title: "t3n", url: "https://t3n.de/rss.xml", category: "DACH" },
  { title: "Trending Topics", url: "https://www.trendingtopics.eu/feed/", category: "DACH" },
  { title: "Startupticker.ch", url: "https://www.startupticker.ch/index/rss.xml", category: "DACH" },
  { title: "Berlin Valley", url: "https://berlinvalley.com/feed/", category: "DACH" },
  { title: "FINSIDER", url: "https://finsider.de/feed/", category: "DACH" },
  { title: "Startup Valley", url: "https://www.startupvalley.news/de/feed/", category: "DACH" },

  // ── UK & Ireland ──────────────────────────────────────────────────────────
  { title: "UKTN", url: "https://www.uktech.news/feed", category: "UK & Ireland" },
  { title: "TechRound", url: "https://techround.co.uk/feed/", category: "UK & Ireland" },
  { title: "BusinessCloud", url: "https://www.businesscloud.co.uk/feed/", category: "UK & Ireland" },
  { title: "Silicon Republic", url: "https://www.siliconrepublic.com/feed", category: "UK & Ireland" },
  { title: "TechSPARK", url: "https://techspark.co/feed/", category: "UK & Ireland" },

  // ── France ────────────────────────────────────────────────────────────────
  { title: "Maddyness", url: "https://www.maddyness.com/feed/", category: "France" },
  { title: "FrenchWeb", url: "https://www.frenchweb.fr/feed", category: "France" },
  { title: "La French Tech Journal", url: "https://lafrenchtech.com/en/feed/", category: "France" },

  // ── Nordics ───────────────────────────────────────────────────────────────
  { title: "ArcticStartup", url: "https://arcticstartup.com/feed/", category: "Nordics" },
  { title: "The Nordic Web", url: "https://thenordicweb.com/feed/", category: "Nordics" },
  { title: "Nordic Startup News", url: "https://nordicstartupnews.com/feed/", category: "Nordics" },
  { title: "HealthTech Nordic", url: "https://healthtechnordic.com/feed/", category: "Nordics" },

  // ── Southern Europe ───────────────────────────────────────────────────────
  { title: "Novobrief", url: "https://novobrief.com/feed/", category: "Southern Europe" },
  { title: "StartupItalia", url: "https://startupitalia.eu/feed/", category: "Southern Europe" },

  // ── CEE & Baltics ─────────────────────────────────────────────────────────
  { title: "The Recursive", url: "https://therecursive.com/feed/", category: "CEE & Baltics" },
  { title: "Emerging Europe", url: "https://emerging-europe.com/feed/", category: "CEE & Baltics" },

  // ── Asia (General) ────────────────────────────────────────────────────────
  { title: "Tech in Asia", url: "https://www.techinasia.com/feed", category: "Asia" },
  { title: "e27", url: "https://e27.co/index_wp.php/feed", category: "Asia" },
  { title: "DealStreetAsia", url: "https://www.dealstreetasia.com/feed/", category: "Asia" },
  { title: "TechNode", url: "https://technode.com/feed/", category: "Asia" },
  { title: "36Kr (via RSSHub)", url: "https://rsshub.app/36kr/newsflashes", category: "Asia" },

  // ── India ─────────────────────────────────────────────────────────────────
  { title: "YourStory", url: "https://yourstory.com/feed", category: "India" },
  { title: "Inc42", url: "https://inc42.com/feed/", category: "India" },
  { title: "The Ken", url: "https://the-ken.com/feed/", category: "India" },
  { title: "Entrackr", url: "https://entrackr.com/feed/", category: "India" },
  { title: "VCCircle", url: "https://www.vccircle.com/rss-feeds/", category: "India" },

  // ── Middle East ───────────────────────────────────────────────────────────
  { title: "Wamda", url: "https://www.wamda.com/feed", category: "Middle East" },
  { title: "Menabytes", url: "https://www.menabytes.com/feed/", category: "Middle East" },
  { title: "Arabnet", url: "https://news.arabnet.me/feed/", category: "Middle East" },

  // ── Africa ────────────────────────────────────────────────────────────────
  { title: "TechCabal", url: "https://techcabal.com/feed/", category: "Africa" },
  { title: "Disrupt Africa", url: "https://disruptafrica.com/feed/", category: "Africa" },
  { title: "Techpoint Africa", url: "https://techpoint.africa/feed/", category: "Africa" },
  { title: "Digest Africa", url: "https://digestafrica.com/feed", category: "Africa" },
  { title: "Ventureburn", url: "https://ventureburn.com/feed/", category: "Africa" },

  // ── Latin America ─────────────────────────────────────────────────────────
  { title: "LatamList", url: "https://latamlist.com/feed/", category: "Latin America" },
  { title: "LAVCA", url: "https://www.lavca.org/feed/", category: "Latin America" },
  { title: "TechCrunch - Latin America", url: "https://techcrunch.com/tag/latin-america/feed/", category: "Latin America" },
  { title: "iupana", url: "https://iupana.com/feed/", category: "Latin America" },

  // ── Oceania ───────────────────────────────────────────────────────────────
  { title: "Startup Daily", url: "https://startupdaily.net/feed/", category: "Oceania" },
  { title: "SmartCompany", url: "https://www.smartcompany.com.au/feed/", category: "Oceania" },
  { title: "NZ Entrepreneur", url: "https://nzentrepreneur.co.nz/feed/", category: "Oceania" },

  // ── Sector: FinTech ───────────────────────────────────────────────────────
  { title: "FinTech Futures", url: "https://www.fintechfutures.com/feed/", category: "Sector: FinTech" },
  { title: "Finextra", url: "https://www.finextra.com/rss/headlines.aspx", category: "Sector: FinTech" },

  // ── Sector: HealthTech ────────────────────────────────────────────────────
  { title: "MobiHealthNews", url: "https://www.mobihealthnews.com/feed", category: "Sector: HealthTech" },
  { title: "FierceBiotech", url: "https://www.fiercebiotech.com/rss/xml", category: "Sector: HealthTech" },

  // ── Sector: Climate ──────────────────────────────────────────────────────
  { title: "CleanTechnica", url: "https://cleantechnica.com/feed/", category: "Sector: Climate" },
  { title: "CTVC (Climate Tech VC)", url: "https://www.ctvc.co/rss/", category: "Sector: Climate" },
  { title: "Charged EVs", url: "https://chargedevs.com/feed/", category: "Sector: Climate" },
  { title: "GreenBiz", url: "https://www.greenbiz.com/rss/all", category: "Sector: Climate" },

  // ── Sector: AI & DeepTech ────────────────────────────────────────────────
  { title: "AI News", url: "https://www.artificialintelligence-news.com/feed/", category: "Sector: AI & DeepTech" },
  { title: "Import AI", url: "https://importai.substack.com/feed", category: "Sector: AI & DeepTech" },

  // ── Sector: Crypto & Web3 ────────────────────────────────────────────────
  { title: "The Block", url: "https://www.theblock.co/rss.xml", category: "Sector: Crypto & Web3" },
  { title: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/", category: "Sector: Crypto & Web3" },

  // ── VC Firms ──────────────────────────────────────────────────────────────
  { title: "Atomico Blog", url: "https://atomico.com/insights/rss.xml", category: "VC Firms" },
  { title: "Speedinvest Blog", url: "https://www.speedinvest.com/blog/rss.xml", category: "VC Firms" },
  { title: "a16z Blog", url: "https://a16z.com/feed/", category: "VC Firms" },
  { title: "Sequoia Blog", url: "https://www.sequoiacap.com/feed/", category: "VC Firms" },
  { title: "First Round Review", url: "https://review.firstround.com/feed.xml", category: "VC Firms" },
  { title: "NFX Blog", url: "https://www.nfx.com/feed.xml", category: "VC Firms" },
  { title: "Point Nine Blog", url: "https://medium.com/feed/point-nine-news", category: "VC Firms" },
  { title: "Northzone Blog", url: "https://northzone.com/feed/", category: "VC Firms" },
  { title: "EQT Ventures Blog", url: "https://eqtventures.com/feed/", category: "VC Firms" },
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

  // Create admin user
  const adminPassword = process.env.ADMIN_SEED_PASSWORD || "admin123";
  await prisma.user.upsert({
    where: { email: "admin@inventure.com" },
    update: {},
    create: {
      email: "admin@inventure.com",
      name: "Admin",
      passwordHash: hashSync(adminPassword, 12),
      role: "admin",
    },
  });
  console.log("Created admin user (admin@inventure.com)");

  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
