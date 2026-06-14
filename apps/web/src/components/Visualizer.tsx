import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { type GraphNodeView, type NodeType } from '@mycelia/core';
import { useStore, sharePreview } from '../store.js';
import { glyphPaths, lockPaths, TypeGlyph, TYPE_LABEL } from './ui/Glyph.js';
import { memberHue, lockedHue } from '../lib/palette.js';

const TYPES: NodeType[] = ['skill', 'project', 'person', 'concept', 'communication'];

interface Placed extends GraphNodeView { x: number; y: number; r: number; }

export function Visualizer() {
  const view = useStore((s) => s.view);
  const manifest = useStore((s) => s.manifest);
  const state = useStore((s) => s.state);
  const address = useStore((s) => s.address);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const selectNode = useStore((s) => s.selectNode);
  const setDepth = useStore((s) => s.setDepth);
  const depth = useStore((s) => s.depth);
  const currentEpoch = useStore((s) => s.currentEpoch);
  const degraded = useStore((s) => s.degraded);
  const busy = useStore((s) => s.busy);
  const openShare = useStore((s) => s.openShare);
  const sharePanelOpen = useStore((s) => s.sharePanelOpen);
  const shareRootId = useStore((s) => s.shareRootId);
  const local = useStore((s) => s.local);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 900, h: 700 });
  const [vb, setVb] = useState({ x: 0, y: 0, w: 900, h: 700 }); // viewBox: pan + zoom
  const [typeFilter, setTypeFilter] = useState<Set<NodeType>>(new Set());
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const apply = () => { const w = el.clientWidth, h = el.clientHeight; setSize({ w, h }); setVb((v) => (v.w === 900 && v.x === 0 ? { x: 0, y: 0, w, h } : v)); };
    apply();
    const ro = new ResizeObserver(apply); ro.observe(el); return () => ro.disconnect();
  }, []);

  const members = useMemo(() => state?.members ?? [], [state]);
  const owner = state?.owner;
  // DEMO-ONLY "present mode" (?present=1): big, bright, glowing nodes for
  // recordings; edges recede so nodes dominate. Does NOT affect the shipped UI.
  const present = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('present');
  const RS = present ? 2.3 : 1;      // node radius scale
  const SPREAD = present ? 1.25 : 1; // mild ring spacing so big nodes don't overlap
  const boldVars = present ? ({ '--mint': '#34d399', '--lavender': '#a78bfa', '--peach': '#fb923c', '--sky': '#38bdf8', '--rose': '#fb7185' } as any) : undefined;
  const placed = useMemo<Placed[]>(() => layout(view, size.w, size.h, SPREAD, present), [view, size.w, size.h, SPREAD, present]);
  const posById = useMemo(() => new Map(placed.map((p) => [p.nodeId, p])), [placed]);
  const rootIds = useMemo(() => new Set((manifest?.roots ?? []).map((r) => r.nodeId)), [manifest]);
  const maxDepth = useMemo(() => Math.max(0, ...placed.map((p) => (p.depthFromRoot >= 0 ? p.depthFromRoot : 0))), [placed]);
  const expiring = !!state && currentEpoch > 0 && state.endEpoch > 0 && state.endEpoch - currentEpoch <= 2;
  const filtered = (p: Placed) => typeFilter.size > 0 && !typeFilter.has(p.type);
  const hue = (a: string) => memberHue(a, members, owner);

  // ghost preview: the slice that WOULD be shared, minus nodes already in the graph.
  const ghosts = useMemo(() => {
    if (!sharePanelOpen || !shareRootId) return [];
    const inView = new Set(view.map((v) => v.nodeId));
    const slice = sharePreview(local, shareRootId, depth).filter((n) => !inView.has(n.id));
    const rootPlaced = posById.get(shareRootId);
    const ax = rootPlaced ? rootPlaced.x : size.w / 2;
    const baseY = rootPlaced ? rootPlaced.y - 70 : size.h - 90;
    const n = slice.length;
    const reach = Math.min(size.w * 0.6, Math.max(140, n * 64));
    return slice.map((node, i) => {
      const t = n <= 1 ? 0 : i / (n - 1) - 0.5; // -0.5..0.5
      const x = ax + t * reach;
      const y = baseY - Math.cos(t * Math.PI) * 26;
      return { id: node.id, title: node.title, x, y, r: 11 };
    });
  }, [sharePanelOpen, shareRootId, local, depth, view, posById, size.w, size.h]);

  // dashed ghost-preview edges, computed off the pan/zoom render path
  const ghostEdges = useMemo(() => {
    const gpos = new Map(ghosts.map((x) => [x.id, x]));
    const drawn = new Set<string>();
    return ghosts.flatMap((g) =>
      local.edges
        .filter((e) => e.from === g.id || e.to === g.id)
        .map((e, j) => {
          const otherId = e.from === g.id ? e.to : e.from;
          const other = posById.get(otherId) ?? gpos.get(otherId);
          if (!other) return null;
          // dedup only ghost<->ghost (both iterated); ghost<->real is seen once
          if (gpos.has(otherId)) {
            const key = [g.id, otherId].sort().join('|');
            if (drawn.has(key)) return null;
            drawn.add(key);
          }
          return <line key={`${g.id}-${j}`} x1={g.x} y1={g.y} x2={other.x} y2={other.y}
            stroke="var(--ink)" strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.4} />;
        }),
    );
  }, [ghosts, local.edges, posById]);

  const fit = useCallback(() => {
    if (placed.length === 0) { setVb({ x: 0, y: 0, w: size.w, h: size.h }); return; }
    const xs = placed.map((p) => p.x), ys = placed.map((p) => p.y);
    const pad = 80;
    const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad, minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
    setVb({ x: minX, y: minY, w: Math.max(200, maxX - minX), h: Math.max(200, maxY - minY) });
  }, [placed, size]);

  const zoom = (f: number) => setVb((v) => { const cx = v.x + v.w / 2, cy = v.y + v.h / 2; return { x: cx - (v.w * f) / 2, y: cy - (v.h * f) / 2, w: v.w * f, h: v.h * f }; });

  const onWheel = (e: React.WheelEvent) => {
    const f = e.deltaY > 0 ? 1.12 : 0.89;
    const svg = svgRef.current; if (!svg) return;
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const m = svg.getScreenCTM(); if (!m) return; const loc = pt.matrixTransform(m.inverse());
    setVb((v) => ({ x: loc.x - (loc.x - v.x) * f, y: loc.y - (loc.y - v.y) * f, w: v.w * f, h: v.h * f }));
  };
  const onPointerDown = (e: React.PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y }; (e.target as Element).setPointerCapture?.(e.pointerId); };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setVb((v) => {
      const scale = v.w / size.w;
      return { ...v, x: drag.current!.vx - (e.clientX - drag.current!.x) * scale, y: drag.current!.vy - (e.clientY - drag.current!.y) * scale };
    });
  };
  const onPointerUp = () => { drag.current = null; };

  // keyboard: arrows -> nearest neighbor, Enter -> select, D -> cycle depth
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'd' || e.key === 'D') { setDepth((depth + 1) % 4); return; }
    if (!selectedNodeId || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const cur = posById.get(selectedNodeId); if (!cur) return;
    const dirs: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const [dirX, dirY] = dirs[e.key]!;
    let best: Placed | null = null, bestScore = Infinity;
    for (const p of placed) {
      if (p.nodeId === selectedNodeId) continue;
      const dx = p.x - cur.x, dy = p.y - cur.y;
      const along = dx * dirX + dy * dirY; if (along <= 0) continue;
      const score = Math.hypot(dx, dy) + Math.abs(dx * dirY - dy * dirX);
      if (score < bestScore) { bestScore = score; best = p; }
    }
    if (best) selectNode(best.nodeId);
  };

  // render the live svg when there are real nodes OR ghost-preview nodes to show
  // (so the first graft's ghosts appear on an otherwise-empty canvas).
  const showCanvas = !!state && (view.length > 0 || ghosts.length > 0);

  return (
    <main ref={wrapRef} className={`canvas-wrap${present ? ' present' : ''}`} style={boldVars}>
      <div className="orb drift" style={{ width: 420, height: 420, left: '12%', top: '12%', background: 'radial-gradient(circle, var(--mint), transparent 70%)', opacity: present ? 0.55 : 0.4 }} />
      <div className="orb drift" style={{ width: 360, height: 360, right: '8%', bottom: '10%', background: 'radial-gradient(circle, var(--lavender), transparent 70%)', opacity: present ? 0.55 : 0.4 }} />

      {!showCanvas ? <Empty hasSession={!!state} busy={busy} /> : (
        <svg ref={svgRef} width="100%" height="100%" data-testid="canvas" tabIndex={0} role="application"
          aria-label="Mycelia memory graph — arrow keys move between memories, Enter selects, D cycles depth"
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} style={{ outline: 'none', cursor: drag.current ? 'grabbing' : 'grab', position: 'relative', zIndex: 1 }}
          onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onKeyDown={onKeyDown}>
          <defs>
            {(manifest?.edges ?? []).map((e, i) => {
              if (e.from === e.to) return null;
              const a = posById.get(e.from), b = posById.get(e.to);
              return a && b && a.owner !== b.owner ? (
                <linearGradient key={i} id={`edge${i}`} gradientUnits="userSpaceOnUse" x1={a.x} y1={a.y} x2={b.x} y2={b.y}>
                  <stop offset="0%" stopColor={hue(a.owner)} />
                  <stop offset="100%" stopColor={hue(b.owner)} />
                </linearGradient>
              ) : null;
            })}
          </defs>

          {/* depth rings */}
          {!present && Array.from({ length: maxDepth }).map((_, i) => (
            <circle key={i} cx={size.w / 2} cy={size.h / 2} r={(i + 1) * ringStep(size) * SPREAD} fill="none" stroke="var(--hairline-soft)" />
          ))}

          {/* hyphae */}
          {(manifest?.edges ?? []).map((e, i) => {
            const a = posById.get(e.from), b = posById.get(e.to);
            if (!a || !b) return null;
            const lit = selectedNodeId === e.from || selectedNodeId === e.to;
            const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.12, my = (a.y + b.y) / 2 + (a.x - b.x) * 0.12;
            const cross = a.owner !== b.owner;
            const stroke = lit ? 'var(--ink)' : cross ? `url(#edge${i})` : 'var(--hairline-strong)';
            return <path key={i} d={`M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`} fill="none" stroke={stroke}
              strokeWidth={lit ? 1.8 : present ? 0.8 : 1} strokeOpacity={lit ? 0.85 : cross ? 0.5 : present ? 0.4 : 1} />;
          })}

          {/* ghost preview edges (dashed) */}
          {ghostEdges}

          {/* ghost preview nodes */}
          {ghosts.map((g) => (
            <g key={`ghost-${g.id}`} transform={`translate(${g.x},${g.y})`} data-testid="ghost">
              <circle r={g.r} fill={address ? hue(address) : 'var(--mint)'} fillOpacity={0.35}
                stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="4 3" />
              <text className="spore-label" y={g.r + 13} textAnchor="middle">{g.title}</text>
            </g>
          ))}
          {ghosts.length > 0 && (
            <text className="spore-label" textAnchor="middle" fill="var(--muted)"
              x={ghosts.reduce((a, g) => a + g.x, 0) / ghosts.length}
              y={Math.max(...ghosts.map((g) => g.y)) + 34}>will be shared</text>
          )}

          {/* memories (spores) */}
          {placed.map((p, i) => {
            const dim = (!present && (p.depthFromRoot < 0 || p.depthFromRoot > maxDepth)) || filtered(p);
            const sel = p.nodeId === selectedNodeId;
            const isRoot = rootIds.has(p.nodeId);
            const fill = p.locked ? lockedHue() : hue(p.owner);
            const bodyStroke = p.locked ? 'var(--muted-soft)' : 'var(--ink)';
            const r = p.r * RS;
            return (
              // outer <g> holds the position; inner <g> runs the bloom animation
              // (its CSS transform: scale would otherwise clobber a translate on
              // the same element, collapsing every node to the svg origin).
              <g key={p.nodeId} transform={`translate(${p.x},${p.y})`}>
              <g className="spore-g" tabIndex={0} role="button"
                aria-label={`${p.type} ${p.decrypted ? p.title : p.locked ? 'locked, no access' : 'encrypted'}${isRoot ? ', shared root' : ''}`}
                style={{ opacity: dim ? 0.28 : 1, animation: 'bloom 0.5s both', animationDelay: `${Math.min(i * 28, 900)}ms` }}
                onClick={() => selectNode(p.nodeId)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectNode(p.nodeId); } }}
                data-testid="spore" data-locked={p.locked}>
                <circle r={r + 18} fill="transparent" stroke="none" style={{ pointerEvents: 'all' }} />
                {expiring && !p.locked && <circle r={r + 4} fill="none" stroke="var(--warning)" strokeWidth={1.2} strokeDasharray="3 3" />}
                {sel && <circle r={r + 6} fill="none" stroke="var(--ink)" strokeWidth={2} />}
                {isRoot && <>
                  <circle r={r + 10} fill="none" stroke={fill} strokeWidth={present ? 2 : 1.2} />
                  <circle r={r + 8} fill="none" stroke={fill} strokeWidth={present ? 2 : 1.2} />
                </>}
                <circle className="spore-body" r={r} fill={fill} stroke={bodyStroke} strokeWidth={present ? 2.4 : 1.5}
                  fillOpacity={p.locked ? (present ? 0.85 : 0.6) : p.decrypted ? 1 : present ? 0.92 : 0.4}
                  strokeDasharray={!p.locked && !p.decrypted ? '2 3' : undefined}
                  style={present ? { filter: `drop-shadow(0 0 ${sel ? 14 : 9}px ${fill})` } : undefined} />
                <svg x={-r * 0.5} y={-r * 0.5} width={r} height={r} viewBox="0 0 24 24"
                  className="spore-glyph" fill="none" stroke="var(--ink)" strokeWidth={1.8}
                  strokeLinecap="round" strokeLinejoin="round" opacity={present ? 0.8 : 0.55}>
                  {p.locked ? lockPaths() : glyphPaths(p.type)}
                </svg>
                <text className="spore-label" textAnchor="middle" y={r + 16} style={present ? { fontSize: '16px', fontWeight: 600 } : undefined}>
                  {p.decrypted ? p.title : p.locked ? 'locked' : TYPE_LABEL[p.type]}
                </text>
              </g>
              </g>
            );
          })}
        </svg>
      )}

      {degraded && (
        <div className="degraded-banner" data-testid="degraded-banner" role="alert">
          <div className="inner">Some key servers are unreachable. Already-revealed memories stay readable; new reveals are paused.</div>
        </div>
      )}

      {state && (
        <>
          <div className="canvas-zoom">
            <button onClick={() => zoom(0.8)} aria-label="Zoom in" title="Zoom in">+</button>
            <button onClick={() => zoom(1.25)} aria-label="Zoom out" title="Zoom out">−</button>
            <button data-testid="fit" onClick={fit} aria-label="Fit to view" title="Fit to view">⤢</button>
          </div>

          <div className="canvas-filters" data-testid="toolbar-filter">
            {TYPES.map((t) => {
              const off = typeFilter.size > 0 && !typeFilter.has(t);
              return (
                <button key={t} className={off ? 'off' : ''} title={TYPE_LABEL[t]} data-testid={`filter-${t}`}
                  onClick={() => setTypeFilter((prev) => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n; })}>
                  <TypeGlyph type={t} size={13} />
                </button>
              );
            })}
          </div>

          <div className="canvas-status">
            <span className="float-chip" data-testid="status-strip">
              {view.length} memories · v{manifest?.version ?? 0} · depth {depth}
              {busy && <span style={{ color: 'var(--muted)' }}> · {busy}</span>}
            </span>
            <span className="canvas-depth">
              context depth
              <input type="range" min={0} max={3} value={depth} data-testid="depth-slider"
                aria-label="Context depth" onChange={(e) => setDepth(Number(e.target.value))} />
            </span>
          </div>

          <div className="canvas-graft">
            <button className="btn-pill" data-testid="open-share" disabled={!state || !!busy}
              onClick={() => openShare(true)}>Graft a memory</button>
          </div>
        </>
      )}
    </main>
  );
}

