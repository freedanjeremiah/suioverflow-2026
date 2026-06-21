// Marketplace client — list a session's graph for sale + purchase access.
// Thin PTB wrapper over the mycelia::marketplace Move module. Reused by the web
// app and validation harnesses (so neither builds raw @mysten/sui calls).
import { Transaction } from '@mysten/sui/transactions';
import type { Signer } from '@mysten/sui/cryptography';
import type { SuiClient } from './access.js';
import type { SuiObjectId, SuiAddress } from './types.js';

const MOD = 'marketplace';

export interface ListingView {
  id: SuiObjectId;
  session: SuiObjectId;
  owner: SuiAddress;
  price: number; // MIST
  title: string;
  blurb: string;
}

export class MarketClient {
  constructor(
    readonly client: SuiClient,
    readonly packageId: string,
  ) {}

  private target(fn: string): `${string}::${string}::${string}` {
    return `${this.packageId}::${MOD}::${fn}`;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async exec(tx: Transaction, signer: Signer): Promise<any> {
    const r = await this.client.core.signAndExecuteTransaction({
      transaction: tx,
      signer,
      include: { effects: true, objectTypes: true },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const any = r as any;
    if (any.$kind !== 'Transaction' || !any.Transaction) {
      throw new Error('tx failed: ' + JSON.stringify(any.FailedTransaction?.effects?.status?.error ?? any.$kind));
    }
    const t = any.Transaction;
    if (t.effects && !t.effects.status.success) {
      throw new Error('tx aborted: ' + JSON.stringify(t.effects.status.error));
    }
    await this.client.core.waitForTransaction({ digest: t.digest });
    return t;
  }

  /** List `sessionId` for sale. `askService` is added as a member (server can
      decrypt + run GPT for the public). Escrows the cap inside the Listing. */
  async listForSale(
    capId: string,
    sessionId: string,
    priceMist: number,
    title: string,
    blurb: string,
    askService: string,
    signer: Signer,
  ): Promise<{ listingId: string; digest: string }> {
    const tx = new Transaction();
    tx.moveCall({
      target: this.target('list_for_sale'),
      arguments: [
        tx.object(capId),
        tx.object(sessionId),
        tx.pure.u64(priceMist),
        tx.pure.string(title),
        tx.pure.string(blurb),
        tx.pure.address(askService),
      ],
    });
    const t = await this.exec(tx, signer);
    let listingId: string | undefined;
    for (const c of t.effects.changedObjects ?? []) {
      if (c.idOperation === 'Created' && ((t.objectTypes ?? {})[c.objectId] ?? '').includes('::marketplace::Listing')) {
        listingId = c.objectId;
      }
    }
    if (!listingId) throw new Error('list_for_sale: listing not created');
    return { listingId, digest: t.digest };
  }

  /** Purchase a listing: pays `priceMist` SUI to the owner, grants membership. */
  async purchase(listingId: string, sessionId: string, priceMist: number, signer: Signer): Promise<string> {
    const tx = new Transaction();
    const [pay] = tx.splitCoins(tx.gas, [tx.pure.u64(priceMist)]);
    tx.moveCall({
      target: this.target('purchase'),
      arguments: [tx.object(listingId), tx.object(sessionId), pay],
    });
    return (await this.exec(tx, signer)).digest;
  }

  async getListing(listingId: string): Promise<ListingView | null> {
    const res = await this.client.core.getObject({ objectId: listingId, include: { json: true } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const j = (res.object?.json ?? null) as any;
    if (!j) return null;
    return {
      id: listingId,
      session: String(j.session),
      owner: String(j.owner),
      price: Number(j.price),
      title: String(j.title ?? ''),
      blurb: String(j.blurb ?? ''),
    };
  }

  /** Enumerate listings via the ListingCreated event (newest first). */
  async listListings(limit = 50): Promise<ListingView[]> {
    // queryEvents is the classic JSON-RPC method (not on the .core API)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (this.client as any).queryEvents({
      query: { MoveEventType: `${this.packageId}::marketplace::ListingCreated` },
      limit,
      order: 'descending',
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const events: any[] = res?.data ?? [];
    const out: ListingView[] = [];
    const seen = new Set<string>();
    for (const e of events) {
      const p = e?.parsedJson ?? {};
      const id = String(p?.listing ?? '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, session: String(p.session), owner: String(p.owner), price: Number(p.price), title: String(p.title ?? ''), blurb: '' });
    }
    return out;
  }
}
