"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
  CartesianGrid,
} from "recharts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCompactAmount(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 0 : 1)}B`;
  }
  if (abs >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  }
  if (abs >= 1_000) {
    return `$${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}K`;
  }
  return `$${value}`;
}

function formatFullAmount(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

// Shared axis / tooltip style tokens that respect dark mode via neutral colors.
const AXIS_TICK_STYLE = { fontSize: 12, fill: "hsl(var(--muted-foreground, 215 20% 65%))" };
const GRID_STROKE = "hsl(var(--border, 220 13% 91%))";
const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: "hsl(var(--popover, 0 0% 100%))",
  color: "hsl(var(--popover-foreground, 222 47% 11%))",
  border: "1px solid hsl(var(--border, 220 13% 91%))",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 13,
  lineHeight: 1.5,
  boxShadow: "0 4px 12px rgba(0,0,0,.08)",
};

// ---------------------------------------------------------------------------
// 1. StageChart — Horizontal bar chart of funding by stage
// ---------------------------------------------------------------------------

type StageChartProps = {
  data: { stage: string; count: number; totalAmount: number }[];
  height?: number;
};

export function StageChart({ data, height = 220 }: StageChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 24, bottom: 4, left: 4 }}
      >
        <XAxis
          type="number"
          tickFormatter={formatCompactAmount}
          tick={AXIS_TICK_STYLE}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="stage"
          width={90}
          tick={AXIS_TICK_STYLE}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(value) => [formatFullAmount(value as number), "Total Amount"]}
          labelFormatter={(label) => {
            const item = data.find((d) => d.stage === String(label));
            return `${String(label)} — ${item?.count ?? 0} deal${item?.count === 1 ? "" : "s"}`;
          }}
          cursor={{ fill: "hsl(var(--accent, 210 40% 96%))", opacity: 0.5 }}
        />
        <Bar
          dataKey="totalAmount"
          fill="#a855f7"
          radius={[0, 4, 4, 0]}
          barSize={18}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// 2. GeographyChart — Horizontal bar chart of funding by country
// ---------------------------------------------------------------------------

type GeographyChartProps = {
  data: {
    country: string;
    totalAmount: number;
    dealCount: number;
    companyCount: number;
  }[];
  height?: number;
};

export function GeographyChart({ data, height = 220 }: GeographyChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 24, bottom: 4, left: 4 }}
      >
        <XAxis
          type="number"
          tickFormatter={formatCompactAmount}
          tick={AXIS_TICK_STYLE}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="country"
          width={90}
          tick={AXIS_TICK_STYLE}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const item = data.find((d) => d.country === label);
            if (!item) return null;
            return (
              <div style={TOOLTIP_STYLE}>
                <p style={{ fontWeight: 600, marginBottom: 4 }}>{item.country}</p>
                <p>{formatFullAmount(item.totalAmount)}</p>
                <p>
                  {item.dealCount} deal{item.dealCount === 1 ? "" : "s"} &middot;{" "}
                  {item.companyCount} compan{item.companyCount === 1 ? "y" : "ies"}
                </p>
              </div>
            );
          }}
          cursor={{ fill: "hsl(var(--accent, 210 40% 96%))", opacity: 0.5 }}
        />
        <Bar
          dataKey="totalAmount"
          fill="#3b82f6"
          radius={[0, 4, 4, 0]}
          barSize={18}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// 3. TimelineChart — Area chart of funding over time
// ---------------------------------------------------------------------------

type TimelineChartProps = {
  data: { month: string; dealCount: number; totalAmount: number }[];
  height?: number;
};

export function TimelineChart({ data, height = 250 }: TimelineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 24, bottom: 4, left: 4 }}>
        <defs>
          <linearGradient id="emeraldGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis
          dataKey="month"
          tick={AXIS_TICK_STYLE}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={formatCompactAmount}
          tick={AXIS_TICK_STYLE}
          axisLine={false}
          tickLine={false}
          width={60}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(value) => [formatFullAmount(value as number), "Total Amount"]}
          labelFormatter={(label) => {
            const item = data.find((d) => d.month === String(label));
            return `${String(label)} — ${item?.dealCount ?? 0} deal${item?.dealCount === 1 ? "" : "s"}`;
          }}
          cursor={{ stroke: "#10b981", strokeWidth: 1, strokeDasharray: "4 4" }}
        />
        <Area
          type="monotone"
          dataKey="totalAmount"
          stroke="#10b981"
          strokeWidth={2}
          fill="url(#emeraldGradient)"
          dot={false}
          activeDot={{ r: 4, fill: "#10b981", stroke: "#fff", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// 4. DealFlowChart — Donut / pie chart of stage distribution by count
// ---------------------------------------------------------------------------

const DEAL_FLOW_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#a855f7",
  "#f97316",
  "#ef4444",
  "#06b6d4",
  "#eab308",
  "#ec4899",
];

type DealFlowChartProps = {
  data: { stage: string; count: number }[];
  height?: number;
};

export function DealFlowChart({ data, height = 220 }: DealFlowChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="stage"
          cx="50%"
          cy="45%"
          innerRadius={40}
          outerRadius={70}
          paddingAngle={2}
          stroke="none"
        >
          {data.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={DEAL_FLOW_COLORS[index % DEAL_FLOW_COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(value, name) => [
            `${value} deal${value === 1 ? "" : "s"}`,
            String(name),
          ]}
        />
        <Legend
          verticalAlign="bottom"
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
