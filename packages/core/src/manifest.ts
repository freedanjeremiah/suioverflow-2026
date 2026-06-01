// Manifest assembly — graph STRUCTURE only, never content. MYCELIA_SPEC §2.3.
import type {
  Manifest,
  ManifestNode,
  ManifestEdge,
  ManifestRoot,
  Node,
  Edge,
  BlobId,
  SuiObjectId,
  NodeId,
} from './types.js';

export interface ManifestBuildInput {
  sessionId: SuiObjectId;
  version: number;
  /** existing manifest to merge into (for contribute/expand), if any */
  base?: Manifest;
  /** newly published nodes: nodeId -> latest blob/patch id */
  blobIds: Record<NodeId, BlobId>;
  nodes: Node[];
  edges: Edge[];
  roots: { nodeId: NodeId; owner: string; depth: number }[];
  updatedAt: number;
}

/** Merge a freshly-published slice into a manifest (idempotent upsert by id). */
export function buildManifest(input: ManifestBuildInput): Manifest {
  const nodeMap = new Map<NodeId, ManifestNode>();
  const edgeKey = (e: ManifestEdge) => `${e.from}->${e.to}:${e.rel}`;
  const edgeMap = new Map<string, ManifestEdge>();
  const rootMap = new Map<string, ManifestRoot>();

  if (input.base) {
    for (const n of input.base.nodes) nodeMap.set(n.nodeId, n);
    for (const e of input.base.edges) edgeMap.set(edgeKey(e), e);
    for (const r of input.base.roots) rootMap.set(`${r.owner}:${r.nodeId}`, r);
  }

  for (const n of input.nodes) {
    const latestBlobId = input.blobIds[n.id];
    if (!latestBlobId) continue; // only nodes we actually published
    nodeMap.set(n.id, {
      nodeId: n.id,
      owner: n.owner,
      latestBlobId,
      type: n.type,
      importanceHint: n.importance,
    });
  }
  for (const e of input.edges) {
    const me: ManifestEdge = { from: e.from, to: e.to, rel: e.rel, owner: e.owner };
    edgeMap.set(edgeKey(me), me);
  }
  for (const r of input.roots) rootMap.set(`${r.owner}:${r.nodeId}`, r);

  return {
    sessionId: input.sessionId,
    version: input.version,
    nodes: [...nodeMap.values()],
    edges: [...edgeMap.values()],
    roots: [...rootMap.values()],
    updatedAt: input.updatedAt,
  };
}

export function emptyManifest(sessionId: SuiObjectId, updatedAt: number): Manifest {
  return { sessionId, version: 0, nodes: [], edges: [], roots: [], updatedAt };
}

/** Diff two manifests -> node ids added/changed (drives the notify feed). */
export function diffManifest(prev: Manifest | undefined, next: Manifest): { added: NodeId[]; changed: NodeId[] } {
  const prevMap = new Map((prev?.nodes ?? []).map((n) => [n.nodeId, n.latestBlobId]));
  const added: NodeId[] = [];
  const changed: NodeId[] = [];
  for (const n of next.nodes) {
    if (!prevMap.has(n.nodeId)) added.push(n.nodeId);
    else if (prevMap.get(n.nodeId) !== n.latestBlobId) changed.push(n.nodeId);
  }
  return { added, changed };
}
