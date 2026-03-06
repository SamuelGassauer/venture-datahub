import * as cheerio from "cheerio";
import { extractArticleContent } from "../src/lib/article-scraper";

async function main() {
  const url = process.argv[2] || "https://techfundingnews.com/wtenergy-10m-waste-gasification/";
  console.log("Fetching:", url);

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Orbit-VC-Bot/1.0)", Accept: "text/html" },
    signal: AbortSignal.timeout(15000),
  });
  const html = await res.text();
  const $ = cheerio.load(html);
  const content = extractArticleContent($);

  console.log("\n=== CONTENT LENGTH:", content.length, "===\n");
  console.log(content.slice(0, 2000));
  console.log("\n=== KEY CHECKS ===");
  for (const term of ["SC Net Zero", "Shell", "Suma", "Cemex", "led by", "investor", "Series A", "Seed"]) {
    console.log(`  "${term}":`, content.includes(term) ? "YES" : "NO");
  }
}

main().catch(console.error);
