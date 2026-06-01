// Event log — append-only notify feed. MYCELIA_SPEC §2.4 / §9 (Flow F).
import type { EventLogEntry, EventKind, SuiAddress, NodeId, NodeType } from './types.js';

export function makeEvent(params: {
  seq: number;
  actor: SuiAddress;
  kind: EventKind;
  nodeId?: NodeId;
  title?: string;
  type?: NodeType;
  depthFromRoot?: number;
  ts: number;
}): EventLogEntry {
  return { ...params };
}

/** Append entries, assigning monotonically increasing seq numbers. */
export function appendEvents(log: EventLogEntry[], newEntries: Omit<EventLogEntry, 'seq'>[]): EventLogEntry[] {
  let seq = log.reduce((m, e) => Math.max(m, e.seq), 0);
  const appended = newEntries.map((e) => ({ ...e, seq: ++seq }));
  return [...log, ...appended];
}

/** Relevance score 0..1 of an event to a viewer's set of root titles (cheap lexical sim). */
export function relevance(entry: EventLogEntry, rootTitles: string[]): number {
  if (!entry.title || rootTitles.length === 0) return 0;
  const toks = (s: string) => new Set(s.toLowerCase().split(/\W+/).filter(Boolean));
  const a = toks(entry.title);
  let best = 0;
  for (const t of rootTitles) {
    const b = toks(t);
    let inter = 0;
    for (const x of a) if (b.has(x)) inter++;
    const denom = Math.max(1, Math.min(a.size, b.size));
    best = Math.max(best, inter / denom);
  }
  return Math.min(1, best);
}
