"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { MemoryGraph, MemoryNode } from "@/lib/graph/types";
import { nodeColor, typeColorHex } from "@/lib/graph/colors";

// react-force-graph-3d touches window at import, so it can't be evaluated on the
// server. We load it lazily on the client (instead of next/dynamic) so the ref
// is passed straight to the real component and imperative methods work.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FG = any;

export interface MemoryGraphCanvasProps {
  graph: MemoryGraph;
  /** ids currently in the selection ("graft") set */
  selected?: Set<string>;
  onSelectNode?: (node: MemoryNode) => void;
  onHoverNode?: (node: MemoryNode | null) => void;
  /** slow ambient spin; for hero / preview use */
  autoRotate?: boolean;
  /** disable click-to-select + drag; pure decoration */
  interactive?: boolean;
  /** dim everything except the selection once a selection exists */
  focusSelection?: boolean;
  /** what drives node hue: "type" (your own graph) or "owner" (marketplace) */
  colorBy?: "type" | "owner";
  /** show always-on labels for nodes at/above this importance (0..1) */
  labelMinImportance?: number;
  className?: string;
}

const CORAL = "#ff385c";
const LINK_BASE = "rgba(60,64,72,0.34)";
const LINK_FADE = "rgba(60,64,72,0.10)";

// ---------- shared textures (built once) ----------
// A filled disc with a slightly darker baked rim, so each node reads as a clean
// bordered dot when tinted (no white-on-white halo to erase the links).
let DISC_TEX: THREE.Texture | null = null;
function discTexture(): THREE.Texture {
  if (DISC_TEX) return DISC_TEX;
  const size = 160;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.72, "rgba(255,255,255,1)");
  g.addColorStop(0.8, "rgba(150,152,158,1)"); // darker rim (tint -> darker node color)
  g.addColorStop(0.92, "rgba(150,152,158,1)");
  g.addColorStop(1, "rgba(150,152,158,0)"); // AA edge
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  DISC_TEX = new THREE.CanvasTexture(c);
  return DISC_TEX;
}

// A soft round aura that fades to transparent — used at low opacity for a touch
// of glow (normal blending, since additive washes out on a white canvas).
let AURA_TEX: THREE.Texture | null = null;
function auraTexture(): THREE.Texture {
  if (AURA_TEX) return AURA_TEX;
  const size = 160;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.35, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  AURA_TEX = new THREE.CanvasTexture(c);
  return AURA_TEX;
}

