"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GlobalFilters = {
  region: string;
  country: string;
  sectors: string[];
  stages: string[];
};

export const EMPTY_FILTERS: GlobalFilters = {
  region: "",
  country: "",
  sectors: [],
  stages: [],
};

export const VIEWER_REGION = "Europe";

// ---------------------------------------------------------------------------
// Region → Country mapping
// ---------------------------------------------------------------------------

export const REGION_COUNTRIES: Record<string, string[]> = {
  Europe: [
    "Germany", "France", "United Kingdom", "UK", "Netherlands", "Sweden",
    "Switzerland", "Spain", "Italy", "Ireland", "Finland", "Denmark",
    "Norway", "Belgium", "Austria", "Portugal", "Poland", "Czech Republic",
    "Estonia", "Lithuania", "Latvia", "Romania", "Hungary", "Luxembourg",
    "Croatia", "Bulgaria", "Greece", "Slovakia", "Slovenia",
  ],
  "North America": ["United States", "US", "USA", "Canada", "Mexico"],
  Asia: [
    "China", "Japan", "South Korea", "India", "Singapore", "Indonesia",
    "Thailand", "Vietnam", "Philippines", "Malaysia", "Taiwan", "Hong Kong",
    "Bangladesh", "Pakistan", "Sri Lanka",
  ],
  "Middle East & Africa": [
    "Israel", "UAE", "United Arab Emirates", "Saudi Arabia", "Turkey",
    "Egypt", "Nigeria", "South Africa", "Kenya", "Ghana", "Morocco",
    "Jordan", "Bahrain", "Qatar", "Kuwait", "Oman",
  ],
  "Latin America": [
    "Brazil", "Mexico", "Colombia", "Argentina", "Chile", "Peru",
    "Uruguay", "Ecuador", "Costa Rica",
  ],
  Oceania: ["Australia", "New Zealand"],
};

export const ALL_REGIONS = Object.keys(REGION_COUNTRIES);

// ---------------------------------------------------------------------------
// Region presets (sub-region shortcuts)
// ---------------------------------------------------------------------------

export const REGION_PRESETS: { label: string; countries: string[] }[] = [
  { label: "DACH", countries: ["Germany", "Austria", "Switzerland"] },
  { label: "Nordics", countries: ["Sweden", "Finland", "Denmark", "Norway"] },
  { label: "Benelux", countries: ["Belgium", "Netherlands", "Luxembourg"] },
  { label: "UK & Ireland", countries: ["United Kingdom", "UK", "Ireland"] },
  { label: "CEE", countries: ["Poland", "Czech Republic", "Hungary", "Romania", "Estonia", "Lithuania", "Latvia", "Croatia", "Bulgaria", "Slovakia", "Slovenia"] },
  { label: "Southern Europe", countries: ["Spain", "Italy", "Portugal", "Greece"] },
];

const EUROPEAN_PRESET_LABELS = new Set(
  REGION_PRESETS.map((p) => p.label)
);

/**
 * Returns true if the given region value is "Europe", a European preset, or
 * empty (meaning the Europe default applies for viewers).
 */
