// Smoke test: drive the built MCP server over stdio (as a real MCP host would)
// and exercise the unified Walrus memory: remember -> recall. Real on-chain writes.
//   from apps/mcp:  set -a; source ../../.env; set +a; node smoke.mjs
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url)); // apps/mcp
const repoRoot = join(here, '..', '..');
const serverEntry = join(here, 'dist', 'index.js');

const key = process.env.MYCELIA_KEY || process.env.MASTER_SUI_PRIVKEY;
if (!key) { console.error('FATAL: set MYCELIA_KEY or MASTER_SUI_PRIVKEY'); process.exit(1); }

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverEntry],
  cwd: repoRoot,                       // so the child's dotenv finds .env
  env: { ...process.env, MYCELIA_KEY: key },
  stderr: 'inherit',
});

const client = new Client({ name: 'mycelia-smoke', version: '0.0.0' });
await client.connect(transport);

const text = (r) => (r?.content ?? []).map((c) => c.text).join('\n');
// on-chain writes (createSession + Walrus quilt + manifest + setHead) are slow
const CALL = { timeout: 300000, resetTimeoutOnProgress: true };
const call = (name, args) => client.callTool({ name, arguments: args }, undefined, CALL);

const tools = await client.listTools();
console.log('TOOLS:', tools.tools.map((t) => t.name).join(', '));

const ident = await client.readResource({ uri: 'mycelia://identity' });
console.log('IDENTITY:', ident.contents?.[0]?.text);

const mems = [
  { title: 'Rust ownership', body: 'borrow checker enforces memory safety at compile time, no GC', type: 'concept', tags: ['coding', 'rust'] },
  { title: 'Walrus blobs', body: 'erasure-coded decentralized storage on Sui, pay in WAL', type: 'concept', tags: ['coding', 'sui'], links: [{ to: 'Rust ownership', rel: 'relates' }] },
  { title: 'Trip to Kyoto', body: 'temples, the philosopher path, autumn maples', type: 'communication', tags: ['travel', 'japan'] },
];
for (const m of mems) {
  const r = await call('mycelia_remember', m);
  console.log('REMEMBER', JSON.stringify(m.title), '->', text(r), r.isError ? '(ERROR)' : '');
}

const recRust = await call('mycelia_recall', { query: 'rust storage', depth: 1 });
console.log('\nRECALL "rust storage" depth=1:\n', text(recRust));

const recTravel = await call('mycelia_recall', { query: 'travel', depth: 0 });
console.log('\nRECALL "travel" depth=0:\n', text(recTravel));

await client.close();
console.log('\nDONE');
