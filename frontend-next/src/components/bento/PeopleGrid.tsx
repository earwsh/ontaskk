'use client';

import Link from 'next/link';
import Avatar from '../ui/Avatar';

export interface Person {
  id: number;
  name: string;
  role?: string;
  avatarUrl?: string | null;
}

/**
 * People shown as faces, not as a list. A wrapping grid reads as "the team"
 * at a glance; names live in the tooltip so the tiles stay uniform.
 */
export default function PeopleGrid({ people, max = 14 }: { people: Person[]; max?: number }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;

  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href="/dashboard/users"
        aria-label="افزودن کاربر"
        title="افزودن کاربر"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-sunken text-fg-muted transition-colors hover:bg-hover hover:text-fg"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </Link>

      {shown.map((p) => (
        <Link
          key={p.id}
          href={`/dashboard/profile/${p.id}`}
          title={p.role ? `${p.name} — ${p.role}` : p.name}
          className="transition-transform duration-200 hover:-translate-y-0.5"
        >
          <Avatar name={p.name} size={44} src={p.avatarUrl} />
        </Link>
      ))}

      {rest > 0 && (
        <Link
          href="/dashboard/users"
          title={`${rest} نفر دیگر`}
          className="tnum flex h-11 w-11 items-center justify-center rounded-full bg-panel-strong text-xs font-bold text-fg-secondary transition-colors hover:bg-hover"
        >
          +{rest}
        </Link>
      )}
    </div>
  );
}
