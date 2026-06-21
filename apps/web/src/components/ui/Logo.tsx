import Link from "next/link";

// A tiny living glyph: three spores joined by hyphae. The brand mark IS a graph.
export function Logo({ withWordmark = true }: { withWordmark?: boolean }) {
  return (
    <Link href="/" className="group inline-flex items-center gap-2.5">
      <svg
        width="30"
        height="30"
        viewBox="0 0 30 30"
        fill="none"
        className="overflow-visible"
        aria-hidden
      >
        <line x1="7" y1="9" x2="15" y2="20" stroke="#222222" strokeOpacity="0.3" strokeWidth="1.2" />
        <line x1="23" y1="7" x2="15" y2="20" stroke="#222222" strokeOpacity="0.3" strokeWidth="1.2" />
        <line x1="7" y1="9" x2="23" y2="7" stroke="#222222" strokeOpacity="0.18" strokeWidth="1.2" />
        <circle cx="7" cy="9" r="3" fill="#222222" />
        <circle cx="23" cy="7" r="2.4" fill="#222222" />
        <circle cx="15" cy="20" r="3.8" fill="var(--glow)" />
      </svg>
      {withWordmark && (
        <span className="font-display text-[19px] font-semibold tracking-tight text-ink">
          Mycelium
        </span>
      )}
    </Link>
  );
}
