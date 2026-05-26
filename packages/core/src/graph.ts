// Graph algorithms — depth neighborhood + remap. MYCELIA_SPEC §4.
// Pure functions over node/edge collections (persistence lives in the server).
import type {
  Node,
  Edge,
  NodeId,
  ManifestNode,
  ManifestEdge,
  ManifestRoot,
  SessionState,
  GraphNodeView,
  SuiAddress,
} from './types.js';
import { sealIdHex } from './crypto.js';

/** Undirected adjacency over a set of edges (sharing is neighborhood, not direction). */
function adjacency(edges: { from: NodeId; to: NodeId }[]): Map<NodeId, Set<NodeId>> {
  const adj = new Map<NodeId, Set<NodeId>>();
  const link = (a: NodeId, b: NodeId) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  };
  for (const e of edges) {
    link(e.from, e.to);
    link(e.to, e.from);
  }
  return adj;
}

/**
 * The d-hop neighborhood of `rootId` over `edges` (BFS). Depth 0 = root alone.
 * Used to select what a depth-share publishes (MYCELIA_SPEC §4).
 */
export function neighborhood(rootId: NodeId, edges: { from: NodeId; to: NodeId }[], depth: number): Set<NodeId> {
  const adj = adjacency(edges);
  const seen = new Set<NodeId>([rootId]);
  let frontier: NodeId[] = [rootId];
  for (let d = 0; d < depth; d++) {
    const next: NodeId[] = [];
    for (const n of frontier) {
      for (const m of adj.get(n) ?? []) {
        if (!seen.has(m)) {
          seen.add(m);
          next.push(m);
        }
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return seen;
}

/**
 * depthFromRoot for every node = min hop distance to ANY shared root over the
 * merged edge set (multi-source BFS). Unreachable -> -1. MYCELIA_SPEC §4 remap.
 */
export function remapDepths(
  nodeIds: NodeId[],
  edges: { from: NodeId; to: NodeId }[],
  roots: { nodeId: NodeId }[],
): Map<NodeId, number> {
  const adj = adjacency(edges);
  const dist = new Map<NodeId, number>();
  for (const id of nodeIds) dist.set(id, -1);
  let frontier: NodeId[] = [];
  for (const r of roots) {
    dist.set(r.nodeId, 0);
    frontier.push(r.nodeId);
  }
  let d = 0;
  while (frontier.length) {
    const next: NodeId[] = [];
    for (const n of frontier) {
      for (const m of adj.get(n) ?? []) {
        if ((dist.get(m) ?? -1) === -1) {
          dist.set(m, d + 1);
          next.push(m);
        }
      }
    }
    frontier = next;
    d++;
  }
  return dist;
}

/**
 * Build the UI-facing merged graph view. A node is `locked` when the viewer is
 * not a session member OR the node's sealId is not in shared_nodes (it shows in
 * structure but can't be read — forward-only honesty, DESIGN §5).
 */
export function buildGraphView(
  manifestNodes: ManifestNode[],
  manifestEdges: ManifestEdge[],
  roots: ManifestRoot[],
  session: Pick<SessionState, 'id' | 'members' | 'sharedNodes'>,
  viewer: SuiAddress,
  revealed: Record<NodeId, { title: string; body: string }> = {},
): GraphNodeView[] {
  const depths = remapDepths(
    manifestNodes.map((n) => n.nodeId),
    manifestEdges,
    roots,
  );
  const isMember = session.members.map((m) => m.toLowerCase()).includes(viewer.toLowerCase());
  const sharedSet = new Set(session.sharedNodes.map((s) => s.toLowerCase()));
  return manifestNodes.map((n) => {
    const sid = sealIdHex(session.id, n.nodeId).toLowerCase();
    const shared = sharedSet.has(sid);
    const rev = revealed[n.nodeId];
    return {
      ...n,
      depthFromRoot: depths.get(n.nodeId) ?? -1,
      locked: !isMember || !shared,
      decrypted: Boolean(rev),
      title: rev?.title,
      body: rev?.body,
    };
  });
}

/** Convenience: collect the NodeVersion-shaped slice for a depth-share. */
export function sliceForShare(
  nodes: Node[],
  edges: Edge[],
  rootId: NodeId,
  depth: number,
): { nodes: Node[]; edges: Edge[] } {
  const ids = neighborhood(rootId, edges, depth);
  const inSlice = (id: NodeId) => ids.has(id);
  return {
    nodes: nodes.filter((n) => inSlice(n.id)),
    edges: edges.filter((e) => inSlice(e.from) && inSlice(e.to)),
  };
}
