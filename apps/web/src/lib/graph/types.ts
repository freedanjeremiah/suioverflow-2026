// The modular memory-graph model. Everything in Mycelium is a node or an edge.
// Keep this framework-agnostic: visual components consume it, they don't own it.

export type NodeType =
  | "skill"
  | "project"
  | "person"
  | "concept"
  | "moment"; // a captured conversation / communication

export type RelationType =
  | "uses"
  | "made"
  | "relates"
  | "partOf"
  | "knows";

export interface MemoryNode {
  id: string;
  type: NodeType;
  /** short human label shown on the spore */
  title: string;
  /** one-line plain description, no jargon */
  summary: string;
  /** 0..1 — drives spore size + glow */
  importance: number;
  tags: string[];
  /** who this memory belongs to; drives hue */
  owner: string;
}

export interface MemoryEdge {
  source: string;
  target: string;
  relation: RelationType;
}

export interface MemoryGraph {
  nodes: MemoryNode[];
  edges: MemoryEdge[];
}

export const NODE_TYPE_META: Record<
  NodeType,
  { label: string; token: string; description: string }
> = {
  skill: { label: "Skill", token: "spore-lime", description: "something you can do" },
  project: { label: "Project", token: "spore-gold", description: "something you're building" },
  person: { label: "Person", token: "spore-rose", description: "someone in your world" },
  concept: { label: "Idea", token: "spore-fox", description: "a concept worth keeping" },
  moment: { label: "Moment", token: "spore-violet", description: "a conversation that mattered" },
};

export const RELATION_LABEL: Record<RelationType, string> = {
  uses: "uses",
  made: "made",
  relates: "relates to",
  partOf: "part of",
  knows: "knows",
};
