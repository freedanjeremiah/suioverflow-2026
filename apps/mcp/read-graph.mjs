// Read-only: load the account's personal graph from Walrus exactly as the WEB
// app does on login (findPersonalSession -> SessionKey.create -> loadFullGraph).
// Proves the web sees whatever the MCP remembered, under the same account.
import 'dotenv/config';
import {
  loadPublicConfig, loadServerSecrets, validatePublicConfig, makeSuiClient,
  keypairFromSecret, addressOf, Crypto, Storage, SessionClient, Mycelia, SessionKey,
} from '@mycelia/core';

const pub = loadPublicConfig(process.env);
const sec = loadServerSecrets(process.env);
validatePublicConfig(pub);
const net = pub.suiNetwork === 'mainnet' ? 'mainnet' : 'testnet';
const kp = keypairFromSecret((process.env.MYCELIA_KEY || process.env.MASTER_SUI_PRIVKEY).trim());
const address = addressOf(kp);

const client = makeSuiClient({ network: pub.suiNetwork, tatumJsonRpcUrl: pub.tatumSuiJsonRpc, tatumApiKey: sec.tatumApiKey, fullnodeUrl: pub.suiFullnodeUrl });
const crypto = new Crypto({ suiClient: client, keyServerIds: pub.sealKeyServerIds, threshold: pub.sealThreshold, packageId: pub.myceliaPackageId });
const storage = new Storage({ network: net, suiClient: client, aggregatorUrl: pub.walrusAggregator });
const sessions = new SessionClient(client, pub.myceliaPackageId);
const service = new Mycelia(sessions, crypto, storage, { storageEpochs: pub.storageEpochs });

console.log('WEB read path for account', address);
const personal = await service.findPersonalSession(address);
if (!personal) { console.log('no personal session yet'); process.exit(0); }
console.log('personal session:', personal.sessionId);
const sk = await SessionKey.create({ address, packageId: pub.myceliaPackageId, ttlMin: 30, signer: kp, suiClient: client });
const state = await service.state(personal.sessionId);
const { nodes, edges } = await service.loadFullGraph(state, sk);
console.log(`\nGRAPH: ${nodes.length} nodes, ${edges.length} edges`);
for (const n of nodes) console.log(`  [${n.type}] ${n.title} (v${n.version}) — ${n.body.slice(0, 48)}`);
for (const e of edges) console.log(`  edge ${e.from.slice(0, 8)} -${e.rel}-> ${e.to.slice(0, 8)}`);
