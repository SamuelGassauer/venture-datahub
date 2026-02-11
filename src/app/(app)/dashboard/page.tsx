"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2,
  Users,
  TrendingUp,
  DollarSign,
  Network,
  MapPin,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import { Badge } from "@/components/ui/badge";

const COLORS = [
  "#6366f1",
  "#f59e0b",
  "#ef4444",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
];

function formatAmount(amount: number | null): string {
  if (!amount) return "N/A";
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

type GraphStats = {
  summary: {
    totalFunding: number;
    totalCompanies: number;
    totalInvestors: number;
    totalRounds: number;
    totalArticles: number;
    totalLocations: number;
    totalEdges: number;
    avgDealSize: number;
    medianDealSize: number | null;
  };
  ingestion: {
    totalInDb: number;
    ingested: number;
    pending: number;
  };
  recentDeals: {
    company: string;
    companyCountry: string | null;
    amount: number | null;
    stage: string | null;
    leadInvestor: string | null;
    participantCount: number;
    articleUrl: string | null;
    articleTitle: string | null;
    publishedAt: string | null;
  }[];
  fundingByStage: { stage: string; count: number; totalAmount: number }[];
  fundingByCountry: { country: string; totalAmount: number; dealCount: number; companyCount: number }[];
  fundingTimeline: { month: string; dealCount: number; totalAmount: number }[];
};

export default function DashboardPage() {
  const [data, setData] = useState<GraphStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/graph-stats")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Knowledge Graph</h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return <p>Failed to load graph stats.</p>;

  const { summary, recentDeals, fundingByStage, fundingByCountry, fundingTimeline } = data;

  const kpiCards = [
    { label: "Companies", value: summary.totalCompanies, icon: Building2, color: "text-blue-500" },
    { label: "Investors", value: summary.totalInvestors, icon: Users, color: "text-green-500" },
    { label: "Funding Rounds", value: summary.totalRounds, icon: TrendingUp, color: "text-purple-500" },
    { label: "Total Funding", value: formatAmount(summary.totalFunding), icon: DollarSign, color: "text-emerald-500" },
    { label: "Avg Deal Size", value: formatAmount(summary.avgDealSize), icon: DollarSign, color: "text-orange-500" },
    { label: "Locations", value: summary.totalLocations, icon: MapPin, color: "text-red-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Network className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-3xl font-bold">Knowledge Graph</h1>
        <span className="text-sm text-muted-foreground">
          {summary.totalEdges} edges &middot; {summary.totalArticles} articles
        </span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kpiCards.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {kpi.label}
              </CardTitle>
              <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpi.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Stage Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Funding by Stage</CardTitle>
          </CardHeader>
          <CardContent>
            {fundingByStage.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={fundingByStage}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="stage" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-10 text-center text-muted-foreground">
                No funding stage data in graph yet.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Country Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Funding by Country</CardTitle>
          </CardHeader>
          <CardContent>
            {fundingByCountry.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={fundingByCountry}
                    dataKey="dealCount"
                    nameKey="country"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ name }) => name}
                  >
                    {fundingByCountry.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-10 text-center text-muted-foreground">
                No country data in graph yet.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Funding Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            {fundingTimeline.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={fundingTimeline}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="dealCount"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={{ fill: "#6366f1" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-10 text-center text-muted-foreground">
                No timeline data in graph yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Deals */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Deals</CardTitle>
        </CardHeader>
        <CardContent>
          {recentDeals.length > 0 ? (
            <div className="space-y-3">
              {recentDeals.map((deal, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="space-y-1">
                    <p className="font-medium">{deal.company}</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {deal.stage && <Badge variant="secondary">{deal.stage}</Badge>}
                      {deal.companyCountry && <span>{deal.companyCountry}</span>}
                      {deal.leadInvestor && (
                        <span className="text-xs">Lead: {deal.leadInvestor}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatAmount(deal.amount)}</p>
                    {deal.participantCount > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {deal.participantCount} investor{deal.participantCount !== 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-muted-foreground">
              No deals in the knowledge graph yet. Ingest funding rounds to populate.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
