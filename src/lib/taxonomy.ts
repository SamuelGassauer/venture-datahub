// ---------------------------------------------------------------------------
// Company Sector Taxonomy — PitchBook-inspired, 2 levels: Sector → Subsector
// ---------------------------------------------------------------------------

export const SECTOR_TAXONOMY: Record<string, readonly string[]> = {
  "Enterprise Software": [
    "SaaS / Productivity",
    "Data & Analytics",
    "Cybersecurity",
    "Developer Tools",
    "AI / Machine Learning",
    "Cloud Infrastructure",
    "ERP / Back-Office",
  ],
  "Fintech": [
    "Payments",
    "Neobanking",
    "Lending / Credit",
    "Insurtech",
    "Wealthtech / Investment",
    "Regtech / Compliance",
    "Crypto / Blockchain",
    "Embedded Finance",
  ],
  "Health & Life Sciences": [
    "Digital Health",
    "Biotech / Pharma",
    "Medtech / Devices",
    "Mental Health",
    "Healthtech Infrastructure",
    "Genomics / Diagnostics",
  ],
  "Climate & Energy": [
    "Clean Energy",
    "Carbon & Sustainability",
    "Circular Economy",
    "Agritech / FoodTech",
    "Water & Waste",
    "EV Infrastructure",
  ],
  "Consumer": [
    "E-Commerce / Marketplace",
    "D2C Brands",
    "Food & Beverage",
    "Social / Community",
    "Gaming / Entertainment",
    "Consumer Health / Wellness",
  ],
  "Industrials & Manufacturing": [
    "Robotics / Automation",
    "Industrial IoT",
    "Supply Chain / Logistics Tech",
    "3D Printing / Additive",
    "Materials / Chemicals",
    "Construction Tech",
  ],
  "Mobility & Transport": [
    "Autonomous Vehicles",
    "Micromobility",
    "Fleet / Logistics",
    "Ride-Hailing / Carsharing",
    "Aerospace / Drones",
    "Maritime / Shipping",
  ],
  "Proptech": [
    "Property Management",
    "Construction / BIM",
    "Real Estate Marketplace",
    "Smart Buildings / IoT",
    "Mortgage / Financing",
  ],
  "Edtech & HR": [
    "Online Learning",
    "Corporate Training",
    "HR Tech / Recruiting",
    "Workforce Management",
    "Credentialing / Assessment",
  ],
  "Deeptech & Hardware": [
    "Semiconductors / Chips",
    "Quantum Computing",
    "Space Tech",
    "Advanced Materials",
    "Photonics / Sensors",
    "Batteries / Energy Storage",
  ],
  "Media & Communications": [
    "Adtech / Martech",
    "Creator Economy",
    "Streaming / Content",
    "Telecom / Connectivity",
    "Publishing / News",
  ],
  "Legal & Governance": [
    "Legaltech",
    "Govtech / Civic Tech",
    "Identity / KYC",
    "Compliance / Audit",
  ],
  "Travel & Hospitality": [
    "Online Travel",
    "Hospitality Tech",
    "Events / Ticketing",
    "Restaurant Tech",
  ],
  "Financial Infrastructure": [
    "Capital Markets Infra",
    "Banking-as-a-Service",
    "Treasury / CFO Tools",
    "Fund Administration",
  ],
} as const;

/** Flat list of all sector names (for dropdowns) */
export const SECTORS: string[] = Object.keys(SECTOR_TAXONOMY);

/** Flat list of all subsector names (for dropdowns) */
export const SUBSECTORS: string[] = Object.values(SECTOR_TAXONOMY).flatMap(
  (subs) => [...subs]
);

// ---------------------------------------------------------------------------
// Lookup maps (case-insensitive)
// ---------------------------------------------------------------------------

const sectorLookup = new Map<string, string>();
for (const sector of SECTORS) {
  sectorLookup.set(sector.toLowerCase(), sector);
}

const subsectorLookup = new Map<string, { sector: string; subsector: string }>();
for (const [sector, subs] of Object.entries(SECTOR_TAXONOMY)) {
  for (const sub of subs) {
    subsectorLookup.set(sub.toLowerCase(), { sector, subsector: sub });
  }
}

/**
 * Case-insensitive sector lookup. Returns canonical name or null.
 */
export function validateSector(input: string | null | undefined): string | null {
  if (!input) return null;
  return sectorLookup.get(input.toLowerCase()) ?? null;
}

/**
 * Case-insensitive subsector lookup within a given sector.
 * Returns canonical subsector name or null.
 */
export function validateSubsector(
  sector: string | null | undefined,
  input: string | null | undefined
): string | null {
  if (!input) return null;
  const match = subsectorLookup.get(input.toLowerCase());
  if (!match) return null;
  // If sector is provided, ensure the subsector belongs to it
  if (sector && match.sector.toLowerCase() !== sector.toLowerCase()) return null;
  return match.subsector;
}

/**
 * Format the full taxonomy as a string for LLM prompts.
 */
export function taxonomyForPrompt(): string {
  const lines: string[] = [];
  for (const [sector, subs] of Object.entries(SECTOR_TAXONOMY)) {
    lines.push(`${sector}: ${subs.join(", ")}`);
  }
  return lines.join("\n");
}