// A crisp text label as a sprite, with a soft white outline so it stays legible
// over links and other nodes. Cached per string.
const LABEL_CACHE = new Map<string, { tex: THREE.Texture; aspect: number }>();
function labelTexture(text: string) {
  const cached = LABEL_CACHE.get(text);
  if (cached) return cached;
  const dpr = 2;
  const fontPx = 30;
  const padX = 10;
  const measureCanvas = document.createElement("canvas");
  const mctx = measureCanvas.getContext("2d")!;
  const font = `600 ${fontPx}px Inter, system-ui, sans-serif`;
  mctx.font = font;
  const w = Math.ceil(mctx.measureText(text).width) + padX * 2;
  const h = fontPx + 16;
  const c = document.createElement("canvas");
  c.width = w * dpr;
  c.height = h * dpr;
  const ctx = c.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // white halo for legibility
  ctx.lineJoin = "round";
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.strokeText(text, w / 2, h / 2);
  ctx.fillStyle = "#222222";
  ctx.fillText(text, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  const entry = { tex, aspect: w / h };
  LABEL_CACHE.set(text, entry);
  return entry;
}

interface NodeObj {
  group: THREE.Group;
  aura: THREE.Sprite;
  disc: THREE.Sprite;
  label?: THREE.Sprite;
  node: MemoryNode;
  hex: string;
}

function baseSize(n: MemoryNode) {
  return 9 + n.importance * 15;
}

export default function MemoryGraphCanvas({
  graph,
  selected,
  onSelectNode,
  onHoverNode,
  autoRotate = false,
  interactive = true,
  focusSelection = true,
  colorBy = "owner",
  labelMinImportance = 0.5,
  className,
}: MemoryGraphCanvasProps) {
  const nodeHue = (n: MemoryNode) =>
    colorBy === "type" ? typeColorHex(n.type) : nodeColor(n);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const objMap = useRef<Map<string, NodeObj>>(new Map());
  const adjacency = useRef<Map<string, Set<string>>>(new Map());
  const hoveredId = useRef<string | null>(null);
  const userInteracted = useRef(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [ForceGraph3D, setForceGraph3D] = useState<FG>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  useEffect(() => {
    let alive = true;
    import("react-force-graph-3d").then((m) => {
      if (alive) setForceGraph3D(() => m.default);
    });
    return () => {
      alive = false;
    };
  }, []);

  // plain {nodes, links} clone for the engine + an adjacency map for highlights.
  // We seed deterministic spherical positions so the graph is ALWAYS spread,
  // independent of the engine's (sometimes flaky) cold-start timing. The force
  // sim then just relaxes this into an organic shape.
  const data = useMemo(() => {
    const adj = new Map<string, Set<string>>();
    for (const e of graph.edges) {
      const s = typeof e.source === "string" ? e.source : (e.source as MemoryNode).id;
      const t = typeof e.target === "string" ? e.target : (e.target as MemoryNode).id;
      if (!adj.has(s)) adj.set(s, new Set());
      if (!adj.has(t)) adj.set(t, new Set());
      adj.get(s)!.add(t);
      adj.get(t)!.add(s);
    }
    adjacency.current = adj;
    const n = graph.nodes.length;
    const R = 70 + n * 4;
    const nodes = graph.nodes.map((node, i) => {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / n);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      return {
        ...node,
        x: R * Math.sin(phi) * Math.cos(theta),
        y: R * Math.sin(phi) * Math.sin(theta),
        z: R * Math.cos(phi),
      };
    });
    return { nodes, links: graph.edges.map((e) => ({ ...e })) };
  }, [graph]);

  function applyState(id: string) {
    const entry = objMap.current.get(id);
    if (!entry) return;
    const sel = selectedRef.current;
    const isSelected = sel?.has(id) ?? false;
    const hasSelection = (sel?.size ?? 0) > 0;
    const hov = hoveredId.current;
    const isNeighborOfHover =
      hov != null && (hov === id || adjacency.current.get(hov)?.has(id));
    const dimmed =
      (focusSelection && hasSelection && !isSelected) ||
      (hov != null && !isNeighborOfHover);

    const s = baseSize(entry.node) * (isSelected ? 1.3 : 1);
    entry.disc.scale.setScalar(s);
    entry.aura.scale.setScalar(s * (isSelected ? 2.6 : 2.0));

    const discMat = entry.disc.material as THREE.SpriteMaterial;
    const auraMat = entry.aura.material as THREE.SpriteMaterial;
    discMat.opacity = dimmed ? 0.32 : 1;
    // a touch of glow: faint node-color aura, coral + stronger when selected
    auraMat.color.set(isSelected ? CORAL : entry.hex);
    auraMat.opacity = dimmed ? 0 : isSelected ? 0.5 : 0.16;

    if (entry.label) {
      const labelMat = entry.label.material as THREE.SpriteMaterial;
      labelMat.opacity = dimmed ? 0.12 : 1;
      // float the label just below the node
      entry.label.position.y = -(s * 0.5 + 4);
    }
  }

  function buildNode(node: MemoryNode): THREE.Object3D {
    const hex = nodeHue(node);
    const disc = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: discTexture(),
        color: new THREE.Color(hex),
        transparent: true,
        depthWrite: false,
      })
    );
    const aura = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: auraTexture(),
        color: new THREE.Color(hex),
        transparent: true,
        depthWrite: false,
        opacity: 0.16,
      })
    );
    const group = new THREE.Group();
    group.add(aura);
    group.add(disc);

    let label: THREE.Sprite | undefined;
    if (node.importance >= labelMinImportance) {
      const { tex, aspect } = labelTexture(node.title);
      label = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
      );
      const lh = 5.5; // label height in world units
      label.scale.set(lh * aspect, lh, 1);
      label.center.set(0.5, 1); // anchor top-center so it hangs below the node
      group.add(label);
    }

    objMap.current.set(node.id, { group, aura, disc, label, node, hex });
    applyState(node.id);
    return group;
  }

  // re-apply visual state whenever the selection set changes
  useEffect(() => {
    for (const id of objMap.current.keys()) applyState(id);
    fgRef.current?.refresh?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, focusSelection]);

  // size to container (drives the canvas via props, not the forwarded ref)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  // configure forces + controls once the instance exists. We tune spread with
  // charge + link distance only; the default center force keeps it framed.
  // (Setting center force strength too high collapses the whole graph to a dot.)
  const fitTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    if (!ForceGraph3D) return;
    let tries = 0;
    const iv = setInterval(() => {
      const fg = fgRef.current;
      tries++;
      if (fg) {
        fg.d3Force?.("charge")?.strength?.(-340);
        fg.d3Force?.("link")?.distance?.(70);
        const center = fg.d3Force?.("center");
        if (center?.strength) center.strength(1);
        fg.d3ReheatSimulation?.();
        const controls = fg.controls?.();
        if (controls) {
          controls.enableZoom = interactive;
          controls.enablePan = interactive;
          controls.enableRotate = true;
          controls.autoRotate = autoRotate;
          controls.autoRotateSpeed = 0.45;
          controls.enableDamping = true;
          controls.dampingFactor = 0.12;
          // keep the camera out of the cluster (no flying through nodes) and
          // not so far the graph vanishes
          controls.minDistance = 60;
          controls.maxDistance = 2600;
          controls.zoomSpeed = 0.7;
          // once the user grabs the graph, stop auto-fitting so we never snap
          // the camera back mid-zoom (that reads as "glitchy")
          controls.addEventListener?.("start", () => {
            userInteracted.current = true;
            controls.autoRotate = false;
            fitTimers.current.forEach(clearTimeout);
            fitTimers.current = [];
          });
        }
        // re-frame as the layout expands so we never freeze on the early
        // collapsed state (onEngineStop alone can fire too early / not at all)
        [600, 1400, 2600, 4200].forEach((t) =>
          fitTimers.current.push(setTimeout(fitView, t))
        );
        clearInterval(iv);
      } else if (tries > 40) {
        clearInterval(iv);
      }
    }, 50);
    return () => {
      clearInterval(iv);
      fitTimers.current.forEach(clearTimeout);
      fitTimers.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ForceGraph3D, interactive, autoRotate]);

  // Frame the camera from the node data coords (the lib renders nodes at these),
  // since getGraphBbox()/zoomToFit() are unreliable here.
  function fitView(durationMs = 600) {
    if (userInteracted.current) return;
    const fg = fgRef.current;
    if (!fg?.camera) return;
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    let count = 0;
    for (const node of data.nodes as Array<{ x?: number; y?: number; z?: number }>) {
      if (!Number.isFinite(node.x) || !Number.isFinite(node.y) || !Number.isFinite(node.z)) continue;
      minX = Math.min(minX, node.x!);
      maxX = Math.max(maxX, node.x!);
      minY = Math.min(minY, node.y!);
      maxY = Math.max(maxY, node.y!);
      minZ = Math.min(minZ, node.z!);
      maxZ = Math.max(maxZ, node.z!);
      count++;
    }
    if (!count) return;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    const dim = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 60);
    const cam = fg.camera();
    const fov = (cam.fov * Math.PI) / 180;
    const dist = (dim / 2 / Math.tan(fov / 2)) * 1.3 + 40;
    fg.cameraPosition({ x: cx, y: cy, z: cz + dist }, { x: cx, y: cy, z: cz }, durationMs);
  }

  function handleReady() {
    fitView();
  }

  function linkEndId(v: unknown): string {
    if (typeof v === "string") return v;
    return (v as MemoryNode).id;
  }

  function linkColor(link: { source: unknown; target: unknown }) {
    const hov = hoveredId.current;
    if (!hov) return LINK_BASE;
    const s = linkEndId(link.source);
    const t = linkEndId(link.target);
    return s === hov || t === hov ? CORAL : LINK_FADE;
  }

  function linkWidth(link: { source: unknown; target: unknown }) {
    const hov = hoveredId.current;
    if (!hov) return 0.9;
    const s = linkEndId(link.source);
    const t = linkEndId(link.target);
    return s === hov || t === hov ? 2.2 : 0.6;
  }

  function handleHover(n: MemoryNode | null) {
    hoveredId.current = n?.id ?? null;
    if (wrapRef.current) {
      wrapRef.current.style.cursor = n && interactive ? "pointer" : "grab";
    }
    for (const id of objMap.current.keys()) applyState(id);
    fgRef.current?.refresh?.();
    onHoverNode?.(n);
  }

  return (
    <div ref={wrapRef} className={className} style={{ width: "100%", height: "100%" }}>
      {!ForceGraph3D && (
        <div className="grid h-full w-full place-items-center">
          <span className="spore-dot h-3 w-3 animate-pulse-glow" />
        </div>
      )}
      {ForceGraph3D && size.w > 0 && (
        <ForceGraph3D
          ref={fgRef}
          width={size.w || undefined}
          height={size.h || undefined}
          graphData={data}
          backgroundColor="rgba(0,0,0,0)"
          showNavInfo={false}
          nodeRelSize={1}
          nodeThreeObject={buildNode as never}
          nodeLabel={(() => "") as never}
          enableNodeDrag={interactive}
          onEngineStop={handleReady}
          cooldownTicks={60}
          warmupTicks={160}
          linkColor={linkColor as never}
          linkWidth={linkWidth as never}
          linkDirectionalParticles={0}
          onNodeClick={
            interactive ? (((n: MemoryNode) => onSelectNode?.(n)) as never) : undefined
          }
          onNodeHover={handleHover as never}
        />
      )}
    </div>
  );
}
