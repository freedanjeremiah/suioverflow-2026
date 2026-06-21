import type { Metadata } from "next";
import { MarketBrowser } from "@/components/market/MarketBrowser";
import { Eyebrow } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Market · Mycelium",
  description: "Browse living memory graphs published by people who know their craft. Every one comes with free questions.",
};

export default function MarketPage() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
      <div className="max-w-2xl">
        <Eyebrow>The market</Eyebrow>
        <h1 className="mt-5 text-balance text-5xl font-semibold leading-[1.02] tracking-tight text-ink sm:text-6xl">
          Rent a mind worth picking.
        </h1>
        <p className="mt-6 text-pretty text-lg leading-relaxed text-ink-mid">
          These are living graphs people built from their own work. Ask one a question like you would
          a mentor. Every graph hands you a few free questions, so you can feel it out before you keep it.
        </p>
      </div>

      <div className="mt-14">
        <MarketBrowser />
      </div>
    </div>
  );
}
