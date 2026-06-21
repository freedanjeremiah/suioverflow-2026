// Orchestration — the canonical write/read paths. MYCELIA_SPEC §3, flows B-H.
// Framework-agnostic: runs in the browser (user's bridged keypair signs + pays)
// and on the server (master signs). Encrypt-before-publish always (#7).
import type { Signer } from '@mysten/sui/cryptography';
import { Crypto, SessionKey, sealIdBytes } from './crypto.js';
import { Storage } from './storage.js';
import { SessionClient } from './chain.js';
import { sliceForShare } from './graph.js';
import { buildManifest, emptyManifest, diffManifest } from './manifest.js';
import { appendEvents } from './events.js';
import { encodeNodeVersion, decodeNodeVersion, encodeManifest, decodeManifest, encodeEvents, decodeEvents } from './node-io.js';
import type {
  Node, Edge, NodeVersion, Manifest, EventLogEntry, SessionState, SuiAddress, SuiObjectId, NodeId, BlobId,
} from './types.js';

/** Reserved seal identity for the (encrypted) manifest of a session. */
export const MANIFEST_NODE_ID = '__manifest__';
/** Reserved seal identity for the event log of a session. */
export const EVENTLOG_NODE_ID = '__eventlog__';
/** The reserved name of an account's single private memory session (one per owner). */
export const PERSONAL_SESSION_NAME = 'personal';

export interface MyceliaConfig {
  storageEpochs: number;
}

export interface ShareInput {
  sessionId: SuiObjectId;
  rootId: NodeId;
  depth: number;
  nodes: Node[]; // the owner's local graph (slice is computed from these)
  edges: Edge[];
  signer: Signer; // pays + owns
  owner: SuiAddress;
  base?: Manifest; // existing manifest to merge into (contribute/expand)
  events?: EventLogEntry[]; // existing event log
  /** Optional UI progress hook: fired at the real pipeline boundaries so the
      client can show honest per-step progress (encrypt → publish → policy). */
  onStep?: (step: 'encrypt' | 'publish' | 'policy', done: boolean) => void;
}

/** A published blob object to track for renewal (invariant #3 / §8). */
export interface BlobRef {
  blobObjectId: SuiObjectId;
  endEpoch: number;
  kind: 'nodes' | 'manifest' | 'events';
}

export interface ShareResult {
  manifest: Manifest;
  manifestBlobId: BlobId;
  eventBlobId: BlobId;
  publishedNodeIds: NodeId[];
  endEpoch: number;
  blobs: BlobRef[]; // (blobObjectId, endEpoch) to persist for renewal
}

export class Mycelia {
  constructor(
    readonly sessions: SessionClient,
    readonly crypto: Crypto,
    readonly storage: Storage,
    readonly config: MyceliaConfig,
  ) {}

  // ---- Flow B: create session (publishes an empty encrypted manifest + head v1) ----
  async createSession(name: string, signer: Signer, owner: SuiAddress, endEpoch: number): Promise<{ sessionId: SuiObjectId; capId: SuiObjectId; manifestBlobId: BlobId; blobs: BlobRef[] }> {
    const { sessionId, capId } = await this.sessions.createSession(name, endEpoch, signer);
    // share the reserved manifest + eventlog identities so members can decrypt them
    const manifestSeal = sealIdBytes(sessionId, MANIFEST_NODE_ID);
    const eventSeal = sealIdBytes(sessionId, EVENTLOG_NODE_ID);
    await this.sessions.shareNodes(sessionId, [manifestSeal, eventSeal], signer);
    const manifest = emptyManifest(sessionId, Date.now());
    manifest.version = 1;
    const m = await this.publishManifest(sessionId, manifest, signer, owner);
    await this.sessions.setHead(sessionId, m.blobId, 1, signer);
    return { sessionId, capId, manifestBlobId: m.blobId, blobs: [m.ref] };
  }

  // ---- Personal store: an account's own memory graph, persisted on Walrus ----
  // The graph lives in ONE per-account session (name = PERSONAL_SESSION_NAME).
  // Owner is the only member, so the owner alone can decrypt; any client holding
  // the account's key (web, MCP) discovers + reads/writes the SAME graph. The
  // unified, no-local-store memory. Sharing still uses SEPARATE sessions so a
  // shared slice never exposes the whole personal graph.

