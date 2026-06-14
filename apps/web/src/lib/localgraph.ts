// The user's PRIVATE local memory graph (Flow A). Lives in localStorage; never
// leaves the device until grafted into a session (then it's encrypted first).
import type { Node, Edge, NodeType } from '@mycelia/core';

export interface LocalGraph { nodes: Node[]; edges: Edge[]; }
const key = (addr: string) => `mycelia:graph:${addr}`;
const uid = () => crypto.randomUUID();

export function load(addr: string): LocalGraph {
  try {
    const raw = localStorage.getItem(key(addr));
    if (raw) return JSON.parse(raw) as LocalGraph;
  } catch { /* ignore */ }
  const seeded = starter(addr);
  save(addr, seeded);
  return seeded;
}
export function save(addr: string, g: LocalGraph) { localStorage.setItem(key(addr), JSON.stringify(g)); }

export function addNode(g: LocalGraph, addr: string, n: { title: string; body: string; type: NodeType; importance?: number; tags?: string[] }): { g: LocalGraph; node: Node } {
  const node: Node = {
    id: uid(), owner: addr, type: n.type, title: n.title, body: n.body,
    importance: n.importance ?? 0.5, tags: n.tags ?? [], createdAt: Date.now(), updatedAt: Date.now(), version: 1,
  };
  return { g: { nodes: [...g.nodes, node], edges: g.edges }, node };
}
export function addEdge(g: LocalGraph, addr: string, from: string, to: string, rel: string): LocalGraph {
  if (g.edges.some((e) => e.from === from && e.to === to && e.rel === rel)) return g;
  return { nodes: g.nodes, edges: [...g.edges, { id: uid(), from, to, rel, owner: addr }] };
}

/** Remove the seeded sample memories (and any edges touching them). */
export function clearSamples(g: LocalGraph): LocalGraph {
  const sampleIds = new Set(g.nodes.filter((n) => n.tags?.includes('sample')).map((n) => n.id));
  return {
    nodes: g.nodes.filter((n) => !sampleIds.has(n.id)),
    edges: g.edges.filter((e) => !sampleIds.has(e.from) && !sampleIds.has(e.to)),
  };
}

/** A small starter graph so a new user has something meaningful to graft.
    Nodes are tagged 'sample' (spec §5): badged in lists, one-click clearable. */
function starter(addr: string): LocalGraph {
  const mk = (title: string, type: NodeType, body: string, importance = 0.6): Node => ({
    id: uid(), owner: addr, type, title, body, importance, tags: ['sample'], createdAt: Date.now(), updatedAt: Date.now(), version: 1,
  });
  const px = mk('Project Atlas', 'project', 'A local-first knowledge platform for agents.', 0.95);
  const ts = mk('TypeScript', 'skill', 'Primary language across the stack.', 0.7);
  const sui = mk('Sui + Move', 'skill', 'On-chain coordination layer and policy module.', 0.8);
  const road = mk('Q3 Roadmap', 'concept', 'Ship sharing, live propagation, revocation.', 0.6);
  const ravi = mk('Ravi (collaborator)', 'person', 'Design-system owner; joining the session.', 0.5);
  const ds = mk('Design System', 'project', 'Tokens, components, motion language.', 0.7);
  const nodes = [px, ts, sui, road, ravi, ds];
  const e = (from: Node, to: Node, rel: string): Edge => ({ id: uid(), from: from.id, to: to.id, rel, owner: addr });
  const edges = [e(px, ts, 'uses'), e(px, sui, 'uses'), e(px, road, 'has'), e(px, ravi, 'with'), e(ravi, ds, 'owns')];
  return { nodes, edges };
}
