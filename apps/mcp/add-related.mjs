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
  { title: 'Mycelia', type: 'project', body: 'Shared, encrypted agent memory on Sui + Walrus + Seal.', tags: ['project'] },
  { title: 'Sui Move', type: 'skill', body: 'The smart-contract language for Mycelia’s session + marketplace.', tags: ['coding'], links: [{ to: 'Mycelia', rel: 'uses' }] },
  { title: 'Walrus storage', type: 'concept', body: 'Decentralized blob store where Mycelia keeps encrypted nodes.', tags: ['infra'], links: [{ to: 'Mycelia', rel: 'relates' }] },
  { title: 'Seal encryption', type: 'concept', body: 'Threshold IBE that gates who can decrypt a session’s nodes.', tags: ['infra'], links: [{ to: 'Mycelia', rel: 'relates' }, { to: 'Walrus storage', rel: 'relates' }] },
  { title: 'Next.js frontend', type: 'skill', body: 'The Mycelia web app — graph explorer, market, sharing.', tags: ['coding'], links: [{ to: 'Mycelia', rel: 'uses' }] },
  { title: 'Privy auth', type: 'concept', body: 'Email login bridged to a deterministic Sui keypair.', tags: ['auth'], links: [{ to: 'Next.js frontend', rel: 'relates' }, { to: 'Mycelia', rel: 'relates' }] },
  { title: 'MCP server', type: 'project', body: 'Agent memory tools (remember/recall/share) over the same store.', tags: ['agent'], links: [{ to: 'Mycelia', rel: 'relates' }, { to: 'Sui Move', rel: 'uses' }] },
  { title: 'Personal session', type: 'concept', body: 'One per-account Walrus session that holds your whole graph.', tags: ['design'], links: [{ to: 'Walrus storage', rel: 'relates' }, { to: 'Seal encryption', rel: 'relates' }, { to: 'Mycelia', rel: 'partOf' }] },
  { title: 'Zustand store', type: 'skill', body: 'Client state for the web graph + share flow.', tags: ['coding'], links: [{ to: 'Next.js frontend', rel: 'relates' }] },
  { title: 'Knowledge marketplace', type: 'concept', body: 'List a graph slice for sale; buyers pay SUI to unlock decrypt.', tags: ['product'], links: [{ to: 'Mycelia', rel: 'relates' }, { to: 'Seal encryption', rel: 'relates' }] },
];

const transport = new StdioClientTransport({
  command: process.execPath, args: [join(here, 'dist', 'index.js')], cwd: repoRoot,
  env: { ...process.env, MYCELIA_KEY: key }, stderr: 'inherit',
});
const client = new Client({ name: 'mycelia-add-related', version: '0.0.0' });
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
const rec = await client.callTool({ name: 'mycelia_recall', arguments: { query: 'Mycelia', depth: 2 } }, undefined, CALL);
const o = JSON.parse(text(rec));
console.log(`\nWROTE ${ok}/10. recall "Mycelia" depth=2 -> ${o.nodes?.length} nodes, ${o.edges?.length} edges (connected cluster).`);
await client.close();
console.log('DONE');
