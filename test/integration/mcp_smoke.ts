// Fast MCP boot smoke: server starts, tools list, local remember/recall work,
// identity resource resolves. No on-chain ops. Run: tsx test/integration/mcp_smoke.ts
import 'dotenv/config';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const REPO = process.cwd();
const env: Record<string, string> = {};
for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
env.MYCELIA_DB = `/tmp/mcp-smoke-${Date.now()}.sqlite`;
env.MYCELIA_HOME = env.MYCELIA_DB + '.home';

const c = new Client({ name: 'smoke', version: '0.1.0' });
await c.connect(new StdioClientTransport({ command: REPO + '/node_modules/.bin/tsx', args: ['apps/mcp/src/index.ts'], env, cwd: REPO }));

const tools = (await c.listTools()).tools.map((t) => t.name);
console.log('TOOLS:', tools.join(', '));
const need = ['mycelia_remember', 'mycelia_recall', 'mycelia_create_session', 'mycelia_share', 'mycelia_join', 'mycelia_sync', 'mycelia_reveal', 'mycelia_add_member', 'mycelia_remove_member', 'mycelia_unshare', 'mycelia_renew'];
const missing = need.filter((n) => !tools.includes(n));

const parse = (r: any) => JSON.parse(r.content[0].text);
await c.callTool({ name: 'mycelia_remember', arguments: { title: 'Smoke Node', body: 'hello', type: 'concept', tags: ['x'] } });
await c.callTool({ name: 'mycelia_remember', arguments: { title: 'Linked', body: 'world', type: 'skill', links: [{ to: 'Smoke Node', rel: 'relates' }] } });
const recall = parse(await c.callTool({ name: 'mycelia_recall', arguments: { query: 'smoke', depth: 1 } }));
const ident = JSON.parse((await c.readResource({ uri: 'mycelia://identity' })).contents[0].text);
await c.close();

console.log('recall nodes:', recall.nodes.length, '| identity:', ident.address?.slice(0, 10), 'net', ident.network);
const ok = missing.length === 0 && recall.nodes.length >= 2 && !!ident.address;
console.log(ok ? '\n✅ MCP SMOKE PASS' : `\n❌ FAIL missing=${missing.join(',')}`);
process.exit(ok ? 0 : 1);
