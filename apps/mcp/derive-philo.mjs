// Derive the Sui key for a Privy email user EXACTLY as the server does
// (seed = HMAC-SHA256(signingSecret, "mycelia:"+privyUserId)) and write it to
// .env as MYCELIA_KEY so the MCP runs as that same account. Never prints the key.
import { createHmac } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { keypairFromSecret, addressOf } from '@mycelia/core';

const EMAIL = process.argv[2] || 'philo@tenorilabs.ai';
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const envPath = join(repoRoot, '.env');

const appId = process.env.PRIVY_APP_ID;
const appSecret = process.env.PRIVY_APP_SECRET;
if (!appId || !appSecret) { console.error('FATAL: PRIVY_APP_ID / PRIVY_APP_SECRET not in env'); process.exit(1); }
const signingSecret = process.env.APP_SIGNING_SECRET || appSecret || 'mycelia-testnet-signing-secret';

// 1) look up the Privy user id by email (server-auth Basic auth + privy-app-id)
const auth = 'Basic ' + Buffer.from(`${appId}:${appSecret}`).toString('base64');
const res = await fetch('https://auth.privy.io/api/v1/users/email/address', {
  method: 'POST',
  headers: { Authorization: auth, 'privy-app-id': appId, 'Content-Type': 'application/json' },
  body: JSON.stringify({ address: EMAIL }),
});
if (!res.ok) {
  const body = await res.text();
  console.error(`Privy lookup failed (${res.status}) for ${EMAIL}: ${body.slice(0, 200)}`);
  console.error('If 404: that email has never logged in to this Privy app yet — log in once on the web, then re-run.');
  process.exit(1);
}
const user = await res.json();
const privyUserId = user.id;
if (!privyUserId) { console.error('No user.id in Privy response'); process.exit(1); }

// 2) derive the seed + keypair exactly like apps/server/src/auth.ts
const seedHex = createHmac('sha256', signingSecret).update(`mycelia:${privyUserId}`).digest('hex');
const seed = new Uint8Array(32);
for (let i = 0; i < 32; i++) seed[i] = parseInt(seedHex.slice(i * 2, i * 2 + 2), 16);
const kp = keypairFromSecret(seed);
const address = addressOf(kp);
const suiprivkey = kp.getSecretKey(); // bech32 suiprivkey…  (SECRET — do not print)

// 3) write/replace MYCELIA_KEY in .env
let env = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
const line = `MYCELIA_KEY=${suiprivkey}`;
if (/^MYCELIA_KEY=.*$/m.test(env)) env = env.replace(/^MYCELIA_KEY=.*$/m, line);
else env = env.replace(/\n*$/, '\n') + line + '\n';
writeFileSync(envPath, env);

console.log('email      :', EMAIL);
console.log('privyUserId:', privyUserId);
console.log('address    :', address);
console.log('MYCELIA_KEY:', suiprivkey.slice(0, 12) + '…' + suiprivkey.slice(-4), '(written to .env)');
