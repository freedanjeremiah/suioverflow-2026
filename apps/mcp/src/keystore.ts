// Local Sui identity for the MCP server. MYCELIA_SPEC §5/§19 (local-first).
// Import via MYCELIA_KEY (bech32 suiprivkey...), else load/generate ~/.mycelia/keystore.json.
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { keypairFromSecret, generateKeypair, addressOf, exportSecret } from '@mycelia/core';
import { faucet, type SuiClient } from '@mycelia/core';

type KP = ReturnType<typeof generateKeypair>;
const DIR = process.env.MYCELIA_HOME ?? join(homedir(), '.mycelia');
const KEYFILE = join(DIR, 'keystore.json');

export function loadKeypair(): { keypair: KP; address: string; created: boolean } {
  const fromEnv = process.env.MYCELIA_KEY;
  if (fromEnv) {
    const kp = keypairFromSecret(fromEnv.trim());
    return { keypair: kp, address: addressOf(kp), created: false };
  }
  if (existsSync(KEYFILE)) {
    const { privkey } = JSON.parse(readFileSync(KEYFILE, 'utf8'));
    const kp = keypairFromSecret(privkey);
    return { keypair: kp, address: addressOf(kp), created: false };
  }
  const kp = generateKeypair();
  mkdirSync(DIR, { recursive: true });
  writeFileSync(KEYFILE, JSON.stringify({ privkey: exportSecret(kp) }, null, 2));
  try { chmodSync(KEYFILE, 0o600); } catch { /* best-effort */ }
  return { keypair: kp, address: addressOf(kp), created: true };
}

/** Best-effort testnet SUI top-up when balance is low (faucet is rate-limited). */
export async function ensureFunded(client: SuiClient, address: string, network: string): Promise<void> {
  if (network !== 'testnet') return;
  try {
    const bal = await client.core.getBalance({ owner: address, coinType: '0x2::sui::SUI' });
    if (BigInt(bal.balance?.balance ?? '0') > 50_000_000n) return;
    await faucet('testnet', address);
  } catch { /* funding is best-effort; tools will report insufficient-gas if it fails */ }
}
