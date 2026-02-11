# GraphRAG Ontologie: Venture Capital Knowledge Graph

> 17 Node-Typen, 28 Edge-Typen — Bloomberg/Crunchbase-Level
> Interaktive Visualisierung: `/ontology` in der App

## Node-Typen nach Kategorie

### Organizations (5)
- **Company** — Portfolio-Unternehmen / Startup (14 Properties: name, legalName, aliases, status, totalFundingUsd, lastValuation, ...)
- **InvestorOrg** — VC/PE/CVC/Angel Group/Family Office/SWF (14 Properties: type, stage_focus, sector_focus, geo_focus, checkSize, aum, ...)
- **FundManager** — GP/Management Company, rechtliche Verwaltungseinheit (5 Properties: jurisdiction, regulatoryStatus, aifmLicense, ...)
- **Fund** — Fonds-Vehikel mit Vintage, Volumen, Performance (13 Properties: vintage, sizeUsd, status, type, strategy, moic, irr, dpi, tvpi, ...)
- **LimitedPartner** — LP/Institutional Allocator: Pension, Endowment, SWF, DFI, Family Office (5 Properties: type, aum, vcAllocationPct, ...)

### Capital Events (4)
- **FundingRound** — Equity/Convertible/Grant Runde (14 Properties: amount, stage, dealType, pre/postMoneyValuation, equityPct, isExtension, ...)
- **Acquisition** — M&A-Transaktion (6 Properties: dealType, priceUsd, status, multipleOnRevenue, ...)
- **IPO** — Börsengang/Direct Listing/SPAC (8 Properties: exchange, ticker, offerPrice, valuationAtIpo, capitalRaised, ...)
- **SPV** — Special Purpose Vehicle für Co-Investments (3 Properties: sizeUsd, purpose, ...)

### People & Governance (2)
- **Person** — Gründer, GP, Angel, Executive (9 Properties: aliases, gender, linkedinUrl, isAngelInvestor, notableExits, ...)
- **BoardSeat** — Zeitgebundenes Board-Mandat (4 Properties: seatType, title, startDate, endDate)

### Taxonomy (3)
- **Sector** — 3-stufige Industrie-Hierarchie: Sector → SubSector → Vertical (4 Properties: level, gicsCode, ...)
- **BusinessModel** — Orthogonale Geschäftsmodell-Klassifikation (3 Properties: category, revenueType)
- **Technology** — Kern-/Enabling Technology (2 Properties: maturity)

### Geography (1)
- **Location** — 5-stufige Hierarchie: Continent → Region → Country → State → City (9 Properties: iso2, iso3, lat/lon, ecosystemRank, ...)

### Provenance (2)
- **Article** — Quellartikel mit Provenienz-Tracking (7 Properties)
- **DataSource** — Externe Enrichment-Quelle (4 Properties: type, reliability, ...)

## Edge-Typen nach Kategorie

### Funding Flow (9)
| Edge | Von → Nach | Properties | Kardinalität |
|------|-----------|------------|-------------|
| RAISED | Company → FundingRound | — | 1:N |
| PARTICIPATED_IN | InvestorOrg → FundingRound | role, allocationUsd, isNewInvestor, isProRata | N:M |
| ANGEL_INVESTED | Person → FundingRound | allocationUsd | N:M |
| DEPLOYED_FROM | FundingRound → Fund | allocationUsd | N:M |
| COMMITTED_TO | LimitedPartner → Fund | commitmentUsd, isAnchor | N:M |
| CO_INVESTED_VIA | FundingRound → SPV | — | N:1 |
| ACQUIRED_BY | Company → Acquisition | — | 1:N |
| ACQUIRER | Company → Acquisition | — | 1:N |
| WENT_PUBLIC | Company → IPO | — | 1:1 |

### Organizational Structure (4)
| Edge | Von → Nach | Kardinalität |
|------|-----------|-------------|
| MANAGES | FundManager → Fund | 1:N |
| GP_OF | InvestorOrg → FundManager | 1:N |
| MANAGED_BY | SPV → InvestorOrg | N:1 |
| SUBSIDIARY_OF | Company → Company | N:1 |

### People & Governance (6)
| Edge | Von → Nach | Properties | Temporal |
|------|-----------|------------|---------|
| FOUNDED | Person → Company | — | ja |
| EMPLOYED_AT | Person → Company | title, startDate, endDate, seniority | ja |
| PARTNER_AT | Person → InvestorOrg | title, startDate, endDate | ja |
| HOLDS_SEAT | Person → BoardSeat | — | — |
| BOARD_AT | BoardSeat → Company | — | — |
| REPRESENTS | BoardSeat → InvestorOrg | — | — |

### Classification (7)
OPERATES_IN, HAS_MODEL, USES_TECH, PARENT_SECTOR, HQ_IN (Company), HQ_IN (InvestorOrg), PART_OF (Location hierarchy)

### Provenance (2)
| Edge | Von → Nach | Properties |
|------|-----------|------------|
| SOURCED_FROM | FundingRound → Article | confidence, extractedAt |
| ENRICHED_BY | Company → DataSource | lastEnrichedAt, fieldsEnriched |

## Entity Resolution

| Entität | Priorität | Strategie |
|---------|-----------|-----------|
| Company | Critical | Normalisierung + Jaro-Winkler ≥ 0.92 + Domain-Match |
| InvestorOrg | Critical | Alias-DB + Suffix-Strip + Crunchbase-ID-Join |
| Person | Critical | Name-Normalisierung + Org-Kontext-Disambiguierung |
| Fund | High | InvestorOrg-Match + Fund-Nummer-Extraktion + Vintage |
| Location | High | GeoNames-Lookup + Alias-Mapping + Hierarchie |
| Sector | Medium | Kuratierte Taxonomie (170+ Verticals) + LLM |
