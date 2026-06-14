import { initialsFor } from '../../lib/palette.js';

/** Pastel identity circle: hue = person, initials carry the meaning without color. */
export function Avatar({ address, hue, label, size = 'sm', ownerRing = false, title }: {
  address: string;
  hue: string;
  label?: string | null;
  size?: 'sm' | 'lg';
  ownerRing?: boolean;
  title?: string;
}) {
  return (
    <span
      className={`avatar${size === 'lg' ? ' lg' : ''}${ownerRing ? ' owner-ring' : ''}`}
      style={{ background: hue }}
      title={title ?? address}
      aria-label={title ?? `member ${address}`}
    >
      {initialsFor(label, address)}
    </span>
  );
}
