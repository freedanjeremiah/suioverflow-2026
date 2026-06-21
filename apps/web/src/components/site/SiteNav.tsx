"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/primitives";
import { Connect } from "@/components/auth/Connect";

const LINKS = [
  { href: "/graph", label: "Your graph" },
  { href: "/market", label: "Market" },
  { href: "/pitch", label: "Pitch" },
  { href: "/#how", label: "How it works" },
];

export function SiteNav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-50">
      <div className="border-b border-hairline bg-substrate/95 backdrop-blur-sm">
        <nav className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Logo />
          <div className="hidden items-center gap-1 md:flex">
            {LINKS.map((l) => {
              const active = l.href === pathname;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`relative rounded-full px-4 py-2 text-sm transition-colors ${
                    active ? "text-ink" : "text-ink-mid hover:text-ink"
                  }`}
                >
                  {active && (
                    <span className="absolute inset-x-4 -bottom-px h-0.5 rounded-full bg-ink" />
                  )}
                  {l.label}
                </Link>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <Button href="/graph" size="sm" variant="outline">
              Your graph
            </Button>
            <Connect />
          </div>
        </nav>
      </div>
    </header>
  );
}
