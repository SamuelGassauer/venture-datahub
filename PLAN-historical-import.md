# Plan: Historische EU-Funding-Runden importieren

**Scope:** Alle europaeischen Finanzierungsrunden, Jan 2024 – Maerz 2026
**Ziel:** Artikel-URLs sammeln, dann ueber bestehende Extraction-Pipeline verarbeiten

---

## Phase 1: URLs ueber Sitemaps sammeln

Script baut, das fuer jede Quelle die Sitemap abruft, alle Artikel-URLs extrahiert,
und nach `lastmod >= 2024-01-01` filtert.

### Tier 1 — Sitemap vorhanden, Funding-fokussiert (hoechste Ausbeute)

| Quelle | Sitemap-Typ | Post-Sitemaps | Geschaetzte Relevanz |
|--------|-------------|---------------|---------------------|
| EU-Startups | Yoast Index | 66 | ~70% Funding |
| Silicon Canals | Rank Math Index | 144 | ~60% Funding |
| Tech Funding News | Yoast Index | 9 | ~90% Funding |
| FINSIDER | WP Default | 1 | ~80% Funding |
| Deutsche Startups | Yoast Index | 25 | ~40% Funding |

### Tier 2 — Sitemap vorhanden, breiteres Themenspektrum

| Quelle | Sitemap-Typ | Post-Sitemaps | Geschaetzte Relevanz |
|--------|-------------|---------------|---------------------|
| Trending Topics | Yoast Index | 25 | ~30% Funding |
| The Recursive | Yoast Index | 4 | ~40% Funding |
| Novobrief | Yoast Index | 2 | ~50% Funding |
| ArcticStartup | Rank Math Index | 38 | ~30% Funding |
| UKTN | Yoast Index | 16 | ~25% Funding |
| Tech.eu | Custom Index | 18 | ~40% Funding |

### Tier 3 — Kein Artikel-Sitemap, Fallback noetig

| Quelle | Problem | Fallback-Strategie |
|--------|---------|-------------------|
| Sifted | Sitemap hat nur Nav-Pages, keine Artikel | Wayback Machine CDX API |
| FinSMEs | 403 auf Sitemap | Wayback Machine CDX API |
| Berlin Valley | Nicht getestet | Sitemap pruefen, sonst Wayback |
| Startupticker.ch | Nicht getestet | Sitemap pruefen, sonst Wayback |

---

## Phase 2: URL-Vorfilterung (vor dem Scrapen)

Nicht jeder Artikel ist eine Finanzierungsrunde. Vorfilterung spart API-Kosten:

### Filter 1: URL-Keywords (schnell, gratis)
URLs die mindestens eins enthalten:
- `funding`, `raises`, `series`, `seed`, `round`, `secures`, `million`,
  `finanzierung`, `investment`, `backed`, `venture`, `capital`

### Filter 2: Titel-Keywords (aus Sitemap-Metadaten, falls vorhanden)
Manche Sitemaps enthalten `<news:title>` oder der Titel ist in der URL encoded.

### Erwartete Zahlen
- Rohe URLs aus Sitemaps (2024+): ~30.000–50.000
- Nach URL-Keyword-Filter: ~5.000–10.000
- Davon tatsaechlich Funding-Runden: ~2.000–4.000

---

## Phase 3: Wayback Machine fuer Tier-3-Quellen

Fuer Sifted, FinSMEs etc. — Wayback CDX API abfragen:

```
https://web.archive.org/cdx/search/cdx?url=sifted.eu/articles/*&output=json&from=20240101&to=20260305&fl=original,timestamp&collapse=urlkey
```

Das liefert alle jemals archivierten Artikel-URLs mit Zeitstempel.
Deduplizierung ueber `collapse=urlkey` (eine URL = ein Eintrag).

---

## Phase 4: Import-Endpoint bauen

Neuer API-Endpoint `/api/articles/import-url`:

1. POST mit `{ urls: string[], source?: string }`
2. Fuer jede URL:
   a. Pruefen ob Article mit dieser URL schon existiert (Skip wenn ja)
   b. HTML fetchen + mit cheerio zu Text parsen
   c. Article-Record anlegen (publishedAt aus Meta-Tags oder Sitemap)
   d. Bestehende Extraction-Pipeline ausfuehren:
      - `isFundEvent()` → FundEvent?
      - `extractFunding()` → FundingRound? (Regex + LLM)
      - `extractValueIndicators()` → CompanyValueIndicator?
3. Rate-Limiting: Max 2 Requests/Sekunde pro Domain
4. Batch-faehig: Queue mit Progress-Tracking

---

## Phase 5: Ausfuehrung

### Reihenfolge
1. Tier 1 Sitemaps crawlen → URL-Liste generieren → filtern
2. Import-Endpoint bauen + mit 50 Test-URLs validieren
3. Tier 1 URLs importieren (geschaetzt ~3.000 Runden)
4. Tier 2 Sitemaps crawlen + importieren
5. Tier 3 via Wayback nachholen (Sifted, FinSMEs)

### Aufwand-Schaetzung
- Phase 1-2 (Sitemap-Crawler + Filter): 1 Script
- Phase 3 (Wayback): 1 Script
- Phase 4 (Import-Endpoint): 1 API Route + Anpassung sync-engine
- Phase 5 (Ausfuehrung): Laeuft automatisch, Monitoring noetig

### Risiken
- Manche Sites blockieren Scraping (403/429) → User-Agent + Rate-Limiting
- Alte Artikel koennten geloescht sein → Wayback als Fallback fuer Content
- LLM-Kosten: ~4.000 Artikel x Claude Haiku = ca. $2–4
- Duplikate wenn gleiche Runde von mehreren Quellen → bestehende Dedup-Logik greift

---

## Nicht im Scope
- Non-EU Runden (Global, Asia, etc.)
- Aelter als Jan 2024
- Manuelle Dateneingabe
