"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Globe,
  MapPin,
  Briefcase,
  X,
  Check,
  TrendingUp,
  Building2,
  Users,
  Zap,
  ChevronDown,
  Sparkles,
  Search,
} from "lucide-react";
import { SECTORS } from "@/lib/taxonomy";
import {
  useGlobalFilters,
  ALL_REGIONS,
  REGION_COUNTRIES,
  REGION_PRESETS,
  STAGES,
  STAGE_COLORS,
} from "@/lib/global-filters";
import type { GlobalFilters } from "@/lib/global-filters";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtCompact(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function GlobalFilterBar() {
  const { data: session, status } = useSession();

  if (status === "loading") return null;
  if (!session) return null;
  if (session.user?.role === "admin") return null;

  return <FilterBarInner />;
}

// ---------------------------------------------------------------------------
// Inner
// ---------------------------------------------------------------------------

function FilterBarInner() {
  const {
    filters,
    updateFilter,
    toggleStage,
    toggleSector,
    clearFilters,
    activeCount,
    availableCountries,
    stats,
    setStats,
    activePreset,
    applyPreset,
  } = useGlobalFilters();

  // Fetch stats once
  useEffect(() => {
    if (stats) return;
    fetch("/api/graph-stats")
      .then((r) => r.json())
      .then((data) => {
        setStats({
          totalDeals: data.summary?.totalRounds ?? 0,
          totalCapital: data.summary?.totalFunding ?? 0,
          totalCompanies: data.summary?.totalCompanies ?? 0,
          totalInvestors: data.summary?.totalInvestors ?? 0,
        });
      })
      .catch(() => {});
  }, [stats, setStats]);

  const countryOptions = useMemo(() => {
    if (!filters.region) return availableCountries;
    if (filters.region.startsWith("preset:")) return availableCountries;
    const regionSet = new Set(
      (REGION_COUNTRIES[filters.region] ?? []).map((c) => c.toLowerCase())
    );
    return availableCountries.filter((c) => regionSet.has(c.toLowerCase()));
  }, [filters.region, availableCountries]);

  const geoLabel = useMemo(() => {
    if (filters.country) return filters.country;
    if (activePreset) return activePreset;
    // Don't show "Europe" as a label — it's the default for viewers
    if (filters.region && filters.region !== "Europe" && !filters.region.startsWith("preset:")) return filters.region;
    return "";
  }, [filters.country, filters.region, activePreset]);

  return (
    <div className="px-4 pt-4 pb-1">
      <div className="relative overflow-hidden rounded-2xl border bg-card shadow-lg shadow-black/[0.04] dark:shadow-black/20">
        {/* Decorative gradient mesh */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/[0.07] blur-3xl" />
          <div className="absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-blue-500/[0.05] blur-3xl" />
        </div>

        <div className="relative">
          {/* ── Top section: Headline + Stats ── */}
          <div className="px-6 pt-6 pb-5">
            <div className="flex items-start justify-between gap-6">
              {/* Headline */}
              <div className="flex items-start gap-4 min-w-0">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 shadow-md shadow-primary/20">
                  <Search className="h-6 w-6 text-primary-foreground" />
                </div>
                <div className="min-w-0 pt-0.5">
                  <h2 className="text-xl font-extrabold tracking-tight leading-tight">
                    Sourcen Sie Deals, Investoren und Marktdaten
                  </h2>
                  <p className="text-[13px] text-muted-foreground leading-relaxed mt-1 max-w-xl">
                    W&auml;hlen Sie Region, Sektor oder Phase &mdash; alle Ansichten der Plattform passen sich sofort an Ihre Auswahl an.
                  </p>
                </div>
              </div>

              {/* Live stats */}
              {stats && (
                <div className="hidden xl:grid grid-cols-4 gap-px shrink-0 rounded-xl bg-border/50 overflow-hidden ring-1 ring-border/50">
                  <MiniStat icon={Zap} value={fmtNum(stats.totalDeals)} label="Deals" />
                  <MiniStat icon={TrendingUp} value={fmtCompact(stats.totalCapital)} label="Kapital" />
                  <MiniStat icon={Building2} value={fmtNum(stats.totalCompanies)} label="Firmen" />
                  <MiniStat icon={Users} value={fmtNum(stats.totalInvestors)} label="Investoren" />
                </div>
              )}
            </div>
          </div>

          {/* ── Filter controls ── */}
          <div className="border-t bg-muted/30">
            <div className="px-6 py-4 space-y-3">
              {/* Row 1: Dropdowns + Stage chips */}
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Geo */}
                <GeoFilterPopover
                  value={geoLabel}
                  region={filters.region}
                  country={filters.country}
                  countryOptions={countryOptions}
                  activePreset={activePreset}
                  onRegion={(r) => updateFilter({ region: r, country: "" })}
                  onCountry={(c) => updateFilter({ country: c })}
                  onPreset={applyPreset}
                  onClear={() => updateFilter({ region: "Europe", country: "" })}
                />

                {/* Sector */}
                <MultiComboboxFilter
                  icon={Briefcase}
                  label="Sektor"
                  selected={filters.sectors}
                  options={SECTORS}
                  onToggle={toggleSector}
                  onClear={() => updateFilter({ sectors: [] })}
                  placeholder="Sektor suchen..."
                  activeColor="amber"
                />

                <div className="hidden sm:block h-7 w-px bg-border/60" />

                {/* Stage pipeline (multi-select) */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mr-0.5">
                    Phase
                  </span>
                  {STAGES.map((stage) => {
                    const isActive = filters.stages.includes(stage);
                    const colors = STAGE_COLORS[stage] ?? "";
                    return (
                      <button
                        key={stage}
                        onClick={() => toggleStage(stage)}
                        className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-all ${
                          isActive
                            ? `${colors} shadow-sm`
                            : "border-transparent text-muted-foreground/50 hover:text-foreground hover:bg-accent/60"
                        }`}
                      >
                        {stage}
                      </button>
                    );
                  })}
                </div>

                {/* Clear */}
                {activeCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="ml-auto flex items-center gap-1.5 rounded-lg border border-destructive/20 bg-destructive/5 px-3.5 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/10 transition-all"
                  >
                    <X className="h-3.5 w-3.5" />
                    Zur&uuml;cksetzen
                  </button>
                )}
              </div>

              {/* Row 2: Active pills */}
              {activeCount > 0 && (
                <div className="flex items-center gap-2.5 pt-1">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3 text-primary/60" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-primary/60">
                      Aktive Filter
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {geoLabel && (
                      <Pill
                        icon={filters.country ? MapPin : Globe}
                        label={geoLabel}
                        onRemove={() => updateFilter({ region: "Europe", country: "" })}
                        variant="blue"
                      />
                    )}
                    {filters.sectors.map((sector) => (
                      <Pill
                        key={sector}
                        icon={Briefcase}
                        label={sector}
                        onRemove={() => toggleSector(sector)}
                        variant="amber"
                      />
                    ))}
                    {filters.stages.map((stage) => (
                      <Pill
                        key={stage}
                        icon={Zap}
                        label={stage}
                        onRemove={() => toggleStage(stage)}
                        variant="stage"
                        stageColor={STAGE_COLORS[stage]}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mini stat in the top-right grid
// ---------------------------------------------------------------------------

function MiniStat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Zap;
  value: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 bg-card px-5 py-2.5">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3 w-3 text-muted-foreground/50" />
        <span className="text-sm font-extrabold tabular-nums text-foreground">{value}</span>
      </div>
      <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter pill
// ---------------------------------------------------------------------------

const PILL_VARIANTS = {
  blue: "text-blue-700 dark:text-blue-300 bg-blue-500/10 border-blue-500/20 shadow-blue-500/5",
  amber: "text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/20 shadow-amber-500/5",
  stage: "",
} as const;

function Pill({
  icon: Icon,
  label,
  onRemove,
  variant,
  stageColor,
}: {
  icon: typeof Globe;
  label: string;
  onRemove: () => void;
  variant: "blue" | "amber" | "stage";
  stageColor?: string;
}) {
  const cls =
    variant === "stage" && stageColor
      ? stageColor
      : PILL_VARIANTS[variant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold shadow-sm transition-all hover:shadow-md ${cls}`}
    >
      <Icon className="h-3 w-3" />
      {label}
      <button
        onClick={onRemove}
        className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Geo filter popover
// ---------------------------------------------------------------------------

function GeoFilterPopover({
  value,
  region,
  country,
  countryOptions,
  activePreset,
  onRegion,
  onCountry,
  onPreset,
  onClear,
}: {
  value: string;
  region: string;
  country: string;
  countryOptions: string[];
  activePreset: string;
  onRegion: (r: string) => void;
  onCountry: (c: string) => void;
  onPreset: (p: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const hasGeo = !!value;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-all ${
            hasGeo
              ? "border-blue-500/30 bg-blue-500/10 text-foreground shadow-sm shadow-blue-500/5"
              : "bg-background text-muted-foreground hover:border-foreground/20 hover:bg-accent/50 hover:shadow-sm"
          }`}
        >
          <Globe className={`h-4 w-4 ${hasGeo ? "text-blue-500" : "text-muted-foreground/50"}`} />
          {hasGeo ? value : "Europa"}
          <ChevronDown className="h-3 w-3 text-muted-foreground/40 ml-0.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0 rounded-xl shadow-xl" align="start" sideOffset={8}>
        <Command>
          <CommandInput placeholder="Region oder Land suchen..." />
          <CommandList className="max-h-[380px]">
            <CommandEmpty>Keine Treffer.</CommandEmpty>

            <CommandGroup heading="Schnellauswahl">
              {REGION_PRESETS.map((preset) => (
                <CommandItem
                  key={preset.label}
                  value={preset.label}
                  onSelect={() => { onPreset(preset.label); setOpen(false); }}
                  className="py-2"
                >
                  <div className="flex items-center gap-2.5 flex-1">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-500/10 text-[10px] font-extrabold text-blue-600 dark:text-blue-400">
                      {preset.label.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="font-semibold">{preset.label}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                      {preset.countries.length} L&auml;nder
                    </span>
                  </div>
                  {activePreset === preset.label && <Check className="h-4 w-4 text-blue-500 ml-2" />}
                </CommandItem>
              ))}
            </CommandGroup>

            {/* Regionen section hidden for viewers – they are restricted to Europe */}

            {countryOptions.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="L&auml;nder">
                  {countryOptions.map((c) => (
                    <CommandItem
                      key={c}
                      value={c}
                      onSelect={() => { onCountry(country === c ? "" : c); setOpen(false); }}
                    >
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{c}</span>
                      {country === c && <Check className="h-4 w-4 text-primary ml-auto" />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {(activePreset || country) && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => { onClear(); setOpen(false); }}>
                    <Globe className="h-3.5 w-3.5" />
                    Zurück zu ganz Europa
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Multi-select combobox filter
// ---------------------------------------------------------------------------

function MultiComboboxFilter({
  icon: Icon,
  label,
  selected,
  options,
  onToggle,
  onClear,
  placeholder,
  activeColor,
}: {
  icon: typeof Briefcase;
  label: string;
  selected: string[];
  options: string[];
  onToggle: (v: string) => void;
  onClear: () => void;
  placeholder: string;
  activeColor: "blue" | "amber";
}) {
  const [open, setOpen] = useState(false);
  const colorMap = {
    blue: { border: "border-blue-500/30", bg: "bg-blue-500/10", text: "text-blue-500", shadow: "shadow-blue-500/5" },
    amber: { border: "border-amber-500/30", bg: "bg-amber-500/10", text: "text-amber-500", shadow: "shadow-amber-500/5" },
  };
  const colors = colorMap[activeColor];
  const hasSelection = selected.length > 0;

  const triggerLabel = hasSelection
    ? selected.length === 1
      ? selected[0]
      : `${selected.length} ${label}`
    : label;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-all ${
            hasSelection
              ? `${colors.border} ${colors.bg} text-foreground shadow-sm ${colors.shadow}`
              : "bg-background text-muted-foreground hover:border-foreground/20 hover:bg-accent/50 hover:shadow-sm"
          }`}
        >
          <Icon className={`h-4 w-4 ${hasSelection ? colors.text : "text-muted-foreground/50"}`} />
          {triggerLabel}
          <ChevronDown className="h-3 w-3 text-muted-foreground/40 ml-0.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0 rounded-xl shadow-xl" align="start" sideOffset={8}>
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>Keine Treffer.</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => {
                const isSelected = selected.includes(opt);
                return (
                  <CommandItem
                    key={opt}
                    value={opt}
                    onSelect={() => onToggle(opt)}
                  >
                    <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded border ${isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                      {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <span>{opt}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {hasSelection && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => { onClear(); setOpen(false); }} className="text-destructive">
                    <X className="h-3.5 w-3.5" />
                    {label}-Filter entfernen
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
