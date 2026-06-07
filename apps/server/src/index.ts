// Mycelia backend — thin operator: auth bridge + funding, session/blob registry
// for the daemon (poll + renewal), and the notification feed. MYCELIA_SPEC §9/§19.
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { mkdirSync } from 'node:fs';
import { buildRuntime } from './runtime.js';
import { Db } from './db.js';
import { Daemon } from './daemon.js';
import { makePrivy, bridgeFromToken, bridgeFromUserId } from './auth.js';
import { fundAddress, isMethodNotFound } from '@mycelia/core';

// Never let a stray async error (RPC blip, funding shortfall) kill the server/daemon.
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', (e as Error)?.message ?? e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', (e as Error)?.message ?? e));

const rt = buildRuntime();
mkdirSync('data', { recursive: true });
const db = new Db(process.env.DB_PATH ?? 'data/mycelia.sqlite');
const privy = makePrivy(rt.pub.privyAppId, rt.sec.privyAppSecret);
const signingSecret = process.env.APP_SIGNING_SECRET || rt.sec.privyAppSecret || 'mycelia-testnet-signing-secret';
const allowDevLogin = process.env.ALLOW_DEV_LOGIN === 'true' || !privy;

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });
// CORS: explicit allowlist (never reflect arbitrary origins). Configure with
// CORS_ORIGINS=comma,separated. An entry may contain `*` (e.g.
// https://*.vercel.app) — it becomes an anchored regex so preview deploys match.
// No credentials — the client sends no cookies.
const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:4173')
  .split(',').map((s) => s.trim()).filter(Boolean)
  .map((o) => (o.includes('*')
    ? new RegExp('^' + o.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$')
    : o));
await app.register(cors, { origin: corsOrigins, credentials: false });

app.get('/api/health', async () => ({ ok: true, master: rt.masterAddress, privy: Boolean(privy), devLogin: allowDevLogin }));

// Public config for the browser (no secrets).
app.get('/api/config', async () => ({
  network: rt.pub.suiNetwork,
  fullnodeUrl: rt.pub.suiFullnodeUrl,
  walrusAggregator: rt.pub.walrusAggregator,
  walrusPublisher: rt.pub.walrusPublisher,
  packageId: rt.pub.myceliaPackageId,
  keyServerIds: rt.pub.sealKeyServerIds,
  sealThreshold: rt.pub.sealThreshold,
  storageEpochs: rt.pub.storageEpochs,
  privyAppId: rt.pub.privyAppId,
  pollIntervalMs: rt.pub.pollIntervalMs,
}));

// Sui JSON-RPC proxy. The browser routes ALL Sui RPC through here so it uses the
// Tatum gateway WITHOUT the x-api-key ever entering the browser bundle (the key
// is a server secret). Tatum is primary; the public fullnode is only a -32601
// capability shim (Tatum lacks e.g. suix_getLatestSuiSystemState, needed for the
// SDK's gas-price resolution on writes). Fail loud at boot if Tatum isn't set.
if (!rt.sec.tatumApiKey || !rt.pub.tatumSuiJsonRpc) {
  throw new Error('Tatum gateway not configured — set TATUM_API_KEY + TATUM_SUI_JSONRPC');
}
const rpcUpstream = rt.pub.tatumSuiJsonRpc;
const rpcFullnode = rt.pub.suiFullnodeUrl; // shim target for methods Tatum can't answer
const rpcHeaders: Record<string, string> = { 'content-type': 'application/json', 'x-api-key': rt.sec.tatumApiKey };
app.log.info(`Sui RPC proxy -> Tatum gateway (${rpcUpstream}); -32601 shim -> ${rpcFullnode}`);

app.post('/api/sui-rpc', async (req, reply) => {
  const body = JSON.stringify(req.body ?? {});
  let delay = 250; // exponential backoff on 429/5xx — Tatum free tier rate-limits bursts
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(rpcUpstream, { method: 'POST', headers: rpcHeaders, body });
    if (res.status !== 429 && res.status < 500) {
      const text = await res.text();
      // Capability shim: Tatum answered but the method is unimplemented -> fullnode.
      if (res.ok && isMethodNotFound(text)) {
        const fb = await fetch(rpcFullnode, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
        return reply.code(fb.status).type('application/json').send(await fb.text());
      }
      return reply.code(res.status).type(res.headers.get('content-type') ?? 'application/json').send(text);
    }
    if (attempt >= 5) return reply.code(res.status).type('application/json').send(await res.text());
    await new Promise((r) => setTimeout(r, delay + Math.floor(delay * 0.3)));
    delay = Math.min(delay * 2, 4000);
  }
});

// Login: verify Privy token -> bridge to Sui keypair -> ensure funded.
app.post<{ Body: { token?: string; privyUserId?: string } }>('/api/login', async (req, reply) => {
  const { token, privyUserId } = req.body ?? {};
  let identity;
  try {
    if (token && privy) identity = await bridgeFromToken(privy, signingSecret, token);
    else if (privyUserId && allowDevLogin) identity = bridgeFromUserId(signingSecret, privyUserId);
    else return reply.code(401).send({ error: privy ? 'token required' : 'Privy not configured (set PRIVY_APP_SECRET) and dev login disabled' });
  } catch (e) {
    return reply.code(401).send({ error: 'invalid Privy token: ' + (e as Error).message });
  }
  db.upsertUser(identity.privyUserId, identity.address);
  // fund the user's wallet from master so they pay for + own their memories
  let funded = { fundedSui: 0n, fundedWal: 0n, digest: '' };
  try {
    funded = await fundAddress(rt.client, rt.master, rt.masterAddress, identity.address, {
      suiMist: 80_000_000n, walAmount: 40_000_000n, minSui: 30_000_000n, minWal: 8_000_000n,
    });
  } catch (e) {
    req.log.warn({ err: (e as Error).message }, 'funding failed (continuing)');
  }
  return {
    address: identity.address,
    seedHex: identity.seedHex,
    privyUserId: identity.privyUserId,
    funded: { sui: funded.fundedSui.toString(), wal: funded.fundedWal.toString(), digest: funded.digest },
  };
});

// Register a session for the daemon to watch + poll.
app.post<{ Params: { id: string }; Body: { owner?: string; name?: string; endEpoch?: number } }>(
  '/api/sessions/:id/watch',
  async (req) => {
    const { owner = '', name = '', endEpoch = 0 } = req.body ?? {};
    db.watchSession(req.params.id, owner, name, endEpoch);
    return { ok: true };
  },
);

// Register published blobs for renewal tracking.
app.post<{ Params: { id: string }; Body: { blobs: { blobObjectId: string; endEpoch: number; kind: string }[] } }>(
  '/api/sessions/:id/blobs',
  async (req) => {
    for (const b of req.body?.blobs ?? []) db.recordBlob(b.blobObjectId, req.params.id, b.endEpoch, b.kind);
    return { ok: true };
  },
);

// Daemon-detected notifications (client polls this for the live "check again" feed).
app.get<{ Params: { id: string }; Querystring: { since?: string } }>(
  '/api/sessions/:id/notifications',
  async (req) => {
    const since = Number(req.query.since ?? 0);
    return { notifications: db.listNotifications(req.params.id, since) };
  },
);

const port = Number(process.env.PORT ?? 8787);
await app.listen({ port, host: '0.0.0.0' });
const daemon = new Daemon(rt, db, rt.pub.pollIntervalMs);
daemon.start();
app.log.info(`Mycelia server on :${port} | master ${rt.masterAddress} | daemon every ${rt.pub.pollIntervalMs}ms`);
