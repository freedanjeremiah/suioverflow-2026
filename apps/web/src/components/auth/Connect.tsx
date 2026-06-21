"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/primitives";
import { useStore } from "@/lib/store";

function shortAddr(a: string) {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(address).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      data-testid="copy-address"
      className="mono rounded-full border border-hairline px-2 py-1.5 text-xs text-ink-mid transition-colors hover:text-ink"
      title="Copy address"
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}

// Email login (Privy) → bridge to a Sui keypair via apps/server → load the
// user's own graph into the store. The /graph page renders that store graph.
export function Connect() {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const phase = useStore((s) => s.phase);
  const address = useStore((s) => s.address);
  const afterLogin = useStore((s) => s.afterLogin);
  const reset = useStore((s) => s.reset);

  useEffect(() => {
    if (authenticated && phase === "anon") {
      getAccessToken().then((t) => afterLogin(t ?? undefined, user?.email?.address ?? undefined));
    } else if (!authenticated && phase !== "anon") {
      reset();
    }
  }, [authenticated, phase, getAccessToken, afterLogin, reset, user]);

  if (!ready) {
    return (
      <Button size="sm" variant="outline" disabled>
        …
      </Button>
    );
  }

  if (authenticated) {
    const label =
      phase === "connecting"
        ? "connecting…"
        : address
          ? shortAddr(address)
          : (user?.email?.address ?? "connected");
    return (
      <span className="inline-flex items-center gap-1.5">
        {address && <CopyAddress address={address} />}
        <button
          onClick={() => {
            logout();
            reset();
          }}
          data-testid="connected"
          className="mono rounded-full border border-hairline px-3 py-1.5 text-xs text-ink-mid transition-colors hover:text-ink"
          title="Sign out"
        >
          {label} · sign out
        </button>
      </span>
    );
  }

  return (
    <Button size="sm" onClick={login} data-testid="connect">
      Connect
    </Button>
  );
}
