"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import MemoryGraphCanvas from "@/components/graph/MemoryGraphCanvas";
import { Button, Eyebrow, Spore } from "@/components/ui/primitives";
import { MY_GRAPH } from "@/lib/graph/data";
import type { MemoryGraph, MemoryNode } from "@/lib/graph/types";
import { getGraph } from "@/lib/client";

export function Hero() {
  const [hover, setHover] = useState<MemoryNode | null>(null);
  // MY_GRAPH is the instant seed; refresh from the backend so the hero reflects
  // the served graph (and a real data source can replace the endpoint later).
  const [graph, setGraph] = useState<MemoryGraph>(MY_GRAPH);

  useEffect(() => {
    let alive = true;
    getGraph()
      .then((r) => alive && setGraph(r.graph))
      .catch(() => { /* keep the seed graph */ });
    return () => { alive = false; };
  }, []);

  return (
    <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
      <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr]">
        {/* text */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <Eyebrow>Memory for your AI</Eyebrow>
          <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.04] tracking-tight text-ink sm:text-5xl lg:text-6xl">
            Your agent already knows you. <span className="text-glow">See it.</span>
          </h1>
          <p className="mt-6 max-w-md text-pretty text-lg leading-relaxed text-ink-mid">
            A living map of what your agent knows. Yours to grow, and to share, a piece at a time.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button href="/graph" size="lg">
              Explore a living graph
            </Button>
            <Button href="/market" variant="outline" size="lg">
              Browse the market
            </Button>
          </div>

          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-ink-dim">
            <span className="flex items-center gap-2">
              <Spore size={8} color="var(--spore-fox)" /> Private by default
            </span>
            <span className="flex items-center gap-2">
              <Spore size={8} color="var(--spore-gold)" /> Yours to keep
            </span>
            <span className="flex items-center gap-2">
              <Spore size={8} color="var(--spore-rose)" /> Hosted by no one
            </span>
          </div>
        </motion.div>

        {/* graph card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-hairline bg-substrate shadow-1"
        >
          <MemoryGraphCanvas
            graph={graph}
            autoRotate
            interactive
            focusSelection={false}
            colorBy="type"
            labelMinImportance={0.62}
            onHoverNode={setHover}
          />
          <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-hairline bg-substrate/90 px-3.5 py-1.5 text-xs font-medium text-ink-dim backdrop-blur-sm">
            Drag to explore
          </div>
          <div className="pointer-events-none absolute bottom-4 left-4 right-4 max-w-xs">
            <motion.div
              key={hover?.id ?? "idle"}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-2xl border border-hairline bg-substrate px-4 py-3 shadow-1"
            >
              <div className="text-[12px] font-semibold uppercase tracking-wide text-glow">
                {hover ? "Remembering" : "A living map"}
              </div>
              <div className="mt-0.5 text-sm font-medium text-ink">
                {hover ? hover.title : "Every point is something it remembers."}
              </div>
              {hover && <div className="mt-1 text-xs leading-snug text-ink-dim">{hover.summary}</div>}
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