function ringStep(s: { w: number; h: number }) { return Math.min(s.w, s.h) / 9; }

function layout(view: GraphNodeView[], w: number, h: number, spread = 1, pack = false): Placed[] {
  const cx = w / 2, cy = h / 2;
  // present/pack: sunflower (phyllotaxis) over ALL nodes — every node centered
  // and visible, evenly spread, independent of depthFromRoot (which collapses to
  // -1 once the merged manifest's root set shrinks).
  if (pack) {
    const N = view.length || 1;
    const maxR = Math.min(w, h) * 0.42;
    const GA = Math.PI * (3 - Math.sqrt(5));
    return view.map((v, i) => {
      const rr = N <= 1 ? 0 : maxR * Math.sqrt((i + 0.5) / N);
      const ang = i * GA;
      return { ...v, x: cx + Math.cos(ang) * rr, y: cy + Math.sin(ang) * rr, r: 11 + (v.importanceHint ?? 0.5) * 12 };
    });
  }
  const step = ringStep({ w, h }) * spread;
  const byDepth = new Map<number, GraphNodeView[]>();
  for (const v of view) { const d = v.depthFromRoot < 0 ? 99 : v.depthFromRoot; (byDepth.get(d) ?? byDepth.set(d, []).get(d)!).push(v); }
  const out: Placed[] = [];
  for (const [d, items] of byDepth) {
    const radius = d === 99 ? step * 4.4 : d * step;
    items.forEach((v, i) => {
      const ang = (i / items.length) * Math.PI * 2 + d * 0.7;
      const jitter = ((hashStr(v.nodeId) % 30) - 15);
      const x = d === 0 && items.length === 1 ? cx : cx + Math.cos(ang) * (radius + jitter);
      const y = d === 0 && items.length === 1 ? cy : cy + Math.sin(ang) * (radius + jitter);
      out.push({ ...v, x, y, r: 11 + (v.importanceHint ?? 0.5) * 12 });
    });
  }
  return out;
}
function hashStr(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

function Empty({ hasSession, busy }: { hasSession: boolean; busy: string | null }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', zIndex: 1, padding: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, maxWidth: 420, textAlign: 'center' }}>
        {busy ? (
          <div className="hint">{busy}</div>
        ) : hasSession ? (
          <>
            <h3 style={{ fontSize: 22 }}>Nothing shared yet.</h3>
            <div className="hint">Graft a memory to plant the first node.</div>
          </>
        ) : (
          <>
            <h3 style={{ fontSize: 22 }}>Sessions are encrypted spaces you share with others.</h3>
            <div className="hint">Create one in the left rail, or join with an ID someone sent you.</div>
          </>
        )}
      </div>
    </div>
  );
}
