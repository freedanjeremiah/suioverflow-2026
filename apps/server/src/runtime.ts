// Shared server runtime — builds the core clients from env once.
// Load .env from the package cwd first, then fall back to the repo root —
// `pnpm --filter @mycelia/server dev` runs with cwd=apps/server, where the
// shared root .env isn't visible to plain `dotenv/config`.
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
loadEnv();
loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });
import {
  loadPublicConfig, loadServerSecrets, validatePublicConfig, makeSuiClient, keypairFromSecret, addressOf,
  Crypto, Storage, SessionClient, Mycelia,
} from '@mycelia/core';

export function buildRuntime() {
  const pub = loadPublicConfig(process.env as Record<string, string>);
  const sec = loadServerSecrets(process.env as Record<string, string>);
  if (!sec.masterSuiPrivkey) throw new Error('MASTER_SUI_PRIVKEY missing — run faucet/setup first');
  validatePublicConfig(pub);

  const master = keypairFromSecret(sec.masterSuiPrivkey);
  const masterAddress = addressOf(master);
  const net = (pub.suiNetwork === 'mainnet' ? 'mainnet' : 'testnet') as 'testnet' | 'mainnet';

  // Tatum-primary; fullnode is only the -32601 capability shim (access.ts).
  const client = makeSuiClient({
    network: pub.suiNetwork,
    tatumJsonRpcUrl: pub.tatumSuiJsonRpc,
    tatumApiKey: sec.tatumApiKey,
    fullnodeUrl: pub.suiFullnodeUrl,
  });
  const crypto = new Crypto({ suiClient: client, keyServerIds: pub.sealKeyServerIds, threshold: pub.sealThreshold, packageId: pub.myceliaPackageId });
  const storage = new Storage({ network: net, suiClient: client, aggregatorUrl: pub.walrusAggregator });
  const sessions = new SessionClient(client, pub.myceliaPackageId);
  const mycelia = new Mycelia(sessions, crypto, storage, { storageEpochs: pub.storageEpochs });

  return {
    pub, sec, master, masterAddress, client, crypto, storage, sessions, mycelia,
    walrusSystemObject: process.env.WALRUS_SYSTEM_OBJECT ?? '0x6c2547cbbc38025cf3adac45f63cb0a8d12ecf777cdc75a4971612bf97fdf6af',
  };
}
export type Runtime = ReturnType<typeof buildRuntime>;
