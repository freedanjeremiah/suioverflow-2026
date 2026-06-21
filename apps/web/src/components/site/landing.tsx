"use client";

import { motion } from "framer-motion";
import { Button, Eyebrow, Spore } from "@/components/ui/primitives";

const ease = [0.16, 1, 0.3, 1] as const;

/* ============================ animated SVGs ============================ */

// "It remembers" — satellites pop in around a core, energy flows along the threads.
function RememberAnim() {
  const cx = 120;
  const cy = 90;
  const sats = [
    { x: 54, y: 42, c: "var(--spore-lime)" },
    { x: 190, y: 50, c: "var(--spore-gold)" },
    { x: 40, y: 124, c: "var(--spore-fox)" },
    { x: 198, y: 128, c: "var(--spore-violet)" },
    { x: 118, y: 154, c: "var(--spore-rose)" },
  ];
  return (
    <svg viewBox="0 0 240 180" className="h-full w-full">
      {sats.map((s, i) => (
        <line
          key={`l${i}`}
          x1={cx}
          y1={cy}
          x2={s.x}
          y2={s.y}
          stroke="#222"
          strokeOpacity="0.16"
          strokeWidth="1"
          strokeDasharray="2 5"
        >
          <animate attributeName="stroke-dashoffset" values="14;0" dur="1.6s" repeatCount="indefinite" />
        </line>
      ))}
      {sats.map((s, i) => (
        <circle key={`s${i}`} cx={s.x} cy={s.y} r="6.5" fill={s.c}>
          <animate
            attributeName="r"
            values="0;6.5;6.5;6.5"
            keyTimes="0;0.35;0.9;1"
            dur="4.5s"
            begin={`${i * 0.55}s`}
            repeatCount="indefinite"
          />
        </circle>
      ))}
      <circle cx={cx} cy={cy} r="11" fill="var(--glow)">
        <animate attributeName="r" values="11;13;11" dur="3s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

// "You see it" — pulses travel inward along the threads, the core glows.
function SeeAnim() {
  const cx = 120;
  const cy = 90;
  const sats = [
    { x: 54, y: 42, c: "var(--spore-lime)" },
    { x: 190, y: 50, c: "var(--spore-gold)" },
    { x: 40, y: 124, c: "var(--spore-fox)" },
    { x: 198, y: 128, c: "var(--spore-violet)" },
    { x: 118, y: 154, c: "var(--spore-rose)" },
  ];
  return (
    <svg viewBox="0 0 240 180" className="h-full w-full">
      {sats.map((s, i) => (
        <line key={`l${i}`} x1={s.x} y1={s.y} x2={cx} y2={cy} stroke="#222" strokeOpacity="0.14" strokeWidth="1" />
      ))}
      {sats.map((s, i) => (
        <circle key={`s${i}`} cx={s.x} cy={s.y} r="6" fill={s.c} />
      ))}
      {sats.map((s, i) => (
        <circle key={`p${i}`} r="3.2" fill={s.c}>
          <animate attributeName="cx" values={`${s.x};${cx}`} dur="1.9s" begin={`${i * 0.34}s`} repeatCount="indefinite" />
          <animate attributeName="cy" values={`${s.y};${cy}`} dur="1.9s" begin={`${i * 0.34}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.8;1" dur="1.9s" begin={`${i * 0.34}s`} repeatCount="indefinite" />
        </circle>
      ))}
      <circle cx={cx} cy={cy} r="12" fill="var(--glow)">
        <animate attributeName="r" values="12;15;12" dur="1.9s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

// "Share a slice" — a pulse crosses a bridge; a new node appears live on the far side.
function ShareAnim() {
  const left = [
    { x: 62, y: 64 },
    { x: 42, y: 104 },
    { x: 86, y: 110 },
  ];
  const right = [
    { x: 178, y: 60 },
    { x: 200, y: 100 },
    { x: 158, y: 110 },
  ];
  return (
    <svg viewBox="0 0 240 180" className="h-full w-full">
      {/* left cluster (you) */}
      <line x1="62" y1="64" x2="42" y2="104" stroke="var(--glow)" strokeOpacity="0.35" />
      <line x1="62" y1="64" x2="86" y2="110" stroke="var(--glow)" strokeOpacity="0.35" />
      {left.map((p, i) => (
        <circle key={`L${i}`} cx={p.x} cy={p.y} r={i === 0 ? 8 : 6} fill="var(--glow)" />
      ))}
      {/* bridge */}
      <line x1="86" y1="110" x2="158" y2="86" stroke="var(--glow)" strokeWidth="1.6" strokeDasharray="4 4">
        <animate attributeName="stroke-dashoffset" values="16;0" dur="0.9s" repeatCount="indefinite" />
      </line>
      <circle r="3.5" fill="var(--glow)">
        <animate attributeName="cx" values="86;158" dur="1.8s" repeatCount="indefinite" />
        <animate attributeName="cy" values="110;86" dur="1.8s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur="1.8s" repeatCount="indefinite" />
      </circle>
      {/* right cluster (them) */}
      <line x1="178" y1="60" x2="200" y2="100" stroke="var(--spore-rose)" strokeOpacity="0.35" />
      <line x1="178" y1="60" x2="158" y2="110" stroke="var(--spore-rose)" strokeOpacity="0.35" />
      {right.map((p, i) => (
        <circle key={`R${i}`} cx={p.x} cy={p.y} r={i === 0 ? 8 : 6} fill="var(--spore-rose)" />
      ))}
      {/* live: a new node appears on their side */}
      <line x1="200" y1="100" x2="208" y2="140" stroke="var(--spore-rose)" strokeOpacity="0.3" strokeDasharray="2 4" />
      <circle cx="208" cy="140" r="6" fill="var(--spore-rose)">
        <animate attributeName="r" values="0;0;6;6;0" keyTimes="0;0.4;0.55;0.9;1" dur="3.6s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

/* ============================ triptych ============================ */

const STEPS = [
  { title: "It remembers", line: "Your agent saves what matters as you work.", art: <RememberAnim /> },
  { title: "You see it", line: "Skills, people, projects, mapped and connected.", art: <SeeAnim /> },
  { title: "Share a slice", line: "Point at what to share. It stays live.", art: <ShareAnim /> },
];

export function FeatureTriptych() {
  return (
    <section id="how" className="mx-auto max-w-7xl scroll-mt-24 px-5 py-20 sm:px-8">
      <div className="mb-12 flex flex-col items-center text-center">
        <Eyebrow>How it works</Eyebrow>
        <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Three steps. No copy-paste.
        </h2>
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <motion.div
            key={s.title}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, delay: i * 0.08, ease }}
            className="rounded-2xl border border-hairline bg-substrate p-6"
          >
            <div className="mb-5 h-44 overflow-hidden rounded-xl border border-hairline-soft bg-substrate-2">
              {s.art}
            </div>
            <h3 className="flex items-center gap-2 text-xl font-semibold text-ink">
              <Spore size={8} color="var(--glow)" /> {s.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-dim">{s.line}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ============================ slice showcase ============================ */

// Big animated lasso selecting a cluster of the graph.
function SliceAnim() {
  const nodes: { x: number; y: number; sel: boolean; c: string }[] = [
    { x: 250, y: 120, sel: true, c: "var(--spore-gold)" },
    { x: 330, y: 96, sel: true, c: "var(--spore-lime)" },
    { x: 372, y: 156, sel: true, c: "var(--spore-fox)" },
    { x: 288, y: 186, sel: true, c: "var(--spore-violet)" },
    { x: 340, y: 210, sel: true, c: "var(--spore-rose)" },
    { x: 226, y: 168, sel: true, c: "var(--spore-lime)" },
    { x: 96, y: 80, sel: false, c: "#c7cad0" },
    { x: 140, y: 232, sel: false, c: "#c7cad0" },
    { x: 470, y: 92, sel: false, c: "#c7cad0" },
    { x: 478, y: 214, sel: false, c: "#c7cad0" },
    { x: 150, y: 150, sel: false, c: "#c7cad0" },
  ];
  const edges: [number, number][] = [
    [0, 1], [1, 2], [0, 3], [3, 4], [2, 4], [0, 5], [5, 3], [1, 8], [6, 0], [5, 10], [4, 9], [7, 5],
  ];
  return (
    <svg viewBox="0 0 560 300" className="h-full w-full">
      {edges.map(([a, b], i) => (
        <line
          key={i}
          x1={nodes[a].x}
          y1={nodes[a].y}
          x2={nodes[b].x}
          y2={nodes[b].y}
          stroke="#222"
          strokeOpacity="0.13"
          strokeWidth="1"
        />
      ))}
      {/* lasso */}
      <ellipse
        cx="300"
        cy="155"
        rx="150"
        ry="105"
        fill="color-mix(in srgb, var(--glow) 7%, transparent)"
        stroke="var(--glow)"
        strokeWidth="1.6"
        strokeDasharray="6 7"
      >
        <animate attributeName="stroke-dashoffset" values="0;-26" dur="1.4s" repeatCount="indefinite" />
        <animate attributeName="rx" values="150;156;150" dur="3.5s" repeatCount="indefinite" />
        <animate attributeName="ry" values="105;110;105" dur="3.5s" repeatCount="indefinite" />
      </ellipse>
      {nodes.map((n, i) => (
        <g key={i}>
          <circle cx={n.x} cy={n.y} r={n.sel ? 13 : 9} fill="#ffffff" />
          <circle cx={n.x} cy={n.y} r={n.sel ? 11 : 7} fill={n.sel ? "var(--glow)" : n.c}>
            {n.sel && (
              <animate
                attributeName="r"
                values="11;12.5;11"
                dur="2.4s"
                begin={`${(i % 6) * 0.25}s`}
                repeatCount="indefinite"
              />
            )}
          </circle>
        </g>
      ))}
    </svg>
  );
}

export function SliceShowcase() {
  return (
    <section className="border-y border-hairline bg-substrate-2/50">
      <div className="mx-auto max-w-4xl px-5 py-20 text-center sm:px-8">
        <div className="flex justify-center">
          <Eyebrow>Pick what to share</Eyebrow>
        </div>
        <h2 className="mx-auto mt-4 max-w-2xl text-balance text-3xl font-semibold tracking-tight text-ink sm:text-5xl">
          Choose a slice by pointing at it.
        </h2>
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease }}
          className="relative mx-auto mt-10 aspect-[560/300] max-w-3xl overflow-hidden rounded-3xl border border-hairline bg-substrate"
        >
          <SliceAnim />
          <span className="absolute bottom-4 left-4 rounded-full border border-hairline bg-substrate px-3.5 py-1.5 text-sm text-ink shadow-1">
            <span className="font-semibold text-glow">6 nodes</span> in this slice
          </span>
        </motion.div>
        <div className="mt-9">
          <Button href="/graph" size="lg">
            Try selecting a slice
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ============================ final CTA ============================ */

export function FinalCTA() {
  return (
    <section className="mx-auto max-w-7xl px-5 pb-8 sm:px-8">
      <div className="relative overflow-hidden rounded-3xl border border-hairline bg-substrate-2 px-8 py-20 text-center sm:px-16">
        <svg
          aria-hidden
          viewBox="0 0 600 80"
          className="pointer-events-none absolute inset-x-0 top-6 mx-auto h-12 w-full max-w-lg opacity-70"
        >
          {[80, 200, 320, 440, 520].map((x, i) => (
            <g key={i}>
              {i > 0 && (
                <line x1={[80, 200, 320, 440, 520][i - 1]} y1="40" x2={x} y2="40" stroke="var(--glow)" strokeOpacity="0.3" />
              )}
              <circle cx={x} cy="40" r="5" fill="var(--glow)">
                <animate attributeName="opacity" values="0.4;1;0.4" dur="2.4s" begin={`${i * 0.3}s`} repeatCount="indefinite" />
              </circle>
            </g>
          ))}
        </svg>
        <div className="relative">
          <h2 className="mx-auto mt-6 max-w-xl text-balance text-3xl font-semibold tracking-tight text-ink sm:text-5xl">
            Grow a memory worth keeping.
          </h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button href="/graph" size="lg">
              Open your graph
            </Button>
            <Button href="/market" variant="outline" size="lg">
              Visit the market
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
