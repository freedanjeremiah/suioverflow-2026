"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Eyebrow, Spore, Tag } from "@/components/ui/primitives";

// The Mycelia pitch — "one memory for all your AI" — as an in-app slide deck.
// Mirrors pitch/pitch-deck.md. Scroll-snap + arrow-key navigation.

type Slide = { key: string; label: string; render: () => React.ReactNode };

const GLOW = "var(--glow)";

function Stat({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-hairline bg-substrate-2/40 p-5">
      <div className="mono text-[11px] uppercase tracking-widest text-ink-dim">{k}</div>
      <div className="mt-1 text-2xl font-semibold text-ink">{v}</div>
      {sub && <div className="mt-1 text-sm text-ink-mid">{sub}</div>}
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <Spore size={8} className="mt-2" />
      <span className="text-lg leading-relaxed text-ink-mid">{children}</span>
    </li>
  );
}

const SLIDES: Slide[] = [
  {
    key: "title",
    label: "Mycelia",
    render: () => (
      <div className="text-center">
        <div className="mx-auto mb-7 grid h-16 w-16 place-items-center">
          <Spore size={20} pulse />
        </div>
        <h1 className="text-balance text-6xl font-semibold leading-[1.05] text-ink sm:text-7xl">Mycelia</h1>
        <p className="mt-5 text-balance text-2xl font-medium text-glow sm:text-3xl">One memory for all your AI</p>
        <p className="mx-auto mt-5 max-w-xl text-pretty text-lg leading-relaxed text-ink-mid">
          Own your memory once. Every AI app — ChatGPT, Claude, Perplexity, Cursor, your own agents — plugs into the
          same encrypted, portable graph.
        </p>
        <div className="mt-9 flex items-center justify-center gap-3">
          <Button href="/graph" size="lg">Open the graph</Button>
          <Button href="/market" variant="outline" size="lg">See the market</Button>
        </div>
        <p className="mono mt-10 text-[11px] uppercase tracking-widest text-ink-faint">↓ scroll · or use arrow keys</p>
      </div>
    ),
  },
  {
    key: "problem",
    label: "Problem",
    render: () => (
      <div>
        <Eyebrow>The problem</Eyebrow>
        <h2 className="mt-4 max-w-3xl text-balance text-4xl font-semibold leading-tight text-ink sm:text-5xl">
          Every AI app has its own amnesiac, locked-in memory.
        </h2>
        <ul className="mt-8 max-w-2xl space-y-4">
          <Bullet>You re-explain yourself to <span className="text-ink">ChatGPT, Claude, Perplexity, Cursor</span> — every day.</Bullet>
          <Bullet>Each tool&rsquo;s memory is a <span className="text-ink">silo</span>: you can&rsquo;t export it, inspect it, or move it.</Bullet>
          <Bullet>New chat or new tool → <span className="text-ink">context gone.</span> Switching means starting over.</Bullet>
          <Bullet>And you <span className="text-ink">don&rsquo;t own any of it.</span> The vendor does.</Bullet>
        </ul>
        <p className="mt-8 max-w-2xl border-l-2 border-hairline-strong pl-4 text-lg italic text-ink-dim">
          A knowledge worker now juggles 5+ AI tools. None of them share what they know about you — and none of it is
          yours to take.
        </p>
      </div>
    ),
  },
  {
    key: "solution",
    label: "Solution",
    render: () => (
      <div>
        <Eyebrow>The solution</Eyebrow>
        <h2 className="mt-4 max-w-3xl text-balance text-4xl font-semibold leading-tight text-ink sm:text-5xl">
          One memory you own that every AI plugs into.
        </h2>
        <ul className="mt-8 max-w-2xl space-y-4">
          <Bullet>A single <span className="text-ink">encrypted knowledge graph of you</span> — skills, projects, people, decisions.</Bullet>
          <Bullet>Any AI connects via <span className="text-ink">MCP</span> and reads &amp; writes the <span className="text-ink">same</span> graph.</Bullet>
          <Bullet>A <span className="text-ink">grafted, living UI</span>: see your memory as a graph, edit it, share a slice.</Bullet>
          <Bullet>Encrypted to you, owned by you — Walrus storage, Seal access, your Sui wallet. No lock-in.</Bullet>
        </ul>
        <p className="mt-8 max-w-2xl rounded-2xl border border-hairline bg-substrate-2/40 p-5 text-lg text-ink-mid">
          <span className="text-glow">The insight:</span> memory should be a <span className="text-ink">user-owned layer</span>,
          not a per-app feature. MCP makes that layer pluggable into every AI tool that exists today.
        </p>
      </div>
    ),
  },
  {
    key: "whynow",
    label: "Why now",
    render: () => (
      <div>
        <Eyebrow>Why now</Eyebrow>
        <h2 className="mt-4 max-w-3xl text-balance text-4xl font-semibold leading-tight text-ink sm:text-5xl">
          Three shifts just made this possible.
        </h2>
        <div className="mt-8 grid max-w-4xl gap-4 sm:grid-cols-3">
          <Stat k="01 · Standard" v="MCP" sub="One integration reaches ChatGPT, Claude, Cursor & the agent ecosystem." />
          <Stat k="02 · Demand" v="Memory" sub="Every vendor is shipping AI memory — and every one is a silo." />
          <Stat k="03 · Rails" v="Walrus + Seal" sub="User-owned, encrypted, shareable data is finally practical on a fast L1." />
        </div>
        <p className="mt-8 max-w-2xl border-l-2 border-hairline-strong pl-4 text-lg text-ink-mid">
          The window: <span className="text-ink">own the cross-app memory layer</span> before each vendor locks users
          into theirs.
        </p>
      </div>
    ),
  },
  {
    key: "market",
    label: "Market",
    render: () => (
      <div>
        <Eyebrow>Market</Eyebrow>
        <h2 className="mt-4 max-w-3xl text-balance text-4xl font-semibold leading-tight text-ink sm:text-5xl">
          A credible path to $100M+ without owning the whole market.
        </h2>
        <div className="mt-8 grid max-w-4xl gap-4 sm:grid-cols-3">
          <Stat k="TAM" v="$100B+" sub="AI software + knowledge management [est.]" />
          <Stat k="SAM" v="$X B" sub="AI memory / context + personal knowledge for AI users [est.]" />
          <Stat k="SOM" v="$Y M" sub="Multi-tool prosumers & devs already on MCP clients [est.]" />
        </div>
        <p className="mt-8 max-w-2xl text-lg text-ink-mid">
          <span className="text-ink">Bottom-up:</span> [N]M people use 2+ AI tools today × $[price]/yr. Start where MCP
          adoption is highest — developers and power users — then expand to teams and orgs.
        </p>
      </div>
    ),
  },
  {
    key: "product",
    label: "Product",
    render: () => (
      <div>
        <Eyebrow>Product</Eyebrow>
        <h2 className="mt-4 max-w-3xl text-balance text-4xl font-semibold leading-tight text-ink sm:text-5xl">
          The graph, the connector, the rails.
        </h2>
        <div className="mt-8 grid max-w-4xl gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-hairline bg-substrate-2/40 p-5">
            <Tag color={GLOW}>The grafted graph</Tag>
            <p className="mt-3 text-ink-mid">A living visualizer of your memory. Add memories, watch it grow, share or sell a slice. &ldquo;Shared with you&rdquo; shows what others granted.</p>
          </div>
          <div className="rounded-2xl border border-hairline bg-substrate-2/40 p-5">
            <Tag color="var(--spore-orchid, #D479C9)">The connector (MCP)</Tag>
            <p className="mt-3 text-ink-mid">Drop your key into any MCP client; that AI now remembers &amp; recalls against your one graph. Write in an agent → see it in the web, same account.</p>
          </div>
          <div className="rounded-2xl border border-hairline bg-substrate-2/40 p-5">
            <Tag color="var(--spore-teal, #5FD0C0)">The rails (on-chain)</Tag>
            <p className="mt-3 text-ink-mid">Each memory encrypted &amp; stored on Walrus; one mutable pointer per account on Sui; access governed by an on-chain policy.</p>
          </div>
        </div>
        <p className="mono mt-6 text-[12px] uppercase tracking-widest text-ink-faint">
          Live demo: <a href="/graph" className="text-glow-soft underline decoration-dotted underline-offset-2 hover:text-glow">/graph</a> · marketplace at <a href="/market" className="text-glow-soft underline decoration-dotted underline-offset-2 hover:text-glow">/market</a>
        </p>
      </div>
    ),
  },
  {
    key: "traction",
    label: "Traction",
    render: () => (
      <div>
        <Eyebrow>Traction</Eyebrow>
        <h2 className="mt-4 max-w-3xl text-balance text-4xl font-semibold leading-tight text-ink sm:text-5xl">
          A working product, live on Sui — end to end.
        </h2>
        <ul className="mt-8 max-w-2xl space-y-4">
          <Bullet><span className="text-ink">Cross-app memory proven:</span> remember in an MCP agent → it appears in the web app, same account, decrypted.</Bullet>
          <Bullet><span className="text-ink">Unified encrypted Walrus store</span> — no DB, no browser storage; a full account graph read back on-chain.</Bullet>
          <Bullet><span className="text-ink">Sharing</span> to an address, a <span className="text-ink">knowledge marketplace</span> (talk-to-GPT + buy-to-unlock), and a <span className="text-ink">&ldquo;Shared with me&rdquo;</span> view — all functional.</Bullet>
        </ul>
        <p className="mono mt-8 max-w-2xl text-[12px] uppercase tracking-widest text-ink-faint">
          [target] design partners: [list] · waitlist: [N] · first 3rd-party MCP integrations: [date]
        </p>
      </div>
    ),
  },
  {
    key: "model",
    label: "Model",
    render: () => (
      <div>
        <Eyebrow>Business model</Eyebrow>
        <h2 className="mt-4 max-w-3xl text-balance text-4xl font-semibold leading-tight text-ink sm:text-5xl">
          $[X]/mo for unlimited, portable, owned AI memory.
        </h2>
        <ul className="mt-8 max-w-2xl space-y-4">
          <Bullet><span className="text-ink">Freemium</span> — personal memory free; pay for capacity, teams, and rich sharing.</Bullet>
          <Bullet><span className="text-ink">Marketplace take rate</span> — a cut of knowledge sold/unlocked between users.</Bullet>
          <Bullet><span className="text-ink">Storage pass-through + premium</span> — Walrus at cost, margin on features.</Bullet>
          <Bullet><span className="text-ink">Enterprise (later)</span> — shared org memory with on-chain access control + audit.</Bullet>
        </ul>
      </div>
    ),
  },
  {
    key: "competition",
    label: "Competition",
    render: () => (
      <div>
        <Eyebrow>Competition</Eyebrow>
        <h2 className="mt-4 max-w-3xl text-balance text-4xl font-semibold leading-tight text-ink sm:text-5xl">
          The only memory that&rsquo;s owned <span className="text-glow">and</span> cross-app.
        </h2>
        <div className="mt-8 max-w-3xl overflow-hidden rounded-2xl border border-hairline">
          <div className="grid grid-cols-3 text-sm">
            <div className="border-b border-hairline bg-substrate-2/40 p-3" />
            <div className="border-b border-l border-hairline bg-substrate-2/40 p-3 text-center text-ink-dim">Siloed &amp; vendor-owned</div>
            <div className="border-b border-l border-hairline bg-substrate-2/40 p-3 text-center font-semibold text-ink">Owned &amp; portable</div>

            <div className="border-b border-hairline p-3 text-ink-dim">Single-app</div>
            <div className="border-b border-l border-hairline p-3 text-center text-ink-mid">ChatGPT / Claude memory</div>
            <div className="border-b border-l border-hairline p-3 text-center text-ink-faint">—</div>

            <div className="p-3 text-ink-dim">AI-native &amp; cross-app</div>
            <div className="border-l border-hairline p-3 text-center text-ink-mid">Notion / Mem / Rewind*</div>
            <div className="grid place-items-center border-l border-hairline bg-[color-mix(in_oklab,var(--glow)_12%,transparent)] p-3">
              <span className="flex items-center gap-2 font-semibold text-ink"><Spore size={9} /> Mycelia</span>
            </div>
          </div>
        </div>
        <p className="mt-5 max-w-2xl text-base text-ink-mid">
          *PKM tools store notes but aren&rsquo;t AI plumbing, aren&rsquo;t cross-app, and aren&rsquo;t user-owned/encrypted.
          The default — per-app memory — is exactly the lock-in users are starting to resent.
        </p>
      </div>
    ),
  },
  {
    key: "team",
    label: "Team",
    render: () => (
      <div>
        <Eyebrow>Team</Eyebrow>
        <h2 className="mt-4 max-w-3xl text-balance text-4xl font-semibold leading-tight text-ink sm:text-5xl">
          Built the full stack, end to end.
        </h2>
        <div className="mt-8 grid max-w-3xl gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-hairline bg-substrate-2/40 p-5">
            <div className="flex items-center gap-3">
              <Spore size={12} pulse />
              <div className="text-lg font-semibold text-ink">[Founder 1] — CEO</div>
            </div>
            <p className="mt-3 text-ink-mid">[Relevant background: AI / crypto / product]</p>
          </div>
          <div className="rounded-2xl border border-hairline bg-substrate-2/40 p-5">
            <div className="flex items-center gap-3">
              <Spore size={12} color="var(--spore-teal, #5FD0C0)" />
              <div className="text-lg font-semibold text-ink">[Founder 2] — CTO</div>
            </div>
            <p className="mt-3 text-ink-mid">[Relevant background: Sui/Move, distributed systems, ML]</p>
          </div>
        </div>
        <p className="mt-6 max-w-2xl text-lg text-ink-mid">
          We built the full on-chain memory stack — Sui + Walrus + Seal + MCP — end to end. We&rsquo;re the team to own
          this layer.
        </p>
      </div>
    ),
  },
  {
    key: "ask",
    label: "Ask",
    render: () => (
      <div>
        <Eyebrow>The ask</Eyebrow>
        <h2 className="mt-4 max-w-3xl text-balance text-4xl font-semibold leading-tight text-ink sm:text-5xl">
          Raising $[X] [pre-seed / seed].
        </h2>
        <div className="mt-8 grid max-w-3xl gap-4 sm:grid-cols-3">
          <Stat k="~50%" v="Product" sub="More MCP clients, the grafted UI, mainnet." />
          <Stat k="~30%" v="Go-to-market" sub="Developers & prosumers; the marketplace." />
          <Stat k="~20%" v="Operations" sub="[12–18] months runway." />
        </div>
        <p className="mt-8 max-w-2xl text-lg text-ink-mid">
          <span className="text-ink">Milestones:</span> [N] live AI-tool integrations · [M] active memories on-chain ·
          mainnet launch · [K] design partners.
        </p>
      </div>
    ),
  },
  {
    key: "vision",
    label: "Vision",
    render: () => (
      <div className="text-center">
        <div className="mx-auto mb-7 grid h-14 w-14 place-items-center">
          <Spore size={18} pulse />
        </div>
        <Eyebrow>Vision</Eyebrow>
        <h2 className="mx-auto mt-4 max-w-3xl text-balance text-4xl font-semibold leading-tight text-ink sm:text-6xl">
          The memory layer of the AI era.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-pretty text-lg leading-relaxed text-ink-mid">
          Your context, owned by you, working in every model and every app — portable across a world of AI tools, and
          the foundation for an economy of shareable knowledge.
        </p>
        <p className="mt-8 text-2xl font-semibold text-glow">Mycelia — one memory for all your AI.</p>
        <div className="mt-9 flex items-center justify-center gap-3">
          <Button href="/graph" size="lg">Open the graph</Button>
          <Button href="mailto:[email]" variant="outline" size="lg">Get in touch</Button>
        </div>
      </div>
    ),
  },
];

