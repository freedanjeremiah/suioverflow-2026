// Replicate the WEB browser's exact read path for philo: Sui RPC through the
// apps/server /api/sui-rpc PROXY (no Tatum key), Seal decrypt, Walrus aggregator.
// If this returns philo's nodes, the browser data path works (issue = stale tab/
// refresh). If it returns 0, the in-browser decrypt/proxy path is the real bug.
import {
  makeSuiClient, keypairFromSecret, addressOf, Crypto, Storage, SessionClient, Mycelia, SessionKey,
} from '@mycelia/core';

const PROXY = process.env.RPC_PROXY || 'http://localhost:8787/api/sui-rpc';
// fetch the same public config the web uses
const cfg = await fetch('http://localhost:8787/api/config').then((r) => r.json());
const kp = keypairFromSecret(process.env.MYCELIA_KEY.trim());
const address = addressOf(kp);

const net = cfg.network === 'mainnet' ? 'mainnet' : 'testnet';
const client = makeSuiClient({ network: cfg.network, proxyUrl: PROXY }); // <-- keyless proxy, like the browser
const crypto = new Crypto({ suiClient: client, keyServerIds: cfg.keyServerIds, threshold: cfg.sealThreshold, packageId: cfg.packageId });
const storage = new Storage({ network: net, suiClient: client, aggregatorUrl: cfg.walrusAggregator });
const sessions = new SessionClient(client, cfg.packageId);
const service = new Mycelia(sessions, crypto, storage, { storageEpochs: cfg.storageEpochs });

console.log('browser-path read for', address, 'via', PROXY);
const personal = await service.findPersonalSession(address);
console.log('findPersonalSession ->', personal ? personal.sessionId : 'NULL');
if (!personal) process.exit(0);
const sk = await SessionKey.create({ address, packageId: cfg.packageId, ttlMin: 30, signer: kp, suiClient: client });
const state = await service.state(personal.sessionId);
console.log('head version', state.headVersion, '| manifest nodes (encrypted):', '(loading…)');
const { nodes, edges } = await service.loadFullGraph(state, sk);
console.log(`DECRYPTED ${nodes.length} nodes, ${edges.length} edges`);
for (const n of nodes.slice(0, 30)) console.log('  -', n.title);
