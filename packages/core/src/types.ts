// Mycelia core data model — MYCELIA_SPEC.md §2.
// Framework-agnostic. No SDK imports here.

export type SuiAddress = string; // 0x-prefixed 32-byte hex
export type SuiObjectId = string;
export type BlobId = string; // Walrus blob/quilt id
export type NodeId = string; // uuid v4, stable across versions

export const NODE_TYPES = ['skill', 'project', 'person', 'concept', 'communication'] as const;
export type NodeType = (typeof NODE_TYPES)[number];

/** A memory node in the local graph (cleartext, never leaves the device as-is). */
export interface Node {
  id: NodeId;
  owner: SuiAddress;
  type: NodeType;
  title: string;
  body: string;
  importance: number; // 0..1
  tags: string[];
  createdAt: number;
  updatedAt: number;
  version: number; // bumps on edit; each version is its own immutable blob
}

/** A typed relation (a hypha thread). */
export interface Edge {
  id: string;
  from: NodeId;
  to: NodeId;
  rel: string;
  owner: SuiAddress;
}

/** The unit that gets encrypted + published. MYCELIA_SPEC §2.2. */
export interface NodeVersion {
  nodeId: NodeId;
  owner: SuiAddress;
  type: NodeType;
  title: string;
  body: string;
  importance: number;
  tags: string[];
  version: number;
  ts: number;
  edges: { to: NodeId; rel: string }[]; // outgoing edges embedded
  prevBlobId?: BlobId;
}

/** Per-session manifest — graph STRUCTURE only, no content. MYCELIA_SPEC §2.3. */
export interface Manifest {
  sessionId: SuiObjectId;
  version: number;
  nodes: ManifestNode[];
  edges: ManifestEdge[];
  roots: ManifestRoot[];
  updatedAt: number;
}
export interface ManifestNode {
  nodeId: NodeId;
  owner: SuiAddress;
  latestBlobId: BlobId;
  type: NodeType;
  importanceHint: number;
}
export interface ManifestEdge {
  from: NodeId;
  to: NodeId;
  rel: string;
  owner: SuiAddress;
}
export interface ManifestRoot {
  nodeId: NodeId;
  owner: SuiAddress;
  depth: number; // depth this root was shared at
}

export const EVENT_KINDS = [
  'added',
  'expanded',
  'shared',
  'revoked',
  'member_added',
  'member_removed',
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** Append-only notify-feed entry. MYCELIA_SPEC §2.4. */
export interface EventLogEntry {
  seq: number;
  actor: SuiAddress;
  kind: EventKind;
  nodeId?: NodeId;
  title?: string;
  type?: NodeType;
  depthFromRoot?: number;
  ts: number;
}

/** Mirror of the on-chain Session object (read view). MYCELIA_SPEC §2.5 / §7. */
export interface SessionState {
  id: SuiObjectId;
  name: string;
  owner: SuiAddress;
  members: SuiAddress[];
  sharedNodes: string[]; // hex seal identities
  headBlob: BlobId;
  headVersion: number;
  eventBlob: BlobId;
  endEpoch: number;
  revoked: SuiAddress[];
}

/** A node remapped into the merged graph view (UI-facing). */
export interface GraphNodeView extends ManifestNode {
  depthFromRoot: number; // min hop to any shared root; Infinity-safe -> -1 if unreachable
  locked: boolean; // sealId not shared OR caller not a member
  title?: string; // present once revealed/decrypted
  body?: string;
  decrypted: boolean;
}
