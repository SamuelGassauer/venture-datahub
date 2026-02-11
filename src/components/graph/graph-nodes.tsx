"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Building2, Users, CircleDollarSign, MapPin } from "lucide-react";

type GraphNodeData = {
  label: string;
  meta: Record<string, unknown>;
  selected?: boolean;
};

const nodeBase =
  "px-3 py-2 rounded-lg border-2 shadow-sm flex items-center gap-2 min-w-[120px] max-w-[200px] transition-all hover:shadow-md cursor-pointer";

function formatCompact(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

export const CompanyNode = memo(function CompanyNode({ data }: NodeProps) {
  const d = data as unknown as GraphNodeData;
  const funding = d.meta.totalFundingUsd as number | undefined;
  return (
    <div
      className={`${nodeBase} border-blue-400 bg-blue-50 dark:bg-blue-950/40 ${d.selected ? "ring-2 ring-blue-500" : ""}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-blue-400" />
      <Building2 className="h-4 w-4 shrink-0 text-blue-500" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-blue-900 dark:text-blue-100">{d.label}</p>
        {funding != null && funding > 0 && (
          <p className="text-xs text-blue-600 dark:text-blue-400">{formatCompact(funding)}</p>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-blue-400" />
    </div>
  );
});

export const InvestorNode = memo(function InvestorNode({ data }: NodeProps) {
  const d = data as unknown as GraphNodeData;
  const deals = d.meta.deals as number | undefined;
  return (
    <div
      className={`${nodeBase} border-green-400 bg-green-50 dark:bg-green-950/40 ${d.selected ? "ring-2 ring-green-500" : ""}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-green-400" />
      <Users className="h-4 w-4 shrink-0 text-green-500" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-green-900 dark:text-green-100">{d.label}</p>
        {deals != null && deals > 0 && (
          <p className="text-xs text-green-600 dark:text-green-400">{deals} deals</p>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-green-400" />
    </div>
  );
});

export const RoundNode = memo(function RoundNode({ data }: NodeProps) {
  const d = data as unknown as GraphNodeData;
  const amount = d.meta.amountUsd as number | undefined;
  const stage = d.meta.stage as string | undefined;
  return (
    <div
      className={`${nodeBase} border-purple-400 bg-purple-50 dark:bg-purple-950/40 ${d.selected ? "ring-2 ring-purple-500" : ""}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-purple-400" />
      <CircleDollarSign className="h-4 w-4 shrink-0 text-purple-500" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-purple-900 dark:text-purple-100">
          {stage ?? "Round"}
        </p>
        {amount != null && amount > 0 && (
          <p className="text-xs text-purple-600 dark:text-purple-400">{formatCompact(amount)}</p>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-purple-400" />
    </div>
  );
});

export const LocationNode = memo(function LocationNode({ data }: NodeProps) {
  const d = data as unknown as GraphNodeData;
  return (
    <div
      className={`${nodeBase} border-orange-400 bg-orange-50 dark:bg-orange-950/40 ${d.selected ? "ring-2 ring-orange-500" : ""}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-orange-400" />
      <MapPin className="h-4 w-4 shrink-0 text-orange-500" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-orange-900 dark:text-orange-100">
          {d.label}
        </p>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-orange-400" />
    </div>
  );
});

export const nodeTypes = {
  company: CompanyNode,
  investor: InvestorNode,
  round: RoundNode,
  location: LocationNode,
};
