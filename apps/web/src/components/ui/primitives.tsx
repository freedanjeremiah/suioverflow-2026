import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

function cx(...c: Array<string | false | undefined | null>) {
  return c.filter(Boolean).join(" ");
}

// --- Spore: the universal node primitive, reused as bullet/marker/avatar ---
export function Spore({
  color,
  size = 10,
  className,
  pulse,
}: {
  color?: string;
  size?: number;
  className?: string;
  pulse?: boolean;
}) {
  return (
    <span
      className={cx("spore-dot inline-block shrink-0", pulse && "animate-pulse-glow", className)}
      style={
        {
          width: size,
          height: size,
          ["--c" as string]: color ?? "var(--glow)",
        } as React.CSSProperties
      }
    />
  );
}

// --- Edge label / relation pill ---
export function Tag({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-substrate px-2.5 py-1 text-[12px] font-medium text-ink-dim">
      {color && <Spore color={color} size={6} />}
      {children}
    </span>
  );
}

type ButtonProps = {
  children: ReactNode;
  variant?: "glow" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
  href?: string;
  className?: string;
} & Omit<ComponentProps<"button">, "ref">;

export function Button({
  children,
  variant = "glow",
  size = "md",
  href,
  className,
  ...rest
}: ButtonProps) {
  const base =
    "group relative inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-200 [transition-timing-function:var(--ease-out-quint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-glow/40 focus-visible:ring-offset-2 focus-visible:ring-offset-substrate";
  const sizes = {
    sm: "h-9 px-4 text-sm",
    md: "h-11 px-5 text-[15px]",
    lg: "h-12 px-6 text-base",
  }[size];
  const variants = {
    glow: "text-white font-medium bg-[var(--glow)] hover:bg-[var(--accent-active)]",
    outline:
      "text-ink bg-substrate border border-ink/90 hover:bg-substrate-2",
    ghost: "text-ink-mid hover:bg-substrate-2 hover:text-ink",
  }[variant];
  const cls = cx(base, sizes, variants, className);

  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}

// --- Eyebrow label, a small coral node + label ---
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-[13px] font-semibold tracking-tight text-glow">
      <Spore size={7} color="var(--glow)" />
      {children}
    </span>
  );
}
