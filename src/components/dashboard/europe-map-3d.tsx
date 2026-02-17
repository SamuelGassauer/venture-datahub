"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { geoMercator, geoPath } from "d3-geo";
import { scaleLinear, scaleSqrt } from "d3-scale";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { FeatureCollection, Feature, Geometry } from "geojson";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CountryDatum = {
  country: string;
  totalAmount: number;
  dealCount: number;
  companyCount: number;
};

export type RecentDeal = {
  company: string;
  companyCountry: string | null;
  amount: number | null;
  stage: string | null;
};

type EuropeMap3DProps = {
  fundingByCountry: CountryDatum[];
  recentDeals?: RecentDeal[];
  onCountryClick?: (country: string) => void;
  activeCountry?: string;
  className?: string;
};

// ---------------------------------------------------------------------------
// Country name → ISO 3166-1 numeric (for world-atlas topojson)
// ---------------------------------------------------------------------------

const COUNTRY_TO_ISO: Record<string, string> = {
  Germany: "276",
  "United Kingdom": "826",
  France: "250",
  Spain: "724",
  Italy: "380",
  Netherlands: "528",
  Sweden: "752",
  Switzerland: "756",
  Norway: "578",
  Denmark: "208",
  Finland: "246",
  Austria: "040",
  Belgium: "056",
  Ireland: "372",
  Portugal: "620",
  Poland: "616",
  "Czech Republic": "203",
  Czechia: "203",
  Romania: "642",
  Hungary: "348",
  Greece: "300",
  Croatia: "191",
  Estonia: "233",
  Latvia: "428",
  Lithuania: "440",
  Slovakia: "703",
  Slovenia: "705",
  Luxembourg: "442",
  Bulgaria: "100",
  Iceland: "352",
  Serbia: "688",
  Ukraine: "804",
  Belarus: "112",
  Moldova: "498",
  "Bosnia and Herzegovina": "070",
  "North Macedonia": "807",
  Albania: "008",
  Montenegro: "499",
  Malta: "470",
  Cyprus: "196",
  Turkey: "792",
};

const ISO_TO_COUNTRY: Record<string, string> = {};
for (const [name, code] of Object.entries(COUNTRY_TO_ISO)) {
  ISO_TO_COUNTRY[code] = name;
}

// European ISO codes set for filtering topojson
const EUROPEAN_CODES = new Set(Object.values(COUNTRY_TO_ISO));

// Approximate centroids (lat, lng) for pulsing dots
const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  Germany: [10.4, 51.2],
  "United Kingdom": [-1.2, 52.5],
  France: [2.2, 46.6],
  Spain: [-3.7, 40.5],
  Italy: [12.6, 42.5],
  Netherlands: [5.3, 52.1],
  Sweden: [15.4, 62.0],
  Switzerland: [8.2, 46.8],
  Norway: [8.5, 61.0],
  Denmark: [9.5, 56.3],
  Finland: [26.0, 64.0],
  Austria: [13.3, 47.5],
  Belgium: [4.5, 50.8],
  Ireland: [-8.0, 53.4],
  Portugal: [-8.2, 39.4],
  Poland: [19.1, 51.9],
  "Czech Republic": [15.5, 49.8],
  Czechia: [15.5, 49.8],
  Romania: [25.0, 45.9],
  Hungary: [19.5, 47.2],
  Greece: [23.7, 39.1],
  Croatia: [15.5, 45.1],
  Estonia: [25.0, 58.6],
  Latvia: [24.6, 56.9],
  Lithuania: [24.0, 55.2],
  Slovakia: [19.7, 48.7],
  Slovenia: [14.8, 46.2],
  Luxembourg: [6.1, 49.6],
  Bulgaria: [25.5, 42.7],
  Iceland: [-19.0, 65.0],
  Serbia: [21.0, 44.0],
  Ukraine: [31.2, 48.4],
  Turkey: [35.2, 39.9],
};

// ---------------------------------------------------------------------------
// TopoJSON fetcher
// ---------------------------------------------------------------------------

const TOPO_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json";

let topoCache: Topology | null = null;

