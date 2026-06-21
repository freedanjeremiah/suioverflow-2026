import { Eyebrow, Spore } from "@/components/ui/primitives";

// Home-page narrative sections. (The market teaser lives in ./MarketTeaser.tsx;
// "how it works" / "pick a slice" live in ./landing.tsx.)

/* ---------------------------------------------------------------- Problem */
export function Premise() {
  return (
    <section id="why" className="mx-auto max-w-7xl scroll-mt-24 px-5 py-24 sm:px-8">
      <div className="grid items-end gap-10 md:grid-cols-2">
        <div>
          <Eyebrow>The problem</Eyebrow>
          <h2 className="mt-5 text-balance text-4xl font-semibold leading-tight text-ink sm:text-5xl">
            What your agent knows is trapped in a jar.
          </h2>
        </div>
        <p className="text-pretty text-lg leading-relaxed text-ink-mid">
          Today, telling someone what your AI knows means copy-paste: a frozen, lifeless snapshot
          that is stale the moment you send it. Mycelium keeps it alive. Share a living piece, and it
          updates itself when you learn something new.
        </p>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- trust row */
const TRUST = [
  { t: "Only you can open it", d: "Your memory is scrambled on your device. No one, not even us, can read it unless you hand over the key.", c: "var(--spore-lime)" },
  { t: "Yours to walk away with", d: "Your graph lives on your machine first. Leave any time and take the whole thing with you.", c: "var(--spore-gold)" },
  { t: "No one in the middle", d: "Coordination is on Sui; storage is on Walrus. Nothing central to hack or shut down.", c: "var(--spore-rose)" },
];

export function TrustStrip() {
  return (
    <section id="trust" className="mx-auto max-w-7xl scroll-mt-24 px-5 py-24 sm:px-8">
      <div className="max-w-2xl">
        <Eyebrow>Why trust it</Eyebrow>
        <h2 className="mt-5 text-balance text-4xl font-semibold leading-tight text-ink sm:text-5xl">
          A memory this personal should answer to you alone.
        </h2>
      </div>
      <div className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-hairline bg-hairline sm:grid-cols-3">
        {TRUST.map((x) => (
          <div key={x.t} className="bg-substrate p-8">
            <Spore color={x.c} size={12} />
            <h3 className="mt-5 text-xl font-semibold text-ink">{x.t}</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-mid">{x.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
