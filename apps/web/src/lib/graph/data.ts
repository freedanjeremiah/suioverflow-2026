import type { MemoryGraph, MemoryNode, MemoryEdge, NodeType } from "./types";

// ----- the user's own living memory graph (placeholder content) -----
// Authored to feel like a real graph that grew from conversation.

type Seed = [id: string, type: NodeType, title: string, summary: string, importance: number, tags: string];

const ME = "you";

const SEEDS: Seed[] = [
  ["rust", "skill", "Rust", "You reach for Rust when something has to be fast and not crash.", 0.92, "language,systems"],
  ["ts", "skill", "TypeScript", "Your default for anything with a UI or an API.", 0.88, "language,web"],
  ["design-systems", "skill", "Design systems", "You think in tokens, not screens.", 0.8, "design,frontend"],
  ["public-speaking", "skill", "Talks & demos", "You get nervous, then you nail the live demo.", 0.55, "soft"],
  ["sui-move", "skill", "Move on Sui", "Picked up while shipping the memory-sharing prototype.", 0.62, "chain,language"],
  ["graph-viz", "skill", "Graph visuals", "Force layouts, spores, the whole living look.", 0.7, "frontend,viz"],

  ["mycelium", "project", "Mycelium", "The thing you're building right now: shared agent memory.", 0.98, "current,flagship"],
  ["aurora", "project", "Aurora", "A side project that taught you streaming UIs.", 0.5, "past"],
  ["talk-2025", "project", "Devcon talk", "The walkthrough you gave on living memory graphs.", 0.46, "talk"],
  ["foxfire", "project", "Foxfire", "An old generative-art experiment, still your wallpaper.", 0.4, "art,past"],

  ["maya", "person", "Maya", "Designer you trust to tell you when something is ugly.", 0.78, "team,design"],
  ["devon", "person", "Devon", "Infra friend who reviews your gnarly PRs.", 0.66, "team,infra"],
  ["priya", "person", "Priya", "Mentor; nudged you toward decentralized storage.", 0.7, "mentor"],
  ["sam", "person", "Sam", "Met at a hackathon, now your agent's first shared session.", 0.52, "collab"],

  ["agent-memory", "concept", "Agent memory", "The idea your agent should remember you across sessions.", 0.95, "thesis"],
  ["local-first", "concept", "Local-first", "Your data lives on your device first, the cloud second.", 0.84, "principle"],
  ["liveness", "concept", "Liveness", "A shared thing should stay alive, not go stale.", 0.72, "principle"],
  ["ownership", "concept", "Real ownership", "If you can't take it with you, you don't own it.", 0.81, "principle"],
  ["sharing-by-slice", "concept", "Sharing a slice", "Share a piece of the graph, not the whole thing.", 0.77, "principle"],
  ["encryption", "concept", "Private by default", "No one reads your memory unless you let them.", 0.86, "principle"],

  ["pair-session", "moment", "Pairing with Devon", "Late night where the sync finally worked across two laptops.", 0.6, "win"],
  ["first-graft", "moment", "First shared node", "The moment Sam's agent saw a node from yours.", 0.74, "milestone"],
  ["maya-critique", "moment", "Maya's teardown", "She called the old UI 'a spreadsheet pretending to be alive'.", 0.5, "feedback"],
  ["idea-spark", "moment", "The mycelium idea", "Walk where the fungus metaphor clicked.", 0.68, "origin"],
];

const EDGES_RAW: MemoryEdge[] = ([
  { source: "mycelium", target: "rust", relation: "uses" },
  { source: "mycelium", target: "ts", relation: "uses" },
  { source: "mycelium", target: "sui-move", relation: "uses" },
  { source: "mycelium", target: "graph-viz", relation: "uses" },
  { source: "mycelium", target: "design-systems", relation: "uses" },
  { source: "mycelium", target: "agent-memory", relation: "relates" },
  { source: "agent-memory", target: "local-first", relation: "relates" },
  { source: "agent-memory", target: "liveness", relation: "relates" },
  { source: "agent-memory", target: "ownership", relation: "relates" },
  { source: "agent-memory", target: "sharing-by-slice", relation: "relates" },
  { source: "agent-memory", target: "encryption", relation: "relates" },
  { source: "mycelium", target: "local-first", relation: "partOf" },
  { source: "mycelium", target: "encryption", relation: "partOf" },
  { source: "mycelium", target: "sharing-by-slice", relation: "partOf" },
  { source: "maya", target: "design-systems", relation: "knows" },
  { source: "maya", target: "mycelium", relation: "partOf" },
  { source: "devon", target: "mycelium", relation: "partOf" },
  { source: "devon", target: "rust", relation: "knows" },
  { source: "priya", target: "local-first", relation: "knows" },
  { source: "priya", target: "ownership", relation: "knows" },
  { source: "sam", target: "first-graft", relation: "relates" },
  { source: "pair-session", target: "devon", relation: "relates" },
  { source: "pair-session", target: "mycelium", relation: "partOf" },
  { source: "first-graft", target: "mycelium", relation: "partOf" },
  { source: "first-graft", target: "sharing-by-slice", relation: "relates" },
  { source: "maya-critique", target: "maya", relation: "relates" },
  { source: "maya-critique", target: "graph-viz", relation: "relates" },
  { source: "idea-spark", target: "mycelium", relation: "relates" },
  { source: "idea-spark", target: "agent-memory", relation: "relates" },
  { source: "talk-2025", target: "mycelium", relation: "relates" },
  { source: "talk-2025", target: "public-speaking", relation: "uses" },
  { source: "aurora", target: "ts", relation: "uses" },
  { source: "aurora", target: "graph-viz", relation: "uses" },
  { source: "foxfire", target: "graph-viz", relation: "uses" },
  { source: "sui-move", target: "ownership", relation: "relates" },
] satisfies MemoryEdge[]).filter((e) => e.target);

export const MY_GRAPH: MemoryGraph = {
  nodes: SEEDS.map(([id, type, title, summary, importance, tags]) => ({
    id,
    type,
    title,
    summary,
    importance,
    tags: tags.split(","),
    owner: ME,
  })),
  edges: EDGES_RAW,
};

// ----- helper: neighbors, used by the visual "grow selection" control -----
export function neighborsOf(graph: MemoryGraph, ids: Set<string>): Set<string> {
  const out = new Set(ids);
  for (const e of graph.edges) {
    const s = typeof e.source === "string" ? e.source : (e.source as MemoryNode).id;
    const t = typeof e.target === "string" ? e.target : (e.target as MemoryNode).id;
    if (ids.has(s)) out.add(t);
    if (ids.has(t)) out.add(s);
  }
  return out;
}

export function nodeById(graph: MemoryGraph, id: string): MemoryNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}
