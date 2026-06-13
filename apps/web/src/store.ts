import { create } from 'zustand';
import { api, type PublicConfig, type Notification } from './lib/api.js';
import { buildBrowserMycelia, type BrowserMycelia } from './lib/mycelia.js';
import * as LG from './lib/localgraph.js';
import {
  buildGraphView, neighborhood, SessionKey,
  type SessionState, type Manifest, type EventLogEntry, type GraphNodeView, type NodeType, type Node,
} from '@mycelia/core';

export interface SessionRef { id: string; name: string; capId?: string; role: 'owner' | 'member'; }
export type Phase = 'loading' | 'login' | 'ready';

export interface Toast { id: number; kind: 'error' | 'success' | 'info'; message: string; detail?: string; }

export type StepStatus = 'todo' | 'doing' | 'done' | 'error';
export interface ProgressStep { key: 'encrypt' | 'publish' | 'policy'; label: string; status: StepStatus; error?: string; }
const CEREMONY: ProgressStep[] = [
  { key: 'encrypt', label: 'Encrypting nodes', status: 'todo' },
  { key: 'publish', label: 'Publishing to Walrus', status: 'todo' },
  { key: 'policy', label: 'Updating on-chain policy', status: 'todo' },
];

/** First-run guide (spec §5): three steps that auto-check from real actions. */
export interface GuideState { dismissed: boolean; grafted: boolean; revealed: boolean; }

interface State {
  phase: Phase;
  config: PublicConfig | null;
  address: string | null;
  email: string | null; // Privy email, drives avatar initials
  m: BrowserMycelia | null;
  sk: SessionKey | null;

  local: LG.LocalGraph;
  sessions: SessionRef[];
  currentId: string | null;
  state: SessionState | null;
  manifest: Manifest | null;
  view: GraphNodeView[];
  events: EventLogEntry[];
  revealed: Record<string, { title: string; body: string }>;
  notifications: Notification[];
  lastNotifId: number;
  currentEpoch: number; // live Walrus epoch (for expiry display)
  degraded: boolean; // below-threshold key servers / decrypt unavailable (fail closed)

  selectedNodeId: string | null; // canvas-selected manifest node (inspector / reveal)
  shareRootId: string | null; // local-graph node chosen as the graft root
  depth: number;
  busy: string | null; // label of current op
  progress: ProgressStep[]; // graft ceremony
  sharePanelOpen: boolean;

  toasts: Toast[];
  guide: GuideState;

  init: () => Promise<void>;
  afterLogin: (seedHex: string, address: string, email?: string | null) => void;
  logout: () => void;
  createSession: (name: string) => Promise<void>;
  joinSession: (id: string) => Promise<void>;
  selectSession: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  shareSelection: () => Promise<void>;
  reveal: (nodeId: string) => Promise<void>;
  addMember: (who: string) => Promise<void>;
  removeMember: (who: string) => Promise<void>;
  unshareNode: (nodeId: string) => Promise<void>;
  renew: (epochs: number) => Promise<void>;
  capture: (n: { title: string; body: string; type: NodeType; connectTo?: string; rel?: string }) => void;
  clearSamples: () => void;
  selectNode: (id: string | null) => void;
  setShareRoot: (id: string | null) => void;
  setDepth: (d: number) => void;
  openShare: (open: boolean) => void;
  pollNotifications: () => Promise<void>;

  pushToast: (kind: Toast['kind'], message: string, detail?: string) => void;
  dismissToast: (id: number) => void;
  fail: (e: unknown, context?: string) => void;
  dismissGuide: () => void;
}

