"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  BackgroundVariant,
} from "@xyflow/react";
import dagre from "dagre";
import "@xyflow/react/dist/style.css";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, Users, CircleDollarSign, MapPin, Search, Loader2 } from "lucide-react";
import { nodeTypes } from "./graph-nodes";
import type { GraphNetworkResponse, GraphNode as APINode } from "@/app/api/graph-network/route";

const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;

type NodeType = "company" | "investor" | "round" | "location";

const typeConfig: Record<NodeType, { icon: typeof Building2; color: string; label: string }> = {
  company: { icon: Building2, color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300", label: "Companies" },
  investor: { icon: Users, color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300", label: "Investors" },
  round: { icon: CircleDollarSign, color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300", label: "Rounds" },
  location: { icon: MapPin, color: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300", label: "Locations" },
};

function layoutGraph(
  apiNodes: APINode[],
  apiEdges: GraphNetworkResponse["edges"],
  visibleTypes: Set<NodeType>,
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 120 });

  const filteredNodes = apiNodes.filter((n) => visibleTypes.has(n.type));
  const nodeIds = new Set(filteredNodes.map((n) => n.id));

  for (const n of filteredNodes) {
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  const filteredEdges = apiEdges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
  for (const e of filteredEdges) {
    g.setEdge(e.source, e.target);
  }

  dagre.layout(g);

  const nodes: Node[] = filteredNodes.map((n) => {
    const pos = g.node(n.id);
    return {
      id: n.id,
      type: n.type,
      position: { x: (pos?.x ?? 0) - NODE_WIDTH / 2, y: (pos?.y ?? 0) - NODE_HEIGHT / 2 },
      data: { label: n.label, meta: n.meta },
    };
  });

  const edgeColors: Record<string, string> = {
    RAISED: "#3b82f6",
    PARTICIPATED_IN: "#22c55e",
    HQ_IN: "#f97316",
    SOURCED_FROM: "#8b5cf6",
  };

  const edges: Edge[] = filteredEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.type.replace(/_/g, " "),
    style: { stroke: edgeColors[e.type] ?? "#94a3b8" },
    labelStyle: { fontSize: 10, fill: "#64748b" },
    animated: false,
  }));

  return { nodes, edges };
}

export function NetworkGraph({
  onNodeSelect,
}: {
  onNodeSelect?: (nodeId: string, nodeType: NodeType, meta: Record<string, unknown>) => void;
}) {
  const [rawData, setRawData] = useState<GraphNetworkResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleTypes, setVisibleTypes] = useState<Set<NodeType>>(
    new Set(["company", "investor", "round", "location"]),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    fetch("/api/graph-network")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load graph network");
        return r.json() as Promise<GraphNetworkResponse>;
      })
      .then(setRawData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!rawData) return;
    const { nodes: layoutNodes, edges: layoutEdges } = layoutGraph(
      rawData.nodes,
      rawData.edges,
      visibleTypes,
    );
    setNodes(layoutNodes);
    setEdges(layoutEdges);
  }, [rawData, visibleTypes, setNodes, setEdges]);

  const toggleType = useCallback((type: NodeType) => {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size > 1) next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  const handleSearch = useCallback(() => {
    if (!rawData || !searchQuery.trim()) return;
    const q = searchQuery.toLowerCase();
    const match = rawData.nodes.find(
      (n) =>
        n.label.toLowerCase().includes(q) ||
        (n.meta.name as string | undefined)?.toLowerCase().includes(q),
    );
    if (match) {
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          data: { ...n.data, selected: n.id === match.id },
        })),
      );
      const matchNode = nodes.find((n) => n.id === match.id);
      if (matchNode) {
        onNodeSelect?.(match.id, match.type, match.meta);
      }
    }
  }, [rawData, searchQuery, nodes, setNodes, onNodeSelect]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const apiNode = rawData?.nodes.find((n) => n.id === node.id);
      if (apiNode) {
        setNodes((nds) =>
          nds.map((n) => ({
            ...n,
            data: { ...n.data, selected: n.id === node.id },
          })),
        );
        onNodeSelect?.(apiNode.id, apiNode.type, apiNode.meta);
      }
    },
    [rawData, setNodes, onNodeSelect],
  );

  const miniMapNodeColor = useCallback((node: Node) => {
    const colors: Record<string, string> = {
      company: "#3b82f6",
      investor: "#22c55e",
      round: "#a855f7",
      location: "#f97316",
    };
    return colors[node.type ?? ""] ?? "#94a3b8";
  }, []);

  const typeCounts = useMemo(() => {
    if (!rawData) return {} as Record<NodeType, number>;
    const counts: Record<string, number> = {};
    for (const n of rawData.nodes) {
      counts[n.type] = (counts[n.type] ?? 0) + 1;
    }
    return counts as Record<NodeType, number>;
  }, [rawData]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b p-2">
        {(Object.entries(typeConfig) as [NodeType, (typeof typeConfig)[NodeType]][]).map(
          ([type, cfg]) => {
            const Icon = cfg.icon;
            const active = visibleTypes.has(type);
            return (
              <Badge
                key={type}
                variant={active ? "default" : "outline"}
                className={`cursor-pointer gap-1 ${active ? cfg.color : "opacity-50"}`}
                onClick={() => toggleType(type)}
              >
                <Icon className="h-3 w-3" />
                {cfg.label} ({typeCounts[type] ?? 0})
              </Badge>
            );
          },
        )}
        <div className="ml-auto flex items-center gap-1">
          <Input
            placeholder="Search nodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="h-7 w-48 text-xs"
          />
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleSearch}>
            <Search className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Graph */}
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          <Controls showInteractive={false} />
          <MiniMap nodeColor={miniMapNodeColor} zoomable pannable />
        </ReactFlow>
      </div>
    </div>
  );
}
