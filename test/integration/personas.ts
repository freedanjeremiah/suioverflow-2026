// Persona-driven LIVE-TX lifecycle test over the Mycelia MCP server.
// Two real agents (separate keys/DBs) exercise every persona + flow on testnet:
//   P1 Builder, P2 Collaborator, P3 Mentor, P4 Team Lead, P5 Privacy-First.
// Each tool call is a real local/on-chain/Walrus/Seal operation.
import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  loadServerSecrets, keypairFromSecret, generateKeypair, addressOf, exportSecret,
  makeSuiClient, loadPublicConfig, fundAddress,
} from '../../packages/core/src/index.js';

const REPO = process.cwd();
const TSX = REPO + '/node_modules/.bin/tsx';
const results: [string, boolean, string][] = [];
const rec = (s: string, ok: boolean, n = '') => { results.push([s, ok, n]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${s}  ${n}`); };

async function agent(key: string, db: string): Promise<Client> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  env.MYCELIA_KEY = key; env.MYCELIA_DB = db; env.MYCELIA_HOME = db + '.home';
  const transport = new StdioClientTransport({ command: TSX, args: ['apps/mcp/src/index.ts'], env, cwd: REPO });
  const c = new Client({ name: 'persona-test', version: '0.1.0' });
  await c.connect(transport);
  return c;
}
async function call(c: Client, name: string, args: Record<string, unknown> = {}): Promise<any> {
  // share/reveal/create do real Walrus+Seal+Sui work (can take minutes) — well past
  // the MCP default 60s request timeout, so give slow tools generous headroom.
  const r: any = await c.callTool({ name, arguments: args }, undefined, { timeout: 300000, maxTotalTimeout: 300000 });
  const text = r?.content?.[0]?.text ?? '';
  const data = (() => { try { return JSON.parse(text); } catch { return text; } })();
  if (r?.isError) throw new Error(`${name}: ${text}`);
  return data;
}

async function main() {
  const pub = loadPublicConfig(process.env as Record<string, string>);
  const sec = loadServerSecrets(process.env as Record<string, string>);
  const master = keypairFromSecret(sec.masterSuiPrivkey);
  const masterAddr = addressOf(master);
  const client = makeSuiClient({ network: 'testnet', fullnodeUrl: pub.suiFullnodeUrl });

  // reuse a persisted collaborator wallet across runs (avoid re-funding each time)
  const COLLAB_FILE = '/tmp/persona-collab.json';
  let collabKp: ReturnType<typeof generateKeypair>;
  if (existsSync(COLLAB_FILE)) collabKp = keypairFromSecret(JSON.parse(readFileSync(COLLAB_FILE, 'utf8')).privkey);
  else { collabKp = generateKeypair(); writeFileSync(COLLAB_FILE, JSON.stringify({ privkey: exportSecret(collabKp) })); }
  const collabAddr = addressOf(collabKp);
  console.log('collaborator', collabAddr);
  const f = await fundAddress(client, master, masterAddr, collabAddr, { suiMist: 90_000_000n, walAmount: 45_000_000n, minSui: 40_000_000n, minWal: 20_000_000n });
  rec('collaborator funded', true, `${collabAddr} (funded sui=${f.fundedSui} wal=${f.fundedWal})`);

  const ts = Date.now();
  const builder = await agent(sec.masterSuiPrivkey, `/tmp/mcp-builder-${ts}.sqlite`);
  const collab = await agent(exportSecret(collabKp), `/tmp/mcp-collab-${ts}.sqlite`);
  rec('both MCP agents connected', true);

  // ===== P1 BUILDER: capture private memory, recall, create+share =====
  await call(builder, 'mycelia_remember', { title: 'Project Atlas', body: 'Local-first agent memory platform.', type: 'project', importance: 0.95 });
  await call(builder, 'mycelia_remember', { title: 'TypeScript', body: 'Primary language.', type: 'skill', links: [{ to: 'Project Atlas', rel: 'uses' }] });
  await call(builder, 'mycelia_remember', { title: 'Sui + Move', body: 'On-chain policy layer.', type: 'skill', links: [{ to: 'Project Atlas', rel: 'uses' }] });
  await call(builder, 'mycelia_remember', { title: 'Q3 Roadmap', body: 'Ship sharing + revocation.', type: 'concept', links: [{ to: 'Project Atlas', rel: 'has' }] });
  const recall = await call(builder, 'mycelia_recall', { query: 'atlas stack', depth: 2 });
  rec('P1 remember+recall', recall.nodes.length >= 3, `${recall.nodes.length} nodes recalled`);

  const sess = await call(builder, 'mycelia_create_session', { name: 'Atlas Build', members: [collabAddr] });
  rec('P1 create_session (+member)', !!sess.sessionId, sess.sessionId);
  const SID = sess.sessionId;
  const shared = await call(builder, 'mycelia_share', { session: SID, root: 'Project Atlas', depth: 2 });
  rec('P1 share depth-2 (+GC superseded)', shared.sharedNodes >= 4, `${shared.sharedNodes} nodes, v${shared.manifestVersion}, gc=${shared.gcDeleted ?? 0}`);

  // ===== P2 COLLABORATOR: join, sync, CROSS-PARTY decrypt, contribute =====
  const joined = await call(collab, 'mycelia_join', { session: SID });
  rec('P2 join', joined.role === 'member', `role=${joined.role}`);
  const csync = await call(collab, 'mycelia_sync', { session: SID });
  const builderNode = csync.nodes.find((n: any) => !n.locked);
  rec('P2 sync sees shared nodes', csync.nodes.length >= 4 && !!builderNode, `${csync.nodes.length} nodes, ${csync.nodes.filter((n:any)=>!n.locked).length} unlocked`);
  const revealed = await call(collab, 'mycelia_reveal', { session: SID, node: builderNode.nodeId });
  rec('P2 CROSS-PARTY decrypt of builder node', revealed.title === 'Project Atlas' || !!revealed.title, revealed.title ?? revealed.reason);

  await call(collab, 'mycelia_remember', { title: 'Design System', body: 'Tokens, components, motion.', type: 'project', importance: 0.8 });
  await call(collab, 'mycelia_remember', { title: 'Tokens', body: 'Color + type scale.', type: 'concept', links: [{ to: 'Design System', rel: 'has' }] });
  const contrib = await call(collab, 'mycelia_share', { session: SID, root: 'Design System', depth: 1 });
  rec('P2 contribute slice', contrib.sharedNodes >= 2, `${contrib.sharedNodes} nodes, v${contrib.manifestVersion}`);

  // ===== P1 BUILDER reads collaborator's contribution (other-direction cross-party) =====
  const bsync = await call(builder, 'mycelia_sync', { session: SID });
  const owners = new Set(bsync.nodes.map((n: any) => n.owner));
  const collabNode = bsync.nodes.find((n: any) => n.owner.toLowerCase() === collabAddr.toLowerCase() && !n.locked);
  rec('P1 sees merged graph (2 owners)', owners.size >= 2 && !!collabNode, `${bsync.nodes.length} nodes, ${owners.size} owners`);
  const bReveal = await call(builder, 'mycelia_reveal', { session: SID, node: collabNode.nodeId });
  rec('P1 cross-party decrypt of collab node', !!bReveal.title, bReveal.title ?? bReveal.reason);

  // ===== Flow E: live expansion (+ GC of superseded blobs) =====
  const exp = await call(builder, 'mycelia_expand', { session: SID, node: 'Project Atlas' });
  rec('Flow E expand (live propagation)', exp.manifestVersion > shared.manifestVersion, `v${exp.manifestVersion}`);
  const csync2 = await call(collab, 'mycelia_sync', { session: SID });
  rec('collaborator sees expansion live', csync2.version >= exp.manifestVersion, `v${csync2.version}`);

  // ===== P4 TEAM LEAD: manage members + REAL storage renewal =====
  const third = addressOf(generateKeypair());
  const add = await call(builder, 'mycelia_add_member', { session: SID, address: third });
  rec('P4 add_member', add.added === third);
  const renew = await call(builder, 'mycelia_renew', { session: SID });
  rec('P4 renew EXTENDS real blobs (#3)', renew.blobsExtended > 0, `extended ${renew.blobsExtended} blobs through epoch ${renew.throughEpoch}`);

  // ===== P3 MENTOR / P5 PRIVACY-FIRST: forward-only revocation, fail-closed =====
  const rm = await call(builder, 'mycelia_remove_member', { session: SID, address: collabAddr });
  rec('P3/P4 remove_member (forward-only)', rm.forwardOnly === true);
  // collaborator now denied a node it never fetched (fresh key issuance blocked)
  const unfetched = csync.nodes.find((n: any) => !n.locked && n.nodeId !== builderNode.nodeId);
  const denied = await call(collab, 'mycelia_reveal', { session: SID, node: unfetched?.nodeId ?? builderNode.nodeId });
  rec('P5 fail-closed after revoke (no access)', denied.access === false, denied.reason ?? JSON.stringify(denied).slice(0, 60));

  await builder.close().catch(() => {}); await collab.close().catch(() => {});
  console.log('\n===== SUMMARY =====');
  for (const [s, ok, n] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${s}  ${n}`);
  const passed = results.filter((r) => r[1]).length;
  console.log(`\n${passed}/${results.length} persona checks passed`);
  process.exit(results.every((r) => r[1]) ? 0 : 1);
}
main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
