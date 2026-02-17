/**
 * Canonical list of European countries used for filtering across the app.
 * Keep in sync with REGION_COUNTRIES.Europe in global-filters.tsx.
 */
export const EUROPEAN_COUNTRIES = [
  "Germany",
  "France",
  "United Kingdom",
  "UK",
  "Netherlands",
  "Sweden",
  "Switzerland",
  "Spain",
  "Italy",
  "Ireland",
  "Finland",
  "Denmark",
  "Norway",
  "Belgium",
  "Austria",
  "Portugal",
  "Poland",
  "Czech Republic",
  "Estonia",
  "Lithuania",
  "Latvia",
  "Romania",
  "Hungary",
  "Luxembourg",
  "Croatia",
  "Bulgaria",
  "Greece",
  "Slovakia",
  "Slovenia",
  "Iceland",
] as const;

/** Set for fast lookup */
export const EUROPEAN_COUNTRIES_SET = new Set(
  EUROPEAN_COUNTRIES.map((c) => c.toLowerCase())
);

/** Cypher-safe list literal for WHERE … IN clauses */
export const EUROPE_CYPHER_LIST = `[${EUROPEAN_COUNTRIES.map((c) => `'${c}'`).join(", ")}]`;

/** Reusable Cypher fragment: WHERE c.country IN [...] */
export const EUROPE_COMPANY_FILTER = `c.country IN ${EUROPE_CYPHER_LIST}`;
