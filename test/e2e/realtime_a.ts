// Realtime "user A" driver (script side, master wallet). Pairs with a live
// browser "user B". Modes:
//   setup <memberAddr>  create session, add member, share a slice, register watch
//   push <title>        contribute a new node into the live session (head bump)
import 'dotenv/config';
import { randomUUID as uuid } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import {
  loadPublicConfig, loadServerSecrets, keypairFromSecret, addressOf, makeSuiClient,
  Crypto, Storage, SessionClient, Mycelia, SessionKey,
} from '../../packages/core/src/index.js';
import type { Node, Edge } from '../../packages/core/src/index.js';

const STATE = '/tmp/rt_session.json';
const API = 'http://localhost:8787';
const log = (...a: unknown[]) => console.log('[A]', ...a);

function build() {
  const pub = loadPublicConfig(process.env as Record<string, string>);
  const sec = loadServerSecrets(process.env as Record<string, string>);
  const kp = keypairFromSecret(sec.masterSuiPrivkey);
  const addr = addressOf(kp);
  const client = makeSuiClient({ network: 'testnet', fullnodeUrl: pub.suiFullnodeUrl });
  const crypto = new Crypto({ suiClient: client, keyServerIds: pub.sealKeyServerIds, threshold: pub.sealThreshold, packageId: pub.myceliaPackageId });
  const storage = new Storage({ network: 'testnet', suiClient: client, aggregatorUrl: pub.walrusAggregator });
  const sessions = new SessionClient(client, pub.myceliaPackageId);
  const service = new Mycelia(sessions, crypto, storage, { storageEpochs: pub.storageEpochs });
  return { pub, kp, addr, client, crypto, storage, sessions, service };
}

function mkNode(addr: string, title: string, type: Node['type'], body: string): Node {
  return { id: uuid(), owner: addr, type, title, body, importance: 0.7, tags: [], createdAt: Date.now(), updatedAt: Date.now(), version: 1 };
}

async function main() {
  const mode = process.argv[2];
  const ctx = build();
  log('A wallet', ctx.addr);

  if (mode === 'setup') {
    const member = process.argv[3];
    if (!member?.startsWith('0x')) throw new Error('usage: setup <0xMemberAddr>');
    const endEpoch = (await ctx.storage.currentEpoch().catch(() => 0)) + ctx.pub.storageEpochs;
    const { sessionId, capId } = await ctx.service.createSession('Realtime Demo', ctx.kp, ctx.addr, endEpoch);
    log('session', sessionId, 'cap', capId);
    await ctx.service.addMember(capId, sessionId, member, ctx.kp);
    log('added member', member);

    // local graph + first share
    const px = mkNode(ctx.addr, 'Project Atlas', 'project', 'Local-first agent memory platform.');
    const ts = mkNode(ctx.addr, 'TypeScript', 'skill', 'Core language.');
    const sui = mkNode(ctx.addr, 'Sui + Move', 'skill', 'On-chain policy.');
    const nodes: Node[] = [px, ts, sui];
    const edges: Edge[] = [
      { id: uuid(), from: px.id, to: ts.id, rel: 'uses', owner: ctx.addr },
      { id: uuid(), from: px.id, to: sui.id, rel: 'uses', owner: ctx.addr },
    ];
    const share = await ctx.service.shareSlice({ sessionId, rootId: px.id, depth: 1, nodes, edges, signer: ctx.kp, owner: ctx.addr });
    log('shared', share.publishedNodeIds.length, 'nodes; manifest v', share.manifest.version);
    await fetch(`${API}/api/sessions/${sessionId}/watch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ owner: ctx.addr, name: 'Realtime Demo', endEpoch: share.endEpoch }) }).catch(() => {});
    writeFileSync(STATE, JSON.stringify({ sessionId, capId, nodes, edges, manifest: share.manifest, events: share.eventBlobId ? [] : [] }));
    console.log('\nSESSION_ID=' + sessionId);
    console.log('A_ADDRESS=' + ctx.addr);
  } else if (mode === 'add') {
    if (!existsSync(STATE)) throw new Error('run setup first');
    const st = JSON.parse(readFileSync(STATE, 'utf8'));
    const who = process.argv[3];
    if (!who?.startsWith('0x')) throw new Error('usage: add <0xAddr>');
    await ctx.service.addMember(st.capId, st.sessionId, who, ctx.kp);
    log('added member', who, 'to', st.sessionId);
    console.log('ADDED=' + who);
  } else if (mode === 'push') {
    if (!existsSync(STATE)) throw new Error('run setup first');
    const st = JSON.parse(readFileSync(STATE, 'utf8'));
    const title = process.argv[3] || 'Live Insight ' + Date.now();
    // fetch current manifest + events as the merge base
    const sk = await SessionKey.create({ address: ctx.addr, packageId: ctx.pub.myceliaPackageId, ttlMin: 10, signer: ctx.kp, suiClient: ctx.client as never });
    const state = await ctx.service.state(st.sessionId);
    const base = await ctx.service.fetchManifest(state, sk);
    const events = await ctx.service.fetchEvents(state, sk).catch(() => []);
    // add a NEW node connected to Project Atlas, contribute it
    const px = (st.nodes as Node[]).find((n) => n.title === 'Project Atlas')!;
    const fresh = mkNode(ctx.addr, title, 'concept', 'Pushed live at ' + new Date().toISOString());
    const nodes: Node[] = [...st.nodes, fresh];
    const edges: Edge[] = [...st.edges, { id: uuid(), from: px.id, to: fresh.id, rel: 'has', owner: ctx.addr }];
    const share = await ctx.service.shareSlice({ sessionId: st.sessionId, rootId: fresh.id, depth: 0, nodes, edges, signer: ctx.kp, owner: ctx.addr, base, events });
    writeFileSync(STATE, JSON.stringify({ ...st, nodes, edges, manifest: share.manifest }));
    log('PUSHED new node:', title, '-> manifest v', share.manifest.version, '(head bumped; B should see it within a poll)');
    console.log('PUSHED=' + title);
  } else {
    throw new Error('usage: realtime_a.ts setup <addr> | push <title>');
  }
}
main().catch((e) => { console.error('[A] FAILED', e); process.exit(1); });
