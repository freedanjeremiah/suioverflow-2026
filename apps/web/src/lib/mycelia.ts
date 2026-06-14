// Build the in-browser Mycelia service from the bridged seed + public config.
// Encryption + publishing happen ON THE DEVICE (invariant #1); the user's
// bridged keypair signs + pays + owns (invariants #5/#6).
import {
  makeSuiClient, keypairFromSecret, Crypto, Storage, SessionClient, Mycelia,
} from '@mycelia/core';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import walrusWasmUrl from '@mysten/walrus-wasm/web/walrus_wasm_bg.wasm?url';
import { rpcProxyUrl, type PublicConfig } from './api.js';

export interface BrowserMycelia {
  address: string;
  keypair: Ed25519Keypair;
  client: ReturnType<typeof makeSuiClient>;
  crypto: Crypto;
  storage: Storage;
  sessions: SessionClient;
  service: Mycelia;
  config: PublicConfig;
}

function seedToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function buildBrowserMycelia(seedHex: string, address: string, config: PublicConfig): BrowserMycelia {
  const keypair = keypairFromSecret(seedToBytes(seedHex));
  // Route browser Sui RPC through the backend Tatum proxy (key stays server-side).
  const client = makeSuiClient({ network: config.network, proxyUrl: rpcProxyUrl() });
  const net = config.network === 'mainnet' ? 'mainnet' : 'testnet';
  const crypto = new Crypto({ suiClient: client, keyServerIds: config.keyServerIds, threshold: config.sealThreshold, packageId: config.packageId });
  const storage = new Storage({ network: net, suiClient: client, aggregatorUrl: config.walrusAggregator, wasmUrl: walrusWasmUrl });
  const sessions = new SessionClient(client, config.packageId);
  const service = new Mycelia(sessions, crypto, storage, { storageEpochs: config.storageEpochs });
  return { address, keypair, client, crypto, storage, sessions, service, config };
}
