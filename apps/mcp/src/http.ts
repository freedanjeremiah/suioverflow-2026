#!/usr/bin/env node
// Mycelia MCP server — HTTP transport (Streamable HTTP) for hosted deployment.
// Mirrors src/index.ts (stdio) but speaks JSON-RPC over HTTP so any remote MCP
// host can connect at POST $MCP_PATH. One shared runtime + key + daemon for the
// whole process (this is a hosted, single-identity instance — see CLAUDE.md: a
// hosted endpoint trades the local-first key-on-device invariant for reach).
//
// Stateless mode: a fresh McpServer + transport is built per request (sharing the
// single runtime), so there is no per-client session state to leak between callers.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildRuntime } from './runtime.js';
import { ensureFunded } from './keystore.js';
import { Daemon } from './daemon.js';
import { buildMcpServer } from './server.js';

process.on('unhandledRejection', (e) => console.error('[mycelia-mcp] unhandledRejection', (e as Error)?.message ?? e));
process.on('uncaughtException', (e) => console.error('[mycelia-mcp] uncaughtException', (e as Error)?.message ?? e));

const rt = buildRuntime();
console.error(`[mycelia-mcp] identity ${rt.address}${rt.created ? ' (new key generated — fund it to publish)' : ''} | ${rt.pub.suiNetwork} | pkg ${rt.pub.myceliaPackageId.slice(0, 10)}…`);
await ensureFunded(rt.client, rt.address, rt.pub.suiNetwork);
const daemon = new Daemon(rt, rt.pub.pollIntervalMs);
daemon.start();

const PORT = Number(process.env.PORT ?? 8788);
const HOST = process.env.HOST ?? '0.0.0.0';
const MCP_PATH = process.env.MCP_PATH ?? '/mcp';

function setCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', process.env.MCP_CORS_ORIGIN ?? '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, mcp-session-id, mcp-protocol-version, authorization');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > 4_000_000) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(undefined);
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (url.pathname === '/health' || url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, address: rt.address, network: rt.pub.suiNetwork, mcpPath: MCP_PATH }));
    return;
  }
  if (url.pathname !== MCP_PATH) { res.writeHead(404).end('not found'); return; }

  // Stateless: GET/DELETE carry no session in this mode — only POST is meaningful.
  if (req.method !== 'POST') {
    res.writeHead(405, { 'content-type': 'application/json', allow: 'POST, OPTIONS' });
    res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed (stateless: use POST)' }, id: null }));
    return;
  }

  try {
    const body = await readBody(req);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const mcp = buildMcpServer(rt);
    res.on('close', () => { void transport.close(); void mcp.close(); });
    await mcp.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (e) {
    console.error('[mycelia-mcp] request failed', (e as Error)?.message ?? e);
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'internal error' }, id: null }));
    }
  }
});

const shutdown = (sig: string) => {
  console.error(`[mycelia-mcp] ${sig} — shutting down`);
  daemon.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

server.listen(PORT, HOST, () => {
  console.error(`[mycelia-mcp] HTTP ready — http://${HOST}:${PORT}${MCP_PATH} | tools: remember, recall, create_session, share, join, sync, reveal, expand, add_member, remove_member, unshare, renew`);
});
