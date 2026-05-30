// Storage layer — Walrus blobs + Quilt. MYCELIA_SPEC §8, docs.md §1.
// User's own signer pays + owns the Blob object (invariant #6: owner = Blob owner).
// Reads are public/gasless (aggregator or SDK getFiles). Encrypt before publish (#7).
import { WalrusClient } from '@mysten/walrus';
import { WalrusFile } from '@mysten/walrus';
import type { Signer } from '@mysten/sui/cryptography';
import type { SuiClient } from './access.js';
import type { BlobId, SuiAddress, SuiObjectId } from './types.js';

export interface StorageConfig {
  network: 'testnet' | 'mainnet';
  suiClient: SuiClient;
  aggregatorUrl: string; // public read endpoint (gasless)
  wasmUrl?: string; // browser: URL to @mysten/walrus-wasm/web/walrus_wasm_bg.wasm
}

export interface PublishResult {
  blobId: BlobId;
  blobObjectId: SuiObjectId;
  endEpoch: number;
}
export interface QuiltPublishResult extends PublishResult {
  patches: Record<string, BlobId>; // identifier -> quilt patch id (read with getFiles)
}
export interface PublishOpts {
  signer: Signer; // pays gas + WAL
  owner: SuiAddress; // Blob object owner (invariant #6)
  epochs: number;
  deletable?: boolean;
}

export class Storage {
  readonly walrus: WalrusClient;
  private readonly aggregator: string;
  private readonly suiClient: SuiClient;

  constructor(cfg: StorageConfig) {
    this.suiClient = cfg.suiClient;
    this.walrus = new WalrusClient({
      network: cfg.network,
      suiClient: cfg.suiClient as never,
      ...(cfg.wasmUrl ? { wasmUrl: cfg.wasmUrl } : {}),
    });
    this.aggregator = cfg.aggregatorUrl.replace(/\/$/, '');
  }

  /**
   * Drop the client's cached coin/object reads so the next coin-selecting write
   * sees the post-spend coin set. Without this, sequential writes from one wallet
   * can build against an already-spent coin -> `balance::split` abort.
   */
  private freshen(): void {
    try {
      (this.suiClient as any).cache?.clear?.();
      this.walrus.reset();
    } catch {
      /* cache clear is best-effort */
    }
  }

