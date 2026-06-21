// Coordination layer — the Sui Session object + Move calls. MYCELIA_SPEC §7.
// Single mutable shared object per session (#2); single-writer monotonic head (#5).
import { Transaction } from '@mysten/sui/transactions';
import type { Signer } from '@mysten/sui/cryptography';
import type { SuiClient } from './access.js';
import type { SessionState, SuiObjectId } from './types.js';

const MOD = 'session';

export interface CreateSessionResult {
  sessionId: SuiObjectId;
  capId: SuiObjectId;
  digest: string;
}

export class SessionClient {
  constructor(
    readonly client: SuiClient,
    readonly packageId: string,
  ) {}

  private target(fn: string): `${string}::${string}::${string}` {
    return `${this.packageId}::${MOD}::${fn}`;
  }

  /** Execute a signed tx, unwrap the v2 tagged-union result, fail closed on abort. */
  private async exec(
    tx: Transaction,
    signer: Signer,
  ): Promise<{ digest: string; effects: any; objectTypes: Record<string, string> }> {
    const r = await this.client.core.signAndExecuteTransaction({
      transaction: tx,
      signer,
      include: { effects: true, objectTypes: true, events: true },
    });
    if (r.$kind !== 'Transaction' || !r.Transaction) {
      const f = (r as any).FailedTransaction;
      throw new Error(`tx failed: ${JSON.stringify(f?.effects?.status?.error ?? r.$kind)}`);
    }
    const t = r.Transaction;
    if (t.effects && !t.effects.status.success) {
      throw new Error(`tx aborted: ${JSON.stringify(t.effects.status.error)}`);
    }
    await this.client.core.waitForTransaction({ digest: t.digest });
    return { digest: t.digest, effects: t.effects, objectTypes: (t.objectTypes ?? {}) as Record<string, string> };
  }

  async createSession(name: string, endEpoch: number, signer: Signer): Promise<CreateSessionResult> {
    const tx = new Transaction();
    tx.moveCall({
      target: this.target('create_session'),
      arguments: [tx.pure.string(name), tx.pure.u64(endEpoch)],
    });
    const { digest, effects, objectTypes } = await this.exec(tx, signer);
    let sessionId: string | undefined;
    let capId: string | undefined;
    for (const o of effects.changedObjects ?? []) {
      if (o.idOperation !== 'Created') continue;
      const ty = objectTypes[o.objectId] ?? '';
      if (ty.endsWith('::session::Session')) sessionId = o.objectId;
      else if (ty.includes('::session::SessionCap')) capId = o.objectId;
    }
    if (!sessionId || !capId) throw new Error('create_session: could not locate created objects');
    return { sessionId, capId, digest };
  }

  async addMember(capId: string, sessionId: string, who: string, signer: Signer): Promise<string> {
    const tx = new Transaction();
    tx.moveCall({ target: this.target('add_member'), arguments: [tx.object(capId), tx.object(sessionId), tx.pure.address(who)] });
    return (await this.exec(tx, signer)).digest;
  }

  async removeMember(capId: string, sessionId: string, who: string, signer: Signer): Promise<string> {
    const tx = new Transaction();
    tx.moveCall({ target: this.target('remove_member'), arguments: [tx.object(capId), tx.object(sessionId), tx.pure.address(who)] });
    return (await this.exec(tx, signer)).digest;
  }

  async shareNode(sessionId: string, sealId: Uint8Array, signer: Signer): Promise<string> {
    const tx = new Transaction();
    tx.moveCall({ target: this.target('share_node'), arguments: [tx.object(sessionId), tx.pure.vector('u8', sealId)] });
    return (await this.exec(tx, signer)).digest;
  }

  /** Batch many share_node calls into one PTB (cheaper than one tx each). */
  async shareNodes(sessionId: string, sealIds: Uint8Array[], signer: Signer): Promise<string> {
    if (sealIds.length === 0) return '';
    const tx = new Transaction();
    for (const sealId of sealIds) {
      tx.moveCall({ target: this.target('share_node'), arguments: [tx.object(sessionId), tx.pure.vector('u8', sealId)] });
    }
    return (await this.exec(tx, signer)).digest;
  }

  async unshareNode(capId: string, sessionId: string, sealId: Uint8Array, signer: Signer): Promise<string> {
    const tx = new Transaction();
    tx.moveCall({ target: this.target('unshare_node'), arguments: [tx.object(capId), tx.object(sessionId), tx.pure.vector('u8', sealId)] });
    return (await this.exec(tx, signer)).digest;
  }

  async setHead(sessionId: string, blobId: string, version: number, signer: Signer): Promise<string> {
    const tx = new Transaction();
    tx.moveCall({ target: this.target('set_head'), arguments: [tx.object(sessionId), tx.pure.string(blobId), tx.pure.u64(version)] });
    return (await this.exec(tx, signer)).digest;
  }

  async setEventBlob(sessionId: string, blobId: string, signer: Signer): Promise<string> {
    const tx = new Transaction();
    tx.moveCall({ target: this.target('set_event_blob'), arguments: [tx.object(sessionId), tx.pure.string(blobId)] });
    return (await this.exec(tx, signer)).digest;
  }

