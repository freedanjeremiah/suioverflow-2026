// Member identity palette (spec §4): each session member claims one of the
// five pastel hues, deterministically — owner first, then address order.
// The same hue drives avatars, feed dots, and graph nodes, so color = person
// everywhere. Outside a session (local-only views) we fall back to a stable
// address-hash hue.

export const PASTELS = [
  'var(--mint)',
  'var(--lavender)',
  'var(--peach)',
  'var(--sky)',
  'var(--rose)',
] as const;

const LOCKED = 'var(--surface-strong)';

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Stable hue for a member within a session (owner first, then address order). */
export function memberHue(address: string, members: string[] = [], owner?: string): string {
  const a = address.toLowerCase();
  const sorted = [...new Set(members.map((m) => m.toLowerCase()))].sort();
  if (owner) {
    const o = owner.toLowerCase();
    const i = sorted.indexOf(o);
    if (i > 0) { sorted.splice(i, 1); sorted.unshift(o); }
  }
  const idx = sorted.indexOf(a);
  if (idx === -1) return PASTELS[hashStr(a) % PASTELS.length]!;
  return PASTELS[idx % PASTELS.length]!;
}

export const lockedHue = () => LOCKED;

/** Initials for an avatar: email -> first letter(s); 0x address -> first hex pair. */
export function initialsFor(label: string | null | undefined, address: string): string {
  if (label && label.includes('@')) {
    const name = label.split('@')[0]!;
    const parts = name.split(/[._-]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  if (label && label.trim() && !label.startsWith('0x') && !label.startsWith('did:')) {
    return label.trim().slice(0, 2).toUpperCase();
  }
  return address.replace(/^0x/, '').slice(0, 2).toUpperCase();
}

export function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}