  /** Find this account's personal memory session, or null if none exists yet. */
  async findPersonalSession(owner: SuiAddress): Promise<{ sessionId: SuiObjectId; capId: SuiObjectId } | null> {
    return this.sessions.findOwnedSession(owner, PERSONAL_SESSION_NAME);
  }

  /** Find (or create) this account's single personal memory session. */
  async findOrCreatePersonalSession(owner: SuiAddress, signer: Signer, endEpoch: number): Promise<{ sessionId: SuiObjectId; capId: SuiObjectId; created: boolean }> {
    const found = await this.sessions.findOwnedSession(owner, PERSONAL_SESSION_NAME);
    if (found) return { sessionId: found.sessionId, capId: found.capId, created: false };
    const r = await this.createSession(PERSONAL_SESSION_NAME, signer, owner, endEpoch);
    return { sessionId: r.sessionId, capId: r.capId, created: true };
  }

  /** Load the full personal graph: decrypt every node in the head manifest
   *  (the owner is a member, so all are readable). Returns the rebuilt
   *  Node/Edge graph + the manifest (pass it back as `base` to the next putNode). */
  async loadFullGraph(state: SessionState, sessionKey: SessionKey): Promise<{ nodes: Node[]; edges: Edge[]; manifest: Manifest }> {
    const manifest = await this.fetchManifest(state, sessionKey);
    // reveal one node, retrying with backoff (decrypt/reads can transiently fail
    // under rate limits) so we don't silently drop nodes from the graph
    const revealOne = async (mn: { nodeId: NodeId; latestBlobId: BlobId; owner: SuiAddress }): Promise<Node | null> => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const nv = await this.reveal(state.id, mn.nodeId, mn.latestBlobId, sessionKey);
          return {
            id: nv.nodeId, owner: nv.owner, type: nv.type, title: nv.title, body: nv.body,
            importance: nv.importance, tags: nv.tags ?? [], createdAt: nv.ts, updatedAt: nv.ts, version: nv.version,
          };
        } catch {
          if (attempt === 2) return null; // give up after 3 tries — skip this node
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        }
      }
      return null;
    };
    // limited concurrency: bursting all reveals at once overwhelms the RPC /
    // aggregator / key servers and causes rate-limit failures (dropped nodes)
    const LIMIT = 6;
    const revealed: (Node | null)[] = [];
    for (let i = 0; i < manifest.nodes.length; i += LIMIT) {
      revealed.push(...(await Promise.all(manifest.nodes.slice(i, i + LIMIT).map(revealOne))));
    }
    const nodes = revealed.filter((n): n is Node => n !== null);
    const edges: Edge[] = manifest.edges.map((e) => ({ id: `${e.from}:${e.to}:${e.rel}`, from: e.from, to: e.to, rel: e.rel, owner: e.owner }));
    return { nodes, edges, manifest };
  }

  /** Load every graph that has been shared TO `viewer` (sessions they're a member
   *  of but don't own). Decrypts what they're allowed to read, tags each node with
   *  its real owner. Powers the web "Shared with me" view. */
  async loadSharedWithMe(viewer: SuiAddress, sessionKey: SessionKey): Promise<{ nodes: Node[]; edges: Edge[]; sessions: { id: SuiObjectId; owner: SuiAddress; count: number }[] }> {
    const ids = await this.sessions.findMemberSessions(viewer);
    const v = viewer.toLowerCase();
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const sessions: { id: SuiObjectId; owner: SuiAddress; count: number }[] = [];
    for (const id of ids) {
      try {
        const state = await this.sessions.getSessionState(id);
        if (state.owner.toLowerCase() === v) continue; // your own session — not "shared with me"
        if (!state.members.map((x) => x.toLowerCase()).includes(v)) continue; // removed since
        const g = await this.loadFullGraph(state, sessionKey);
        if (g.nodes.length === 0) continue;
        nodes.push(...g.nodes);
        edges.push(...g.edges);
        sessions.push({ id, owner: state.owner, count: g.nodes.length });
      } catch {
        /* unreadable session — skip */
      }
    }
    const seen = new Set<string>();
    const uniq = nodes.filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)));
    return { nodes: uniq, edges, sessions };
  }

  /** Upsert one memory node (+ its outgoing edges) into a session — write-through.
   *  encrypt → Walrus quilt → allowlist (new node) → rebuild manifest → bump head.
   *  `base` MUST be the latest manifest (head version strictly increases, #2/#5);
   *  pass the returned manifest as `base` for the next call. */
  async putNode(args: { sessionId: SuiObjectId; node: Node; outgoing: { to: NodeId; rel: string }[]; base: Manifest; signer: Signer; owner: SuiAddress }): Promise<{ manifest: Manifest; blobs: BlobRef[] }> {
    const { sessionId, node, outgoing, base, signer, owner } = args;
    const prev = base.nodes.find((x) => x.nodeId === node.id)?.latestBlobId;
    const isNew = !prev;
    const nv: NodeVersion = {
      nodeId: node.id, owner: node.owner, type: node.type, title: node.title, body: node.body,
      importance: node.importance, tags: node.tags, version: node.version, ts: Date.now(), edges: outgoing,
      ...(prev ? { prevBlobId: prev } : {}),
    };
    const ct = await this.crypto.encrypt(sessionId, node.id, encodeNodeVersion(nv));
    // single-entry Quilt so reveal()'s readQuiltPatch path resolves it (same as shareSlice)
    const quilt = await this.storage.publishQuilt([{ identifier: node.id, contents: ct }], { signer, owner, epochs: this.config.storageEpochs });
    // allowlist the seal id so the owner can decrypt; share_node is idempotent, only needed once
    if (isNew) await this.sessions.shareNodes(sessionId, [sealIdBytes(sessionId, node.id)], signer);
    const edges: Edge[] = outgoing.map((e) => ({ id: `${node.id}:${e.to}:${e.rel}`, from: node.id, to: e.to, rel: e.rel, owner }));
    const manifest = buildManifest({
      sessionId, version: base.version + 1, base, updatedAt: Date.now(),
      blobIds: { [node.id]: quilt.patches[node.id]! }, nodes: [node], edges, roots: [],
    });
    const m = await this.publishManifest(sessionId, manifest, signer, owner);
    await this.sessions.setHead(sessionId, m.blobId, manifest.version, signer);
    return { manifest, blobs: [{ blobObjectId: quilt.blobObjectId, endEpoch: quilt.endEpoch, kind: 'nodes' }, m.ref] };
  }

  private async publishManifest(sessionId: SuiObjectId, manifest: Manifest, signer: Signer, owner: SuiAddress): Promise<{ blobId: BlobId; ref: BlobRef }> {
    const ct = await this.crypto.encrypt(sessionId, MANIFEST_NODE_ID, encodeManifest(manifest));
    const r = await this.storage.publishBlob(ct, { signer, owner, epochs: this.config.storageEpochs });
    return { blobId: r.blobId, ref: { blobObjectId: r.blobObjectId, endEpoch: r.endEpoch, kind: 'manifest' } };
  }

  private async publishEvents(sessionId: SuiObjectId, events: EventLogEntry[], signer: Signer, owner: SuiAddress): Promise<{ blobId: BlobId; ref: BlobRef }> {
    const ct = await this.crypto.encrypt(sessionId, EVENTLOG_NODE_ID, encodeEvents(events));
    const r = await this.storage.publishBlob(ct, { signer, owner, epochs: this.config.storageEpochs });
    return { blobId: r.blobId, ref: { blobObjectId: r.blobObjectId, endEpoch: r.endEpoch, kind: 'events' } };
  }

  // ---- Flow C / D: share a depth slice (or contribute another owner's slice) ----
  async shareSlice(input: ShareInput): Promise<ShareResult> {
    const { sessionId, rootId, depth, signer, owner } = input;
    const slice = sliceForShare(input.nodes, input.edges, rootId, depth);
    if (slice.nodes.length === 0) throw new Error(`root ${rootId} not in local graph`);

    // 1+2: build NodeVersions, encrypt each
    input.onStep?.('encrypt', false);
    const items: { identifier: string; contents: Uint8Array }[] = await Promise.all(slice.nodes.map(async (n) => {
      const prev = input.base?.nodes.find((x) => x.nodeId === n.id)?.latestBlobId; // history chain (§2.2)
      const nv: NodeVersion = {
        nodeId: n.id, owner: n.owner, type: n.type, title: n.title, body: n.body,
        importance: n.importance, tags: n.tags, version: n.version, ts: Date.now(),
        edges: slice.edges.filter((e) => e.from === n.id).map((e) => ({ to: e.to, rel: e.rel })),
        ...(prev ? { prevBlobId: prev } : {}),
      };
      const ct = await this.crypto.encrypt(sessionId, n.id, encodeNodeVersion(nv));
      return { identifier: n.id, contents: ct };
    }));

    // 3: publish the slice as one Quilt (user pays + owns)
    input.onStep?.('encrypt', true);
    input.onStep?.('publish', false);
    const quilt = await this.storage.publishQuilt(items, { signer, owner, epochs: this.config.storageEpochs });
    input.onStep?.('publish', true);

    // 4: add each node's seal identity to the policy (one PTB)
    input.onStep?.('policy', false);
    const sealIds = slice.nodes.map((n) => sealIdBytes(sessionId, n.id));
    await this.sessions.shareNodes(sessionId, sealIds, signer);

    // 5: rebuild manifest (merge into base if contributing/expanding)
    const baseVersion = input.base?.version ?? 1;
    const manifest = buildManifest({
      sessionId, version: baseVersion + 1, base: input.base, updatedAt: Date.now(),
      blobIds: quilt.patches, nodes: slice.nodes, edges: slice.edges,
      roots: [{ nodeId: rootId, owner, depth }],
    });

    // 6 + 8 (publish): manifest + events blobs are independent — publish concurrently
    const diff = diffManifest(input.base, manifest);
    const newEvents = appendEvents(input.events ?? [], [
      { actor: owner, kind: 'shared', nodeId: rootId, title: slice.nodes.find((n) => n.id === rootId)?.title, type: slice.nodes.find((n) => n.id === rootId)?.type, depthFromRoot: 0, ts: Date.now() },
      ...diff.added.filter((id) => id !== rootId).map((id) => ({
        actor: owner, kind: 'added' as const, nodeId: id,
        title: slice.nodes.find((n) => n.id === id)?.title, type: slice.nodes.find((n) => n.id === id)?.type, ts: Date.now(),
      })),
    ]);
    // Sequential: each publish signs Walrus cert txs; concurrent txs equivocate the single gas coin.
    const m = await this.publishManifest(sessionId, manifest, signer, owner);
    const manifestBlobId = m.blobId;
    await this.sessions.setHead(sessionId, manifestBlobId, manifest.version, signer);
    const ev = await this.publishEvents(sessionId, newEvents, signer, owner);
    await this.sessions.setEventBlob(sessionId, ev.blobId, signer);
    input.onStep?.('policy', true);
    return {
      manifest, manifestBlobId, eventBlobId: ev.blobId, publishedNodeIds: slice.nodes.map((n) => n.id), endEpoch: quilt.endEpoch,
      blobs: [{ blobObjectId: quilt.blobObjectId, endEpoch: quilt.endEpoch, kind: 'nodes' }, m.ref, ev.ref],
    };
  }

  // ---- Flow E: expand a single shared node to a new version ----
  async expandNode(args: { sessionId: SuiObjectId; node: Node; outgoing: { to: NodeId; rel: string }[]; base: Manifest; events: EventLogEntry[]; signer: Signer; owner: SuiAddress }): Promise<ShareResult> {
    const { sessionId, node, base, signer, owner } = args;
    const prev = base.nodes.find((x) => x.nodeId === node.id)?.latestBlobId;
    const nv: NodeVersion = {
      nodeId: node.id, owner: node.owner, type: node.type, title: node.title, body: node.body,
      importance: node.importance, tags: node.tags, version: node.version, ts: Date.now(), edges: args.outgoing,
      ...(prev ? { prevBlobId: prev } : {}),
    };
    const ct = await this.crypto.encrypt(sessionId, node.id, encodeNodeVersion(nv));
    const nodeBlob = await this.storage.publishBlob(ct, { signer, owner, epochs: this.config.storageEpochs });
    await this.sessions.shareNodes(sessionId, [sealIdBytes(sessionId, node.id)], signer);
    const manifest = buildManifest({
      sessionId, version: base.version + 1, base, updatedAt: Date.now(),
      blobIds: { [node.id]: nodeBlob.blobId }, nodes: [node], edges: [], roots: [],
    });
    const m = await this.publishManifest(sessionId, manifest, signer, owner);
    await this.sessions.setHead(sessionId, m.blobId, manifest.version, signer);
    const events = appendEvents(args.events, [{ actor: owner, kind: 'expanded', nodeId: node.id, title: node.title, type: node.type, ts: Date.now() }]);
    const ev = await this.publishEvents(sessionId, events, signer, owner);
    await this.sessions.setEventBlob(sessionId, ev.blobId, signer);
    return {
      manifest, manifestBlobId: m.blobId, eventBlobId: ev.blobId, publishedNodeIds: [node.id], endEpoch: nodeBlob.endEpoch,
      blobs: [{ blobObjectId: nodeBlob.blobObjectId, endEpoch: nodeBlob.endEpoch, kind: 'nodes' }, m.ref, ev.ref],
    };
  }

  /** GC superseded deletable blobs (old manifest/event/node versions, §8). Owner signs. */
  async gcBlobs(blobObjectIds: SuiObjectId[], signer: Signer): Promise<{ deleted: string[]; failed: string[] }> {
    const deleted: string[] = [], failed: string[] = [];
    // Sequential: each deleteBlob signs a Sui tx; concurrent txs equivocate the single gas coin.
    for (const id of blobObjectIds) {
      try { await this.storage.deleteBlob(id, signer); deleted.push(id); }
      catch { failed.push(id); }
    }
    return { deleted, failed };
  }

  /** Extend storage for a set of blob objects (real renewal, invariant #3). Owner signs. */
  async renewStorage(blobObjectIds: SuiObjectId[], epochs: number, signer: Signer): Promise<{ extended: string[]; failed: string[] }> {
    const extended: string[] = [], failed: string[] = [];
    for (const id of blobObjectIds) {
      try { await this.storage.extend(id, epochs, signer); extended.push(id); }
      catch { failed.push(id); }
    }
    return { extended, failed };
  }

  // ---- Flow F (read): reveal a node ----
  async reveal(sessionId: SuiObjectId, nodeId: NodeId, blobId: BlobId, sessionKey: SessionKey): Promise<NodeVersion> {
    // node ciphertexts live as Quilt patches — read over the aggregator (reliable
    // cross-process HTTP), not the wasm getFiles cache that only the publisher warms.
    const ct = await this.storage.readQuiltPatch(blobId);
    const txBytes = await this.sessions.buildSealApproveTx(sessionId, sealIdBytes(sessionId, nodeId));
    const plain = await this.crypto.decrypt(ct, sessionKey, txBytes);
    return decodeNodeVersion(plain);
  }

  // ---- read manifest + events for a session ----
  async fetchManifest(state: SessionState, sessionKey: SessionKey): Promise<Manifest> {
    if (!state.headBlob) return emptyManifest(state.id, Date.now());
    // manifest is a standalone blob -> read via the aggregator (reliable HTTP,
    // no per-storage-node probing / wasm), then decrypt.
    const ct = await this.storage.readViaAggregator(state.headBlob);
    const txBytes = await this.sessions.buildSealApproveTx(state.id, sealIdBytes(state.id, MANIFEST_NODE_ID));
    const plain = await this.crypto.decrypt(ct, sessionKey, txBytes);
    return decodeManifest(plain);
  }

  async fetchEvents(state: SessionState, sessionKey: SessionKey): Promise<EventLogEntry[]> {
    if (!state.eventBlob) return [];
    const ct = await this.storage.readViaAggregator(state.eventBlob);
    const txBytes = await this.sessions.buildSealApproveTx(state.id, sealIdBytes(state.id, EVENTLOG_NODE_ID));
    const plain = await this.crypto.decrypt(ct, sessionKey, txBytes);
    return decodeEvents(plain);
  }

  // ---- Flow G: membership + revocation ----
  async addMember(capId: string, sessionId: SuiObjectId, who: SuiAddress, signer: Signer) {
    return this.sessions.addMember(capId, sessionId, who, signer);
  }
  async removeMember(capId: string, sessionId: SuiObjectId, who: SuiAddress, signer: Signer) {
    return this.sessions.removeMember(capId, sessionId, who, signer);
  }
  async unshare(capId: string, sessionId: SuiObjectId, nodeId: NodeId, signer: Signer) {
    return this.sessions.unshareNode(capId, sessionId, sealIdBytes(sessionId, nodeId), signer);
  }

  // ---- Flow H: renewal ----
  async renew(capId: string, sessionId: SuiObjectId, endEpoch: number, signer: Signer) {
    return this.sessions.renew(capId, sessionId, endEpoch, signer);
  }

  state(sessionId: SuiObjectId): Promise<SessionState> {
    return this.sessions.getSessionState(sessionId);
  }
}
