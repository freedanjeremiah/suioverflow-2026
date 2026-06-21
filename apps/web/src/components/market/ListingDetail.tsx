"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { Button, Spore } from "@/components/ui/primitives";
import { ownerColorHex } from "@/lib/graph/colors";
import { loadListing } from "@/lib/market-read";
import type { ListingView } from "@mycelia/core";
import { useStore } from "@/lib/store";
import { ListingAsk } from "@/components/market/ListingAsk";
import { explorerTx, explorerObject, explorerAccount, shortId } from "@/lib/explorer";

function short(a: string) {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function CopyOwner({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(address).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      data-testid="copy-owner"
      className="mono rounded-full border border-hairline px-2 py-1 text-xs text-ink-mid transition-colors hover:text-ink"
      title="Copy owner address"
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}

export function ListingDetail({ id }: { id: string }) {
  const [listing, setListing] = useState<ListingView | null | undefined>(undefined);
  const { login } = usePrivy();
  const m = useStore((s) => s.m);
  const buy = useStore((s) => s.buy);
  const purchaseListing = useStore((s) => s.purchaseListing);
  const net = useStore((s) => s.config?.network) ?? "testnet";

  useEffect(() => {
    let alive = true;
    loadListing(id)
      .then((l) => alive && setListing(l))
      .catch(() => alive && setListing(null));
    return () => { alive = false; };
  }, [id]);

  if (listing === undefined) {
    return <div className="grid h-[60vh] place-items-center"><span className="spore-dot h-3 w-3 animate-pulse-glow" /></div>;
  }
  if (listing === null) {
    return <div className="grid h-[60vh] place-items-center text-ink-mid">Listing not found.</div>;
  }

  const price = listing.price > 0 ? `${(listing.price / 1e9).toLocaleString(undefined, { maximumFractionDigits: 4 })} SUI` : "Free";
  const owned = buy.state === "done";

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
      <Link href="/market" className="mono text-[11px] uppercase tracking-widest text-ink-dim transition-colors hover:text-ink">
        ← back to market
      </Link>
      <div className="mt-6 flex items-center gap-2.5">
        <Spore color={ownerColorHex(listing.owner)} size={12} pulse />
        <span className="mono text-xs text-ink-dim">by</span>
        <a
          href={explorerAccount(net, listing.owner)}
          target="_blank"
          rel="noreferrer"
          className="mono text-xs text-glow-soft underline decoration-dotted underline-offset-2 hover:text-glow"
        >
          {short(listing.owner)} ↗
        </a>
        <CopyOwner address={listing.owner} />
      </div>
      <h1 className="mt-3 text-balance text-4xl font-semibold leading-tight text-ink sm:text-5xl">
        {listing.title || "Untitled graph"}
      </h1>
      {listing.blurb && <p className="mt-3 max-w-xl text-pretty text-lg leading-relaxed text-ink-mid">{listing.blurb}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        {/* buy */}
        <div className="rounded-3xl border border-hairline bg-substrate-2/40 p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="mono text-sm text-ink-dim">price</div>
              <div className="text-2xl font-semibold text-ink">{price}</div>
            </div>
            {owned ? (
              <Button variant="outline" disabled data-testid="owned">Purchased ✓</Button>
            ) : !m ? (
              <Button onClick={login} data-testid="buy-connect">Connect to buy</Button>
            ) : (
              <Button
                onClick={() => purchaseListing(id, listing.session, listing.price)}
                disabled={buy.state === "buying"}
                data-testid="buy"
              >
                {buy.state === "buying" ? "Buying…" : "Buy & unlock"}
              </Button>
            )}
          </div>
          {buy.state === "error" && <p className="mt-3 text-sm text-[var(--spore-rose)]">{buy.message}</p>}
          {owned && (
            <p className="mt-3 text-sm text-ink-mid">
              You&rsquo;re now a member of this graph&rsquo;s session — the owner&rsquo;s account granted you access
              on-chain.{" "}
              <a
                href={explorerTx(net, buy.digest)}
                target="_blank"
                rel="noreferrer"
                className="mono text-glow-soft underline decoration-dotted underline-offset-2 hover:text-glow"
              >
                view tx ↗
              </a>
            </p>
          )}
          <p className="mono mt-4 break-all text-[11px] text-ink-faint">
            session{" "}
            <a
              href={explorerObject(net, listing.session)}
              target="_blank"
              rel="noreferrer"
              className="text-glow-soft underline decoration-dotted underline-offset-2 hover:text-glow"
            >
              {shortId(listing.session)} ↗
            </a>
          </p>
        </div>

        {/* talk to GPT (public, server-decrypted) */}
        <ListingAsk sessionId={listing.session} author={short(listing.owner)} />
      </div>
    </div>
  );
}
