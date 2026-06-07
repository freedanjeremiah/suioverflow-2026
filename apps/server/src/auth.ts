// Auth bridge — Privy session -> deterministic Sui keypair seed. MYCELIA_SPEC §19.
// The seed is HMAC(serverSecret, privyUserId): stable per user, server-derivable
// (so it can fund the address), held client-side for signing. Testnet bridge.
import { PrivyClient } from '@privy-io/server-auth';
import { createHmac } from 'node:crypto';
import { keypairFromSecret, addressOf } from '@mycelia/core';

export function makePrivy(appId: string, appSecret: string): PrivyClient | null {
  if (!appId || !appSecret) return null;
  return new PrivyClient(appId, appSecret);
}

/** 32-byte hex seed for a user — feed to Ed25519Keypair.fromSecretKey on both ends. */
export function deriveSeedHex(serverSecret: string, privyUserId: string): string {
  return createHmac('sha256', serverSecret).update(`mycelia:${privyUserId}`).digest('hex');
}

function seedBytes(hex: string): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export interface BridgedIdentity { privyUserId: string; address: string; seedHex: string; }

/** Verify a Privy access token and derive the bridged Sui identity. */
export async function bridgeFromToken(privy: PrivyClient, serverSecret: string, token: string): Promise<BridgedIdentity> {
  const claims = await privy.verifyAuthToken(token);
  return bridgeFromUserId(serverSecret, claims.userId);
}

export function bridgeFromUserId(serverSecret: string, privyUserId: string): BridgedIdentity {
  const seedHex = deriveSeedHex(serverSecret, privyUserId);
  const kp = keypairFromSecret(seedBytes(seedHex));
  return { privyUserId, address: addressOf(kp), seedHex };
}
