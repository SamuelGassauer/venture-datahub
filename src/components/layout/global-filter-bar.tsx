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
  REGION_COUNTRIES,
  REGION_PRESETS,
  STAGES,
  STAGE_COLORS,
} from "@/lib/global-filters";
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
      <div className="relative overflow-hidden rounded-[16px] lg-inset">
        {/* Decorative gradient mesh */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/[0.07] blur-3xl" />
          <div className="absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-blue-500/[0.05] blur-3xl" />
        </div>

        <div className="relative">
          {/* -- Top section: Headline + Stats -- */}
          <div className="px-6 pt-6 pb-5">
            <div className="flex items-start justify-between gap-6">
              {/* Headline */}
              <div className="flex items-start gap-4 min-w-0">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-gradient-to-br from-primary to-primary/70">
                  <Search className="h-6 w-6 text-primary-foreground" />
                </div>
                <div className="min-w-0 pt-0.5">
                  <h2 className="text-[17px] font-semibold tracking-[-0.02em] leading-tight text-foreground/85">
                    Sourcen Sie Deals, Investoren und Marktdaten
                  </h2>
                  <p className="text-[13px] tracking-[-0.01em] text-foreground/45 leading-relaxed mt-1 max-w-xl">
                    W&auml;hlen Sie Region, Sektor oder Phase &mdash; alle Ansichten der Plattform passen sich sofort an Ihre Auswahl an.
                  </p>
                </div>
              </div>

              {/* Live stats */}
              {stats && (
                <div className="hidden xl:grid grid-cols-4 gap-px shrink-0 rounded-[10px] bg-foreground/[0.04] overflow-hidden">
                  <MiniStat icon={Zap} value={fmtNum(stats.totalDeals)} label="Deals" />
                  <MiniStat icon={TrendingUp} value={fmtCompact(stats.totalCapital)} label="Kapital" />
                  <MiniStat icon={Building2} value={fmtNum(stats.totalCompanies)} label="Firmen" />
                  <MiniStat icon={Users} value={fmtNum(stats.totalInvestors)} label="Investoren" />
                </div>
              )}
            </div>
          </div>

          {/* -- Filter controls -- */}
          <div className="glass-status-bar">
            <div className="px-6 py-4 space-y-3">
              {/* Row 1: Dropdowns + Stage chips */}
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Geo */}
                <GeoFilterPopover
                  value={geoLabel}
                  country={filters.country}
                  countryOptions={countryOptions}
                  activePreset={activePreset}
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

                <div className="hidden sm:block h-7 w-px bg-foreground/[0.08]" />

                {/* Stage pipeline (multi-select) */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-foreground/35 mr-0.5">
                    Phase
                  </span>
                  {STAGES.map((stage) => {
                    const isActive = filters.stages.includes(stage);
                    const colors = STAGE_COLORS[stage] ?? "";
                    return (
                      <button
                        key={stage}
                        onClick={() => toggleStage(stage)}
                        className={`glass-capsule-btn whitespace-nowrap px-3 py-1.5 text-[11px] font-medium transition-all ${
                          isActive
                            ? `${colors}`
                            : "text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.06]"
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
                    className="ml-auto glass-capsule-btn flex items-center gap-1.5 bg-destructive/5 px-3.5 py-1.5 text-[11px] font-medium text-destructive hover:bg-destructive/10 transition-all"
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
                    <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-primary/60">
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
    <div className="flex flex-col items-center gap-0.5 bg-foreground/[0.02] px-5 py-2.5">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3 w-3 text-foreground/35" />
        <span className="text-[13px] font-semibold tabular-nums text-foreground/85">{value}</span>
      </div>
      <span className="text-[11px] font-medium tracking-[0.04em] uppercase text-foreground/45">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter pill
// ---------------------------------------------------------------------------

const PILL_VARIANTS = {
  blue: "text-blue-600 dark:text-blue-400 bg-blue-500/8 border-blue-500/20",
  amber: "text-amber-600 dark:text-amber-400 bg-amber-500/8 border-amber-500/20",
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
      className={`inline-flex items-center gap-1.5 rounded-full border-[0.5px] px-3 py-1 text-[11px] font-medium transition-all ${cls}`}
    >
      <Icon className="h-3 w-3" />
      {label}
      <button
        onClick={onRemove}
        className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/[0.08] transition-colors"
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
  country,
  countryOptions,
  activePreset,
  onCountry,
  onPreset,
  onClear,
}: {
  value: string;
  country: string;
  countryOptions: string[];
  activePreset: string;
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
          className={`glass-capsule-btn flex h-10 items-center gap-2 px-4 text-[13px] font-semibold transition-all ${
            hasGeo
              ? "border-blue-500/30 bg-blue-500/10 text-foreground/85"
              : "text-foreground/55 hover:bg-foreground/[0.06] hover:text-foreground/70"
          }`}
        >
          <Globe className={`h-4 w-4 ${hasGeo ? "text-blue-500" : "text-foreground/35"}`} />
          {hasGeo ? value : "Europa"}
          <ChevronDown className="h-3 w-3 text-foreground/30 ml-0.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="glass-popover w-[360px] p-0" align="start" sideOffset={8}>
        <Command>
          <CommandInput placeholder="Region oder Land suchen..." className="glass-search-input" />
          <CommandList className="max-h-[380px]">
            <CommandEmpty>Keine Treffer.</CommandEmpty>

            <CommandGroup heading="Schnellauswahl">
              {REGION_PRESETS.map((preset) => (
                <CommandItem
                  key={preset.label}
                  value={preset.label}
                  onSelect={() => { onPreset(preset.label); setOpen(false); }}
                  className="py-2 rounded-[6px]"
                >
                  <div className="flex items-center gap-2.5 flex-1">
                    <span className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-blue-500/8 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                      {preset.label.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="font-semibold text-[13px] text-foreground/85">{preset.label}</span>
                    <span className="ml-auto text-[11px] text-foreground/35 tabular-nums">
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
                      className="rounded-[6px]"
                    >
                      <MapPin className="h-3.5 w-3.5 text-foreground/40" />
                      <span className="text-[13px] text-foreground/70">{c}</span>
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
                  <CommandItem onSelect={() => { onClear(); setOpen(false); }} className="rounded-[6px]">
                    <Globe className="h-3.5 w-3.5 text-foreground/40" />
                    <span className="text-[13px] text-foreground/70">Zur&uuml;ck zu ganz Europa</span>
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
    blue: { border: "border-blue-500/30", bg: "bg-blue-500/10", text: "text-blue-500" },
    amber: { border: "border-amber-500/30", bg: "bg-amber-500/10", text: "text-amber-500" },
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
          className={`glass-capsule-btn flex h-10 items-center gap-2 px-4 text-[13px] font-semibold transition-all ${
            hasSelection
              ? `${colors.border} ${colors.bg} text-foreground/85`
              : "text-foreground/55 hover:bg-foreground/[0.06] hover:text-foreground/70"
          }`}
        >
          <Icon className={`h-4 w-4 ${hasSelection ? colors.text : "text-foreground/35"}`} />
          {triggerLabel}
          <ChevronDown className="h-3 w-3 text-foreground/30 ml-0.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="glass-popover w-[280px] p-0" align="start" sideOffset={8}>
        <Command>
          <CommandInput placeholder={placeholder} className="glass-search-input" />
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
                    className="rounded-[6px]"
                  >
                    <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-[4px] border-[0.5px] ${isSelected ? "bg-primary border-primary" : "border-foreground/[0.15]"}`}>
                      {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <span className="text-[13px] text-foreground/70">{opt}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {hasSelection && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => { onClear(); setOpen(false); }} className="text-destructive rounded-[6px]">
                    <X className="h-3.5 w-3.5" />
                    <span className="text-[13px]">{label}-Filter entfernen</span>
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
