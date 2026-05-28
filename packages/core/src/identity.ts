// Identity & ownership. MYCELIA_SPEC §5/§19.
// Sui keypair handling + deterministic owner color (DESIGN §2 — never amber).
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import type { Signer } from '@mysten/sui/cryptography';
import type { SuiAddress } from './types.js';

export type { Signer };

/** Restore a keypair from a bech32 `suiprivkey1...` string or raw 32-byte secret. */
export function keypairFromSecret(secret: string | Uint8Array): Ed25519Keypair {
  return Ed25519Keypair.fromSecretKey(secret);
}

export function generateKeypair(): Ed25519Keypair {
  return Ed25519Keypair.generate();
}

export function addressOf(kp: Ed25519Keypair): SuiAddress {
  return kp.getPublicKey().toSuiAddress();
}

/** Export the bech32 secret (suiprivkey1...). Treat as a secret — never log. */
export function exportSecret(kp: Ed25519Keypair): string {
  return kp.getSecretKey();
}

// Owner palette — bioluminescent, NON-blue, amber reserved for shared/merged (DESIGN §2).
// Ordered so the primary "you" tends to spore-green; collaborators get orchid/teal/gold/rose.
export const OWNER_PALETTE = [
  '#7CE0A0', // spore green
  '#D479C9', // orchid
  '#5FD0C0', // teal-green
  '#E3C75A', // gold
  '#E08AB0', // rose
  '#9BD46A', // lime moss
] as const;

/** Deterministic owner color from a Sui address — stable across UI surfaces. */
export function ownerColor(address: SuiAddress): string {
  let h = 0;
  const s = address.toLowerCase();
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return OWNER_PALETTE[h % OWNER_PALETTE.length]!;
}

/** Short display form: 0xabcd…1234. */
export function shortAddr(address: SuiAddress): string {
  if (!address?.startsWith('0x') || address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