export default function PitchPage() {
  const scroller = useRef<HTMLDivElement>(null);
  const slideEls = useRef<Array<HTMLElement | null>>([]);
  const [active, setActive] = useState(0);

  const go = (i: number) => {
    const n = Math.max(0, Math.min(SLIDES.length - 1, i));
    slideEls.current[n]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // track the most-visible slide for the progress rail
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (vis) {
          const idx = slideEls.current.indexOf(vis.target as HTMLElement);
          if (idx >= 0) setActive(idx);
        }
      },
      { root, threshold: [0.4, 0.6] },
    );
    slideEls.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  // keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowDown", "ArrowRight", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        go(active + 1);
      } else if (["ArrowUp", "ArrowLeft", "PageUp"].includes(e.key)) {
        e.preventDefault();
        go(active - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  return (
    <div className="relative">
      <div
        ref={scroller}
        className="h-[calc(100vh-5rem)] snap-y snap-mandatory overflow-y-auto scroll-smooth"
      >
        {SLIDES.map((s, i) => (
          <section
            key={s.key}
            ref={(el) => {
              slideEls.current[i] = el;
            }}
            data-testid={`slide-${s.key}`}
            className="flex min-h-[calc(100vh-5rem)] snap-start items-center px-6 py-16 sm:px-12"
          >
            <div className="mx-auto w-full max-w-5xl">{s.render()}</div>
          </section>
        ))}
      </div>

      {/* progress rail */}
      <div className="pointer-events-auto fixed right-4 top-1/2 z-20 hidden -translate-y-1/2 flex-col items-center gap-2.5 sm:flex">
        {SLIDES.map((s, i) => (
          <button
            key={s.key}
            onClick={() => go(i)}
            aria-label={`Go to ${s.label}`}
            title={s.label}
            className="grid place-items-center"
          >
            <span
              className="rounded-full transition-all"
              style={{
                width: i === active ? 10 : 7,
                height: i === active ? 10 : 7,
                background: i === active ? "var(--glow)" : "var(--hairline-strong, #3a3a3a)",
              }}
            />
          </button>
        ))}
      </div>

      {/* counter + prev/next */}
      <div className="glass fixed bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full border border-hairline px-3 py-1.5">
        <button onClick={() => go(active - 1)} disabled={active === 0} className="text-ink-dim transition-colors hover:text-ink disabled:opacity-30" aria-label="Previous slide">↑</button>
        <span className="mono text-xs text-ink-mid">{String(active + 1).padStart(2, "0")} / {String(SLIDES.length).padStart(2, "0")} · {SLIDES[active].label}</span>
        <button onClick={() => go(active + 1)} disabled={active === SLIDES.length - 1} className="text-ink-dim transition-colors hover:text-ink disabled:opacity-30" aria-label="Next slide">↓</button>
      </div>
    </div>
  );
}
