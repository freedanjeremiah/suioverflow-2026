// Canonical (de)serialization for the units that get encrypted/published.
// Stable key order -> deterministic bytes (same content => same plaintext).
import type { NodeVersion, Manifest, EventLogEntry } from './types.js';

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}
function sortKeys(v: any): any {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) out[k] = sortKeys(v[k]);
    return out;
  }
  return v;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export function encodeNodeVersion(nv: NodeVersion): Uint8Array { return enc.encode(stableStringify(nv)); }
export function decodeNodeVersion(bytes: Uint8Array): NodeVersion { return JSON.parse(dec.decode(bytes)) as NodeVersion; }

export function encodeManifest(m: Manifest): Uint8Array { return enc.encode(stableStringify(m)); }
export function decodeManifest(bytes: Uint8Array): Manifest { return JSON.parse(dec.decode(bytes)) as Manifest; }

export function encodeEvents(entries: EventLogEntry[]): Uint8Array { return enc.encode(stableStringify(entries)); }
export function decodeEvents(bytes: Uint8Array): EventLogEntry[] {
  const v = JSON.parse(dec.decode(bytes));
  return Array.isArray(v) ? (v as EventLogEntry[]) : [];
}
