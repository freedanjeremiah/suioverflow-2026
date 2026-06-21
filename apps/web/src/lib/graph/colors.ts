import type { MemoryNode, NodeType } from "./types";

// Clean, flat categorical palette that reads well on a white canvas.
// Coral (Rausch) leads; the rest are muted but distinct. No glow.
const PALETTE = [
  "#ff385c", // coral / Rausch
  "#0f8a86", // teal
  "#c47d00", // amber
  "#7b4ddc", // violet
  "#2f9e57", // green
  "#c2255c", // rose
];

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Deterministic per-owner color, from the flat palette.
export function ownerColor(owner: string): string {
  return PALETTE[hashString(owner) % PALETTE.length];
}

// color a node from its owner (used by the 3D canvas in "owner" mode)
export function nodeColor(node: MemoryNode): string {
  return ownerColor(node.owner);
}

// type accent maps to a design token var
const TYPE_VAR: Record<NodeType, string> = {
  skill: "var(--spore-lime)",
  project: "var(--spore-gold)",
  person: "var(--spore-rose)",
  concept: "var(--spore-fox)",
  moment: "var(--spore-violet)",
};

export function typeColor(type: NodeType): string {
  return TYPE_VAR[type];
}

// ----- WebGL-safe hex colors for three.js -----
// (kept the old name so callers don't change; the `light` arg is now ignored)
export function ownerColorHex(owner: string, _light = 0.62): string {
  void _light;
  return ownerColor(owner);
}

const TYPE_HEX: Record<NodeType, string> = {
  skill: "#2f9e57",
  project: "#c47d00",
  person: "#c2255c",
  concept: "#0f8a86",
  moment: "#7b4ddc",
};

export function typeColorHex(type: NodeType): string {
  return TYPE_HEX[type];
}
