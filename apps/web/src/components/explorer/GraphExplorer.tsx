"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePrivy } from "@privy-io/react-auth";
import MemoryGraphCanvas from "@/components/graph/MemoryGraphCanvas";
import { Button, Spore, Tag } from "@/components/ui/primitives";
import { neighborsOf, nodeById } from "@/lib/graph/data";
import { NODE_TYPE_META, RELATION_LABEL, type MemoryGraph, type MemoryNode, type NodeType } from "@/lib/graph/types";
import { ownerColorHex, typeColor } from "@/lib/graph/colors";
import { useStore, type Phase, type ShareStep, type ShareKind } from "@/lib/store";
import { explorerTx, explorerObject, explorerAccount, shortId } from "@/lib/explorer";

const TYPES = Object.keys(NODE_TYPE_META) as NodeType[];

// relations of a node, resolved against the given graph, for the inspector
function relationsOf(graph: MemoryGraph, nodeId: string): { rel: keyof typeof RELATION_LABEL; other: MemoryNode }[] {
  const out: { rel: keyof typeof RELATION_LABEL; other: MemoryNode }[] = [];
  for (const e of graph.edges) {
    const s = typeof e.source === "string" ? e.source : (e.source as MemoryNode).id;
    const t = typeof e.target === "string" ? e.target : (e.target as MemoryNode).id;
    if (s === nodeId) {
      const other = nodeById(graph, t);
      if (other) out.push({ rel: e.relation, other });
    } else if (t === nodeId) {
      const other = nodeById(graph, s);
      if (other) out.push({ rel: e.relation, other });
    }
  }
  return out;
}

// Wrapper: render the connected user's own graph, or a connect/empty state.
// No static/dummy graph is ever shown here.
export function GraphExplorer() {
  const graph = useStore((s) => s.graph);
  const sharedView = useStore((s) => s.sharedView);
  const loadingShared = useStore((s) => s.loadingShared);
  const phase = useStore((s) => s.phase);
  const [view, setView] = useState<"mine" | "shared">("mine");
  // graph is null only when not connected / still loading; once connected it's a
  // (possibly empty) per-user graph and the explorer handles the empty case.
  if (!graph) return <EmptyState phase={phase} />;
  const active = view === "mine" ? graph : sharedView ?? { nodes: [], edges: [] };
  return (
    <Explorer
      key={view}
      graph={active}
      view={view}
      setView={setView}
      mineCount={graph.nodes.length}
      sharedCount={sharedView?.nodes.length ?? 0}
      loadingShared={loadingShared}
    />
  );
}

