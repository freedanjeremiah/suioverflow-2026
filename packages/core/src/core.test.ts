import { describe, it, expect } from 'vitest';
import { Storage } from './storage.js';
import { makeSuiClient } from './access.js';
import { generateKeypair, addressOf } from './identity.js';
import { sealIdBytes, sealIdHex } from './crypto.js';
import { neighborhood, remapDepths, sliceForShare, buildGraphView } from './graph.js';
import { buildManifest, diffManifest, emptyManifest } from './manifest.js';
import { appendEvents, relevance } from './events.js';
import { encodeNodeVersion, decodeNodeVersion } from './node-io.js';
import { ownerColor, OWNER_PALETTE } from './identity.js';
import type { Node, Edge, NodeVersion } from './types.js';

const SESSION = '0x' + 'ab'.repeat(32);

describe('sealId', () => {
  it('is 64 bytes: 32 session prefix ++ 32 node hash', () => {
    const b = sealIdBytes(SESSION, 'node-1');
    expect(b.length).toBe(64);
    // prefix equals the raw session id bytes
    expect(Buffer.from(b.slice(0, 32)).toString('hex')).toBe('ab'.repeat(32));
  });
  it('is deterministic and node-specific', () => {
    expect(sealIdHex(SESSION, 'a')).toBe(sealIdHex(SESSION, 'a'));
    expect(sealIdHex(SESSION, 'a')).not.toBe(sealIdHex(SESSION, 'b'));
  });
});

describe('graph BFS / remap', () => {
  // chain: r - b - c - d
  const edges = [
    { from: 'r', to: 'b' },
    { from: 'b', to: 'c' },
    { from: 'c', to: 'd' },
  ];
  it('neighborhood respects depth (0=root only)', () => {
    expect([...neighborhood('r', edges, 0)]).toEqual(['r']);
    expect(new Set(neighborhood('r', edges, 1))).toEqual(new Set(['r', 'b']));
    expect(new Set(neighborhood('r', edges, 2))).toEqual(new Set(['r', 'b', 'c']));
  });
  it('remap computes min hop to nearest root, -1 if unreachable', () => {
    const d = remapDepths(['r', 'b', 'c', 'd', 'x'], edges, [{ nodeId: 'r' }]);
    expect(d.get('r')).toBe(0);
    expect(d.get('b')).toBe(1);
    expect(d.get('d')).toBe(3);
    expect(d.get('x')).toBe(-1);
  });
  it('multi-root remap takes the minimum', () => {
    const d = remapDepths(['r', 'b', 'c', 'd'], edges, [{ nodeId: 'r' }, { nodeId: 'd' }]);
    expect(d.get('c')).toBe(1); // closer to d than r
  });
});

describe('sliceForShare', () => {
  const nodes: Node[] = ['r', 'b', 'c'].map((id) => ({
    id, owner: '0x1', type: 'concept', title: id, body: '', importance: 0.5, tags: [], createdAt: 0, updatedAt: 0, version: 1,
  }));
  const edges: Edge[] = [
    { id: 'e1', from: 'r', to: 'b', rel: 'rel', owner: '0x1' },
    { id: 'e2', from: 'b', to: 'c', rel: 'rel', owner: '0x1' },
  ];
  it('keeps only nodes within depth and edges fully inside the slice', () => {
    const s = sliceForShare(nodes, edges, 'r', 1);
    expect(s.nodes.map((n) => n.id).sort()).toEqual(['b', 'r']);
    expect(s.edges.map((e) => e.id)).toEqual(['e1']);
  });
});