export function isEuropeanFilter(region: string): boolean {
  if (!region || region === VIEWER_REGION) return true;
  if (region.startsWith("preset:")) {
    return EUROPEAN_PRESET_LABELS.has(region.slice(7));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

export const STAGES = [
  "Pre-Seed", "Seed", "Series A", "Series B", "Series C",
  "Series D", "Growth", "Late Stage", "Debt", "Grant",
];

export const STAGE_COLORS: Record<string, string> = {
  "Pre-Seed": "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/25",
  "Seed": "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
  "Series A": "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/25",
  "Series B": "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/25",
  "Series C": "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25",
  "Series D": "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/25",
  "Growth": "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/25",
  "Late Stage": "bg-pink-500/15 text-pink-700 dark:text-pink-400 border-pink-500/25",
  "Debt": "bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/25",
  "Grant": "bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/25",
};

// ---------------------------------------------------------------------------
// Live summary stats (populated by first data-fetching page)
// ---------------------------------------------------------------------------

export type FilterStats = {
  totalDeals: number;
  totalCapital: number;
  totalCompanies: number;
  totalInvestors: number;
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type GlobalFiltersContextValue = {
  filters: GlobalFilters;
  setFilters: (f: GlobalFilters) => void;
  updateFilter: (patch: Partial<GlobalFilters>) => void;
  toggleStage: (stage: string) => void;
  toggleSector: (sector: string) => void;
  clearFilters: () => void;
  activeCount: number;
  availableCountries: string[];
  setAvailableCountries: (countries: string[]) => void;
  stats: FilterStats | null;
  setStats: (s: FilterStats) => void;
  activePreset: string;
  applyPreset: (presetLabel: string) => void;
};

const GlobalFiltersContext = createContext<GlobalFiltersContextValue | null>(null);

export function GlobalFiltersProvider({ children, role }: { children: React.ReactNode; role?: string }) {
  const isViewer = role !== "admin";
  const defaultFilters = isViewer ? { ...EMPTY_FILTERS, region: VIEWER_REGION } : EMPTY_FILTERS;
  const [filters, setFiltersRaw] = useState<GlobalFilters>(defaultFilters);
  const [availableCountries, setAvailableCountriesRaw] = useState<string[]>([]);
  const [stats, setStatsRaw] = useState<FilterStats | null>(null);
  const [activePreset, setActivePreset] = useState("");

  const setFilters = useCallback((f: GlobalFilters) => {
    setFiltersRaw(f);
    setActivePreset("");
  }, []);

  const updateFilter = useCallback((patch: Partial<GlobalFilters>) => {
    // Viewers must stay within Europe – prevent clearing or switching to non-European regions
    if (isViewer && patch.region !== undefined) {
      if (!patch.region || (!isEuropeanFilter(patch.region) && !REGION_COUNTRIES[VIEWER_REGION]?.map(c => c.toLowerCase()).includes(patch.region.toLowerCase()))) {
        patch = { ...patch, region: VIEWER_REGION };
      }
    }

    setFiltersRaw((prev) => {
      const next = { ...prev, ...patch };
      if (patch.region !== undefined && next.country) {
        const regionSet = new Set(
          (REGION_COUNTRIES[next.region] ?? []).map((c) => c.toLowerCase())
        );
        if (next.region && !regionSet.has(next.country.toLowerCase())) {
          next.country = "";
        }
      }
      return next;
    });
    // Clear preset when individual filters change
    if (!("_preset" in patch)) setActivePreset("");
  }, [isViewer]);

  const toggleStage = useCallback((stage: string) => {
    setFiltersRaw((prev) => ({
      ...prev,
      stages: prev.stages.includes(stage)
        ? prev.stages.filter((s) => s !== stage)
        : [...prev.stages, stage],
    }));
  }, []);

  const toggleSector = useCallback((sector: string) => {
    setFiltersRaw((prev) => ({
      ...prev,
      sectors: prev.sectors.includes(sector)
        ? prev.sectors.filter((s) => s !== sector)
        : [...prev.sectors, sector],
    }));
  }, []);

  const clearFilters = useCallback(() => {
    setFiltersRaw(defaultFilters);
    setActivePreset("");
  }, [defaultFilters]);

  const applyPreset = useCallback((presetLabel: string) => {
    const preset = REGION_PRESETS.find((p) => p.label === presetLabel);
    if (!preset) return;
    setFiltersRaw((prev) => ({ ...prev, region: `preset:${presetLabel}`, country: "" }));
    setActivePreset(presetLabel);
  }, []);

  // For viewers, "Europe" is the baseline – don't count it as active
  const regionActive = filters.region
    ? (isViewer && filters.region === VIEWER_REGION ? 0 : 1)
    : 0;
  const activeCount =
    regionActive +
    (filters.country ? 1 : 0) +
    filters.sectors.length +
    filters.stages.length;

  const setAvailableCountries = useCallback((countries: string[]) => {
    setAvailableCountriesRaw((prev) => {
      if (prev.length >= countries.length) return prev;
      return countries;
    });
  }, []);

  const setStats = useCallback((s: FilterStats) => {
    setStatsRaw(s);
  }, []);

  const value = useMemo(
    () => ({
      filters,
      setFilters,
      updateFilter,
      toggleStage,
      toggleSector,
      clearFilters,
      activeCount,
      availableCountries,
      setAvailableCountries,
      stats,
      setStats,
      activePreset,
      applyPreset,
    }),
    [filters, setFilters, updateFilter, toggleStage, toggleSector, clearFilters, activeCount, availableCountries, setAvailableCountries, stats, setStats, activePreset, applyPreset]
  );

  return (
    <GlobalFiltersContext.Provider value={value}>
      {children}
    </GlobalFiltersContext.Provider>
  );
}

export function useGlobalFilters() {
  const ctx = useContext(GlobalFiltersContext);
  if (!ctx) throw new Error("useGlobalFilters must be used within GlobalFiltersProvider");
  return ctx;
}

/**
 * Resolve preset regions to country arrays for filtering.
 * Returns null if no geo filter is active.
 */
export function resolveGeoFilter(filters: GlobalFilters): {
  countries: Set<string>;
} | null {
  if (filters.country) {
    return { countries: new Set([filters.country.toLowerCase()]) };
  }
  if (filters.region) {
    if (filters.region.startsWith("preset:")) {
      const presetName = filters.region.slice(7);
      const preset = REGION_PRESETS.find((p) => p.label === presetName);
      if (preset) {
        return { countries: new Set(preset.countries.map((c) => c.toLowerCase())) };
      }
    }
    const regionCountries = REGION_COUNTRIES[filters.region];
    if (regionCountries) {
      return { countries: new Set(regionCountries.map((c) => c.toLowerCase())) };
    }
  }
  return null;
}
