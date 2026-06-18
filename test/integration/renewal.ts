// LIVE test: storage.extend actually extends a Walrus blob's on-chain end_epoch.
// Proves the renewal fix (invariant #3) — previously renew only bumped a marker.
import 'dotenv/config';
import {
  loadPublicConfig, loadServerSecrets, keypairFromSecret, addressOf, makeSuiClient, Storage,
} from '../../packages/core/src/index.js';

async function main() {
  const pub = loadPublicConfig(process.env as Record<string, string>);
  const sec = loadServerSecrets(process.env as Record<string, string>);
  const master = keypairFromSecret(sec.masterSuiPrivkey);
  const addr = addressOf(master);
  const client = makeSuiClient({ network: 'testnet', fullnodeUrl: pub.suiFullnodeUrl });
  const storage = new Storage({ network: 'testnet', suiClient: client, aggregatorUrl: pub.walrusAggregator });

  // publish a tiny blob (non-JSON first byte so the ciphertext guard passes)
  const bytes = new Uint8Array(48);
  bytes[0] = 0x07;
  for (let i = 1; i < bytes.length; i++) bytes[i] = (i * 37) & 0xff;
  console.log('• publishing tiny blob (epochs=3)…');
  const r = await storage.publishBlob(bytes, { signer: master, owner: addr, epochs: 3 });
  console.log('• blobObject', r.blobObjectId, 'endEpoch(before)=', r.endEpoch);

  console.log('• extending +5 epochs…');
  const digest = await storage.extend(r.blobObjectId, 5, master);
  console.log('• extend digest', digest);
  await client.core.waitForTransaction({ digest });
  (client as any).cache?.clear?.();
  // read the Blob object's storage.end_epoch fresh via getObject json
  const res = await client.core.getObject({ objectId: r.blobObjectId, include: { json: true } });
  const after = Number((res.object as any).json?.storage?.fields?.end_epoch ?? (res.object as any).json?.storage?.end_epoch ?? 0);
  console.log('• endEpoch(after)=', after, '| raw storage:', JSON.stringify((res.object as any).json?.storage).slice(0, 160));

  const ok = after > r.endEpoch;
  console.log(ok ? `\n✅ RENEWAL LIVE OK — end_epoch ${r.endEpoch} -> ${after} (blob storage actually extended on-chain)`
                 : `\n❌ FAIL — end_epoch did not grow (${r.endEpoch} -> ${after})`);
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