describe('manifest', () => {
  it('builds + merges + diffs', () => {
    const base = emptyManifest(SESSION, 1);
    const m1 = buildManifest({
      sessionId: SESSION, version: 1, base, updatedAt: 1,
      blobIds: { n1: 'blobA' },
      nodes: [{ id: 'n1', owner: '0x1', type: 'project', title: 'X', body: '', importance: 0.8, tags: [], createdAt: 0, updatedAt: 0, version: 1 }],
      edges: [], roots: [{ nodeId: 'n1', owner: '0x1', depth: 2 }],
    });
    expect(m1.nodes.length).toBe(1);
    const m2 = buildManifest({
      sessionId: SESSION, version: 2, base: m1, updatedAt: 2,
      blobIds: { n1: 'blobB' }, // changed
      nodes: [{ id: 'n1', owner: '0x1', type: 'project', title: 'X', body: '', importance: 0.8, tags: [], createdAt: 0, updatedAt: 0, version: 2 }],
      edges: [], roots: [],
    });
    expect(diffManifest(m1, m2)).toEqual({ added: [], changed: ['n1'] });
  });
});

describe('buildGraphView locking', () => {
  it('locks nodes when viewer is not a member or node not shared', () => {
    const mnodes = [{ nodeId: 'n1', owner: '0x1', latestBlobId: 'b', type: 'project' as const, importanceHint: 0.5 }];
    const shared = sealIdHex(SESSION, 'n1');
    const view = buildGraphView(mnodes, [], [{ nodeId: 'n1', owner: '0x1', depth: 1 }],
      { id: SESSION, members: ['0x1'], sharedNodes: [shared] }, '0x1');
    expect(view[0]!.locked).toBe(false);
    const outsider = buildGraphView(mnodes, [], [], { id: SESSION, members: ['0x1'], sharedNodes: [shared] }, '0x2');
    expect(outsider[0]!.locked).toBe(true);
  });
});

describe('events', () => {
  it('appends with monotonic seq', () => {
    const log = appendEvents([], [{ actor: '0x1', kind: 'added', ts: 1 }]);
    const log2 = appendEvents(log, [{ actor: '0x1', kind: 'expanded', ts: 2 }]);
    expect(log2.map((e) => e.seq)).toEqual([1, 2]);
  });
  it('relevance is higher for overlapping titles', () => {
    const hi = relevance({ seq: 1, actor: '0x1', kind: 'added', title: 'Design System Tokens', ts: 0 }, ['Design System']);
    const lo = relevance({ seq: 1, actor: '0x1', kind: 'added', title: 'Unrelated Thing', ts: 0 }, ['Design System']);
    expect(hi).toBeGreaterThan(lo);
  });
});

describe('node-io', () => {
  it('round-trips a NodeVersion deterministically', () => {
    const nv: NodeVersion = {
      nodeId: 'n1', owner: '0x1', type: 'skill', title: 'TS', body: 'b', importance: 0.5, tags: ['x'], version: 1, ts: 1, edges: [{ to: 'n2', rel: 'uses' }],
    };
    const a = encodeNodeVersion(nv);
    expect(decodeNodeVersion(a)).toEqual(nv);
    // key order independent
    const reordered = { ts: 1, owner: '0x1', nodeId: 'n1', type: 'skill', title: 'TS', body: 'b', importance: 0.5, tags: ['x'], version: 1, edges: [{ rel: 'uses', to: 'n2' }] } as NodeVersion;
    expect(encodeNodeVersion(reordered)).toEqual(a);
  });
});

describe('encrypt-before-publish guard (#7/#10)', () => {
  it('refuses to publish plaintext (JSON) bytes', async () => {
    const client = makeSuiClient({ network: 'testnet', proxyUrl: 'https://x' });
    const storage = new Storage({ network: 'testnet', suiClient: client, aggregatorUrl: 'https://x' });
    const kp = generateKeypair();
    const plaintext = new TextEncoder().encode('{"nodeId":"n1","title":"secret"}');
    await expect(storage.publishBlob(plaintext, { signer: kp, owner: addressOf(kp), epochs: 3 }))
      .rejects.toThrow(/ciphertext|#7/i);
  });
});

describe('ownerColor', () => {
  it('is deterministic and from the non-blue palette', () => {
    expect(ownerColor('0xabc')).toBe(ownerColor('0xabc'));
    expect(OWNER_PALETTE).toContain(ownerColor('0xabc') as any);
  });
});
