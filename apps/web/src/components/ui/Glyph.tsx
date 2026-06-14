import type { NodeType } from '@mycelia/core';

/** Designed monochrome type glyphs (spec §4) — one icon style, 1.5px stroke.
    Replaces the old dingbat/emoji glyphs. Renders as inline SVG (UI) via
    <TypeGlyph/> or as raw SVG children for use inside the graph <svg> via
    glyphPaths(). */

export const TYPE_LABEL: Record<NodeType, string> = {
  skill: 'Skill',
  project: 'Project',
  person: 'Person',
  concept: 'Concept',
  communication: 'Communication',
};

/** Path data drawn in a 24x24 box, stroke-based. */
export function glyphPaths(type: NodeType): JSX.Element {
  switch (type) {
    case 'skill': // spark
      return <path d="M12 4v5M12 15v5M4 12h5M15 12h5" />;
    case 'project': // square frame
      return <rect x="6" y="6" width="12" height="12" rx="2" />;
    case 'person': // head + shoulders
      return <><circle cx="12" cy="9" r="3.2" /><path d="M5.5 19c1.4-3 4-4.2 6.5-4.2s5.1 1.2 6.5 4.2" /></>;
    case 'concept': // open circle + dot
      return <><circle cx="12" cy="12" r="6.5" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /></>;
    case 'communication': // chat
      return <path d="M5 7.5A2.5 2.5 0 017.5 5h9A2.5 2.5 0 0119 7.5v6a2.5 2.5 0 01-2.5 2.5H10l-4 3.5V7.5z" />;
  }
}

export function lockPaths(): JSX.Element {
  return <><rect x="7" y="11" width="10" height="8" rx="1.5" /><path d="M9 11V8.5a3 3 0 016 0V11" /></>;
}

export function TypeGlyph({ type, size = 14 }: { type: NodeType; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {glyphPaths(type)}
    </svg>
  );
}
