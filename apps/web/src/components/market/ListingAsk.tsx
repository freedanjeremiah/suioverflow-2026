"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Spore } from "@/components/ui/primitives";

const API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787").replace(/\/$/, "");

interface Turn {
  role: "you" | "graph";
  text: string;
  touched?: string[];
  pending?: boolean;
}

// Public "talk to GPT" over a listing. The ask-service (server) is a session
// member, so it decrypts the graph (Seal) and runs GPT — anyone can ask.
export function ListingAsk({ sessionId, author }: { sessionId: string; author: string }) {
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setError(null);
    setInput("");
    setBusy(true);
    setTurns((prev) => [...prev, { role: "you", text: q }, { role: "graph", text: "", pending: true }]);
    requestAnimationFrame(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }));
    try {
      const r = await fetch(`${API}/api/listings/${sessionId}/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? `failed (${r.status})`);
      const d = (await r.json()) as { answer: string; touched?: string[] };
      setTurns((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "graph", text: d.answer, touched: d.touched };
        return next;
      });
    } catch (e) {
      setTurns((prev) => prev.slice(0, -1));
      setError(e instanceof Error ? e.message : "ask failed");
    } finally {
      setBusy(false);
      requestAnimationFrame(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }));
    }
  }

  return (
    <div className="flex h-[460px] flex-col overflow-hidden rounded-3xl border border-hairline bg-substrate-2/40">
      <div className="flex items-center gap-2 border-b border-hairline px-5 py-3.5">
        <Spore size={9} pulse />
        <span className="text-sm font-medium text-ink">Ask this graph</span>
        <span className="mono ml-auto text-[11px] text-ink-dim">GPT · {author}&rsquo;s knowledge</span>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        {turns.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Spore size={16} pulse />
            <p className="max-w-xs text-sm text-ink-mid">
              Ask anything — the ask-service decrypts this graph and answers in {author}&rsquo;s voice.
            </p>
          </div>
        )}
        <AnimatePresence initial={false}>
          {turns.map((t, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={t.role === "you" ? "flex justify-end" : "flex justify-start"}
            >
              <div
                data-testid={t.role === "graph" && !t.pending ? "listing-answer" : undefined}
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  t.role === "you" ? "bg-substrate-3/80 text-ink" : "border border-hairline bg-substrate/70 text-ink-mid"
                }`}
              >
                {t.pending ? "…" : t.text}
                {t.touched && t.touched.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {t.touched.map((n) => (
                      <span key={n} className="mono inline-flex items-center gap-1.5 rounded-full border border-hairline px-2 py-0.5 text-[10px] text-ink-dim">
                        <Spore size={5} /> {n}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="border-t border-hairline p-4">
        {error && <p className="mb-2 text-xs text-[var(--spore-rose)]">{error}</p>}
        <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the graph anything…"
            disabled={busy}
            data-testid="listing-ask-input"
            className="flex-1 rounded-full border border-hairline bg-substrate px-4 py-2.5 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-glow/60 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!input.trim() || busy}
            data-testid="listing-ask-submit"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--glow)] text-white transition-transform hover:-translate-y-0.5 disabled:opacity-40"
            aria-label="Ask"
          >
            {busy ? "…" : "↑"}
          </button>
        </form>
      </div>
    </div>
  );
}
