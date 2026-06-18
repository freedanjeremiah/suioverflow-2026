// Focused live repro of "P1 cross-party decrypt of collab node -> Decryption failed".
// master(builder) shares node A; collab contributes node B; master reveals B.
// Dumps each ciphertext's parsed EncryptedObject (threshold/services/demType/id)
// + raw read length, then attempts decrypt — to separate config-asymmetry from a
// corrupt/wrong read.
import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  loadPublicConfig, loadServerSecrets, makeSuiClient,
  Crypto, Storage, SessionClient, Mycelia,
  keypairFromSecret, generateKeypair, addressOf, exportSecret, fundAddress,
  sealIdBytes, SessionKey, EncryptedObject,
} from '../../packages/core/src/index.js';
import type { Node } from '../../packages/core/src/types.js';

const pub = loadPublicConfig(process.env as Record<string, string>);
const sec = loadServerSecrets(process.env as Record<string, string>);
const client = makeSuiClient({ network: 'testnet', fullnodeUrl: pub.suiFullnodeUrl });
const crypto = new Crypto({ suiClient: client, keyServerIds: pub.sealKeyServerIds, threshold: pub.sealThreshold, packageId: pub.myceliaPackageId });
const storage = new Storage({ network: 'testnet', suiClient: client, aggregatorUrl: pub.walrusAggregator });
const sessions = new SessionClient(client, pub.myceliaPackageId);
const svc = new Mycelia(sessions, crypto, storage, { storageEpochs: pub.storageEpochs });

const master = keypairFromSecret(sec.masterSuiPrivkey);
const masterAddr = addressOf(master);

const COLLAB_FILE = '/tmp/persona-collab.json';
let collab: ReturnType<typeof generateKeypair>;
if (existsSync(COLLAB_FILE)) collab = keypairFromSecret(JSON.parse(readFileSync(COLLAB_FILE, 'utf8')).privkey);
else { collab = generateKeypair(); writeFileSync(COLLAB_FILE, JSON.stringify({ privkey: exportSecret(collab) })); }
const collabAddr = addressOf(collab);

function node(id: string, owner: string, title: string): Node {
  return { id, owner, type: 'concept', title, body: `body of ${title}`, importance: 0.7, tags: [], createdAt: Date.now(), updatedAt: Date.now(), version: 1 };
}
async function sk(addr: string, signer: any): Promise<SessionKey> {
  return SessionKey.create({ address: addr, packageId: pub.myceliaPackageId, ttlMin: 10, signer, suiClient: client as never });
}
function dump(tag: string, ct: Uint8Array) {
  const eo = EncryptedObject.parse(ct) as any;
  console.log(`${tag}: len=${ct.length} threshold=${eo.threshold} demType=${eo.encryptedShares?.$kind ?? eo.demType ?? '?'} id=${eo.id?.slice?.(0, 24) ?? eo.id} pkg=${(eo.packageId ?? '').slice?.(0, 12)} services=[${(eo.services ?? []).map((s: any) => (s?.[0] ?? s?.objectId ?? s)?.toString?.().slice?.(0, 10)).join(',')}]`);
  return eo;
}

async function main() {
  console.log('master', masterAddr, '| collab', collabAddr);
  await fundAddress(client, master, masterAddr, collabAddr, { suiMist: 90_000_000n, walAmount: 45_000_000n, minSui: 40_000_000n, minWal: 20_000_000n });

  const epoch = (await storage.currentEpoch().catch(() => 0)) + pub.storageEpochs;
  const { sessionId, capId } = await svc.createSession('crossreveal', master, masterAddr, epoch);
  await svc.addMember(capId, sessionId, collabAddr, master);
  console.log('session', sessionId);

  // master shares A (depth 0, single node)
  const A = node('node-A', masterAddr, 'Alpha');
  const ra = await svc.shareSlice({ sessionId, rootId: A.id, depth: 0, nodes: [A], edges: [], signer: master, owner: masterAddr });
  const patchA = ra.manifest.nodes.find((n) => n.nodeId === A.id)!.latestBlobId;
  console.log('shared A, manifest v' + ra.manifest.version, 'patchA', patchA);

  // collab contributes B (depth 0), merging into master's manifest
  const B = node('node-B', collabAddr, 'Beta');
  const rb = await svc.shareSlice({ sessionId, rootId: B.id, depth: 0, nodes: [B], edges: [], signer: collab, owner: collabAddr, base: ra.manifest, events: [] });
  const patchB = rb.manifest.nodes.find((n) => n.nodeId === B.id)!.latestBlobId;
  console.log('collab contributed B, manifest v' + rb.manifest.version, 'patchB', patchB);

  // --- read raw ciphertexts + parse EncryptedObject for both ---
  const ctA = await storage.read(patchA);
  const ctB = await storage.read(patchB);
  console.log('\n--- EncryptedObject comparison ---');
  dump('A (master-encrypted, works)', ctA);
  dump('B (collab-encrypted, fails) ', ctB);
  console.log('config: keyServers=[' + pub.sealKeyServerIds.map((s) => s.slice(0, 10)).join(',') + '] threshold=' + pub.sealThreshold);

  // --- decrypt attempts ---
  const mk = await sk(masterAddr, master);
  console.log('\n--- decrypt attempts (master sessionKey) ---');
  for (const [tag, nodeId, ct] of [['A self', A.id, ctA], ['B cross', B.id, ctB]] as const) {
    try {
      const tx = await sessions.buildSealApproveTx(sessionId, sealIdBytes(sessionId, nodeId));
      const plain = await crypto.decrypt(ct, mk, tx);
      console.log(`PASS ${tag}: decrypted ${plain.length} bytes`);
    } catch (e) {
      console.log(`FAIL ${tag}: ${(e as Error).name}: ${(e as Error).message}`);
    }
  }

  // control: collab reveals A (the working direction, other party)
  const ck = await sk(collabAddr, collab);
  try {
    const tx = await sessions.buildSealApproveTx(sessionId, sealIdBytes(sessionId, A.id));
    const plain = await crypto.decrypt(ctA, ck, tx);
    console.log(`PASS A via collab sessionKey: ${plain.length} bytes`);
  } catch (e) { console.log(`FAIL A via collab: ${(e as Error).name}: ${(e as Error).message}`); }
}
main().then(() => process.exit(0)).catch((e) => { console.error('REPRO ERROR', e); process.exit(1); });
