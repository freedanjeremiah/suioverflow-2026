// Recover testnet funds: re-derive the dev-login bridged wallets (seed =
// HMAC(signingSecret,"mycelia:"+userId), same as the server) and sweep their
// SUI + WAL back to master. No faucet needed.
import 'dotenv/config';
import { createHmac } from 'node:crypto';
import {
  loadPublicConfig, loadServerSecrets, keypairFromSecret, addressOf, makeSuiClient, sweepTo,
} from '../packages/core/src/index.js';

const IDS = ['did:privy:testuser-philo', 'did:privy:builder-e2e', 'did:privy:builder-mp', 'did:privy:collab-mp',
  'did:privy:liveB', 'did:privy:demo', 'did:privy:wiring', 'did:privy:builder', 'did:privy:realtime'];

function seedKeypair(secret: string, userId: string) {
  const hex = createHmac('sha256', secret).update(`mycelia:${userId}`).digest('hex');
  const b = new Uint8Array(32);
  for (let i = 0; i < 32; i++) b[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return keypairFromSecret(b);
}

async function main() {
  const pub = loadPublicConfig(process.env as Record<string, string>);
  const sec = loadServerSecrets(process.env as Record<string, string>);
  const signingSecret = process.env.APP_SIGNING_SECRET || sec.privyAppSecret || 'mycelia-testnet-signing-secret';
  const master = addressOf(keypairFromSecret(sec.masterSuiPrivkey));
  const client = makeSuiClient({ network: 'testnet', tatumJsonRpcUrl: pub.tatumSuiJsonRpc, tatumApiKey: sec.tatumApiKey, fullnodeUrl: pub.suiFullnodeUrl });
  console.log('master', master);
  let totSui = 0n, totWal = 0n;
  for (const id of IDS) {
    const kp = seedKeypair(signingSecret, id);
    const addr = addressOf(kp);
    try {
      const r = await sweepTo(client, kp, addr, master);
      if (r.sentSui > 0n || r.sentWal > 0n) { totSui += r.sentSui; totWal += r.sentWal; console.log(`SWEPT ${id} ${addr}: +${Number(r.sentSui) / 1e9} SUI +${Number(r.sentWal) / 1e9} WAL`); }
      else console.log(`empty ${id} ${addr}`);
    } catch (e) { console.log(`err ${id} ${addr}: ${(e as Error).message.slice(0, 90)}`); }
  }
  console.log(`\nrecovered ~${Number(totSui) / 1e9} SUI + ${Number(totWal) / 1e9} WAL to master`);
}
main().catch((e) => { console.error(e); process.exit(1); });
