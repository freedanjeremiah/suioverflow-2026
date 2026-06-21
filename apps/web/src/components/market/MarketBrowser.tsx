"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Spore } from "@/components/ui/primitives";
import { ownerColorHex } from "@/lib/graph/colors";
import { loadListings } from "@/lib/market-read";
import type { ListingView } from "@mycelia/core";

function priceLabel(mist: number) {
  return mist > 0 ? `${(mist / 1e9).toLocaleString(undefined, { maximumFractionDigits: 4 })} SUI` : "Free";
}
function short(a: string) {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

export function MarketBrowser() {
  const [listings, setListings] = useState<ListingView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    loadListings()
      .then((l) => alive && setListings(l))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "failed to load market"));
    return () => { alive = false; };
  }, []);

  const shown = (listings ?? []).filter((l) =>
    q.trim() ? (l.title + l.owner).toLowerCase().includes(q.trim().toLowerCase()) : true,
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="mono text-[11px] uppercase tracking-widest text-ink-dim">
          {listings ? `${listings.length} graph${listings.length === 1 ? "" : "s"} listed on-chain` : "loading market…"}
        </p>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search graphs…"
          className="mono w-full max-w-xs rounded-full border border-hairline bg-substrate-2/60 px-4 py-2 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-glow/60"
        />
      </div>

      {error && <p className="mt-10 text-sm text-[var(--spore-rose)]">{error}</p>}
      {!listings && !error && (
        <div className="mt-24 grid place-items-center">
          <span className="spore-dot h-3 w-3 animate-pulse-glow" />
        </div>
      )}
      {listings && shown.length === 0 && (
        <div className="mt-24 flex flex-col items-center gap-3 text-center">
          <Spore size={14} pulse />
          <p className="text-ink-mid">No graphs listed yet. Share a slice on your graph, then “List for sale”.</p>
        </div>
      )}

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((l, i) => (
          <motion.div
            key={l.id}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: (i % 3) * 0.06, ease: [0.16, 1, 0.3, 1] }}
          >
            <Link
              href={`/market/${l.id}`}
              className="group flex h-full flex-col rounded-3xl border border-hairline bg-substrate-2/40 p-6 transition-all duration-500 hover:-translate-y-1 hover:border-hairline-strong"
            >
              <div className="flex items-center justify-between">
                <Spore color={ownerColorHex(l.owner)} size={13} pulse />
                <span className="mono text-glow-soft">{priceLabel(l.price)}</span>
              </div>
              <h3 className="mt-4 text-xl font-semibold text-ink">{l.title || "Untitled graph"}</h3>
              {l.blurb && <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-dim">{l.blurb}</p>}
              <div className="mt-5 flex items-center justify-between border-t border-hairline pt-4 text-sm">
                <span className="mono flex items-center gap-2 text-ink-mid">
                  <Spore color={ownerColorHex(l.owner)} size={8} /> {short(l.owner)}
                </span>
                <span className="text-glow-soft transition-transform group-hover:translate-x-0.5">Open →</span>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
