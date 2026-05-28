// Confidentiality layer — Seal IBE + threshold + Move policy. MYCELIA_SPEC §6/§10, docs.md §2.
// Encrypt-before-publish, always (invariant #7). Fail closed on NoAccessError.
import { SealClient, SessionKey, NoAccessError, EncryptedObject } from '@mysten/seal';
import { blake2b } from '@noble/hashes/blake2b';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import type { SuiClient } from './access.js';
import type { SuiObjectId, NodeId } from './types.js';

export { SessionKey, NoAccessError, EncryptedObject };

export interface SealConfig {
  suiClient: SuiClient;
  keyServerIds: string[];
  threshold: number;
  packageId: string;
  verifyKeyServers?: boolean;
}

/** Strip 0x and lowercase a Sui id/address. */
function rawHex(id: string): string {
  return (id.startsWith('0x') ? id.slice(2) : id).toLowerCase().padStart(64, '0');
}

/**
 * Seal identity bytes for a node. MYCELIA_SPEC §6:
 *   sealId = sessionId(32 bytes) ++ blake2b256(utf8(nodeId))(32 bytes)
 * The session-id prefix ties ciphertext to one session's policy (enables
 * forward-only revocation). Returned both as raw bytes and lowercase hex.
 */
export function sealIdBytes(sessionId: SuiObjectId, nodeId: NodeId): Uint8Array {
  const session = hexToBytes(rawHex(sessionId)); // 32 bytes
  const node = blake2b(new TextEncoder().encode(nodeId), { dkLen: 32 }); // 32 bytes
  const out = new Uint8Array(64);
  out.set(session, 0);
  out.set(node, 32);
  return out;
}
export function sealIdHex(sessionId: SuiObjectId, nodeId: NodeId): string {
  return bytesToHex(sealIdBytes(sessionId, nodeId));
}

export class Crypto {
  readonly client: SealClient;
  readonly packageId: string;
  readonly threshold: number;

  constructor(cfg: SealConfig) {
    this.packageId = cfg.packageId;
    this.threshold = cfg.threshold;
    this.client = new SealClient({
      suiClient: cfg.suiClient as never,
      serverConfigs: cfg.keyServerIds.map((objectId) => ({ objectId, weight: 1 })),
      verifyKeyServers: cfg.verifyKeyServers ?? true,
    });
  }

  /**
   * Encrypt plaintext for (sessionId, nodeId). Returns ciphertext bytes only.
   * The symmetric `key` (backupKey) is deliberately discarded — never logged or
   * stored (CLAUDE.md: never log secrets).
   */
  async encrypt(sessionId: SuiObjectId, nodeId: NodeId, plaintext: Uint8Array): Promise<Uint8Array> {
    const id = sealIdHex(sessionId, nodeId);
    const { encryptedObject } = await this.client.encrypt({
      threshold: this.threshold,
      packageId: this.packageId,
      id,
      data: plaintext,
    });
    return encryptedObject;
  }

  /**
   * Decrypt ciphertext. `txBytes` must be a built seal_approve* transaction kind
   * (see session-client.buildSealApproveTx). Denied policy -> NoAccessError,
   * which callers MUST treat as "no access", never retry (fail closed, §10).
   */
  async decrypt(ciphertext: Uint8Array, sessionKey: SessionKey, txBytes: Uint8Array): Promise<Uint8Array> {
    return this.client.decrypt({ data: ciphertext, sessionKey, txBytes });
  }
}

export function isNoAccess(e: unknown): boolean {
  return e instanceof NoAccessError;
}
