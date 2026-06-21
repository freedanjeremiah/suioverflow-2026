// Mycelia MCP server — memory tools for any MCP host. Thin wrappers over
// @mycelia/core (encrypt-on-device, owner=this key). MYCELIA_SPEC §3, flows A-H.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { SessionKey, sealIdBytes, isNoAccess, buildGraphView, neighborhood, NODE_TYPES } from '@mycelia/core';
import type { Manifest, EventLogEntry, NodeType, Node, Edge } from '@mycelia/core';
import type { Runtime } from './runtime.js';

const TYPE = z.enum(NODE_TYPES as unknown as [string, ...string[]]);

export function buildMcpServer(rt: Runtime): McpServer {
  const mcp = new McpServer({ name: 'mycelia', version: '0.1.0' });
  const keys = new Map<string, SessionKey>();

  const ok = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] });
  const fail = (msg: string) => ({ isError: true, content: [{ type: 'text' as const, text: msg }] });

  async function sessionKey(): Promise<SessionKey> {
    let sk = keys.get(rt.address);
    if (!sk || sk.isExpired()) {
      sk = await SessionKey.create({ address: rt.address, packageId: rt.pub.myceliaPackageId, ttlMin: 10, signer: rt.keypair, suiClient: rt.client as never });
      keys.set(rt.address, sk);
    }
    return sk;
  }
  async function loadGraph(sessionId: string): Promise<{ manifest: Manifest; events: EventLogEntry[]; sk: SessionKey } | null> {
    const sk = await sessionKey();
    const state = await rt.service.state(sessionId);
    if (!state.headBlob) return { manifest: { sessionId, version: state.headVersion, nodes: [], edges: [], roots: [], updatedAt: Date.now() }, events: [], sk };
    const manifest = await rt.service.fetchManifest(state, sk);
    const events = await rt.service.fetchEvents(state, sk).catch(() => []);
    return { manifest, events, sk };
  }

  // ---- the account's personal memory graph: ONE per-account session on Walrus ----
  // This is the unified store. Any client holding this key (web, this MCP) finds the
  // same session and reads/writes the same graph. No local source of truth.
  let personal: { sessionId: string; capId: string } | null = null;
  // cache the decrypted graph, keyed by the on-chain head version (a web write bumps
  // it, so we reload). Invalidated to null after our own writes.
  let cache: { version: number; nodes: Node[]; edges: Edge[]; manifest: Manifest } | null = null;

  async function ensurePersonal(): Promise<{ sessionId: string; capId: string }> {
    if (personal) return personal;
    const endEpoch = (await rt.storage.currentEpoch().catch(() => 0)) + rt.pub.storageEpochs;
    const ps = await rt.service.findOrCreatePersonalSession(rt.address, rt.keypair, endEpoch);
    personal = { sessionId: ps.sessionId, capId: ps.capId };
    return personal;
  }

  async function loadPersonal(): Promise<{ nodes: Node[]; edges: Edge[]; manifest: Manifest }> {
    const ps = await ensurePersonal();
    const sk = await sessionKey();
    const state = await rt.service.state(ps.sessionId);
    if (cache && cache.version === state.headVersion) return { nodes: cache.nodes, edges: cache.edges, manifest: cache.manifest };
    const loaded = await rt.service.loadFullGraph(state, sk);
    cache = { version: state.headVersion, ...loaded };
    return loaded;
  }

  const dedupeOut = (es: { to: string; rel: string }[]) => {
    const seen = new Set<string>();
    return es.filter((e) => { const k = `${e.to}:${e.rel}`; if (seen.has(k)) return false; seen.add(k); return true; });
  };

  /** Lexical prefilter + d-hop neighborhood over the graph (agent ranks the result). */
  function recallFrom(nodes: Node[], edges: Edge[], query: string, depth: number): { nodes: (Node & { score: number })[]; edges: Edge[] } {
    const terms = query.toLowerCase().split(/\W+/).filter(Boolean);
    const score = (n: Node) => {
      const hay = `${n.title} ${n.body} ${n.tags.join(' ')}`.toLowerCase();
      let s = 0;
      for (const t of terms) if (hay.includes(t)) s += hay.split(t).length - 1;
      return s + (n.title.toLowerCase().includes(query.toLowerCase()) ? 3 : 0);
    };
    const ranked = nodes.map((n) => ({ n, s: score(n) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    const roots = (ranked.length ? ranked : nodes.map((n) => ({ n, s: 0 }))).slice(0, 6);
    const keep = new Set<string>();
    for (const r of roots) for (const id of neighborhood(r.n.id, edges, depth)) keep.add(id);
    const scoreMap = new Map(ranked.map((x) => [x.n.id, x.s]));
    const out = nodes.filter((n) => keep.has(n.id)).map((n) => ({ ...n, score: scoreMap.get(n.id) ?? 0 }));
    return { nodes: out, edges: edges.filter((e) => keep.has(e.from) && keep.has(e.to)) };
  }

  // ---- Flow A: capture (write-through to your personal Walrus session) ----
  mcp.registerTool('mycelia_remember', {
    description: 'Store a durable memory (node) in your account graph on Walrus (encrypted to you), optionally linked to existing memories. Shows up in the Mycelia web app under the same account. Returns the node.',
    inputSchema: {
      title: z.string(), body: z.string(), type: TYPE.default('concept'),
      importance: z.number().min(0).max(1).optional(),
      tags: z.array(z.string()).optional(),
      links: z.array(z.object({ to: z.string().describe('title or id of an existing memory'), rel: z.string() })).optional(),
    },
  }, async (a) => {
    try {
      const ps = await ensurePersonal();
      const { nodes, edges, manifest } = await loadPersonal();
      // upsert by title (same dedupe behavior as before)
      const existing = nodes.find((n) => n.title === a.title);
      const node: Node = existing
        ? { ...existing, body: a.body, type: a.type as NodeType, importance: a.importance ?? existing.importance, tags: a.tags ?? existing.tags, updatedAt: Date.now(), version: existing.version + 1 }
        : { id: randomUUID(), owner: rt.address, type: a.type as NodeType, title: a.title, body: a.body, importance: a.importance ?? 0.5, tags: a.tags ?? [], createdAt: Date.now(), updatedAt: Date.now(), version: 1 };
      // resolve links (title or id) and preserve the node's existing outgoing edges
      const linked: { to: string; rel: string }[] = [];
      for (const l of a.links ?? []) {
        const to = nodes.find((n) => n.id === l.to || n.title === l.to);
        if (to) linked.push({ to: to.id, rel: l.rel });
      }
      const priorOut = edges.filter((e) => e.from === node.id).map((e) => ({ to: e.to, rel: e.rel }));
      const outgoing = dedupeOut([...priorOut, ...linked]);
      const res = await rt.service.putNode({ sessionId: ps.sessionId, node, outgoing, base: manifest, signer: rt.keypair, owner: rt.address });
      cache = null; // force a fresh decrypt on next read
      rt.store.recordBlobs(ps.sessionId, res.blobs); // track Walrus blobs for renewal
      return ok({ id: node.id, owner: node.owner, type: node.type, title: node.title, version: node.version, links: outgoing.length, manifestVersion: res.manifest.version });
    } catch (e) { return fail('remember failed: ' + (e as Error).message); }
  });

  // ---- recall (structured subgraph; agent ranks) ----
  mcp.registerTool('mycelia_recall', {
    description: 'Recall relevant memories from your account graph on Walrus: lexical match + d-hop neighborhood. Returns a subgraph {nodes(+score), edges} for you to rank.',
    inputSchema: { query: z.string(), depth: z.number().int().min(0).max(3).default(1) },
  }, async (a) => {
    try {
      const { nodes, edges } = await loadPersonal();
      return ok(recallFrom(nodes, edges, a.query, a.depth));
    } catch (e) { return fail('recall failed: ' + (e as Error).message); }
  });

  // ---- Flow B: create session ----
  mcp.registerTool('mycelia_create_session', {
    description: 'Create an encrypted shared session on-chain. Optionally add member addresses. Returns sessionId + capId.',
    inputSchema: { name: z.string(), members: z.array(z.string()).optional() },
  }, async (a) => {
    try {
      const endEpoch = (await rt.storage.currentEpoch().catch(() => 0)) + rt.pub.storageEpochs;
      const r = await rt.service.createSession(a.name, rt.keypair, rt.address, endEpoch);
      for (const m of a.members ?? []) await rt.service.addMember(r.capId, r.sessionId, m, rt.keypair);
      rt.store.trackSession({ session_id: r.sessionId, name: a.name, cap_id: r.capId, role: 'owner', last_version: 0 });
      rt.store.recordBlobs(r.sessionId, r.blobs);
      return ok({ sessionId: r.sessionId, capId: r.capId, members: a.members ?? [] });
    } catch (e) { return fail('create_session failed: ' + (e as Error).message); }
  });

  // ---- Flow C/D: share a depth slice ----
  mcp.registerTool('mycelia_share', {
    description: 'Graft a memory + its d-hop neighborhood into a session: encrypt each node, publish to Walrus (you pay+own), update policy + head.',
    inputSchema: { session: z.string(), root: z.string().describe('title or id of a local memory'), depth: z.number().int().min(0).max(3).default(1) },
  }, async (a) => {
    try {
      const graph = await loadPersonal();
      const root = graph.nodes.find((n) => n.id === a.root || n.title === a.root);
      if (!root) return fail(`unknown memory: ${a.root}`);
      const cur = await loadGraph(a.session);
      const superseded = rt.store.blobIdsByKind(a.session, ['manifest', 'events']); // old head/event blobs -> GC after
      const res = await rt.service.shareSlice({
        sessionId: a.session, rootId: root.id, depth: a.depth,
        nodes: graph.nodes, edges: graph.edges,
        signer: rt.keypair, owner: rt.address,
        base: cur?.manifest, events: cur?.events,
      });
      rt.store.recordBlobs(a.session, res.blobs);
      // GC the now-superseded manifest/event blobs (§8) — reclaims storage rent
      const gc = await rt.service.gcBlobs(superseded, rt.keypair);
      rt.store.removeBlobs(gc.deleted);
      return ok({ sharedNodes: res.publishedNodeIds.length, manifestVersion: res.manifest.version, root: root.title, gcDeleted: gc.deleted.length });
    } catch (e) { return fail('share failed: ' + (e as Error).message); }
  });

  // ---- Flow D: join a session you were added to ----
  mcp.registerTool('mycelia_join', {
    description: 'Track a session you were added to (by id) so you can sync + reveal it.',
    inputSchema: { session: z.string() },
  }, async (a) => {
    try {
      const state = await rt.service.state(a.session);
      const role = state.owner.toLowerCase() === rt.address.toLowerCase() ? 'owner' : 'member';
      rt.store.trackSession({ session_id: a.session, name: state.name || 'shared', cap_id: null, role, last_version: 0 });
      return ok({ session: a.session, name: state.name, role, members: state.members.length });
    } catch (e) { return fail('join failed: ' + (e as Error).message); }
  });

  // ---- Flow F (read): sync structure ----
  mcp.registerTool('mycelia_sync', {
    description: 'Sync a session: returns the merged graph structure (nodes with owner/type, depth, and locked vs revealable) + the activity feed.',
    inputSchema: { session: z.string() },
  }, async (a) => {
    try {
      const g = await loadGraph(a.session);
      if (!g) return fail('no manifest');
      const state = await rt.service.state(a.session);
      const view = buildGraphView(g.manifest.nodes, g.manifest.edges, g.manifest.roots, state, rt.address);
      return ok({
        version: g.manifest.version, members: state.members, owner: state.owner,
        nodes: view.map((v) => ({ nodeId: v.nodeId, owner: v.owner, type: v.type, depth: v.depthFromRoot, locked: v.locked })),
        edges: g.manifest.edges, events: g.events,
      });
    } catch (e) {
      if (isNoAccess(e)) return ok({ access: false, reason: 'no access — not a member of this session (forward-only)' });
      const msg = (e as Error).message;
      if (/threshold|InconsistentKeyServers|key server/i.test(msg)) return ok({ degraded: true, reason: 'fewer key servers available than the threshold — cannot decrypt (fail-closed)' });
      return fail('sync failed: ' + msg);
    }
  });

  // ---- Flow F: reveal one node (decrypt) ----
  mcp.registerTool('mycelia_reveal', {
    description: 'Decrypt one shared node (Seal). Returns its content, or a clean no-access result if policy denies (fail-closed).',
    inputSchema: { session: z.string(), node: z.string().describe('nodeId') },
  }, async (a) => {
    try {
      const g = await loadGraph(a.session);
      if (!g) return fail('no manifest');
      const mn = g.manifest.nodes.find((n) => n.nodeId === a.node);
      if (!mn) return fail(`node not in session: ${a.node}`);
      const nv = await rt.service.reveal(a.session, a.node, mn.latestBlobId, g.sk);
      return ok({ nodeId: nv.nodeId, owner: nv.owner, type: nv.type, title: nv.title, body: nv.body, edges: nv.edges });
    } catch (e) {
      if (isNoAccess(e)) return ok({ access: false, reason: 'no access (not shared with you / revoked) — forward-only' });
      return fail('reveal failed: ' + (e as Error).message);
    }
  });

  // ---- Flow G: membership + revoke ----
  const capOf = (s: string) => rt.store.session(s)?.cap_id ?? null;
  mcp.registerTool('mycelia_add_member', {
    description: 'Add a member address to a session you own.',
    inputSchema: { session: z.string(), address: z.string() },
  }, async (a) => { const cap = capOf(a.session); if (!cap) return fail('not session owner'); try { await rt.service.addMember(cap, a.session, a.address, rt.keypair); return ok({ added: a.address }); } catch (e) { return fail((e as Error).message); } });

  mcp.registerTool('mycelia_remove_member', {
    description: 'Remove a member (forward-only: blocks future key issuance; cannot retract already-decrypted copies).',
    inputSchema: { session: z.string(), address: z.string() },
  }, async (a) => { const cap = capOf(a.session); if (!cap) return fail('not session owner'); try { await rt.service.removeMember(cap, a.session, a.address, rt.keypair); return ok({ removed: a.address, forwardOnly: true }); } catch (e) { return fail((e as Error).message); } });

  mcp.registerTool('mycelia_unshare', {
    description: 'Un-share a node (forward-only). Blocks future decrypts of that node.',
    inputSchema: { session: z.string(), node: z.string() },
  }, async (a) => { const cap = capOf(a.session); if (!cap) return fail('not session owner'); try { await rt.service.unshare(cap, a.session, a.node, rt.keypair); return ok({ unshared: a.node, forwardOnly: true }); } catch (e) { return fail((e as Error).message); } });

  // ---- Flow H: renew storage ----
  mcp.registerTool('mycelia_renew', {
    description: 'Extend real Walrus storage for this session\'s blobs you own (+ update the on-chain end_epoch marker) so data does not expire.',
    inputSchema: { session: z.string(), epochs: z.number().int().optional() },
  }, async (a) => {
    const cap = capOf(a.session); if (!cap) return fail('not session owner');
    try {
      const cur = await rt.storage.currentEpoch().catch(() => 0);
      const epochs = a.epochs ?? rt.pub.storageEpochs;
      // 1) extend the actual Walrus blob objects (owner-signed)
      const ids = rt.store.blobsForSession(a.session).map((b) => b.blob_object_id);
      const r = await rt.service.renewStorage(ids, epochs, rt.keypair);
      for (const id of r.extended) rt.store.setBlobEpoch(id, cur + epochs);
      // 2) update the on-chain Session end_epoch marker
      await rt.service.renew(cap, a.session, cur + epochs, rt.keypair);
      return ok({ renewed: a.session, throughEpoch: cur + epochs, blobsExtended: r.extended.length, blobsFailed: r.failed.length });
    } catch (e) { return fail((e as Error).message); }
  });

  // ---- Flow E: expand a shared node to a new version (live propagation) ----
  mcp.registerTool('mycelia_expand', {
    description: 'Publish a new version of a node you own into the session (live expansion). Bumps the head; members see it on next sync.',
    inputSchema: { session: z.string(), node: z.string().describe('title or id of a local memory') },
  }, async (a) => {
    try {
      const graph = await loadPersonal();
      const node = graph.nodes.find((n) => n.id === a.node || n.title === a.node);
      if (!node) return fail(`unknown memory: ${a.node}`);
      const cur = await loadGraph(a.session);
      if (!cur) return fail('no manifest');
      const outgoing = graph.edges.filter((e) => e.from === node.id).map((e) => ({ to: e.to, rel: e.rel }));
      const res = await rt.service.expandNode({ sessionId: a.session, node, outgoing, base: cur.manifest, events: cur.events, signer: rt.keypair, owner: rt.address });
      rt.store.recordBlobs(a.session, res.blobs);
      return ok({ expanded: node.title, manifestVersion: res.manifest.version });
    } catch (e) { return fail('expand failed: ' + (e as Error).message); }
  });

  // ---- resources ----
  mcp.registerResource('identity', 'mycelia://identity', { description: 'This agent\'s Sui address + network', mimeType: 'application/json' },
    async () => {
      let bal = '0';
      try { bal = (await rt.client.core.getBalance({ owner: rt.address, coinType: '0x2::sui::SUI' })).balance?.balance ?? '0'; } catch { /* ignore */ }
      return { contents: [{ uri: 'mycelia://identity', mimeType: 'application/json', text: JSON.stringify({ address: rt.address, network: rt.pub.suiNetwork, packageId: rt.pub.myceliaPackageId, suiBalance: bal }) }] };
    });
  mcp.registerResource('sessions', 'mycelia://sessions', { description: 'Sessions this agent tracks', mimeType: 'application/json' },
    async () => ({ contents: [{ uri: 'mycelia://sessions', mimeType: 'application/json', text: JSON.stringify(rt.store.sessions()) }] }));
  mcp.registerResource('feed', 'mycelia://feed', { description: 'Check-again notifications (head bumps, renewals)', mimeType: 'application/json' },
    async () => ({ contents: [{ uri: 'mycelia://feed', mimeType: 'application/json', text: JSON.stringify(rt.store.feed()) }] }));

  return mcp;
}