const SKEY = (a: string) => `mycelia:sessions:${a}`;
const loadSessions = (a: string): SessionRef[] => { try { return JSON.parse(localStorage.getItem(SKEY(a)) || '[]'); } catch { return []; } };
const saveSessions = (a: string, s: SessionRef[]) => localStorage.setItem(SKEY(a), JSON.stringify(s));
// published blob refs per (address, session) — what the owner can extend on renew
const BKEY = (a: string, s: string) => `mycelia:blobs:${a}:${s}`;
type BlobRef = { blobObjectId: string; endEpoch: number; kind: string };
const loadBlobs = (a: string, s: string): BlobRef[] => { try { return JSON.parse(localStorage.getItem(BKEY(a, s)) || '[]'); } catch { return []; } };
function addBlobs(a: string, s: string, refs: BlobRef[]) {
  const cur = loadBlobs(a, s);
  const seen = new Map(cur.map((b) => [b.blobObjectId, b]));
  for (const r of refs) if (r.blobObjectId) seen.set(r.blobObjectId, r);
  localStorage.setItem(BKEY(a, s), JSON.stringify([...seen.values()]));
}

const GKEY = (a: string) => `mycelia:guide:${a}`;
const loadGuide = (a: string): GuideState => {
  try { return { dismissed: false, grafted: false, revealed: false, ...JSON.parse(localStorage.getItem(GKEY(a)) || '{}') }; }
  catch { return { dismissed: false, grafted: false, revealed: false }; }
};
const saveGuide = (a: string, g: GuideState) => localStorage.setItem(GKEY(a), JSON.stringify(g));

/** Plain-language error translation (spec §6): what happened + what to do,
    raw detail preserved behind a disclosure. */
function friendly(raw: string): { message: string; detail?: string } {
  if (/threshold|InconsistentKeyServers|key server/i.test(raw))
    return { message: 'Some key servers are unreachable, so decryption is paused. Already-revealed memories stay readable.', detail: raw };
  if (/insufficient|gas|balance|coin/i.test(raw))
    return { message: "This wallet doesn't have enough funds for that action.", detail: raw };
  if (/notExists|not found|deleted|invalid.*object|No object/i.test(raw))
    return { message: "That session couldn't be found. Check the ID and try again.", detail: raw };
  if (/Failed to fetch|NetworkError|timeout|fetch failed|ECONN/i.test(raw))
    return { message: 'Network hiccup while talking to the chain or storage. Try again in a moment.', detail: raw };
  if (raw.length > 160) return { message: 'Something went wrong.', detail: raw };
  return { message: raw };
}

let toastSeq = 1;

