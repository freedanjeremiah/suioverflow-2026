import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Spore } from "@/components/ui/primitives";

const COLS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Your graph", href: "/graph" },
      { label: "Marketplace", href: "/market" },
      { label: "How it works", href: "/#how" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Why Mycelium", href: "/#why" },
      { label: "How it works", href: "/#how" },
      { label: "The market", href: "/market" },
    ],
  },
  {
    title: "Trust",
    links: [
      { label: "Privacy & security", href: "/#trust" },
      { label: "How sharing works", href: "/#how" },
      { label: "Your graph", href: "/graph" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="relative mt-24 border-t border-hairline">
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-4 text-sm leading-relaxed text-ink-dim">
              A living memory for your AI. It grows as you work, and it is yours to keep, hide, or
              share, one piece at a time.
            </p>
          </div>
          {COLS.map((col) => (
            <div key={col.title}>
              <h4 className="mono mb-4 flex items-center gap-2 text-[11px] uppercase tracking-widest text-ink-dim">
                <Spore size={6} /> {col.title}
              </h4>
              <ul className="space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-sm text-ink-mid transition-colors hover:text-glow"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-14 flex flex-col items-start justify-between gap-3 border-t border-hairline pt-6 text-xs text-ink-faint sm:flex-row sm:items-center">
          <span>© {new Date().getFullYear()} Mycelium. Tend your network.</span>
          <span className="mono">Encrypted. Local-first. Hosted by no one.</span>
        </div>
      </div>
    </footer>
  );
}
