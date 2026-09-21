'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Project = { id: number; name: string; department?: { name: string } | null };

type ProjectPickerProps = {
  projects: Project[];
  /** Selected ids in order. The first is the task's own project; the rest each get their own copy. */
  value: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
};

/**
 * Project selection for the new-task form.
 *
 * The list is unbounded — 45 projects today and growing — so the previous
 * dropdown plus a row of 44 toggle buttons made the form hard to read and gave
 * no way to find a project except scanning it. This narrows by typing instead.
 *
 * Chosen projects stay visible as chips inside the field, with the caret
 * sitting after the last one: the same shape as a recipient field, which is
 * what tells someone another project can still be added without a label
 * spelling it out.
 */
export default function ProjectPicker({ projects, value, onChange, disabled }: ProjectPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const selected = value.map((id) => byId.get(id)).filter(Boolean) as Project[];

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects
      .filter((p) => !value.includes(p.id))
      .filter((p) => !q || `${p.name} ${p.department?.name ?? ''}`.toLowerCase().includes(q));
  }, [projects, value, query]);

  useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocPointerDown);
    return () => document.removeEventListener('mousedown', onDocPointerDown);
  }, [open]);

  // Keyboard navigation is useless if the highlighted row is scrolled out of sight.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const add = (id: number) => {
    onChange([...value, id]);
    setQuery('');
    setActive(0);
    setOpen(true);
    inputRef.current?.focus();
  };

  const remove = (id: number) => {
    onChange(value.filter((x) => x !== id));
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      if (!matches.length) return;
      setActive((i) => (e.key === 'ArrowDown' ? (i + 1) % matches.length : (i - 1 + matches.length) % matches.length));
      return;
    }
    if (e.key === 'Enter') {
      // The field lives inside a form; Enter here picks a project, it does not submit.
      if (open && matches[active]) { e.preventDefault(); add(matches[active].id); }
      return;
    }
    if (e.key === 'Escape' && open) { e.preventDefault(); setOpen(false); return; }
    // Backspace on an empty query walks back through the chips, the way a
    // recipient field does — otherwise removing one means reaching for the mouse.
    if (e.key === 'Backspace' && !query && value.length) { e.preventDefault(); remove(value[value.length - 1]); }
  };

  return (
    <div ref={boxRef} className="relative">
      <div
        onClick={() => { if (!disabled) { setOpen(true); inputRef.current?.focus(); } }}
        className={`flex min-h-[46px] w-full flex-wrap items-center gap-1.5 rounded-tile bg-sunken px-2.5 py-2 transition-colors ${
          disabled ? 'opacity-60' : 'cursor-text focus-within:bg-hover'
        }`}
      >
        {selected.map((p, i) => (
          <span
            key={p.id}
            className={`flex items-center gap-1.5 rounded-full py-1 pl-3 pr-1.5 text-xs font-medium ${
              i === 0 ? 'bg-pill text-pill-fg' : 'bg-hover text-fg ring-1 ring-inset ring-border'
            }`}
          >
            {p.name}
            {!disabled && (
              <button
                type="button"
                aria-label={`حذف ${p.name}`}
                onClick={(e) => { e.stopPropagation(); remove(p.id); }}
                className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-sm leading-none opacity-70 transition-opacity hover:opacity-100"
              >
                ×
              </button>
            )}
          </span>
        ))}

        <input
          ref={inputRef}
          value={query}
          disabled={disabled}
          // Reset with the query, not in an effect: a stale index would
          // highlight one row and add another.
          onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={selected.length ? 'پروژه دیگری اضافه کنید…' : 'نام پروژه را بنویسید یا انتخاب کنید…'}
          className="min-w-[10rem] flex-1 bg-transparent px-1.5 py-1 text-sm text-fg outline-none placeholder:text-fg-muted"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
        />
      </div>

      {open && !disabled && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute z-30 mt-1.5 max-h-60 w-full overflow-auto rounded-tile bg-card p-1 shadow-lg ring-1 ring-border"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2.5 text-xs text-fg-muted">
              {query.trim() ? 'پروژه‌ای با این نام پیدا نشد' : 'همه پروژه‌ها انتخاب شده‌اند'}
            </li>
          ) : (
            matches.map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  data-active={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => add(p.id)}
                  className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-tile px-3 py-2 text-right text-sm transition-colors ${
                    i === active ? 'bg-hover text-fg' : 'text-fg-secondary'
                  }`}
                >
                  <span>{p.name}</span>
                  {p.department?.name && <span className="text-[10px] text-fg-muted">{p.department.name}</span>}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