function EmptyState({ phase }: { phase: Phase }) {
  const { login, ready } = usePrivy();
  return (
    <div className="grid h-[calc(100vh-5rem)] place-items-center px-6 text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center">
          <Spore size={18} pulse />
        </div>
        <h1 className="text-2xl font-semibold text-ink">Your living memory</h1>
        {phase === "connecting" ? (
          <p className="mt-2 text-ink-mid">Loading your graph…</p>
        ) : phase === "error" ? (
          <p className="mt-2 text-[var(--spore-rose)]">Couldn&rsquo;t load your graph. Try connecting again.</p>
        ) : (
          <>
            <p className="mt-2 text-ink-mid">
              Connect to open your own memory graph. Your data is yours, encrypted to you.
            </p>
            <Button className="mt-6" onClick={login} disabled={!ready} data-testid="graph-connect">
              Connect
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function Explorer({
  graph,
  view,
  setView,
  mineCount,
  sharedCount,
  loadingShared,
}: {
  graph: MemoryGraph;
  view: "mine" | "shared";
  setView: (v: "mine" | "shared") => void;
  mineCount: number;
  sharedCount: number;
  loadingShared: boolean;
}) {
  const readOnly = view === "shared"; // "shared with me" is a read-only view of others' graphs
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusId, setFocusId] = useState<string | null>(null);
  const [hover, setHover] = useState<MemoryNode | null>(null);
  const [query, setQuery] = useState("");
  const [sharePanel, setSharePanel] = useState(false);
  const [addPanel, setAddPanel] = useState(false);
  const [agentPanel, setAgentPanel] = useState(false);
  const resetShare = useStore((s) => s.resetShare);
  const refreshGraph = useStore((s) => s.refreshGraph);
  const refreshing = useStore((s) => s.refreshing);

  const focus = focusId ? nodeById(graph, focusId) : null;
  // depth-based sharing needs a single root: focused node, else first selected, else most important
  const shareRootId =
    focusId ?? [...selected][0] ?? [...graph.nodes].sort((a, b) => b.importance - a.importance)[0]?.id ?? null;

  function openShare() {
    if (!shareRootId) return;
    resetShare();
    setAddPanel(false);
    setAgentPanel(false);
    setSharePanel(true);
  }

  function openAdd() {
    setSharePanel(false);
    setAgentPanel(false);
    setFocusId(null);
    setAddPanel(true);
  }

  function openAgent() {
    setSharePanel(false);
    setAddPanel(false);
    setFocusId(null);
    setAgentPanel(true);
  }

  function toggle(id: string) {
    setSharePanel(false);
    setAgentPanel(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onSelectNode(node: MemoryNode) {
    setFocusId(node.id);
    toggle(node.id);
  }

  function grow() {
    setSharePanel(false);
    setAgentPanel(false);
    setSelected((prev) => {
      if (prev.size === 0) {
        const top = [...graph.nodes].sort((a, b) => b.importance - a.importance)[0];
        return top ? new Set([top.id]) : prev;
      }
      return neighborsOf(graph, prev);
    });
  }

  function clearAll() {
    setSelected(new Set());
    setFocusId(null);
    setSharePanel(false);
    setAgentPanel(false);
  }

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return graph.nodes
      .filter((n) => n.title.toLowerCase().includes(q) || n.tags.some((t) => t.includes(q)))
      .slice(0, 6);
  }, [query, graph]);

  const selectedNodes = graph.nodes.filter((n) => selected.has(n.id));

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-[1600px] flex-col px-3 sm:px-5">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="flex items-center gap-3">
          <Spore size={11} pulse />
          <div>
            <h1 className="text-lg font-semibold leading-none text-ink">
              {readOnly ? "Shared with you" : "Your living memory"}
            </h1>
            <p className="mono mt-1 text-[11px] uppercase tracking-widest text-ink-dim">
              {readOnly
                ? `${graph.nodes.length} from others · ${graph.edges.length} links`
                : `${graph.nodes.length} memories · ${graph.edges.length} links`}
            </p>
          </div>
          {/* Mine / Shared-with-me toggle */}
          <div className="ml-1 flex items-center gap-0.5 rounded-full border border-hairline bg-substrate-2/40 p-0.5">
            <button
              onClick={() => setView("mine")}
              data-testid="view-mine"
              className={`mono rounded-full px-3 py-1 text-xs transition-colors ${
                !readOnly ? "bg-substrate-3/70 text-ink" : "text-ink-dim hover:text-ink"
              }`}
            >
              Mine · {mineCount}
            </button>
            <button
              onClick={() => setView("shared")}
              data-testid="view-shared"
              className={`mono rounded-full px-3 py-1 text-xs transition-colors ${
                readOnly ? "bg-substrate-3/70 text-ink" : "text-ink-dim hover:text-ink"
              }`}
            >
              Shared{loadingShared ? " …" : ` · ${sharedCount}`}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!readOnly && (
            <>
              <span className="mono text-sm text-ink-mid">
                <span className="text-glow">{selected.size}</span> in slice
              </span>
              <Button variant="outline" size="sm" onClick={openAdd} data-testid="add-memory">
                ＋ Add
              </Button>
              <Button variant="ghost" size="sm" onClick={openAgent} data-testid="agent-key-open">
                Agent
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" onClick={() => refreshGraph()} disabled={refreshing} data-testid="refresh-graph">
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
          <Button variant="ghost" size="sm" onClick={clearAll}>
            Clear
          </Button>
          {!readOnly && (
            <>
              <Button variant="outline" size="sm" onClick={grow} disabled={graph.nodes.length === 0}>
                Grow ✦
              </Button>
              <Button size="sm" onClick={openShare} disabled={!shareRootId} data-testid="share-slice">
                Share
              </Button>
            </>
          )}
        </div>
      </div>

      {/* body */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 pb-4 lg:grid-cols-[240px_1fr_340px]">
        {/* left: pick-by-name list */}
        <aside className="hidden min-h-0 flex-col overflow-hidden rounded-2xl border border-hairline bg-substrate-2/40 lg:flex">
          <div className="border-b border-hairline p-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a memory…"
              className="mono w-full rounded-lg border border-hairline bg-substrate px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-glow/60"
            />
            {matches.length > 0 && (
              <div className="mt-2 space-y-1">
                {matches.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => onSelectNode(n)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink-mid transition-colors hover:bg-substrate-3/60 hover:text-ink"
                  >
                    <Spore color={ownerColorHex(n.owner)} size={8} />
                    {n.title}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {TYPES.map((t) => {
              const items = graph.nodes.filter((n) => n.type === t);
              if (items.length === 0) return null;
              return (
                <div key={t} className="mb-2">
                  <div className="mono flex items-center gap-2 px-2 py-1.5 text-[10px] uppercase tracking-widest text-ink-dim">
                    <Spore color={typeColor(t)} size={6} />
                    {NODE_TYPE_META[t].label}
                  </div>
                  {items.map((n) => {
                    const on = selected.has(n.id);
                    return (
                      <button
                        key={n.id}
                        onClick={() => onSelectNode(n)}
                        onMouseEnter={() => setHover(n)}
                        onMouseLeave={() => setHover(null)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                          on ? "bg-substrate-3/70 text-ink" : "text-ink-mid hover:bg-substrate-3/40 hover:text-ink"
                        }`}
                      >
                        <span
                          className={`grid h-3.5 w-3.5 place-items-center rounded-full border transition-colors ${
                            on ? "border-transparent" : "border-hairline-strong"
                          }`}
                          style={on ? { background: ownerColorHex(n.owner) } : undefined}
                        >
                          {on && <span className="h-1.5 w-1.5 rounded-full bg-substrate" />}
                        </span>
                        <span className="truncate">{n.title}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </aside>

        {/* center: the canvas */}
        <div className="relative min-h-[50vh] overflow-hidden rounded-2xl border border-hairline bg-substrate/40 lg:min-h-0">
          <MemoryGraphCanvas
            graph={graph}
            selected={selected}
            onSelectNode={onSelectNode}
            onHoverNode={setHover}
            interactive
            focusSelection
            colorBy={readOnly ? "owner" : "type"}
          />
          {graph.nodes.length > 0 ? (
            <div className="glass pointer-events-none absolute left-4 top-4 rounded-full border border-hairline px-3.5 py-1.5 text-xs text-ink-mid">
              {readOnly
                ? "Shared with you by others · colored by owner · tap to inspect"
                : "Tap nodes to build a slice · drag to orbit · scroll to zoom"}
            </div>
          ) : readOnly ? (
            <div className="absolute inset-0 grid place-items-center px-6 text-center">
              <div className="max-w-xs">
                <Spore size={16} pulse />
                <p className="mt-4 text-sm text-ink-mid">
                  {loadingShared
                    ? "Looking for graphs shared with you…"
                    : "Nothing shared with you yet. When someone shares a graph to your address, it appears here."}
                </p>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 grid place-items-center px-6 text-center">
              <div className="max-w-xs">
                <Spore size={16} pulse />
                <p className="mt-4 text-sm text-ink-mid">
                  Your graph is empty. Add your first memory to start building it — it&rsquo;s yours, per account.
                </p>
                <Button className="mt-5" size="sm" onClick={openAdd} data-testid="empty-add">
                  ＋ Add a memory
                </Button>
              </div>
            </div>
          )}
          <AnimatePresence>
            {hover && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.25 }}
                className="glass pointer-events-none absolute bottom-4 left-4 max-w-xs rounded-2xl border border-hairline px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <Spore color={ownerColorHex(hover.owner)} size={9} />
                  <span className="text-sm font-medium text-ink">{hover.title}</span>
                </div>
                <p className="mt-1.5 text-xs leading-snug text-ink-dim">{hover.summary}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* right: inspector + share */}
        <aside className="hidden min-h-0 flex-col overflow-hidden rounded-2xl border border-hairline bg-substrate-2/40 lg:flex">
          <AnimatePresence mode="wait">
            {!readOnly && addPanel ? (
              <AddMemoryPanel key="add" graph={graph} onDone={() => setAddPanel(false)} />
            ) : !readOnly && agentPanel ? (
              <AgentKeyPanel key="agent" onDone={() => setAgentPanel(false)} />
            ) : !readOnly && sharePanel && shareRootId ? (
              <ShareOnChainPanel key="share" graph={graph} rootId={shareRootId} onBack={() => setSharePanel(false)} />
            ) : focus ? (
              <Inspector key={focus.id} node={focus} graph={graph} inSlice={selected.has(focus.id)} onToggle={() => toggle(focus.id)} readOnly={readOnly} />
            ) : readOnly ? (
              <SharedSummary key="shared-summary" graph={graph} loading={loadingShared} />
            ) : (
              <SliceSummary key="summary" nodes={selectedNodes} onGrow={grow} />
            )}
          </AnimatePresence>
        </aside>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- right panels */
function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex min-h-0 flex-1 flex-col"
    >
      {children}
    </motion.div>
  );
}

function Inspector({
  node,
  graph,
  inSlice,
  onToggle,
  readOnly = false,
}: {
  node: MemoryNode;
  graph: MemoryGraph;
  inSlice: boolean;
  onToggle: () => void;
  readOnly?: boolean;
}) {
  const meta = NODE_TYPE_META[node.type];
  const relations = relationsOf(graph, node.id);
  return (
    <PanelShell>
      <div className="border-b border-hairline p-5">
        <Tag color={typeColor(node.type)}>{meta.label}</Tag>
        <h2 className="mt-3 flex items-center gap-2.5 text-2xl font-semibold text-ink">
          <Spore color={ownerColorHex(node.owner)} size={12} />
          {node.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-mid">{node.summary}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <Field label="What it is">{meta.description}</Field>
        <Field label="How much it matters">
          <div className="mt-1 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-substrate-3">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.round(node.importance * 100)}%`, background: ownerColorHex(node.owner) }}
              />
            </div>
            <span className="mono text-xs text-ink-dim">{Math.round(node.importance * 100)}</span>
          </div>
        </Field>
        {node.tags.length > 0 && (
          <Field label="Tags">
            <div className="mt-1 flex flex-wrap gap-1.5">
              {node.tags.map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
            </div>
          </Field>
        )}
        {relations.length > 0 && (
          <Field label={`Connections (${relations.length})`}>
            <ul className="mt-1 space-y-1.5">
              {relations.map((r, i) => (
                <li key={`${r.rel}-${r.other.id}-${i}`} className="flex items-center gap-2 text-sm">
                  <Spore color={ownerColorHex(r.other.owner)} size={7} />
                  <span className="mono text-[11px] uppercase tracking-wide text-ink-faint">{RELATION_LABEL[r.rel]}</span>
                  <span className="truncate text-ink-mid">{r.other.title}</span>
                </li>
              ))}
            </ul>
          </Field>
        )}
      </div>
      <div className="border-t border-hairline p-4">
        {readOnly ? (
          <div className="flex items-center gap-2 text-xs text-ink-dim">
            <Spore color={ownerColorHex(node.owner)} size={8} />
            <span className="mono truncate">shared by {node.owner.slice(0, 6)}…{node.owner.slice(-4)}</span>
          </div>
        ) : (
          <Button className="w-full" variant={inSlice ? "outline" : "glow"} onClick={onToggle}>
            {inSlice ? "Remove from slice" : "Add to slice"}
          </Button>
        )}
      </div>
    </PanelShell>
  );
}

// Right-panel summary for the "Shared with you" view: who shared, how much.
function SharedSummary({ graph, loading }: { graph: MemoryGraph; loading: boolean }) {
  const byOwner = new Map<string, number>();
  for (const n of graph.nodes) byOwner.set(n.owner, (byOwner.get(n.owner) ?? 0) + 1);
  const owners = [...byOwner.entries()].sort((a, b) => b[1] - a[1]);
  return (
    <PanelShell>
      <div className="border-b border-hairline p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <Spore size={11} pulse /> Shared with you
        </h2>
        <p className="mt-1.5 text-sm text-ink-mid">
          Memories other people shared to your address. You can read them; they stay owned (and colored) by their
          author.
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {graph.nodes.length === 0 ? (
          <p className="text-sm text-ink-dim">{loading ? "Looking for shared graphs…" : "Nothing shared with you yet."}</p>
        ) : (
          <>
            <Field label={`From ${owners.length} ${owners.length === 1 ? "person" : "people"}`}>
              <ul className="mt-1 space-y-1.5">
                {owners.map(([o, c]) => (
                  <li key={o} className="flex items-center gap-2 text-sm">
                    <Spore color={ownerColorHex(o)} size={9} />
                    <span className="mono truncate text-ink-mid">
                      {o.slice(0, 6)}…{o.slice(-4)}
                    </span>
                    <span className="mono ml-auto text-[11px] text-ink-faint">
                      {c} {c === 1 ? "node" : "nodes"}
                    </span>
                  </li>
                ))}
              </ul>
            </Field>
            <p className="mt-4 text-xs text-ink-dim">Tap a node to inspect it.</p>
          </>
        )}
      </div>
    </PanelShell>
  );
}

function SliceSummary({ nodes, onGrow }: { nodes: MemoryNode[]; onGrow: () => void }) {
  return (
    <PanelShell>
      <div className="border-b border-hairline p-5">
        <h2 className="text-lg font-semibold text-ink">Your slice</h2>
        <p className="mt-1 text-sm text-ink-dim">The piece of your memory you&rsquo;re about to share.</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {nodes.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="relative mb-4 h-16 w-16">
              <span className="spore-dot absolute inset-0 m-auto h-3 w-3 animate-pulse-glow" />
            </div>
            <p className="text-sm text-ink-mid">Tap a node, or pick from the list, to start a slice.</p>
            <Button variant="outline" size="sm" className="mt-5" onClick={onGrow}>
              Start me off ✦
            </Button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {nodes.map((n) => (
              <div key={n.id} className="flex items-center gap-2.5 rounded-lg border border-hairline bg-substrate/60 px-3 py-2">
                <Spore color={ownerColorHex(n.owner)} size={9} />
                <span className="truncate text-sm text-ink">{n.title}</span>
                <span className="mono ml-auto text-[10px] uppercase text-ink-faint">{NODE_TYPE_META[n.type].label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {nodes.length > 0 && (
        <div className="border-t border-hairline p-4">
          <p className="mono mb-3 text-[11px] uppercase tracking-widest text-ink-dim">
            grow to pull in everything connected
          </p>
          <Button variant="outline" className="w-full" onClick={onGrow}>
            Grow the slice ✦
          </Button>
        </div>
      )}
    </PanelShell>
  );
}

function AddMemoryPanel({ graph, onDone }: { graph: MemoryGraph; onDone: () => void }) {
  const addMemory = useStore((s) => s.addMemory);
  const memBusy = useStore((s) => s.memBusy);
  const memError = useStore((s) => s.memError);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<NodeType>("concept");
  const [body, setBody] = useState("");
  const [relatesTo, setRelatesTo] = useState("");

  async function submit() {
    if (!title.trim() || memBusy) return;
    await addMemory({ title, body, type, relatesTo: relatesTo || undefined });
    // close only on success (the write set no error)
    if (!useStore.getState().memError) onDone();
  }

  return (
    <PanelShell>
      <div className="border-b border-hairline p-5">
        <button onClick={onDone} className="mono mb-3 text-[11px] uppercase tracking-widest text-ink-dim hover:text-ink">
          ← back
        </button>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <Spore size={11} pulse /> Add a memory
        </h2>
        <p className="mt-1.5 text-sm text-ink-mid">A new node in your graph — encrypted to you and saved on Walrus.</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Rust, Maya, Q4 plan…"
            data-testid="add-title"
            className="mt-1 w-full rounded-lg border border-hairline bg-substrate px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-glow/60"
          />
        </Field>
        <Field label="Type">
          <div className="mt-1 flex flex-wrap gap-1.5">
            {TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                data-testid={`add-type-${t}`}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                  t === type
                    ? "border-glow/60 bg-[color-mix(in_oklab,var(--glow)_12%,transparent)] text-ink"
                    : "border-hairline text-ink-mid hover:text-ink"
                }`}
              >
                <Spore color={typeColor(t)} size={6} /> {NODE_TYPE_META[t].label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Note">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What is it? One or two lines."
            rows={3}
            data-testid="add-body"
            className="mt-1 w-full resize-none rounded-lg border border-hairline bg-substrate px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-glow/60"
          />
        </Field>
        {graph.nodes.length > 0 && (
          <Field label="Relate to (optional)">
            <select
              value={relatesTo}
              onChange={(e) => setRelatesTo(e.target.value)}
              data-testid="add-relates"
              className="mt-1 w-full rounded-lg border border-hairline bg-substrate px-3 py-2 text-sm text-ink outline-none focus:border-glow/60"
            >
              <option value="">— none —</option>
              {graph.nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <div className="border-t border-hairline p-4">
        {memError && (
          <p className="mb-2 text-xs text-[var(--spore-rose)]" data-testid="add-error">{memError}</p>
        )}
        <Button className="w-full" onClick={submit} disabled={!title.trim() || memBusy} data-testid="add-memory-submit">
          {memBusy ? "Saving to Walrus…" : "Add memory"}
        </Button>
      </div>
    </PanelShell>
  );
}

/* ---- Connect your agent: reveal the account key to paste into an MCP client --- */
function AgentKeyPanel({ onDone }: { onDone: () => void }) {
  const m = useStore((s) => s.m);
  const address = useStore((s) => s.address);
  const pkg = useStore((s) => s.config?.packageId);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // bech32 suiprivkey for this account — the MCP reads it as MYCELIA_KEY
  const key = m ? m.keypair.getSecretKey() : "";

  function copy(text: string, what: string) {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(what);
      setTimeout(() => setCopied((c) => (c === what ? null : c)), 1500);
    });
  }

  return (
    <PanelShell>
      <div className="border-b border-hairline p-5">
        <button onClick={onDone} className="mono mb-3 text-[11px] uppercase tracking-widest text-ink-dim hover:text-ink">
          ← back
        </button>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <Spore size={11} pulse /> Connect your agent
        </h2>
        <p className="mt-1.5 text-sm text-ink-mid">
          Your MCP agent can write to this same graph. Paste the key below as{" "}
          <span className="mono text-ink">MYCELIA_KEY</span> in your MCP client — then anything it remembers shows up
          here, under this account.
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <Field label="Account">
          <div className="mono break-all text-xs text-ink-mid">{address ?? "—"}</div>
        </Field>
        {pkg && (
          <Field label="Package">
            <div className="mono break-all text-xs text-ink-dim">{pkg}</div>
          </Field>
        )}
        <Field label="MYCELIA_KEY (agent key)">
          <div className="rounded-lg border border-hairline bg-substrate px-3 py-2">
            <div className="mono break-all text-xs text-ink" data-testid="agent-key">
              {key ? (revealed ? key : "•".repeat(48)) : "connect first"}
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setRevealed((r) => !r)} disabled={!key}>
              {revealed ? "Hide" : "Reveal"}
            </Button>
            <Button size="sm" onClick={() => copy(key, "key")} disabled={!key} data-testid="copy-agent-key">
              {copied === "key" ? "Copied ✓" : "Copy key"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-[var(--spore-rose)]">
            This is your private key. Anyone with it controls this account — never share or commit it.
          </p>
        </Field>
        <Field label="How to wire it">
          <ol className="mt-1 list-decimal space-y-1 pl-4 text-xs text-ink-dim">
            <li>Copy the key above.</li>
            <li>
              In your MCP client config, set the <span className="mono text-ink-mid">mycelia</span> server&rsquo;s{" "}
              <span className="mono text-ink-mid">MYCELIA_KEY</span> env to it.
            </li>
            <li>
              Ask the agent to <span className="mono text-ink-mid">remember</span> something, then refresh this page.
            </li>
          </ol>
        </Field>
      </div>
    </PanelShell>
  );
}

const DEPTHS = [0, 1, 2, 3];

function ShareOnChainPanel({ graph, rootId, onBack }: { graph: MemoryGraph; rootId: string; onBack: () => void }) {
  const root = nodeById(graph, rootId);
  const [depth, setDepth] = useState(1);
  const [mode, setMode] = useState<ShareKind>("market");
  const [recipient, setRecipient] = useState("");
  const [price, setPrice] = useState(0.01);
  const [saleTitle, setSaleTitle] = useState(root?.title ? `${root.title} — knowledge` : "My graph");
  const [saleBlurb, setSaleBlurb] = useState("");
  const previewCount = useStore((s) => s.previewCount);
  const shareOnChain = useStore((s) => s.shareOnChain);
  const share = useStore((s) => s.share);
  const m = useStore((s) => s.m);
  const chainError = useStore((s) => s.chainError);

  const net = useStore((s) => s.config?.network) ?? "testnet";
  const count = previewCount(rootId, depth);
  const sharing = share.state === "sharing";
  const steps: ShareStep[] = ["encrypt", "publish", "policy"];

  function submit() {
    shareOnChain(
      rootId,
      depth,
      mode === "address"
        ? { kind: "address", address: recipient }
        : { kind: "market", priceSui: price, title: saleTitle, blurb: saleBlurb },
    );
  }

  return (
    <PanelShell>
      <div className="border-b border-hairline p-5">
        <button onClick={onBack} className="mono mb-3 text-[11px] uppercase tracking-widest text-ink-dim hover:text-ink">
          ← back
        </button>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <Spore size={11} pulse /> Share on-chain
        </h2>
        <p className="mt-1.5 text-sm text-ink-mid">
          Encrypt a slice around <span className="text-ink">{root?.title ?? "this memory"}</span>, publish it to
          Walrus, and grant access on-chain.
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <Field label="Depth from root">
          <div className="mt-1 flex gap-1.5">
            {DEPTHS.map((d) => (
              <button
                key={d}
                onClick={() => setDepth(d)}
                disabled={sharing}
                data-testid={`depth-${d}`}
                className={`mono h-8 w-9 rounded-lg border text-sm transition-colors ${
                  d === depth
                    ? "border-glow/60 bg-[color-mix(in_oklab,var(--glow)_12%,transparent)] text-ink"
                    : "border-hairline text-ink-mid hover:text-ink"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm text-ink-mid">
            <span className="text-glow" data-testid="slice-count">{count}</span> {count === 1 ? "memory" : "memories"} in this slice
          </p>
        </Field>

        {/* two share targets: the public market, or a private address */}
        <Field label="Share to">
          <div className="mt-1 grid grid-cols-2 gap-1.5">
            {(["market", "address"] as ShareKind[]).map((k) => (
              <button
                key={k}
                onClick={() => setMode(k)}
                disabled={sharing}
                data-testid={`mode-${k}`}
                className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                  mode === k
                    ? "border-glow/60 bg-[color-mix(in_oklab,var(--glow)_12%,transparent)] text-ink"
                    : "border-hairline text-ink-mid hover:text-ink"
                }`}
              >
                {k === "market" ? "The market" : "An address"}
              </button>
            ))}
          </div>
        </Field>

        {mode === "address" ? (
          <Field label="Recipient Sui address">
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="0x… recipient address"
              disabled={sharing}
              data-testid="share-recipient"
              className="mono mt-1 w-full rounded-lg border border-hairline bg-substrate px-3 py-2 text-xs text-ink outline-none placeholder:text-ink-faint focus:border-glow/60"
            />
            <p className="mt-1.5 text-xs text-ink-dim">
              A private share: they&rsquo;re added as a session member (add_member) so Seal lets them decrypt.
            </p>
          </Field>
        ) : (
          <Field label="Listing">
            <div className="space-y-2">
              <input
                value={saleTitle}
                onChange={(e) => setSaleTitle(e.target.value)}
                placeholder="Title"
                disabled={sharing}
                data-testid="sale-title"
                className="w-full rounded-lg border border-hairline bg-substrate px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-glow/60"
              />
              <input
                value={saleBlurb}
                onChange={(e) => setSaleBlurb(e.target.value)}
                placeholder="One-line description"
                disabled={sharing}
                data-testid="sale-blurb"
                className="w-full rounded-lg border border-hairline bg-substrate px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-glow/60"
              />
              <label className="flex items-center gap-2 text-sm text-ink-mid">
                <span className="mono text-xs text-ink-dim">price (SUI)</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                  disabled={sharing}
                  data-testid="sale-price"
                  className="mono w-24 rounded-lg border border-hairline bg-substrate px-2 py-1 text-sm text-ink outline-none focus:border-glow/60"
                />
              </label>
            </div>
            <p className="mt-1.5 text-xs text-ink-dim">
              Public: anyone can talk to GPT about it; buyers pay SUI to unlock decrypt access.
            </p>
          </Field>
        )}

        {sharing && (
          <Field label="Publishing">
            <ul className="mt-1 space-y-1">
              {steps.map((s) => (
                <li key={s} className="flex items-center gap-2 text-sm">
                  <Spore color="var(--glow)" size={7} className={share.step === s ? "animate-pulse-glow" : ""} />
                  <span className={share.step === s ? "text-ink" : "text-ink-dim"}>{s}</span>
                </li>
              ))}
            </ul>
          </Field>
        )}
        {share.state === "done" && (
          <div className="rounded-lg border border-hairline bg-substrate/60 p-3 text-sm" data-testid="share-done">
            <p className="text-ink">✓ Shared {share.count} {share.count === 1 ? "memory" : "memories"} on-chain.</p>
            <div className="mt-2 space-y-1 text-xs">
              {share.result.kind === "address" ? (
                <ExRow label="allowlisted" href={explorerAccount(net, share.result.address)} text={shortId(share.result.address)} testid="share-result-address" />
              ) : (
                <ExRow label="listing" href={explorerObject(net, share.result.listingId)} text={shortId(share.result.listingId)} testid="share-result-listing" />
              )}
              <ExRow label="session" href={explorerObject(net, share.sessionId)} text={shortId(share.sessionId)} />
              <ExRow label="tx" href={explorerTx(net, share.result.digest)} text={shortId(share.result.digest)} testid="share-result-tx" />
            </div>
            {share.result.kind === "market" && (
              <p className="mt-2 text-xs text-ink-dim">In the market now — anyone can ask GPT; buyers pay to unlock.</p>
            )}
          </div>
        )}
        {share.state === "error" && (
          <p className="text-sm text-[var(--spore-rose)]" data-testid="share-error">
            {share.message}
          </p>
        )}
        {!m && (
          <p className="mt-2 text-xs text-ink-dim">
            {chainError ? `Chain init failed: ${chainError}` : "Preparing the on-chain stack…"}
          </p>
        )}
      </div>
      <div className="border-t border-hairline p-4">
        <Button className="w-full" onClick={submit} disabled={!m || sharing} data-testid="share-onchain">
          {sharing ? "Sharing on-chain…" : mode === "address" ? "Share to address" : "Share to market"}
        </Button>
      </div>
    </PanelShell>
  );
}

function ExRow({ label, href, text, testid }: { label: string; href: string; text: string; testid?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="mono w-20 shrink-0 text-ink-faint">{label}</span>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        data-testid={testid}
        className="mono truncate text-glow-soft underline decoration-dotted underline-offset-2 hover:text-glow"
      >
        {text} ↗
      </a>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="mono text-[11px] uppercase tracking-widest text-ink-dim">{label}</div>
      <div className="mt-1.5 text-sm text-ink-mid">{children}</div>
    </div>
  );
}
