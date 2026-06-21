"use client";

import { create } from "zustand";
import { api, type PublicConfig } from "./api";
import { toMemoryGraph } from "./graph/from-core";
import type { MemoryGraph, NodeType } from "./graph/types";
import type { Node as CoreNode, Edge as CoreEdge, NodeType as CoreNodeType, Manifest, SessionKey } from "@mycelia/core";
import type { BrowserMycelia } from "./mycelia";

/** The account's memory graph in core (Node/Edge) form — mirrored in memory from
 *  the personal Walrus session. The source of truth is on-chain, not the browser. */
export interface LocalGraph {
  nodes: CoreNode[];
  edges: CoreEdge[];
}

export type Phase = "anon" | "connecting" | "ready" | "error";
export type ShareStep = "encrypt" | "publish" | "policy";
export type ShareKind = "address" | "market";
/** where a slice is shared: privately to an address, or publicly to the market */
export type ShareTarget =
  | { kind: "address"; address: string }
  | { kind: "market"; priceSui: number; title: string; blurb: string };
export type ShareResult =
  | { kind: "address"; address: string; digest: string }
  | { kind: "market"; listingId: string; digest: string };
export type ShareStatus =
  | { state: "idle" }
  | { state: "sharing"; step: ShareStep }
  | { state: "done"; sessionId: string; count: number; result: ShareResult }
  | { state: "error"; message: string };
export type BuyStatus =
  | { state: "idle" }
  | { state: "buying" }
  | { state: "done"; digest: string }
  | { state: "error"; message: string };

interface CurrentSession {
  id: string;
  capId: string;
}

interface State {
  phase: Phase;
  address: string | null;
  email: string | null;
  seedHex: string | null;
  config: PublicConfig | null;
  /** browser Sui/Walrus/Seal service; null until the chain stack is built */
  m: BrowserMycelia | null;
  chainError: string | null;
  /** raw local graph (core Node/Edge) — mirrored from the personal Walrus session */
  local: LocalGraph | null;
  /** mapped graph for the UI */
  graph: MemoryGraph | null;
  error: string | null;
  session: CurrentSession | null;
  share: ShareStatus;
  /** the ask-service (server master) address — added as a member on listing */
  askService: string | null;
  /** the account's personal memory session (the unified Walrus store) */
  personal: { sessionId: string; capId: string } | null;
  /** latest personal manifest — the `base` for the next write (head must increase) */
  base: Manifest | null;
  /** Seal session key for decrypting the personal graph */
  sk: SessionKey | null;
  /** a write-through add to Walrus is in flight */
  memBusy: boolean;
  memError: string | null;

  afterLogin: (token?: string, email?: string) => Promise<void>;
  /** share a depth slice on-chain — privately to an address, or to the market */
  shareOnChain: (rootId: string, depth: number, target: ShareTarget) => Promise<void>;
  /** buy a listing on-chain (pays SUI → membership via escrowed cap) */
  buy: BuyStatus;
  purchaseListing: (listingId: string, sessionId: string, priceMist: number) => Promise<void>;
  /** count of memories a (root, depth) slice would include — for the preview */
  previewCount: (rootId: string, depth: number) => number;
  /** add a memory to the account's graph — write-through to the personal Walrus session */
  addMemory: (input: { title: string; body: string; type: NodeType; relatesTo?: string }) => Promise<void>;
  /** reload the graph from Walrus (picks up memories added elsewhere, e.g. via the MCP) */
  refreshGraph: () => Promise<void>;
  /** a graph reload is in flight */
  refreshing: boolean;
  /** graphs shared TO this account (read-only), mapped for the UI; null until loaded */
  sharedView: MemoryGraph | null;
  loadingShared: boolean;
  /** discover + decrypt the sessions shared with this account */
  loadShared: () => Promise<void>;
  resetShare: () => void;
  reset: () => void;
}

// depth-d undirected BFS over the raw local edges — mirrors @mycelia/core's
// `neighborhood` (so the preview count matches what shareSlice actually publishes).
// Must expand only from the CURRENT frontier each level (a Set mutated mid-pass
// would cascade past one hop).
function neighborhoodIds(local: LocalGraph, rootId: string, depth: number): Set<string> {
  const out = new Set<string>([rootId]);
  let frontier = new Set<string>([rootId]);
  for (let d = 0; d < depth; d++) {
    const next = new Set<string>();
    for (const e of local.edges) {
      if (frontier.has(e.from) && !out.has(e.to)) { out.add(e.to); next.add(e.to); }
      if (frontier.has(e.to) && !out.has(e.from)) { out.add(e.from); next.add(e.from); }
    }
    if (next.size === 0) break;
    frontier = next;
  }
  return out;
}

