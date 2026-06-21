"use client";

// Build the in-browser Mycelia service from the bridged seed + public config.
// Ported from the old Vite app. Encryption + publishing happen ON THE DEVICE;
// the user's bridged keypair signs + pays + owns. Loaded via dynamic import from
// the store (client-only) so the heavy Sui/Walrus/Seal SDKs never hit SSR.
import { makeSuiClient, keypairFromSecret, Crypto, Storage, SessionClient, Mycelia, MarketClient, SessionKey } from "@mycelia/core";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { rpcProxyUrl, type PublicConfig } from "./api";

export interface BrowserMycelia {
  address: string;
  keypair: Ed25519Keypair;
  client: ReturnType<typeof makeSuiClient>;
  crypto: Crypto;
  storage: Storage;
  sessions: SessionClient;
  service: Mycelia;
  market: MarketClient;
  config: PublicConfig;
}

function seedToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function buildBrowserMycelia(seedHex: string, address: string, config: PublicConfig): BrowserMycelia {
  const keypair = keypairFromSecret(seedToBytes(seedHex));
  // Browser Sui RPC goes through the backend Tatum proxy (key stays server-side).
  const client = makeSuiClient({ network: config.network, proxyUrl: rpcProxyUrl() });
  const net = config.network === "mainnet" ? "mainnet" : "testnet";
  const crypto = new Crypto({
    suiClient: client,
    keyServerIds: config.keyServerIds,
    threshold: config.sealThreshold,
    packageId: config.packageId,
  });
  const storage = new Storage({
    network: net,
    suiClient: client,
    aggregatorUrl: config.walrusAggregator,
    // served from apps/web/public (Turbopack-safe, no bundler wasm-url magic)
    wasmUrl: "/walrus_wasm_bg.wasm",
  });
  const sessions = new SessionClient(client, config.packageId);
  const service = new Mycelia(sessions, crypto, storage, { storageEpochs: config.storageEpochs });
  const market = new MarketClient(client, config.packageId);
  return { address, keypair, client, crypto, storage, sessions, service, market, config };
}

/** A Seal SessionKey for reading (decrypting) this account's own sessions. The
 *  bridged keypair signs locally — no wallet prompt. Reused across reads. */
export function createSessionKey(m: BrowserMycelia): Promise<SessionKey> {
  return SessionKey.create({
    address: m.address,
    packageId: m.config.packageId,
    ttlMin: 30,
    signer: m.keypair,
    suiClient: m.client as never,
  });
}

/** The account's private key in `suiprivkey…` (bech32) form — what an MCP client
 *  pastes as MYCELIA_KEY to act as this same Sui account (shared memory). */
export function exportAgentKey(m: BrowserMycelia): string {
  return m.keypair.getSecretKey();
}
