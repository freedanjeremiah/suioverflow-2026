"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eyebrow, Spore, Button } from "@/components/ui/primitives";
import { ownerColorHex } from "@/lib/graph/colors";
import { loadListings } from "@/lib/market-read";
import type { ListingView } from "@mycelia/core";

function priceLabel(mist: number) {
  return mist > 0 ? `${(mist / 1e9).toLocaleString(undefined, { maximumFractionDigits: 4 })} SUI` : "Free";
}
function short(a: string) {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

// Home-page teaser of real on-chain listings (top 3). Hides itself if nothing
// is listed yet — no mock data.
export function MarketTeaser() {
  const [listings, setListings] = useState<ListingView[] | null>(null);
  useEffect(() => {
    let alive = true;
    loadListings()
      .then((l) => alive && setListings(l.slice(0, 3)))
      .catch(() => alive && setListings([]));
    return () => { alive = false; };
  }, []);

  if (listings && listings.length === 0) return null;

  return (
    <section className="border-t border-hairline bg-substrate-2/40">
      <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-xl">
            <Eyebrow>The market</Eyebrow>
            <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Borrow someone else&rsquo;s map.
            </h2>
          </div>
          <Button href="/market" variant="outline">
            See all graphs
          </Button>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {(listings ?? Array.from({ length: 3 }, () => null)).map((l, i) =>
            l ? (
              <Link
                key={l.id}
                href={`/market/${l.id}`}
                className="group flex flex-col rounded-2xl border border-hairline bg-substrate p-6 transition-shadow duration-300 hover:shadow-1"
              >
                <div className="flex items-center justify-between">
                  <Spore color={ownerColorHex(l.owner)} size={12} pulse />
                  <span className="mono text-glow-soft">{priceLabel(l.price)}</span>
                </div>
                <h3 className="mt-4 text-xl font-semibold text-ink">{l.title || "Untitled graph"}</h3>
                {l.blurb && <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-dim">{l.blurb}</p>}
                <div className="mt-5 flex items-center justify-between border-t border-hairline pt-4 text-sm">
                  <span className="mono text-ink-mid">{short(l.owner)}</span>
                  <span className="text-glow-soft transition-transform group-hover:translate-x-0.5">Open →</span>
                </div>
              </Link>
            ) : (
              <div key={i} className="h-40 rounded-2xl border border-hairline bg-substrate-2/40" />
            ),
          )}
        </div>
      </div>
    </section>
  );
}
