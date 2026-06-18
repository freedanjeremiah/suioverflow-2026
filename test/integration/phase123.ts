// Phase 1-3 end-to-end against Sui + Walrus + Seal testnet, paid by the master wallet.
// Proves: create session -> share node -> encrypt -> publish -> read -> seal_approve -> decrypt,
// plus fail-closed on a non-shared node. Run: tsx test/integration/phase123.ts
import 'dotenv/config';
import { randomUUID as uuid } from 'node:crypto';
import {
  loadPublicConfig,
  loadServerSecrets,
  keypairFromSecret,
  addressOf,
  makeSuiClient,
  Crypto,
  Storage,
  SessionClient,
  sealIdBytes,
  SessionKey,
  isNoAccess,
} from '../../packages/core/src/index.js';

function log(...a: unknown[]) { console.log('•', ...a); }

async function main() {
  const pub = loadPublicConfig(process.env as Record<string, string>);
  const sec = loadServerSecrets(process.env as Record<string, string>);
  if (!sec.masterSuiPrivkey) throw new Error('MASTER_SUI_PRIVKEY missing');
  if (!pub.myceliaPackageId) throw new Error('MYCELIA_PACKAGE_ID missing');

  const master = keypairFromSecret(sec.masterSuiPrivkey);
  const addr = addressOf(master);
  log('master', addr);

  const client = makeSuiClient({
    network: pub.suiNetwork as 'testnet',
    fullnodeUrl: pub.suiFullnodeUrl,
    tatumJsonRpcUrl: pub.tatumSuiJsonRpc,
    tatumApiKey: sec.tatumApiKey, // route via Tatum gateway
  });
  const sessions = new SessionClient(client, pub.myceliaPackageId);
  const crypto = new Crypto({
    suiClient: client,
    keyServerIds: pub.sealKeyServerIds,
    threshold: pub.sealThreshold,
    packageId: pub.myceliaPackageId,
    verifyKeyServers: true,
  });
  const storage = new Storage({ network: 'testnet', suiClient: client, aggregatorUrl: pub.walrusAggregator });

  // 1. create session
  const { sessionId, capId } = await sessions.createSession('Phase123 test', 419 + pub.storageEpochs, master);
  log('session', sessionId, 'cap', capId);

  // 2. a node + its seal id, share it
  const nodeId = uuid();
  const sealId = sealIdBytes(sessionId, nodeId);
  await sessions.shareNode(sessionId, sealId, master);
  log('shared node', nodeId);

  // 3. encrypt a NodeVersion payload
  const payload = new TextEncoder().encode(JSON.stringify({ nodeId, title: 'Project X', body: 'secret memory ' + Date.now() }));
  const ciphertext = await crypto.encrypt(sessionId, nodeId, payload);
  log('encrypted', ciphertext.length, 'bytes');

  // 4. publish ciphertext (master pays + owns)
  const { blobId, blobObjectId, endEpoch } = await storage.publishBlob(ciphertext, {
    signer: master, owner: addr, epochs: pub.storageEpochs,
  });
  log('published blob', blobId, 'obj', blobObjectId, 'endEpoch', endEpoch);

  // 5. read ciphertext back
  const back = await storage.read(blobId);
  if (Buffer.compare(Buffer.from(back), Buffer.from(ciphertext)) !== 0) throw new Error('ciphertext mismatch on read');
  log('read back ciphertext OK', back.length, 'bytes');

  // 6. SessionKey + seal_approve -> decrypt
  const sk = await SessionKey.create({ address: addr, packageId: pub.myceliaPackageId, ttlMin: 10, signer: master, suiClient: client as never });
  const txBytes = await sessions.buildSealApproveTx(sessionId, sealId);
  const plain = await crypto.decrypt(back, sk, txBytes);
  const decoded = new TextDecoder().decode(plain);
  if (decoded !== new TextDecoder().decode(payload)) throw new Error('decrypted plaintext mismatch');
  log('DECRYPT OK ->', decoded.slice(0, 60));

  // 7. fail-closed: a node that was NEVER shared must be denied
  const otherNode = uuid();
  const otherSealId = sealIdBytes(sessionId, otherNode);
  const ct2 = await crypto.encrypt(sessionId, otherNode, new TextEncoder().encode('should be denied'));
  try {
    const txBytes2 = await sessions.buildSealApproveTx(sessionId, otherSealId);
    await crypto.decrypt(ct2, sk, txBytes2);
    throw new Error('FAIL: decrypt of non-shared node should have been denied');
  } catch (e) {
    if (isNoAccess(e)) log('fail-closed OK: non-shared node -> NoAccessError');
    else if ((e as Error).message.startsWith('FAIL:')) throw e;
    else log('fail-closed OK (denied):', (e as Error).message.slice(0, 80));
  }

  // 8. read session state mirror
  const state = await sessions.getSessionState(sessionId);
  log('state: members', state.members.length, 'shared', state.sharedNodes.length, 'headVer', state.headVersion);

  console.log('\n✅ PHASE 1-3 INTEGRATION PASSED');
}

main().catch((e) => { console.error('\n❌ FAILED:', e); process.exit(1); });