  /**
   * Retry a Walrus write on transient committee/epoch/certification faults.
   * writeBlob/writeQuilt span register -> store slivers -> certify in one call;
   * if the Walrus epoch rolls or the cached committee is stale mid-write, certify
   * hits a MoveAbort (e.g. messages::new_certified_message code 1). Reset the
   * client's cached committee + coins and retry — a genuine NoAccess/policy abort
   * never originates from these system calls, so scoping retry to publishes is safe.
   */
  private async withWriteRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try { return await fn(); } catch (e) {
        lastErr = e;
        const msg = (e as Error)?.message ?? '';
        const transient = /new_certified_message|certif|MoveAbort|epoch|committee|Inconsistent|notEnough|NotEnough|sliver|timed? ?out|timeout|ECONNRESET|fetch failed|50[0-9]\b|retry/i.test(msg);
        if (!transient || i === attempts - 1) throw e;
        this.freshen();
        await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
      }
    }
    throw lastErr;
  }

  /**
   * Guard against accidentally publishing plaintext (invariant #7/#10). Seal
   * ciphertext is BCS and never begins with a JSON/whitespace marker.
   */
  private assertCiphertext(bytes: Uint8Array): void {
    const b = bytes[0];
    if (b === 0x7b || b === 0x5b || b === 0x20 || b === 0x22) {
      throw new Error('refusing to publish: payload looks like plaintext, not Seal ciphertext (invariant #7)');
    }
  }

  /** Publish one ciphertext blob, owned by `owner`, paid by `signer`. */
  async publishBlob(ciphertext: Uint8Array, opts: PublishOpts): Promise<PublishResult> {
    this.assertCiphertext(ciphertext);
    this.freshen();
    const { blobId, blobObject } = await this.withWriteRetry(() => this.walrus.writeBlob({
      blob: ciphertext,
      deletable: opts.deletable ?? true,
      epochs: opts.epochs,
      signer: opts.signer,
      owner: opts.owner,
    }));
    return { blobId, blobObjectId: blobObject.id, endEpoch: Number(blobObject.storage.end_epoch) };
  }

  /**
   * Publish many ciphertext entries as ONE Quilt (cheap for many small blobs,
   * docs.md §1). Returns the quilt id + per-identifier patch ids.
   */
  async publishQuilt(
    items: { identifier: string; contents: Uint8Array; tags?: Record<string, string> }[],
    opts: PublishOpts,
  ): Promise<QuiltPublishResult> {
    for (const it of items) this.assertCiphertext(it.contents);
    this.freshen();
    const res = await this.withWriteRetry(() => this.walrus.writeQuilt({
      blobs: items,
      deletable: opts.deletable ?? true,
      epochs: opts.epochs,
      signer: opts.signer,
      owner: opts.owner,
    }));
    const patches: Record<string, BlobId> = {};
    for (const p of res.index.patches) patches[p.identifier] = p.patchId;
    return {
      blobId: res.blobId,
      blobObjectId: res.blobObject.id,
      endEpoch: Number(res.blobObject.storage.end_epoch),
      patches,
    };
  }

  /** Read a blob or quilt-patch by id (handles both via SDK getFiles). */
  async read(id: BlobId): Promise<Uint8Array> {
    const files = await this.walrus.getFiles({ ids: [id] });
    if (!files[0]) throw new Error(`blob not found: ${id}`);
    return files[0].bytes();
  }

  /** Batch read (efficient for many patches from the same quilt). */
  async readMany(ids: BlobId[]): Promise<Uint8Array[]> {
    if (ids.length === 0) return [];
    const files = await this.walrus.getFiles({ ids });
    return Promise.all(files.map((f) => f.bytes()));
  }

  /**
   * Gasless read of a whole blob via the public aggregator (no SDK/wasm).
   * Retries on 404/5xx: a freshly-certified blob can lag a few seconds before
   * it propagates to the aggregator.
   */
  async readViaAggregator(blobId: BlobId, retries = 6): Promise<Uint8Array> {
    return this.fetchWithRetry(`${this.aggregator}/v1/blobs/${blobId}`, blobId, retries);
  }

  /**
   * Gasless read of a single Quilt patch by its patch id via the aggregator.
   * Node ciphertexts are published inside Quilts (shareSlice) — a reader that
   * never published the Quilt cannot rely on the wasm client's warm cache, so
   * read the patch over plain HTTP with retry (same reliability fix as #20aa3dc
   * applied to manifest/events). Returns the exact patch bytes (one EncryptedObject).
   */
  async readQuiltPatch(patchId: BlobId, retries = 6): Promise<Uint8Array> {
    return this.fetchWithRetry(`${this.aggregator}/v1/blobs/by-quilt-patch-id/${patchId}`, patchId, retries);
  }

  private async fetchWithRetry(url: string, id: string, retries: number): Promise<Uint8Array> {
    let delay = 800;
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(url);
        if (res.ok) return new Uint8Array(await res.arrayBuffer());
        if (res.status < 500 && res.status !== 404) throw new Error(`aggregator ${res.status} for ${id}`);
        if (attempt >= retries) throw new Error(`aggregator read failed ${res.status} for ${id}`);
      } catch (e) {
        if (attempt >= retries) throw e;
      }
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 1.6, 5000);
    }
  }

  /**
   * Extend storage for a blob by `epochs` (renewal, invariant #3). Funder `signer`
   * pays + must own the Blob object. extendBlob() only BUILDS the tx, so we use
   * executeExtendBlobTransaction which signs + executes.
   */
  async extend(blobObjectId: SuiObjectId, epochs: number, signer: Signer): Promise<string> {
    this.freshen();
    const { digest } = await this.walrus.executeExtendBlobTransaction({ blobObjectId, epochs, signer });
    return digest;
  }

  /** Delete a deletable blob to reclaim storage (GC of superseded versions, §8). Owner signs. */
  async deleteBlob(blobObjectId: SuiObjectId, signer: Signer): Promise<string> {
    this.freshen();
    const { digest } = await this.walrus.executeDeleteBlobTransaction({ blobObjectId, signer });
    return digest;
  }

  /** Current Walrus epoch (for renewal decisions). */
  async currentEpoch(): Promise<number> {
    const s = await this.walrus.systemState();
    return s.committee.epoch;
  }

  static makeFile(identifier: string, contents: Uint8Array, tags?: Record<string, string>): WalrusFile {
    return WalrusFile.from({ identifier, contents, tags });
  }
}
