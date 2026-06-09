#!/usr/bin/env node
// Mycelia MCP server entry. stdout is the MCP JSON-RPC channel — log only to stderr.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
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
const mcp = buildMcpServer(rt);
const transport = new StdioServerTransport();
let closing = false;
const shutdown = async (sig: string) => {
  if (closing) return; closing = true;
  console.error(`[mycelia-mcp] ${sig} — shutting down`);
  daemon.stop();
  try { await mcp.close(); } catch { /* ignore */ }
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
await mcp.connect(transport);
console.error('[mycelia-mcp] ready — stdio transport; tools: remember, recall, create_session, share, join, sync, reveal, expand, add_member, remove_member, unshare, renew');