export const useStore = create<State>((set, get) => ({
  phase: 'loading', config: null, address: null, email: null, m: null, sk: null,
  local: { nodes: [], edges: [] }, sessions: [], currentId: null,
  state: null, manifest: null, view: [], events: [], revealed: {}, notifications: [], lastNotifId: 0, currentEpoch: 0, degraded: false,
  selectedNodeId: null, shareRootId: null, depth: 1, busy: null, progress: [], sharePanelOpen: false,
  toasts: [], guide: { dismissed: false, grafted: false, revealed: false },

  pushToast: (kind, message, detail) => {
    const id = toastSeq++;
    set({ toasts: [...get().toasts, { id, kind, message, detail }].slice(-4) });
    const ttl = kind === 'error' ? 9000 : 5000;
    setTimeout(() => get().dismissToast(id), ttl);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  fail: (e, context) => {
    const raw = e instanceof Error ? e.message : String(e);
    const f = friendly(raw);
    get().pushToast('error', context ? `${context}: ${f.message}` : f.message, f.detail);
  },

  dismissGuide: () => {
    const { address, guide } = get();
    const next = { ...guide, dismissed: true };
    if (address) saveGuide(address, next);
    set({ guide: next });
  },

  init: async () => {
    try {
      const config = await api.config();
      set({ config });
      const cachedSeed = sessionStorage.getItem('mycelia:seed');
      const cachedAddr = sessionStorage.getItem('mycelia:addr');
      const cachedEmail = sessionStorage.getItem('mycelia:email');
      if (cachedSeed && cachedAddr) get().afterLogin(cachedSeed, cachedAddr, cachedEmail);
      else set({ phase: 'login' });
    } catch (e) { get().fail(e, 'Could not reach the Mycelia backend'); set({ phase: 'login' }); }
  },

  afterLogin: (seedHex, address, email = null) => {
    const config = get().config!;
    const m = buildBrowserMycelia(seedHex, address, config);
    sessionStorage.setItem('mycelia:seed', seedHex);
    sessionStorage.setItem('mycelia:addr', address);
    if (email) sessionStorage.setItem('mycelia:email', email);
    set({
      m, address, email, phase: 'ready',
      local: LG.load(address), sessions: loadSessions(address), guide: loadGuide(address),
    });
  },

  logout: () => {
    sessionStorage.removeItem('mycelia:seed'); sessionStorage.removeItem('mycelia:addr'); sessionStorage.removeItem('mycelia:email');
    set({ phase: 'login', m: null, address: null, email: null, currentId: null, state: null, manifest: null, view: [], events: [], sk: null });
  },

  createSession: async (name) => {
    const { m, sessions, address } = get();
    if (!m || !address) return;
    set({ busy: 'Creating session…' });
    try {
      const endEpoch = (await m.storage.currentEpoch().catch(() => 0)) + m.config.storageEpochs;
      const r = await m.service.createSession(name, m.keypair, address, endEpoch);
      const ref: SessionRef = { id: r.sessionId, name, capId: r.capId, role: 'owner' };
      const next = [...sessions, ref];
      saveSessions(address, next);
      await api.watch(r.sessionId, { owner: address, name, endEpoch });
      set({ sessions: next });
      get().pushToast('success', `Session "${name}" created.`);
      await get().selectSession(r.sessionId);
    } catch (e) { get().fail(e, 'Could not create the session'); }
    finally { set({ busy: null }); }
  },

  joinSession: async (id) => {
    const { sessions, address } = get();
    if (!address || !id.trim()) return;
    const sid = id.trim();
    set({ busy: 'Joining session…' });
    try {
      const state = await get().m!.service.state(sid); // validate it exists
      if (!sessions.some((s) => s.id === sid)) {
        const role = state.owner.toLowerCase() === address.toLowerCase() ? 'owner' : 'member';
        const next = [...sessions, { id: sid, name: state.name || 'shared session', role } as SessionRef];
        saveSessions(address, next);
        set({ sessions: next });
        await api.watch(sid, { owner: state.owner, name: state.name || '', endEpoch: state.endEpoch }).catch(() => {});
      }
      await get().selectSession(sid);
    } catch (e) { get().fail(e, 'Join failed'); }
    finally { set({ busy: null }); }
  },

  selectSession: async (id) => { set({ currentId: id, revealed: {}, lastNotifId: 0, notifications: [] }); await get().refresh(); },

  refresh: async () => {
    const { m, currentId, address, revealed } = get();
    if (!m || !currentId || !address) return;
    set({ busy: get().busy ?? 'Syncing…' });
    try {
      let sk = get().sk;
      if (!sk || sk.isExpired() || sk.getAddress() !== address) {
        sk = await SessionKey.create({ address, packageId: m.config.packageId, ttlMin: 10, signer: m.keypair, suiClient: m.client as never });
        set({ sk });
      }
      const state = await m.service.state(currentId);
      let degraded = false;
      const fetched = await m.service.fetchManifest(state, sk).catch((e: Error) => {
        if (/threshold|InconsistentKeyServers|key server/i.test(e.message)) degraded = true;
        return null;
      });
      // keep the prior manifest/view on a transient read miss (e.g. a head bump
      // whose new blob hasn't propagated to the aggregator yet) — no blank flicker.
      const manifest = fetched ?? get().manifest;
      const events = fetched ? await m.service.fetchEvents(state, sk).catch(() => get().events) : get().events;
      const view = manifest
        ? buildGraphView(manifest.nodes, manifest.edges, manifest.roots, state, address, revealed)
        : get().view;
      const currentEpoch = await m.storage.currentEpoch().catch(() => get().currentEpoch);
      set({ state, manifest, events, view, currentEpoch, degraded });
    } catch (e) { get().fail(e, 'Sync failed'); }
    finally { set({ busy: null }); }
  },

  shareSelection: async () => {
    const { m, currentId, address, shareRootId, depth, local } = get();
    if (!m || !currentId || !address || !shareRootId) return;
    const count = sharePreview(local, shareRootId, depth).length;
    set({ progress: CEREMONY.map((s) => ({ ...s })), busy: 'Grafting…' });
    const onStep = (key: 'encrypt' | 'publish' | 'policy', done: boolean) =>
      set({ progress: get().progress.map((p) => (p.key === key ? { ...p, status: done ? 'done' : 'doing' } : p)) });
    try {
      const res = await m.service.shareSlice({
        sessionId: currentId, rootId: shareRootId, depth,
        nodes: local.nodes, edges: local.edges, signer: m.keypair, owner: address,
        base: get().manifest ?? undefined, events: get().events, onStep,
      });
      set({ progress: get().progress.map((s) => ({ ...s, status: 'done' as StepStatus })) });
      // register ALL published blobs (node quilt + manifest + events) for renewal,
      // and persist them locally so the owner's Renew button can extend them.
      await api.registerBlobs(currentId, res.blobs.map((b) => ({ blobObjectId: b.blobObjectId, endEpoch: b.endEpoch, kind: b.kind }))).catch(() => {});
      addBlobs(address, currentId, res.blobs);
      await api.watch(currentId, { owner: address, name: get().sessions.find((s) => s.id === currentId)?.name ?? '', endEpoch: res.endEpoch || 0 }).catch(() => {});
      const guide = { ...get().guide, grafted: true };
      saveGuide(address, guide);
      set({ sharePanelOpen: false, progress: [], guide });
      get().pushToast('success', `${count} ${count === 1 ? 'memory' : 'memories'} grafted into the session.`);
      await get().refresh();
    } catch (e) {
      // keep the ceremony visible: mark the in-flight step failed, offer retry
      const raw = e instanceof Error ? e.message : String(e);
      const f = friendly(raw);
      set({
        progress: get().progress.map((p) =>
          p.status === 'doing' ? { ...p, status: 'error' as StepStatus, error: f.message }
            : p.status === 'todo' && get().progress.every((q) => q.status !== 'doing') && p.key === 'encrypt'
              ? { ...p, status: 'error' as StepStatus, error: f.message } : p),
      });
      get().fail(e, 'Graft failed');
    }
    finally { set({ busy: null }); }
  },

  reveal: async (nodeId) => {
    const { m, currentId, manifest, sk, revealed, address } = get();
    if (!m || !currentId || !manifest || !sk || !address) return;
    const mn = manifest.nodes.find((n) => n.nodeId === nodeId);
    if (!mn) return;
    set({ busy: 'Revealing…' });
    try {
      const nv = await m.service.reveal(currentId, nodeId, mn.latestBlobId, sk);
      const nextRevealed = { ...revealed, [nodeId]: { title: nv.title, body: nv.body } };
      const state = get().state!;
      const view = buildGraphView(manifest.nodes, manifest.edges, manifest.roots, state, address, nextRevealed);
      const guide = { ...get().guide, revealed: true };
      saveGuide(address, guide);
      set({ revealed: nextRevealed, view, guide });
    } catch (e) {
      const msg = (e as Error).message;
      if (/threshold|InconsistentKeyServers|key server/i.test(msg)) set({ degraded: true });
      get().fail(e, 'Reveal failed');
    }
    finally { set({ busy: null }); }
  },

  addMember: async (who) => {
    const { m, currentId, sessions } = get();
    const ref = sessions.find((s) => s.id === currentId);
    if (!m || !currentId || !ref?.capId) return;
    set({ busy: 'Adding member…' });
    try {
      await m.service.addMember(ref.capId, currentId, who.trim(), m.keypair);
      get().pushToast('success', 'Member added. They can now decrypt everything shared here.');
      await get().refresh();
    }
    catch (e) { get().fail(e, 'Could not add member'); } finally { set({ busy: null }); }
  },
  removeMember: async (who) => {
    const { m, currentId, sessions } = get();
    const ref = sessions.find((s) => s.id === currentId);
    if (!m || !currentId || !ref?.capId) return;
    set({ busy: 'Removing member…' });
    try {
      await m.service.removeMember(ref.capId, currentId, who, m.keypair);
      get().pushToast('info', 'Member removed. Future reads are blocked; already-decrypted copies remain on their device.');
      await get().refresh();
    }
    catch (e) { get().fail(e, 'Could not remove member'); } finally { set({ busy: null }); }
  },
  unshareNode: async (nodeId) => {
    const { m, currentId, sessions } = get();
    const ref = sessions.find((s) => s.id === currentId);
    if (!m || !currentId || !ref?.capId) return;
    set({ busy: 'Pruning…' });
    try {
      await m.service.unshare(ref.capId, currentId, nodeId, m.keypair);
      get().pushToast('info', 'Memory un-shared. Future decryption is blocked for everyone.');
      await get().refresh();
    }
    catch (e) { get().fail(e, 'Could not un-share'); } finally { set({ busy: null }); }
  },
  renew: async (epochs) => {
    const { m, currentId, sessions, state } = get();
    const ref = sessions.find((s) => s.id === currentId);
    if (!m || !currentId || !ref?.capId || !state) return;
    set({ busy: 'Renewing storage…' });
    try {
      const cur = await m.storage.currentEpoch().catch(() => state.endEpoch);
      // extend the actual Walrus blobs we own (invariant #3), then the on-chain marker
      const ids = loadBlobs(get().address!, currentId).map((b) => b.blobObjectId);
      const r = await m.service.renewStorage(ids, epochs, m.keypair);
      if (r.extended.length) addBlobs(get().address!, currentId, loadBlobs(get().address!, currentId).map((b) => r.extended.includes(b.blobObjectId) ? { ...b, endEpoch: cur + epochs } : b));
      await m.service.renew(ref.capId, currentId, cur + epochs, m.keypair);
      get().pushToast('success', `Storage renewed through epoch ${cur + epochs}.`);
      await get().refresh();
    } catch (e) { get().fail(e, 'Renewal failed'); } finally { set({ busy: null }); }
  },

  capture: ({ title, body, type, connectTo, rel }) => {
    const { local, address } = get();
    if (!address) return;
    const { g, node } = LG.addNode(local, address, { title, body, type });
    let g2 = g;
    if (connectTo && rel) g2 = LG.addEdge(g2, address, connectTo, node.id, rel);
    LG.save(address, g2);
    set({ local: g2 });
  },

  clearSamples: () => {
    const { local, address } = get();
    if (!address) return;
    const g = LG.clearSamples(local);
    LG.save(address, g);
    const shareRootId = g.nodes.some((n) => n.id === get().shareRootId) ? get().shareRootId : null;
    set({ local: g, shareRootId });
    get().pushToast('info', 'Sample memories cleared.');
  },

  selectNode: (id) => set({ selectedNodeId: id }),
  setShareRoot: (id) => set({ shareRootId: id }),
  setDepth: (d) => set({ depth: Math.max(0, Math.min(3, d)) }),
  openShare: (open) => set({ sharePanelOpen: open, progress: [] }),

  pollNotifications: async () => {
    const { currentId, lastNotifId, notifications, busy } = get();
    if (!currentId || busy) return; // don't touch the shared client mid-operation (graft/reveal)
    try {
      const { notifications: fresh } = await api.notifications(currentId, lastNotifId);
      if (fresh.length) {
        const maxId = Math.max(lastNotifId, ...fresh.map((n) => n.id));
        set({ notifications: [...fresh.reverse(), ...notifications].slice(0, 50), lastNotifId: maxId });
        // live propagation: a head bump means new shared memory -> resync
        if (fresh.some((n) => n.kind === 'head')) await get().refresh();
      }
    } catch { /* daemon feed best-effort */ }
  },
}));

/** Local-graph slice preview for the share panel + the canvas ghost preview. */
export function sharePreview(local: LG.LocalGraph, rootId: string | null, depth: number): Node[] {
  if (!rootId) return [];
  const ids = neighborhood(rootId, local.edges, depth);
  return local.nodes.filter((n) => ids.has(n.id));
}