export const useStore = create<State>((set, get) => ({
  phase: "anon",
  address: null,
  email: null,
  seedHex: null,
  config: null,
  m: null,
  chainError: null,
  local: null,
  graph: null,
  error: null,
  session: null,
  share: { state: "idle" },
  askService: null,
  personal: null,
  base: null,
  sk: null,
  memBusy: false,
  memError: null,
  refreshing: false,
  sharedView: null,
  loadingShared: false,
  buy: { state: "idle" },

  afterLogin: async (token, email) => {
    if (get().phase === "connecting") return;
    set({ phase: "connecting", error: null, email: email ?? null });
    let address: string;
    let seedHex: string;
    try {
      const res = await api.login(token ? { token } : {});
      address = res.address;
      seedHex = res.seedHex;
    } catch (e) {
      set({ phase: "error", error: e instanceof Error ? e.message : "login failed" });
      return;
    }
    set({ address, seedHex });

    // Build the on-chain stack, then load the account's memory graph from its
    // personal Walrus session. The graph lives on-chain (encrypted to this
    // account) — no browser store. A brand-new account starts empty; the session
    // is created lazily on the first addMemory (so login never pays gas).
    try {
      const config = await api.config();
      const { buildBrowserMycelia, createSessionKey } = await import("./mycelia");
      const m = buildBrowserMycelia(seedHex, address, config);
      const health = await api.health().catch(() => null);
      const sk = await createSessionKey(m);
      const personal = await m.service.findPersonalSession(address);
      let local: LocalGraph = { nodes: [], edges: [] };
      let base: Manifest | null = null;
      if (personal) {
        const state = await m.service.state(personal.sessionId);
        const loaded = await m.service.loadFullGraph(state, sk);
        local = { nodes: loaded.nodes, edges: loaded.edges };
        base = loaded.manifest;
      }
      set({
        config, m, askService: health?.master ?? null, chainError: null, phase: "ready",
        personal, base, sk, local, graph: toMemoryGraph(local),
      });
      // discover graphs shared with this account in the background (don't block login)
      void get().loadShared();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "chain init failed";
      set({ phase: "error", chainError: msg, error: msg });
    }
  },

  previewCount: (rootId, depth) => {
    const local = get().local;
    if (!local) return 0;
    return neighborhoodIds(local, rootId, depth).size;
  },

  addMemory: async ({ title, body, type, relatesTo }) => {
    const { m, address, sk, local } = get();
    if (!m || !address || !sk || !local) {
      set({ memError: "Your graph isn't ready yet — reconnect and try again." });
      return;
    }
    set({ memBusy: true, memError: null });
    try {
      // ensure the personal session exists (created lazily on the first memory)
      let { personal, base } = get();
      if (!personal || !base) {
        const endEpoch = (await m.storage.currentEpoch().catch(() => 0)) + m.config.storageEpochs;
        const ps = await m.service.findOrCreatePersonalSession(address, m.keypair, endEpoch);
        const state = await m.service.state(ps.sessionId);
        const loaded = await m.service.loadFullGraph(state, sk);
        personal = { sessionId: ps.sessionId, capId: ps.capId };
        base = loaded.manifest;
        set({ personal, base, local: { nodes: loaded.nodes, edges: loaded.edges }, graph: toMemoryGraph({ nodes: loaded.nodes, edges: loaded.edges }) });
      }

      const cur = get().local!;
      const coreType: CoreNodeType = type === "moment" ? "communication" : type;
      const node: CoreNode = {
        id: crypto.randomUUID(), owner: address, type: coreType,
        title: title.trim() || "Untitled", body: body.trim(), importance: 0.6, tags: [],
        createdAt: Date.now(), updatedAt: Date.now(), version: 1,
      };
      const outgoing = relatesTo ? [{ to: relatesTo, rel: "relates" }] : [];
      // write-through: encrypt → Walrus → bump on-chain head
      const res = await m.service.putNode({ sessionId: personal.sessionId, node, outgoing, base: get().base!, signer: m.keypair, owner: address });
      const nextEdges: CoreEdge[] = relatesTo
        ? [...cur.edges, { id: `${node.id}:${relatesTo}:relates`, from: node.id, to: relatesTo, rel: "relates", owner: address }]
        : cur.edges;
      const next: LocalGraph = { nodes: [...cur.nodes, node], edges: nextEdges };
      set({ base: res.manifest, local: next, graph: toMemoryGraph(next), memBusy: false });
    } catch (e) {
      set({ memBusy: false, memError: e instanceof Error ? e.message : "couldn't save to Walrus" });
    }
  },

  loadShared: async () => {
    const { m, address, sk } = get();
    if (!m || !address || !sk || get().loadingShared) return;
    set({ loadingShared: true });
    try {
      const { nodes, edges } = await m.service.loadSharedWithMe(address, sk);
      const sharedView = nodes.length ? toMemoryGraph({ nodes, edges }) : null;
      set({ sharedView, loadingShared: false });
    } catch {
      set({ loadingShared: false });
    }
  },

  refreshGraph: async () => {
    const { m, address, sk } = get();
    if (!m || !address || !sk || get().refreshing) return;
    set({ refreshing: true, memError: null });
    try {
      const personal = get().personal ?? (await m.service.findPersonalSession(address));
      if (!personal) {
        const empty: LocalGraph = { nodes: [], edges: [] };
        set({ personal: null, base: null, local: empty, graph: toMemoryGraph(empty), refreshing: false });
        return;
      }
      const state = await m.service.state(personal.sessionId);
      const loaded = await m.service.loadFullGraph(state, sk);
      const local: LocalGraph = { nodes: loaded.nodes, edges: loaded.edges };
      set({ personal, base: loaded.manifest, local, graph: toMemoryGraph(local), refreshing: false });
      void get().loadShared();
    } catch (e) {
      set({ refreshing: false, memError: e instanceof Error ? e.message : "couldn't reload from Walrus" });
    }
  },

  shareOnChain: async (rootId, depth, target) => {
    const { m, address, local, askService } = get();
    if (!m || !address || !local) {
      set({ share: { state: "error", message: "Wallet/chain not ready yet — try again in a moment." } });
      return;
    }
    if (target.kind === "address") {
      const who = target.address.trim();
      if (!/^0x[0-9a-fA-F]{64}$/.test(who)) {
        set({ share: { state: "error", message: "Recipient must be a 0x… Sui address (66 chars)." } });
        return;
      }
    }
    if (target.kind === "market" && !askService) {
      set({ share: { state: "error", message: "Ask-service address unavailable; reconnect and retry." } });
      return;
    }
    const count = neighborhoodIds(local, rootId, depth).size;
    set({ share: { state: "sharing", step: "encrypt" } });
    try {
      // 1) ensure an on-chain session exists (reuse across shares this session)
      let session = get().session;
      if (!session) {
        const endEpoch = (await m.storage.currentEpoch().catch(() => 0)) + m.config.storageEpochs;
        const r = await m.service.createSession(`memory:${address.slice(0, 10)}`, m.keypair, address, endEpoch);
        session = { id: r.sessionId, capId: r.capId };
        set({ session });
        await api.watch(r.sessionId, { owner: address, name: "memory", endEpoch }).catch(() => {});
      }

      // 2) share the depth slice on-chain (encrypt → Walrus quilt → share_node policy)
      const res = await m.service.shareSlice({
        sessionId: session.id,
        rootId,
        depth,
        nodes: local.nodes,
        edges: local.edges,
        signer: m.keypair,
        owner: address,
        onStep: (step, done) => {
          if (!done) set({ share: { state: "sharing", step } });
        },
      });
      await api
        .registerBlobs(session.id, res.blobs.map((b) => ({ blobObjectId: b.blobObjectId, endEpoch: b.endEpoch, kind: b.kind })))
        .catch(() => {});

      // 3) grant access per the target
      let result: ShareResult;
      if (target.kind === "address") {
        // allowlist the recipient (add_member) — Seal gates decrypt on this
        const digest = await m.service.addMember(session.capId, session.id, target.address.trim(), m.keypair);
        result = { kind: "address", address: target.address.trim(), digest };
      } else {
        // list on the market (escrows cap + adds the ask-service as a member)
        const priceMist = Math.max(0, Math.round(target.priceSui * 1e9));
        const { listingId, digest } = await m.market.listForSale(
          session.capId, session.id, priceMist,
          target.title.trim() || "Untitled graph", target.blurb.trim(), askService!, m.keypair,
        );
        result = { kind: "market", listingId, digest };
      }

      set({ share: { state: "done", sessionId: session.id, count, result } });
    } catch (e) {
      set({ share: { state: "error", message: e instanceof Error ? e.message : "on-chain share failed" } });
    }
  },

  purchaseListing: async (listingId, sessionId, priceMist) => {
    const { m } = get();
    if (!m) {
      set({ buy: { state: "error", message: "Connect first to purchase." } });
      return;
    }
    set({ buy: { state: "buying" } });
    try {
      const digest = await m.market.purchase(listingId, sessionId, priceMist, m.keypair);
      set({ buy: { state: "done", digest } });
    } catch (e) {
      set({ buy: { state: "error", message: e instanceof Error ? e.message : "purchase failed" } });
    }
  },

  resetShare: () => set({ share: { state: "idle" } }),
  reset: () =>
    set({
      phase: "anon",
      address: null,
      email: null,
      seedHex: null,
      config: null,
      m: null,
      chainError: null,
      local: null,
      graph: null,
      error: null,
      session: null,
      share: { state: "idle" },
      askService: null,
      personal: null,
      base: null,
      sk: null,
      memBusy: false,
      memError: null,
      refreshing: false,
      sharedView: null,
      loadingShared: false,
      buy: { state: "idle" },
    }),
}));
