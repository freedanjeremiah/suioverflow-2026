// Phase-0 bootstrap: provision the master operator wallet. Generates (or reuses)
// a Sui keypair, best-effort faucet, and writes MASTER_SUI_* into .env.
// WAL must be acquired separately on testnet:  walrus --context testnet get-wal
import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { generateKeypair, keypairFromSecret, addressOf, exportSecret, makeSuiClient, faucet, balanceOf } from '../packages/core/src/index.js';

const ENV = join(process.cwd(), '.env');

function setEnv(key: string, val: string) {
  let env = existsSync(ENV) ? readFileSync(ENV, 'utf8') : '';
  const line = `${key}=${val}`;
  env = new RegExp(`^${key}=.*$`, 'm').test(env) ? env.replace(new RegExp(`^${key}=.*$`, 'm'), line) : env + (env.endsWith('\n') || env === '' ? '' : '\n') + line + '\n';
  writeFileSync(ENV, env);
}

async function main() {
  const existing = process.env.MASTER_SUI_PRIVKEY;
  const kp = existing ? keypairFromSecret(existing) : generateKeypair();
  const addr = addressOf(kp);
  if (!existing) { setEnv('MASTER_SUI_ADDRESS', addr); setEnv('MASTER_SUI_PRIVKEY', exportSecret(kp)); console.log('generated master wallet ->', addr, '(written to .env)'); }
  else console.log('reusing master wallet', addr);

  const client = makeSuiClient({ network: 'testnet', tatumJsonRpcUrl: process.env.TATUM_SUI_JSONRPC, tatumApiKey: process.env.TATUM_API_KEY, fullnodeUrl: process.env.SUI_FULLNODE_URL ?? 'https://fullnode.testnet.sui.io' });
  const before = await balanceOf(client, addr).catch(() => 0n);
  console.log('SUI balance:', Number(before) / 1e9);
  if (before < 100_000_000n) {
    console.log('requesting faucet…');
    const r = await faucet('testnet', addr);
    console.log(r.ok ? 'faucet OK (wait a few seconds)' : `faucet failed: ${r.error}\n  -> claim manually: https://faucet.sui.io/?address=${addr}`);
  }
  console.log('\nNext:\n  1) acquire WAL:  walrus --context testnet get-wal\n  2) publish Move:  pnpm move:publish');
}
main().catch((e) => { console.error(e); process.exit(1); });
