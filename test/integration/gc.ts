import 'dotenv/config';
import { loadPublicConfig, loadServerSecrets, keypairFromSecret, addressOf, makeSuiClient, Storage } from '../../packages/core/src/index.js';
(async () => {
  const pub = loadPublicConfig(process.env as any); const sec = loadServerSecrets(process.env as any);
  const kp = keypairFromSecret(sec.masterSuiPrivkey); const addr = addressOf(kp);
  const client = makeSuiClient({ network: 'testnet', fullnodeUrl: pub.suiFullnodeUrl });
  const storage = new Storage({ network: 'testnet', suiClient: client, aggregatorUrl: pub.walrusAggregator });
  const bytes = new Uint8Array(32); bytes[0] = 0x09; for (let i = 1; i < 32; i++) bytes[i] = (i * 13) & 0xff;
  const r = await storage.publishBlob(bytes, { signer: kp, owner: addr, epochs: 2, deletable: true });
  console.log('• published', r.blobObjectId);
  const d = await storage.deleteBlob(r.blobObjectId, kp);
  console.log('• delete digest', d);
  await client.core.waitForTransaction({ digest: d }); (client as any).cache?.clear?.();
  let gone = false;
  try { const o = await client.core.getObject({ objectId: r.blobObjectId, include: { json: true } }); gone = !(o as any).object; }
  catch { gone = true; }
  console.log(gone ? '\n✅ GC LIVE OK — blob object deleted on-chain' : '\n❌ FAIL — blob still exists');
  process.exit(gone ? 0 : 1);
})().catch((e) => { console.error('FAILED:', String(e).slice(0,200)); process.exit(1); });
