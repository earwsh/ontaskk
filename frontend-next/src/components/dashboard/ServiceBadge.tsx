'use client';

interface ServiceBadgeProps {
  name: string;
  ok: boolean;
}

export default function ServiceBadge({ name, ok }: ServiceBadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ${
      ok ? 'border-green-500/20 bg-green-500/5 text-green-400' : 'border-line bg-sunken text-fg-muted'
    }`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-green-400' : 'bg-text-muted'}`} />
      {name} {ok ? 'فعال' : 'غیرفعال'}
    </span>
  );
}
