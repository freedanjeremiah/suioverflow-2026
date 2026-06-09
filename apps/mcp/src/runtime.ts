// Build the core clients + local store for the MCP server from env + keystore.
import 'dotenv/config';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  loadPublicConfig, loadServerSecrets, validatePublicConfig, makeSuiClient, Crypto, Storage, SessionClient, Mycelia,
} from '@mycelia/core';
import { loadKeypair } from './keystore.js';
import { MemoryStore } from './store.js';

export function buildRuntime() {
  const pub = loadPublicConfig(process.env as Record<string, string>);
  const sec = loadServerSecrets(process.env as Record<string, string>);
  validatePublicConfig(pub);
  const { keypair, address, created } = loadKeypair();
  const net = (pub.suiNetwork === 'mainnet' ? 'mainnet' : 'testnet') as 'testnet' | 'mainnet';

  // Tatum-primary; fullnode is only the -32601 capability shim (access.ts).
  const client = makeSuiClient({
    network: pub.suiNetwork,
    tatumJsonRpcUrl: pub.tatumSuiJsonRpc, tatumApiKey: sec.tatumApiKey, fullnodeUrl: pub.suiFullnodeUrl,
  });
  const crypto = new Crypto({ suiClient: client, keyServerIds: pub.sealKeyServerIds, threshold: pub.sealThreshold, packageId: pub.myceliaPackageId });
  const storage = new Storage({ network: net, suiClient: client, aggregatorUrl: pub.walrusAggregator });
  const sessions = new SessionClient(client, pub.myceliaPackageId);
  const service = new Mycelia(sessions, crypto, storage, { storageEpochs: pub.storageEpochs });
  const dbPath = process.env.MYCELIA_DB ?? join(process.env.MYCELIA_HOME ?? join(homedir(), '.mycelia'), 'memory.sqlite');
  const store = new MemoryStore(dbPath, address);

  return { pub, sec, keypair, address, created, net, client, crypto, storage, sessions, service, store };
}
export type Runtime = ReturnType<typeof buildRuntime>;
