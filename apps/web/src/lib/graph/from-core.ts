// Map @mycelia/core domain types (Node/Edge — the on-chain/local graph model)
// into the UI's MemoryGraph. Type-only import of core, so no runtime is pulled.
import type { Node, Edge } from "@mycelia/core";
import type { MemoryGraph, MemoryNode, MemoryEdge, NodeType, RelationType } from "./types";

const TYPE_MAP: Record<string, NodeType> = {
  skill: "skill",
  project: "project",
  person: "person",
  concept: "concept",
  communication: "moment", // core calls it "communication"; the UI calls it "moment"
  moment: "moment",
};

const REL_MAP: Record<string, RelationType> = {
  uses: "uses",
  made: "made",
  relates: "relates",
  partof: "partOf",
  has: "partOf",
  knows: "knows",
  with: "knows",
  owns: "made",
};

function mapNode(n: Node): MemoryNode {
  return {
    id: n.id,
    type: TYPE_MAP[n.type] ?? "concept",
    title: n.title,
    summary: n.body ?? "",
    importance: typeof n.importance === "number" ? n.importance : 0.5,
    tags: n.tags ?? [],
    owner: n.owner,
  };
}

function mapEdge(e: Edge): MemoryEdge {
  return {
    source: e.from,
    target: e.to,
    relation: REL_MAP[(e.rel ?? "").toLowerCase()] ?? "relates",
  };
}

export function toMemoryGraph(g: { nodes: Node[]; edges: Edge[] }): MemoryGraph {
  const ids = new Set(g.nodes.map((n) => n.id));
  return {
    nodes: g.nodes.map(mapNode),
    // drop dangling edges so the canvas never references a missing node
    edges: g.edges.filter((e) => ids.has(e.from) && ids.has(e.to)).map(mapEdge),
  };
}
