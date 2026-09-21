'use client';

import Avatar from './Avatar';

export interface AvatarUser {
  id?: number;
  name: string;
  avatarUrl?: string | null;
}

interface AvatarStackProps {
  /** List of users with optional avatarUrl and id */
  users?: AvatarUser[];
  /** Legacy: list of names */
  names?: string[];
  max?: number;
  size?: number;
}

/** Overlapping avatars with a "+n" chip, supporting both avatarUrl and name fallbacks with tooltip. */
export default function AvatarStack({ users, names, max = 4, size = 28 }: AvatarStackProps) {
  const items: AvatarUser[] = users
    ? users
    : (names || []).map((name) => ({ name }));

  if (!items.length) return null;

  const shown = items.slice(0, max);
  const rest = items.slice(max);

  return (
    <div className="flex items-center" dir="ltr">
      {shown.map((user, i) => (
        <span
          key={user.id ? `user-${user.id}` : `${user.name}-${i}`}
          title={user.name}
          className="transition-transform hover:z-10 hover:scale-105"
          style={{ marginInlineStart: i === 0 ? 0 : -Math.round(size * 0.28) }}
        >
          <Avatar name={user.name} size={size} ringed src={user.avatarUrl} />
        </span>
      ))}
      {rest.length > 0 && (
        <span
          title={rest.map((u) => u.name).join('، ')}
          className="tnum inline-flex items-center justify-center rounded-full bg-panel-strong font-bold text-fg-secondary transition-transform hover:z-10 hover:scale-105 cursor-default"
          style={{
            width: size,
            height: size,
            marginInlineStart: -Math.round(size * 0.28),
            fontSize: Math.max(10, Math.round(size * 0.36)),
            boxShadow: '0 0 0 2px var(--card)',
          }}
        >
          +{rest.length}
        </span>
      )}
    </div>
  );
}
