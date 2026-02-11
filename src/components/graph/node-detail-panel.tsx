"use client";

import { useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Building2,
  Users,
  CircleDollarSign,
  MapPin,
  X,
  ExternalLink,
  Loader2,
} from "lucide-react";

type NodeType = "company" | "investor" | "round" | "location";

type DetailData = {
  records: Record<string, unknown>[];
};

function formatAmount(amount: number | null | undefined): string {
  if (!amount) return "N/A";
  if (amount >= 1e9) return `$${(amount / 1e9).toFixed(1)}B`;
  if (amount >= 1e6) return `$${(amount / 1e6).toFixed(1)}M`;
  if (amount >= 1e3) return `$${(amount / 1e3).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

const queries: Record<NodeType, (meta: Record<string, unknown>) => string> = {
  company: (meta) => `
    MATCH (c:Company {name: '${escapeCypher(meta.name as string)}'})
    OPTIONAL MATCH (c)-[:RAISED]->(fr:FundingRound)
    OPTIONAL MATCH (inv:InvestorOrg)-[:PARTICIPATED_IN]->(fr)
    OPTIONAL MATCH (c)-[:HQ_IN]->(loc:Location)
    RETURN c.name AS name, c.country AS country, c.totalFundingUsd AS totalFunding,
           loc.name AS location,
           collect(DISTINCT {stage: fr.stage, amount: fr.amountUsd}) AS rounds,
           collect(DISTINCT inv.name) AS investors
  `,
  investor: (meta) => `
    MATCH (inv:InvestorOrg {name: '${escapeCypher(meta.name as string)}'})
    OPTIONAL MATCH (inv)-[p:PARTICIPATED_IN]->(fr:FundingRound)<-[:RAISED]-(c:Company)
    RETURN inv.name AS name,
           count(p) AS deals,
           sum(CASE WHEN p.role = 'lead' THEN 1 ELSE 0 END) AS leads,
           collect(DISTINCT {company: c.name, stage: fr.stage, amount: fr.amountUsd}) AS portfolio
  `,
  round: (meta) => `
    MATCH (c:Company)-[:RAISED]->(fr:FundingRound)
    WHERE fr.amountUsd = ${meta.amountUsd ?? 0} AND fr.stage = '${escapeCypher((meta.stage as string) ?? "")}'
    AND c.name = '${escapeCypher((meta.company as string) ?? (meta.name as string) ?? "")}'
    OPTIONAL MATCH (inv:InvestorOrg)-[p:PARTICIPATED_IN]->(fr)
    OPTIONAL MATCH (fr)-[:SOURCED_FROM]->(a:Article)
    RETURN c.name AS company, fr.amountUsd AS amount, fr.stage AS stage,
           collect(DISTINCT {name: inv.name, role: p.role}) AS investors,
           a.url AS articleUrl, a.title AS articleTitle
    LIMIT 1
  `,
  location: (meta) => `
    MATCH (loc:Location {name: '${escapeCypher(meta.name as string)}'})
    OPTIONAL MATCH (c:Company)-[:HQ_IN]->(loc)
    RETURN loc.name AS name, collect(DISTINCT c.name) AS companies
  `,
};

function escapeCypher(s: string): string {
  return s.replace(/'/g, "\\'");
}

const typeIcons: Record<NodeType, typeof Building2> = {
  company: Building2,
  investor: Users,
  round: CircleDollarSign,
  location: MapPin,
};

const typeColors: Record<NodeType, string> = {
  company: "text-blue-500",
  investor: "text-green-500",
  round: "text-purple-500",
  location: "text-orange-500",
};

export function NodeDetailPanel({
  nodeId,
  nodeType,
  meta,
  onClose,
}: {
  nodeId: string;
  nodeType: NodeType;
  meta: Record<string, unknown>;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setDetail(null);

    const query = queries[nodeType](meta);
    fetch("/api/graph-query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    })
      .then((r) => r.json() as Promise<DetailData>)
      .then((data) => {
        if (data.records?.[0]) {
          setDetail(data.records[0]);
        }
      })
      .catch(() => {
        setDetail(meta);
      })
      .finally(() => setLoading(false));
  }, [nodeId, nodeType, meta]);

  const Icon = typeIcons[nodeType];

  return (
    <div className="absolute right-0 top-0 z-10 flex h-full w-80 flex-col border-l bg-background shadow-lg">
      <div className="flex items-center justify-between border-b p-3">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${typeColors[nodeType]}`} />
          <span className="text-sm font-semibold capitalize">{nodeType} Details</span>
        </div>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : nodeType === "company" ? (
            <CompanyDetail data={detail} />
          ) : nodeType === "investor" ? (
            <InvestorDetail data={detail} />
          ) : nodeType === "round" ? (
            <RoundDetail data={detail} />
          ) : (
            <LocationDetail data={detail} />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function CompanyDetail({ data }: { data: Record<string, unknown> | null }) {
  if (!data) return <p className="text-sm text-muted-foreground">No data available.</p>;
  const rounds = (data.rounds as { stage: string; amount: number }[]) ?? [];
  const investors = (data.investors as string[]) ?? [];
  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{data.name as string}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {data.country != null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Country</span>
              <span>{String(data.country)}</span>
            </div>
          )}
          {data.location != null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">HQ</span>
              <span>{String(data.location)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total Funding</span>
            <span className="font-semibold">{formatAmount(data.totalFunding as number)}</span>
          </div>
        </CardContent>
      </Card>

      {rounds.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Funding Rounds ({rounds.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {rounds
              .filter((r) => r.stage || r.amount)
              .map((r, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <Badge variant="secondary" className="text-xs">
                    {r.stage ?? "Unknown"}
                  </Badge>
                  <span>{formatAmount(r.amount)}</span>
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {investors.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Investors ({investors.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1">
            {investors.filter(Boolean).map((inv, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {inv}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}

function InvestorDetail({ data }: { data: Record<string, unknown> | null }) {
  if (!data) return <p className="text-sm text-muted-foreground">No data available.</p>;
  const portfolio = (data.portfolio as { company: string; stage: string; amount: number }[]) ?? [];
  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{data.name as string}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Deals</span>
            <span className="font-semibold">{data.deals as number}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Leads</span>
            <span className="font-semibold">{data.leads as number}</span>
          </div>
        </CardContent>
      </Card>

      {portfolio.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Portfolio ({portfolio.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {portfolio
              .filter((p) => p.company)
              .map((p, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="truncate">{p.company}</span>
                  <div className="flex items-center gap-1">
                    {p.stage && (
                      <Badge variant="secondary" className="text-xs">
                        {p.stage}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">{formatAmount(p.amount)}</span>
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}

function RoundDetail({ data }: { data: Record<string, unknown> | null }) {
  if (!data) return <p className="text-sm text-muted-foreground">No data available.</p>;
  const investors = (data.investors as { name: string; role: string }[]) ?? [];
  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{data.company as string}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Amount</span>
            <span className="font-semibold">{formatAmount(data.amount as number)}</span>
          </div>
          {data.stage != null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Stage</span>
              <Badge variant="secondary">{String(data.stage)}</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {investors.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Investors</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {investors
              .filter((inv) => inv.name)
              .map((inv, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span>{inv.name}</span>
                  {inv.role === "lead" && (
                    <Badge variant="default" className="text-xs">
                      Lead
                    </Badge>
                  )}
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {data.articleUrl && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Source Article</CardTitle>
          </CardHeader>
          <CardContent>
            <a
              href={data.articleUrl as string}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-blue-500 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              {data.articleTitle ? String(data.articleTitle) : "View Article"}
            </a>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function LocationDetail({ data }: { data: Record<string, unknown> | null }) {
  if (!data) return <p className="text-sm text-muted-foreground">No data available.</p>;
  const companies = (data.companies as string[]) ?? [];
  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{data.name as string}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3 w-3" />
            Location
          </div>
        </CardContent>
      </Card>

      {companies.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Companies ({companies.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1">
            {companies.filter(Boolean).map((c, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {c}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}
