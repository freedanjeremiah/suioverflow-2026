// Verify the "Shared with me" feature: load everything shared TO philo, exactly
// as the web store's loadShared() does (service.loadSharedWithMe).
import {
  loadPublicConfig, loadServerSecrets, makeSuiClient, keypairFromSecret, addressOf,
  Crypto, Storage, SessionClient, Mycelia, SessionKey,
} from '@mycelia/core';

const pub = loadPublicConfig(process.env);
const sec = loadServerSecrets(process.env);
const net = pub.suiNetwork === 'mainnet' ? 'mainnet' : 'testnet';
const kp = keypairFromSecret(process.env.MYCELIA_KEY.trim()); // philo
const address = addressOf(kp);
const client = makeSuiClient({ network: pub.suiNetwork, tatumJsonRpcUrl: pub.tatumSuiJsonRpc, tatumApiKey: sec.tatumApiKey, fullnodeUrl: pub.suiFullnodeUrl });
const crypto = new Crypto({ suiClient: client, keyServerIds: pub.sealKeyServerIds, threshold: pub.sealThreshold, packageId: pub.myceliaPackageId });
const storage = new Storage({ network: net, suiClient: client, aggregatorUrl: pub.walrusAggregator });
const service = new Mycelia(new SessionClient(client, pub.myceliaPackageId), crypto, storage, { storageEpochs: pub.storageEpochs });

console.log('Shared-with-me for', address);
const sk = await SessionKey.create({ address, packageId: pub.myceliaPackageId, ttlMin: 30, signer: kp, suiClient: client });
const { nodes, edges, sessions } = await service.loadSharedWithMe(address, sk);
console.log(`\n${sessions.length} session(s) shared with you; ${nodes.length} nodes, ${edges.length} edges:`);
for (const s of sessions) console.log(`  session ${s.id.slice(0, 10)}… from ${s.owner.slice(0, 8)}… (${s.count} nodes)`);
for (const n of nodes) console.log(`   - [${n.type}] ${n.title}  (owner ${n.owner.slice(0, 8)}…)`);
