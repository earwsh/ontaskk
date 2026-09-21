'use client';

/**
 * Deterministic colour per person: the same name always yields the same hue,
 * so faces stay recognisable across the app without storing an image.
 */
// Twelve well-spaced hues; lightness and saturation come from the theme so
// the same avatar stays legible on a white card and on a navy one.
const HUES = [222, 258, 292, 330, 8, 26, 44, 96, 150, 172, 190, 204];

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '؟';
  if (parts.length === 1) return parts[0].charAt(0);
  return parts[0].charAt(0) + parts[1].charAt(0);
}

import { useState } from 'react';

interface AvatarProps {
  name: string;
  size?: number;
  className?: string;
  /** Draws a ring in the surface colour — for overlapping avatar stacks. */
  ringed?: boolean;
  /** Uploaded photo. The initials stay the fallback when it is absent. */
  src?: string | null;
}

export default function Avatar({ name, size = 32, className = '', ringed = false, src }: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const hue = HUES[hash(name) % HUES.length];

  if (src && !imgError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- uploads are served
      // straight from the API host, not through the image optimiser.
      <img
        src={src}
        alt={name}
        title={name}
        width={size}
        height={size}
        onError={() => setImgError(true)}
        className={`inline-block shrink-0 rounded-full object-cover ${className}`}
        style={{
          width: size,
          height: size,
          boxShadow: ringed ? '0 0 0 2px var(--card)' : undefined,
        }}
      />
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${className}`}
      style={{
        width: size,
        height: size,
        background: `hsl(${hue} var(--avatar-s) var(--avatar-bg-l))`,
        color: `hsl(${hue} var(--avatar-s) var(--avatar-fg-l))`,
        fontSize: Math.max(10, Math.round(size * 0.4)),
        boxShadow: ringed ? '0 0 0 2px var(--card)' : undefined,
      }}
      title={name}
    >
      {initialsOf(name)}
    </span>
  );
}
