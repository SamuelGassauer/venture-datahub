import { NextRequest, NextResponse } from "next/server";
import driver from "@/lib/neo4j";

function toNumber(value: unknown): unknown {
  return typeof value === "object" && value !== null && "toNumber" in value
    ? (value as { toNumber(): number }).toNumber()
    : value;
}

export type GraphNode = {
  id: string;
  type: "company" | "investor" | "round" | "location";
  label: string;
  meta: Record<string, unknown>;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  type: string;
  meta: Record<string, unknown>;
};

export type GraphNetworkResponse = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export async function GET(request: NextRequest) {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const { searchParams } = request.nextUrl;
    const center = searchParams.get("center");
    const depth = parseInt(searchParams.get("depth") ?? "2", 10);

    let query: string;
    const params: Record<string, unknown> = {};

    if (center) {
      query = `
        MATCH (start)
        WHERE elementId(start) = $center OR start.name = $center
        CALL apoc.path.subgraphAll(start, {maxLevel: $depth})
        YIELD nodes, relationships
        RETURN nodes, relationships
      `;
      params.center = center;
      params.depth = depth;
    } else {
      query = `
        MATCH (n)
        WHERE n:Company OR n:InvestorOrg OR n:FundingRound OR n:Location
        WITH collect(n) AS allNodes
        UNWIND allNodes AS n
        OPTIONAL MATCH (n)-[r]->(m)
        WHERE m:Company OR m:InvestorOrg OR m:FundingRound OR m:Location
        RETURN collect(DISTINCT n) AS nodes, collect(DISTINCT r) AS relationships
      `;
    }

    const result = await session.run(query, params);

    const nodesMap = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];

    if (center) {
      // APOC path result
      const record = result.records[0];
      if (record) {
        const rawNodes = record.get("nodes") as unknown[];
        const rawRels = record.get("relationships") as unknown[];
        processNodes(rawNodes, nodesMap);
        processRelationships(rawRels, edges, nodesMap);
      }
    } else {
      const record = result.records[0];
      if (record) {
        const rawNodes = record.get("nodes") as unknown[];
        const rawRels = record.get("relationships") as unknown[];
        processNodes(rawNodes, nodesMap);
        processRelationships(rawRels, edges, nodesMap);
      }
    }

    return NextResponse.json({
      nodes: Array.from(nodesMap.values()),
      edges,
    } satisfies GraphNetworkResponse);
  } catch (error) {
    // Fallback: if APOC is not available, use simple queries
    try {
      const fallbackResult = await session.run(`
        MATCH (c:Company)-[r1:RAISED]->(fr:FundingRound)
        OPTIONAL MATCH (inv:InvestorOrg)-[r2:PARTICIPATED_IN]->(fr)
        OPTIONAL MATCH (c)-[r3:HQ_IN]->(loc:Location)
        RETURN c, fr, inv, loc, r1, r2, r3
        LIMIT 500
      `);

      const nodesMap = new Map<string, GraphNode>();
      const edges: GraphEdge[] = [];
      const edgeIds = new Set<string>();

      for (const record of fallbackResult.records) {
        for (const key of ["c", "fr", "inv", "loc"]) {
          const node = record.get(key);
          if (node && typeof node === "object" && "identity" in node) {
            const neoNode = node as NeoNode;
            const id = neoNode.elementId ?? neoNode.identity.toString();
            if (!nodesMap.has(id)) {
              nodesMap.set(id, neoNodeToGraphNode(neoNode, id));
            }
          }
        }
        for (const key of ["r1", "r2", "r3"]) {
          const rel = record.get(key);
          if (rel && typeof rel === "object" && "type" in rel) {
            const neoRel = rel as NeoRelationship;
            const eid = neoRel.elementId ?? `${neoRel.start}-${neoRel.type}-${neoRel.end}`;
            if (!edgeIds.has(eid)) {
              edgeIds.add(eid);
              const sourceId = neoRel.startNodeElementId ?? neoRel.start.toString();
              const targetId = neoRel.endNodeElementId ?? neoRel.end.toString();
              if (nodesMap.has(sourceId) && nodesMap.has(targetId)) {
                edges.push({
                  id: eid,
                  source: sourceId,
                  target: targetId,
                  type: neoRel.type,
                  meta: extractProps(neoRel.properties ?? {}),
                });
              }
            }
          }
        }
      }

      return NextResponse.json({
        nodes: Array.from(nodesMap.values()),
        edges,
      } satisfies GraphNetworkResponse);
    } catch (fallbackError) {
      return NextResponse.json(
        { error: fallbackError instanceof Error ? fallbackError.message : "Failed to fetch network" },
        { status: 500 },
      );
    }
  } finally {
    await session.close();
  }
}

type NeoNode = {
  identity: { toString(): string };
  elementId?: string;
  labels: string[];
  properties: Record<string, unknown>;
};

type NeoRelationship = {
  identity: { toString(): string };
  elementId?: string;
  start: { toString(): string };
  end: { toString(): string };
  startNodeElementId?: string;
  endNodeElementId?: string;
  type: string;
  properties?: Record<string, unknown>;
};

function extractProps(props: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    result[key] = toNumber(value);
  }
  return result;
}

function labelToType(labels: string[]): GraphNode["type"] {
  if (labels.includes("Company")) return "company";
  if (labels.includes("InvestorOrg")) return "investor";
  if (labels.includes("FundingRound")) return "round";
  if (labels.includes("Location")) return "location";
  return "company";
}

function neoNodeToGraphNode(node: NeoNode, id: string): GraphNode {
  const type = labelToType(node.labels);
  const props = extractProps(node.properties);
  let label = (props.name as string) ?? id;
  if (type === "round") {
    const stage = props.stage ?? "Round";
    const amount = props.amountUsd;
    label = amount ? `${stage} $${formatCompact(amount as number)}` : (stage as string);
  }
  return { id, type, label, meta: props };
}

function formatCompact(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toString();
}

function processNodes(rawNodes: unknown[], nodesMap: Map<string, GraphNode>) {
  for (const raw of rawNodes) {
    const node = raw as NeoNode;
    const id = node.elementId ?? node.identity.toString();
    if (!nodesMap.has(id)) {
      nodesMap.set(id, neoNodeToGraphNode(node, id));
    }
  }
}

function processRelationships(
  rawRels: unknown[],
  edges: GraphEdge[],
  nodesMap: Map<string, GraphNode>,
) {
  const edgeIds = new Set<string>();
  for (const raw of rawRels) {
    if (!raw) continue;
    const rel = raw as NeoRelationship;
    const id = rel.elementId ?? `${rel.start}-${rel.type}-${rel.end}`;
    if (edgeIds.has(id)) continue;
    edgeIds.add(id);
    const sourceId = rel.startNodeElementId ?? rel.start.toString();
    const targetId = rel.endNodeElementId ?? rel.end.toString();
    if (nodesMap.has(sourceId) && nodesMap.has(targetId)) {
      edges.push({
        id,
        source: sourceId,
        target: targetId,
        type: rel.type,
        meta: extractProps(rel.properties ?? {}),
      });
    }
  }
}
