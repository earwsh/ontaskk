import { categoryIcon } from '@/lib/rejectionCategories';

/** The 24x24 stroke icon for a rejection category, or nothing for an unrecorded one. */
export default function CategoryIcon({ category, className = 'h-3.5 w-3.5' }: {
  category: string | null | undefined;
  className?: string;
}) {
  const d = categoryIcon(category);
  if (!d) return null;
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}
