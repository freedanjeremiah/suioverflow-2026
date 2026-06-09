// Mycelia MCP server — memory tools for any MCP host. Thin wrappers over
// @mycelia/core (encrypt-on-device, owner=this key). MYCELIA_SPEC §3, flows A-H.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SessionKey, sealIdBytes, isNoAccess, buildGraphView, NODE_TYPES } from '@mycelia/core';
import type { Manifest, EventLogEntry, NodeType } from '@mycelia/core';
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

  // ---- Flow A: capture ----
  mcp.registerTool('mycelia_remember', {
    description: 'Store a durable memory (node) in your private local graph, optionally linked to existing memories. Returns the node.',
    inputSchema: {
      title: z.string(), body: z.string(), type: TYPE.default('concept'),
      importance: z.number().min(0).max(1).optional(),
      tags: z.array(z.string()).optional(),
      links: z.array(z.object({ to: z.string().describe('title or id of an existing memory'), rel: z.string() })).optional(),
    },
  }, async (a) => ok(rt.store.remember({ title: a.title, body: a.body, type: a.type as NodeType, importance: a.importance, tags: a.tags, links: a.links })));

  // ---- recall (structured subgraph; agent ranks) ----
  mcp.registerTool('mycelia_recall', {
    description: 'Recall relevant private memories: lexical match + d-hop neighborhood. Returns a subgraph {nodes(+score), edges} for you to rank.',
    inputSchema: { query: z.string(), depth: z.number().int().min(0).max(3).default(1) },
  }, async (a) => ok(rt.store.recall(a.query, a.depth)));

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
      const root = rt.store.nodeByTitleOrId(a.root);
      if (!root) return fail(`unknown memory: ${a.root}`);
      const cur = await loadGraph(a.session);
      const superseded = rt.store.blobIdsByKind(a.session, ['manifest', 'events']); // old head/event blobs -> GC after
      const res = await rt.service.shareSlice({
        sessionId: a.session, rootId: root.id, depth: a.depth,
        nodes: rt.store.allNodes(), edges: rt.store.allEdges(),
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
      const node = rt.store.nodeByTitleOrId(a.node);
      if (!node) return fail(`unknown memory: ${a.node}`);
      const cur = await loadGraph(a.session);
      if (!cur) return fail('no manifest');
      const outgoing = rt.store.allEdges().filter((e) => e.from === node.id).map((e) => ({ to: e.to, rel: e.rel }));
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