  async renew(capId: string, sessionId: string, endEpoch: number, signer: Signer): Promise<string> {
    const tx = new Transaction();
    tx.moveCall({ target: this.target('renew'), arguments: [tx.object(capId), tx.object(sessionId), tx.pure.u64(endEpoch)] });
    return (await this.exec(tx, signer)).digest;
  }

  /** Build the seal_approve transaction kind for Seal decryption (txBytes). */
  async buildSealApproveTx(sessionId: string, sealId: Uint8Array): Promise<Uint8Array> {
    const tx = new Transaction();
    tx.moveCall({ target: this.target('seal_approve'), arguments: [tx.pure.vector('u8', sealId), tx.object(sessionId)] });
    return tx.build({ client: this.client, onlyTransactionKind: true });
  }

  /** Read the on-chain Session object into a SessionState mirror. */
  async getSessionState(sessionId: string): Promise<SessionState> {
    const res = await this.client.core.getObject({ objectId: sessionId, include: { json: true } });
    const j = (res.object.json ?? {}) as any;
    // VecSet renders as { type, fields: { contents: [...] } } over JSON-RPC.
    const contents = (v: any): any[] => v?.fields?.contents ?? v?.contents ?? (Array.isArray(v) ? v : []);
    const vecSetAddrs = (v: any): string[] => contents(v).map((x: any) => (typeof x === 'string' ? x : x?.fields?.key ?? String(x)));
    const vecSetBytes = (v: any): string[] => contents(v).map((x: any) => bytesToHex(x));
    return {
      id: sessionId,
      name: String(j.name ?? ''),
      owner: String(j.owner ?? ''),
      members: vecSetAddrs(j.members),
      sharedNodes: vecSetBytes(j.shared_nodes),
      headBlob: String(j.head_blob ?? ''),
      headVersion: Number(j.head_version ?? 0),
      eventBlob: String(j.event_blob ?? ''),
      endEpoch: Number(j.end_epoch ?? 0),
      revoked: vecSetAddrs(j.revoked),
    };
  }

  /**
   * Decentralized discovery: find an owner's session by its exact `name` by
   * walking the SessionCaps they own (each cap carries its `session` id). Returns
   * the first match, or null. Lets any client (web, MCP) converge on the same
   * per-account session with no off-chain registry. MYCELIA_SPEC §7.
   */
  async findOwnedSession(owner: string, name: string): Promise<{ sessionId: string; capId: string } | null> {
    const capType = `${this.packageId}::${MOD}::SessionCap`;
    const caps: { capId: string; sessionId: string }[] = [];
    let cursor: string | null = null;
    for (;;) {
      const page = await this.client.getOwnedObjects({
        owner,
        filter: { StructType: capType },
        options: { showContent: true },
        cursor,
      });
      for (const r of page.data) {
        const d = r.data;
        const fields = (d?.content as { fields?: { session?: string } } | undefined)?.fields;
        if (d?.objectId && fields?.session) caps.push({ capId: d.objectId, sessionId: String(fields.session) });
      }
      if (!page.hasNextPage || !page.nextCursor) break;
      cursor = page.nextCursor;
    }
    for (const c of caps) {
      try {
        const st = await this.getSessionState(c.sessionId);
        if (st.name === name && st.owner.toLowerCase() === owner.toLowerCase()) return c;
      } catch {
        /* unreadable / deleted cap — skip */
      }
    }
    return null;
  }

  /**
   * Sessions where `member` was added (and not since removed) — i.e. graphs
   * shared TO this address. Walks `MemberChanged` events newest-first, so the
   * latest membership state per session wins (forward-only revocation honored).
   */
  async findMemberSessions(member: string, maxPages = 20): Promise<string[]> {
    const type = `${this.packageId}::${MOD}::MemberChanged`;
    const m = member.toLowerCase();
    const decided = new Set<string>(); // sessions whose latest state we've recorded
    const added = new Set<string>();
    let cursor: { txDigest: string; eventSeq: string } | null = null;
    for (let pages = 0; pages < maxPages; pages++) {
      const page = await this.client.queryEvents({ query: { MoveEventType: type }, cursor, limit: 50, order: 'descending' });
      for (const e of page.data) {
        const j = e.parsedJson as { session?: string; member?: string; added?: boolean } | undefined;
        if (!j || String(j.member).toLowerCase() !== m) continue;
        const sid = String(j.session);
        if (decided.has(sid)) continue; // newest-first: first seen is the current state
        decided.add(sid);
        if (j.added) added.add(sid);
      }
      if (!page.hasNextPage || !page.nextCursor) break;
      cursor = page.nextCursor;
    }
    return [...added];
  }
}

function bytesToHex(x: any): string {
  if (typeof x === 'string') return x.startsWith('0x') ? x.slice(2) : x;
  if (Array.isArray(x)) return x.map((b: number) => b.toString(16).padStart(2, '0')).join('');
  return String(x);
}
