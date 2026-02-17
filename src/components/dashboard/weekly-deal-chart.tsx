"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { EUROPE_CYPHER_LIST } from "@/lib/european-countries";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DayRow = {
  day: string;
  dealCount: number;
  totalAmount: number;
};

type WeekBucket = {
  weekLabel: string;
  weekStart: string;
  deals: number;
  volume: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  if (n > 0) return `$${n.toFixed(0)}`;
  return "$0";
}

/** Get Monday-based ISO week start for a date (local time, no UTC shift) */
function getWeekStart(d: Date): string {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = start
  copy.setDate(copy.getDate() + diff);
  const y = copy.getFullYear();
  const m = String(copy.getMonth() + 1).padStart(2, "0");
  const dd = String(copy.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** Format week label: "Jan 6" */
function weekLabel(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Format a local date as YYYY-MM-DD (avoids UTC shift from toISOString) */
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Generate all Monday-start weeks for last N days, always including this week */
function generateWeeks(days: number): string[] {
  const weeks: string[] = [];
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - days);

  // Start from the Monday of the earliest week
  const ws = getWeekStart(start);
  const current = new Date(ws + "T12:00:00");

  // End at the Monday of the current week
  const endWeek = getWeekStart(now);

  while (localDateStr(current) <= endWeek) {
    weeks.push(localDateStr(current));
    current.setDate(current.getDate() + 7);
  }
  return weeks;
}

// ---------------------------------------------------------------------------
// Cypher query builder (cutoff computed at runtime)
// ---------------------------------------------------------------------------

function buildQuery(): string {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  return `
    MATCH (c:Company)-[:RAISED]->(fr:FundingRound)-[:SOURCED_FROM]->(a:Article)
    WHERE c.country IN ${EUROPE_CYPHER_LIST}
      AND a.publishedAt IS NOT NULL
      AND substring(toString(a.publishedAt), 0, 10) >= '${cutoffStr}'
    WITH DISTINCT fr, substring(toString(a.publishedAt), 0, 10) AS day
    RETURN day,
           count(fr) AS dealCount,
           sum(fr.amountUsd) AS totalAmount
    ORDER BY day ASC
  `;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WeeklyDealChart({ className = "" }: { className?: string }) {
  const [rawData, setRawData] = useState<DayRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/graph-query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: buildQuery() }),
    })
      .then((r) => r.json())
      .then((json) => {
        const records = (json.records ?? []) as Record<string, unknown>[];
        setRawData(
          records.map((r) => ({
            day: String(r.day ?? ""),
            dealCount: Number(r.dealCount ?? 0),
            totalAmount: Number(r.totalAmount ?? 0),
          }))
        );
      })
      .catch(() => setRawData([]))
      .finally(() => setLoading(false));
  }, []);

  // Aggregate days into weeks
  const weeks = useMemo<WeekBucket[]>(() => {
    if (!rawData) return [];

    // Build a map: weekStart → {deals, volume}
    const map = new Map<string, { deals: number; volume: number }>();
    for (const row of rawData) {
      if (!row.day) continue;
      const ws = getWeekStart(new Date(row.day + "T00:00:00"));
      const existing = map.get(ws) ?? { deals: 0, volume: 0 };
      existing.deals += row.dealCount;
      existing.volume += row.totalAmount;
      map.set(ws, existing);
    }

    // Fill all weeks (including empty ones)
    const allWeeks = generateWeeks(90);
    return allWeeks.map((ws) => {
      const data = map.get(ws) ?? { deals: 0, volume: 0 };
      return {
        weekLabel: weekLabel(ws),
        weekStart: ws,
        deals: data.deals,
        volume: data.volume,
      };
    });
  }, [rawData]);

  // Summary stats
  const totalDeals = weeks.reduce((s, w) => s + w.deals, 0);
  const totalVolume = weeks.reduce((s, w) => s + w.volume, 0);
  const avgDealsPerWeek =
    weeks.length > 0 ? Math.round(totalDeals / weeks.length) : 0;

  if (loading) {
    return (
      <div className={className}>
        <Skeleton className="h-[220px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-1">
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Letzte 90 Tage
          </h3>
          <span className="text-[10px] text-slate-500">Wochenbasis</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[10px] text-slate-500">
            <span className="font-mono text-xs font-bold text-slate-300">
              {totalDeals}
            </span>{" "}
            Deals
          </span>
          <span className="text-[10px] text-slate-500">
            <span className="font-mono text-xs font-bold text-slate-300">
              {fmt(totalVolume)}
            </span>{" "}
            Volumen
          </span>
          <span className="text-[10px] text-slate-500">
            <span className="font-mono text-xs font-bold text-slate-300">
              ~{avgDealsPerWeek}
            </span>{" "}
            /Woche
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="px-2 pb-3">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart
            data={weeks}
            margin={{ top: 8, right: 8, bottom: 0, left: -12 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.04)"
              vertical={false}
            />
            <XAxis
              dataKey="weekLabel"
              tick={{ fontSize: 10, fill: "rgb(148,163,184)" }}
              axisLine={false}
              tickLine={false}
              interval={0}
              angle={-45}
              textAnchor="end"
              height={40}
            />
            <YAxis
              yAxisId="deals"
              tick={{ fontSize: 10, fill: "rgb(148,163,184)" }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <YAxis
              yAxisId="volume"
              orientation="right"
              tick={{ fontSize: 10, fill: "rgb(148,163,184)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => fmt(v)}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "rgba(255,255,255,0.03)" }}
            />
            <Bar
              yAxisId="volume"
              dataKey="volume"
              radius={[3, 3, 0, 0]}
              fill="hsl(210, 70%, 35%)"
              opacity={0.5}
              name="Volumen"
            />
            <Bar
              yAxisId="deals"
              dataKey="deals"
              radius={[3, 3, 0, 0]}
              fill="hsl(200, 80%, 55%)"
              name="Deals"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 pb-3">
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm" style={{ background: "hsl(200, 80%, 55%)" }} />
          <span className="text-[10px] text-slate-400">Deals</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm" style={{ background: "hsl(210, 70%, 35%)", opacity: 0.5 }} />
          <span className="text-[10px] text-slate-400">Volumen</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; dataKey: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  const deals = payload.find((p) => p.dataKey === "deals")?.value ?? 0;
  const volume = payload.find((p) => p.dataKey === "volume")?.value ?? 0;

  return (
    <div className="rounded-lg border border-white/15 bg-slate-900/95 backdrop-blur-xl shadow-2xl px-3 py-2 min-w-[140px]">
      <div className="text-[11px] font-medium text-slate-300 mb-1">
        KW {label}
      </div>
      <div className="space-y-0.5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[10px] text-slate-400">Deals</span>
          <span className="font-mono text-xs font-bold text-white tabular-nums">
            {deals}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[10px] text-slate-400">Volumen</span>
          <span className="font-mono text-xs font-bold text-white tabular-nums">
            {fmt(volume)}
          </span>
        </div>
        {deals > 0 && (
          <div className="flex items-center justify-between gap-4 pt-0.5 border-t border-white/10">
            <span className="text-[10px] text-slate-500">Ø Deal</span>
            <span className="font-mono text-[11px] text-slate-400 tabular-nums">
              {fmt(volume / deals)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
