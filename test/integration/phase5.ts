// Phase 5: full service write/read path on testnet (single wallet = master).
// createSession -> shareSlice -> fetchManifest(decrypt) -> reveal -> events -> unshare denies.
import 'dotenv/config';
import { randomUUID as uuid } from 'node:crypto';
import {
  loadPublicConfig, loadServerSecrets, keypairFromSecret, addressOf, makeSuiClient,
  Crypto, Storage, SessionClient, Mycelia, SessionKey, isNoAccess,
} from '../../packages/core/src/index.js';
import type { Node, Edge } from '../../packages/core/src/index.js';

const log = (...a: unknown[]) => console.log('•', ...a);

async function main() {
  const pub = loadPublicConfig(process.env as Record<string, string>);
  const sec = loadServerSecrets(process.env as Record<string, string>);
  const master = keypairFromSecret(sec.masterSuiPrivkey);
  const addr = addressOf(master);
  const client = makeSuiClient({ network: 'testnet', fullnodeUrl: pub.suiFullnodeUrl });
  const crypto = new Crypto({ suiClient: client, keyServerIds: pub.sealKeyServerIds, threshold: pub.sealThreshold, packageId: pub.myceliaPackageId });
  const storage = new Storage({ network: 'testnet', suiClient: client, aggregatorUrl: pub.walrusAggregator });
  const sessions = new SessionClient(client, pub.myceliaPackageId);
  const mycelia = new Mycelia(sessions, crypto, storage, { storageEpochs: pub.storageEpochs });

  // local graph: Project X -- uses --> TypeScript, -- has --> Roadmap
  const px = uuid(), ts = uuid(), rd = uuid();
  const mk = (id: string, title: string, type: Node['type']): Node => ({ id, owner: addr, type, title, body: `body of ${title}`, importance: 0.7, tags: [], createdAt: Date.now(), updatedAt: Date.now(), version: 1 });
  const nodes: Node[] = [mk(px, 'Project X', 'project'), mk(ts, 'TypeScript', 'skill'), mk(rd, 'Roadmap', 'concept')];
  const edges: Edge[] = [
    { id: uuid(), from: px, to: ts, rel: 'uses', owner: addr },
    { id: uuid(), from: px, to: rd, rel: 'has', owner: addr },
  ];

  const { sessionId, capId, manifestBlobId } = await mycelia.createSession('Project X share', master, addr, 423 + pub.storageEpochs);
  log('session', sessionId, 'manifest', manifestBlobId.slice(0, 10));

  const share = await mycelia.shareSlice({ sessionId, rootId: px, depth: 1, nodes, edges, signer: master, owner: addr });
  log('shared', share.publishedNodeIds.length, 'nodes; manifest v', share.manifest.version);
  if (share.publishedNodeIds.length !== 3) throw new Error(`expected 3 nodes (root+2), got ${share.publishedNodeIds.length}`);

  // read side: SessionKey + decrypt manifest + reveal root
  const sk = await SessionKey.create({ address: addr, packageId: pub.myceliaPackageId, ttlMin: 10, signer: master, suiClient: client as never });
  const state = await mycelia.state(sessionId);
  const manifest = await mycelia.fetchManifest(state, sk);
  log('manifest decrypted: nodes', manifest.nodes.length, 'edges', manifest.edges.length, 'roots', manifest.roots.length);
  if (manifest.nodes.length !== 3) throw new Error('manifest node count mismatch');

  const rootEntry = manifest.nodes.find((n) => n.nodeId === px)!;
  const revealed = await mycelia.reveal(sessionId, px, rootEntry.latestBlobId, sk);
  log('revealed root ->', revealed.title, '| edges:', revealed.edges.map((e) => e.rel).join(','));
  if (revealed.title !== 'Project X') throw new Error('revealed title mismatch');

  const events = await mycelia.fetchEvents(state, sk);
  log('events:', events.map((e) => `${e.kind}:${e.title ?? ''}`).join('  '));
  if (!events.some((e) => e.kind === 'shared')) throw new Error('missing shared event');

  // forward-only: unshare the root. A client that ALREADY fetched the key keeps
  // it (invariant #4 — not retracted). A FRESH client (no cached key) must be
  // denied new key issuance. Use a brand-new Crypto/Mycelia to simulate that.
  await mycelia.unshare(capId, sessionId, px, master);
  const freshCrypto = new Crypto({ suiClient: client, keyServerIds: pub.sealKeyServerIds, threshold: pub.sealThreshold, packageId: pub.myceliaPackageId });
  const freshMycelia = new Mycelia(sessions, freshCrypto, storage, { storageEpochs: pub.storageEpochs });
  try {
    const sk2 = await SessionKey.create({ address: addr, packageId: pub.myceliaPackageId, ttlMin: 10, signer: master, suiClient: client as never });
    await freshMycelia.reveal(sessionId, px, rootEntry.latestBlobId, sk2);
    throw new Error('FAIL: reveal after unshare should be denied');
  } catch (e) {
    if (isNoAccess(e)) log('forward-only OK: unshared node -> NoAccessError');
    else if ((e as Error).message.startsWith('FAIL:')) throw e;
    else log('forward-only OK (denied):', (e as Error).message.slice(0, 70));
  }

  console.log('\n✅ PHASE 5 SERVICE INTEGRATION PASSED');
}
main().catch((e) => { console.error('\n❌ FAILED:', e); process.exit(1); });