async function fetchTopo(): Promise<Topology> {
  if (topoCache) return topoCache;
  const res = await fetch(TOPO_URL);
  topoCache = (await res.json()) as Topology;
  return topoCache;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(amount: number): string {
  if (amount >= 1e9) return `$${(amount / 1e9).toFixed(1)}B`;
  if (amount >= 1e6) return `$${(amount / 1e6).toFixed(1)}M`;
  if (amount >= 1e3) return `$${(amount / 1e3).toFixed(0)}K`;
  if (amount > 0) return `$${amount.toFixed(0)}`;
  return "$0";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EuropeMap3D({
  fundingByCountry,
  recentDeals = [],
  onCountryClick,
  activeCountry,
  className = "",
}: EuropeMap3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [geoData, setGeoData] = useState<FeatureCollection | null>(null);
  const [dims, setDims] = useState({ width: 800, height: 520 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [loaded, setLoaded] = useState(false);

  // Build lookup map: country name → data
  const dataMap = useMemo(() => {
    const m = new Map<string, CountryDatum>();
    for (const d of fundingByCountry) {
      m.set(d.country, d);
    }
    return m;
  }, [fundingByCountry]);

  // Count recent deals per country (last N)
  const recentByCountry = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of recentDeals) {
      if (d.companyCountry) {
        m.set(d.companyCountry, (m.get(d.companyCountry) ?? 0) + 1);
      }
    }
    return m;
  }, [recentDeals]);

  // Max funding for color scale
  const maxFunding = useMemo(
    () => Math.max(...fundingByCountry.map((d) => d.totalAmount), 1),
    [fundingByCountry]
  );

  // Color scale: transparent → rich blue
  const colorScale = useMemo(
    () =>
      scaleLinear<string>()
        .domain([0, maxFunding * 0.15, maxFunding * 0.5, maxFunding])
        .range([
          "hsl(220, 50%, 25%)",
          "hsl(220, 60%, 35%)",
          "hsl(210, 70%, 45%)",
          "hsl(200, 80%, 55%)",
        ])
        .clamp(true),
    [maxFunding]
  );

  // Dot size scale
  const dotScale = useMemo(
    () =>
      scaleSqrt()
        .domain([0, Math.max(...fundingByCountry.map((d) => d.companyCount), 1)])
        .range([3, 14])
        .clamp(true),
    [fundingByCountry]
  );

  // Load topojson
  useEffect(() => {
    fetchTopo().then((topo) => {
      const countries = topo.objects.countries as GeometryCollection;
      const all = feature(topo, countries) as FeatureCollection;

      // Filter to European countries
      const euroFeatures = all.features.filter((f: Feature<Geometry>) =>
        EUROPEAN_CODES.has(String(f.id))
      );

      setGeoData({
        type: "FeatureCollection",
        features: euroFeatures,
      });
      setTimeout(() => setLoaded(true), 50);
    });
  }, []);

  // Responsive resize
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      setDims({ width, height: Math.min(width * 0.65, 520) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Projection
  const projection = useMemo(
    () =>
      geoMercator()
        .center([15, 54])
        .scale(dims.width * 0.9)
        .translate([dims.width / 2, dims.height / 2]),
    [dims]
  );

  const pathGen = useMemo(() => geoPath().projection(projection), [projection]);

  // Get country name from feature
  const getCountryName = useCallback(
    (f: Feature<Geometry>) => ISO_TO_COUNTRY[String(f.id)] ?? null,
    []
  );

  // Ticker data
  const tickerItems = useMemo(() => {
    const total = fundingByCountry.reduce((s, d) => s + d.totalAmount, 0);
    const totalDeals = fundingByCountry.reduce((s, d) => s + d.dealCount, 0);
    const totalCompanies = fundingByCountry.reduce(
      (s, d) => s + d.companyCount,
      0
    );
    const topCountry = [...fundingByCountry].sort(
      (a, b) => b.totalAmount - a.totalAmount
    )[0];

    return [
      { label: "Total Capital", value: fmt(total) },
      { label: "Deals", value: String(totalDeals) },
      { label: "Companies", value: String(totalCompanies) },
      {
        label: "Top Market",
        value: topCountry?.country ?? "—",
      },
      {
        label: "Recent Rounds",
        value: String(recentDeals.length),
      },
    ];
  }, [fundingByCountry, recentDeals]);

  // Hovered country data
  const hoveredData = hovered ? dataMap.get(hovered) : null;

  return (
    <div className={`relative ${className}`}>
      {/* ── Ticker Bar ── */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-t-xl border border-b-0 bg-card/80 backdrop-blur-sm px-4 py-2">
        <div className="flex h-2 w-2 items-center justify-center">
          <span className="absolute h-2 w-2 animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </div>
        <span className="mr-2 text-[10px] font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
          Live
        </span>
        {tickerItems.map((item, i) => (
          <span key={item.label} className="whitespace-nowrap">
            {i > 0 && (
              <span className="mx-1.5 text-muted-foreground/30">·</span>
            )}
            <span className="font-mono text-xs font-bold tabular-nums">
              {item.value}
            </span>{" "}
            <span className="text-[10px] text-muted-foreground">
              {item.label}
            </span>
          </span>
        ))}
      </div>

      {/* ── Map Container with 3D perspective ── */}
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-b-xl border bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950"
        style={{
          perspective: "1200px",
        }}
      >
        {/* Grid overlay for holographic feel */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        <svg
          width={dims.width}
          height={dims.height}
          viewBox={`0 0 ${dims.width} ${dims.height}`}
          className="relative"
          style={{
            transform: "rotateX(12deg) scale(1.02)",
            transformOrigin: "center 60%",
            transition: "transform 0.5s ease",
          }}
          onMouseMove={(e) => {
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) {
              setMousePos({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
              });
            }
          }}
          onMouseLeave={() => setHovered(null)}
        >
          {/* Defs: glow filter + gradient */}
          <defs>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter
              id="hotGlow"
              x="-100%"
              y="-100%"
              width="300%"
              height="300%"
            >
              <feGaussianBlur stdDeviation="12" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <radialGradient id="dotGlow">
              <stop offset="0%" stopColor="hsl(200, 90%, 65%)" stopOpacity="0.8" />
              <stop offset="100%" stopColor="hsl(200, 90%, 65%)" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Country paths */}
          {geoData?.features.map((f, i) => {
            const name = getCountryName(f);
            const d = pathGen(f) ?? undefined;
            const datum = name ? dataMap.get(name) : null;
            const isHovered = hovered === name;
            const isActive = activeCountry === name;
            const hasFunding = (datum?.totalAmount ?? 0) > 0;

            // Fill color
            let fill = "hsl(220, 20%, 18%)";
            if (hasFunding && datum) {
              fill = colorScale(datum.totalAmount);
            }

            // Hot zone glow for top-funded countries
            const isHot =
              datum && datum.totalAmount > maxFunding * 0.4;

            return (
              <g key={String(f.id)}>
                {/* Hot zone glow underlay */}
                {isHot && (
                  <path
                    d={d}
                    fill={colorScale(datum!.totalAmount)}
                    opacity={0.25}
                    filter="url(#hotGlow)"
                    className="pointer-events-none"
                  />
                )}
                <path
                  d={d}
                  fill={fill}
                  stroke={
                    isHovered || isActive
                      ? "hsl(200, 80%, 70%)"
                      : "hsl(220, 20%, 28%)"
                  }
                  strokeWidth={isHovered || isActive ? 1.5 : 0.5}
                  opacity={loaded ? 1 : 0}
                  className="cursor-pointer transition-all duration-300"
                  style={{
                    transitionDelay: `${i * 15}ms`,
                    filter:
                      isHovered || isActive
                        ? "brightness(1.3)"
                        : "brightness(1)",
                  }}
                  onMouseEnter={() => name && setHovered(name)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => name && onCountryClick?.(name)}
                />
              </g>
            );
          })}

          {/* Pulsing dots at country centroids */}
          {fundingByCountry.map((datum) => {
            const coords = COUNTRY_CENTROIDS[datum.country];
            if (!coords) return null;
            const pt = projection(coords);
            if (!pt) return null;
            const r = dotScale(datum.companyCount);
            const isHovered2 = hovered === datum.country;
            const recent = recentByCountry.get(datum.country) ?? 0;

            return (
              <g
                key={datum.country}
                className="cursor-pointer"
                onMouseEnter={() => setHovered(datum.country)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onCountryClick?.(datum.country)}
              >
                {/* Glow circle */}
                <circle
                  cx={pt[0]}
                  cy={pt[1]}
                  r={r * 2}
                  fill="url(#dotGlow)"
                  opacity={loaded ? 0.5 : 0}
                  className="transition-opacity duration-500 pointer-events-none"
                  style={{ transitionDelay: "300ms" }}
                />
                {/* Main dot */}
                <circle
                  cx={pt[0]}
                  cy={pt[1]}
                  r={r}
                  fill={colorScale(datum.totalAmount)}
                  stroke="hsl(200, 60%, 75%)"
                  strokeWidth={isHovered2 ? 2 : 0.5}
                  opacity={loaded ? 0.9 : 0}
                  filter={isHovered2 ? "url(#glow)" : undefined}
                  className="transition-all duration-300"
                  style={{ transitionDelay: "300ms" }}
                />
                {/* Pulse ring for countries with recent activity */}
                {recent > 0 && (
                  <circle
                    cx={pt[0]}
                    cy={pt[1]}
                    r={r}
                    fill="none"
                    stroke="hsl(160, 80%, 55%)"
                    strokeWidth={1.5}
                    opacity={loaded ? 1 : 0}
                    className="pointer-events-none"
                    style={{
                      animation: "map-pulse 2s ease-out infinite",
                      transformOrigin: `${pt[0]}px ${pt[1]}px`,
                    }}
                  />
                )}
                {/* Company count label */}
                {datum.companyCount >= 3 && (
                  <text
                    x={pt[0]}
                    y={pt[1]}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="pointer-events-none select-none fill-white text-[9px] font-bold"
                    opacity={loaded ? 1 : 0}
                    style={{ transitionDelay: "400ms" }}
                  >
                    {datum.companyCount}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* ── Glassmorphic Tooltip ── */}
        {hovered && hoveredData && (
          <div
            className="pointer-events-none absolute z-30 animate-in fade-in-0 zoom-in-95 duration-150"
            style={{
              left: Math.min(mousePos.x + 16, dims.width - 220),
              top: Math.max(mousePos.y - 10, 8),
            }}
          >
            <div className="rounded-xl border border-white/15 bg-slate-900/90 backdrop-blur-xl shadow-2xl px-4 py-3 min-w-[190px]">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="h-2.5 w-2.5 rounded-full ring-2 ring-white/20"
                  style={{
                    backgroundColor: colorScale(hoveredData.totalAmount),
                  }}
                />
                <span className="text-sm font-semibold text-white">
                  {hovered}
                </span>
              </div>
              <div className="space-y-1">
                <TooltipRow
                  label="Total Funding"
                  value={fmt(hoveredData.totalAmount)}
                  highlight
                />
                <TooltipRow
                  label="Companies"
                  value={String(hoveredData.companyCount)}
                />
                <TooltipRow
                  label="Deals"
                  value={String(hoveredData.dealCount)}
                />
                {hoveredData.dealCount > 0 && (
                  <TooltipRow
                    label="Avg Deal"
                    value={fmt(
                      hoveredData.totalAmount / hoveredData.dealCount
                    )}
                  />
                )}
              </div>
              <div className="mt-2 pt-1.5 border-t border-white/10">
                <span className="text-[10px] text-slate-400">
                  Click to filter
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-3 right-3 flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/80 backdrop-blur-sm px-3 py-1.5">
          <span className="text-[9px] text-slate-400 uppercase tracking-wider">
            Funding
          </span>
          <div className="flex gap-0.5">
            {[0, 0.15, 0.35, 0.6, 1].map((t) => (
              <div
                key={t}
                className="h-2 w-5 first:rounded-l last:rounded-r"
                style={{ backgroundColor: colorScale(maxFunding * t) }}
              />
            ))}
          </div>
          <span className="text-[9px] text-slate-400">{fmt(maxFunding)}</span>
        </div>
      </div>

    </div>
  );
}

// ---------------------------------------------------------------------------
// Tooltip row helper
// ---------------------------------------------------------------------------

function TooltipRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[11px] text-slate-400">{label}</span>
      <span
        className={`font-mono text-xs tabular-nums ${
          highlight ? "font-bold text-white" : "text-slate-200"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
