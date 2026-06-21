// Add a tightly-INTERCONNECTED 10-node cluster to philo via the MCP. Each node
// links to ones added before it, so the result is one connected component.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const key = process.env.MYCELIA_KEY;

// ordered so every link target already exists when the node is written
const CLUSTER = [
  { title: 'Sui', type: 'project', body: 'Object-centric L1 blockchain by Mysten Labs; parallel execution, Move smart contracts.', tags: ['sui', 'blockchain'] },
  { title: 'Move language', type: 'skill', body: 'Resource-oriented language; assets are typed objects that cannot be copied or dropped.', tags: ['sui', 'coding'], links: [{ to: 'Sui', rel: 'uses' }] },
  { title: 'Sui objects', type: 'concept', body: 'Everything is an object with a unique 32-byte ID; owned, shared, or immutable.', tags: ['sui'], links: [{ to: 'Sui', rel: 'relates' }, { to: 'Move language', rel: 'relates' }] },
  { title: 'Owned vs shared objects', type: 'concept', body: 'Owned objects take the fast single-writer path; shared objects go through consensus.', tags: ['sui'], links: [{ to: 'Sui objects', rel: 'relates' }] },
  { title: 'Programmable Transaction Blocks', type: 'concept', body: 'PTBs chain many Move calls + transfers into one atomic transaction.', tags: ['sui'], links: [{ to: 'Sui', rel: 'relates' }, { to: 'Move language', rel: 'uses' }] },
  { title: 'Mysticeti consensus', type: 'concept', body: 'Suis DAG-based BFT consensus with sub-second finality.', tags: ['sui'], links: [{ to: 'Sui', rel: 'relates' }, { to: 'Owned vs shared objects', rel: 'relates' }] },
  { title: 'Gas and MIST', type: 'concept', body: '1 SUI = 1e9 MIST; storage fees are partly rebated when objects are deleted.', tags: ['sui'], links: [{ to: 'Sui', rel: 'relates' }, { to: 'Programmable Transaction Blocks', rel: 'relates' }] },
  { title: 'Capabilities pattern', type: 'concept', body: 'Authority is a transferable object (a Cap); holding it grants gated actions.', tags: ['sui', 'coding'], links: [{ to: 'Sui objects', rel: 'relates' }, { to: 'Move language', rel: 'relates' }] },
  { title: 'Package upgrades', type: 'concept', body: 'Published Move packages are immutable; new versions are authorized by an UpgradeCap.', tags: ['sui', 'coding'], links: [{ to: 'Move language', rel: 'relates' }, { to: 'Capabilities pattern', rel: 'relates' }] },
  { title: 'Dynamic fields', type: 'concept', body: 'Attach arbitrary keyed values to an object beyond its struct layout; enables big collections.', tags: ['sui', 'coding'], links: [{ to: 'Sui objects', rel: 'relates' }, { to: 'Move language', rel: 'relates' }] },
];

const transport = new StdioClientTransport({
  command: process.execPath, args: [join(here, 'dist', 'index.js')], cwd: repoRoot,
  env: { ...process.env, MYCELIA_KEY: key }, stderr: 'inherit',
});
const client = new Client({ name: 'mycelia-add-sui', version: '0.0.0' });
await client.connect(transport);
const CALL = { timeout: 300000, resetTimeoutOnProgress: true };
const text = (r) => (r?.content ?? []).map((c) => c.text).join('\n');

let i = 0, ok = 0;
for (const n of CLUSTER) {
  i++;
  const args = { title: n.title, body: n.body, type: n.type, tags: n.tags };
  if (n.links) args.links = n.links;
  try {
    const r = await client.callTool({ name: 'mycelia_remember', arguments: args }, undefined, CALL);
    if (r.isError) console.log(`[${i}/10] ERROR ${n.title}: ${text(r)}`);
    else { ok++; const o = JSON.parse(text(r)); console.log(`[${i}/10] ok ${n.title} (links ${o.links}, head v${o.manifestVersion})`); }
  } catch (e) { console.log(`[${i}/10] THREW ${n.title}: ${e.message}`); }
}
const rec = await client.callTool({ name: 'mycelia_recall', arguments: { query: 'Sui', depth: 2 } }, undefined, CALL);
const o = JSON.parse(text(rec));
console.log(`\nWROTE ${ok}/10. recall "Sui" depth=2 -> ${o.nodes?.length} nodes, ${o.edges?.length} edges (connected cluster).`);
await client.close();
console.log('DONE');
