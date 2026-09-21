'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Avatar from '@/components/ui/Avatar';
import Skeleton from '@/components/ui/Skeleton';
import api from '@/lib/api';
import { roleLabel } from '@/lib/roles';
import { displayNameOf, getCachedUser } from '@/lib/currentUser';
import PerformanceSummary from '@/components/profile/PerformanceSummary';

export default function ColleagueProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === 'string' ? parseInt(params.id) : 0;

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // Your own profile is the editable one; do not show a read-only copy of it.
    if (getCachedUser()?.id === id) {
      router.replace('/dashboard/profile');
      return;
    }
    api.get(`/users/${id}/profile`)
      .then(({ data }) => setUser(data))
      .catch((err) => setError(err?.response?.status === 404 ? 'کاربر پیدا نشد' : 'خطا در دریافت پروفایل'))
      .finally(() => setLoading(false));
  }, [id, router]);

  if (loading) {
    return (
      <div className="space-y-3 py-5">
        <Skeleton className="h-32 w-full rounded-card" />
        <Skeleton className="h-40 w-full rounded-card" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <p className="py-10 text-center text-sm text-fg-muted">{error}</p>
      </Card>
    );
  }

  const name = displayNameOf(user);
  const departments: string[] = (user.departmentMemberships || [])
    .map((m: any) => m.department?.name)
    .filter(Boolean);
  const shared = (user.projects || []).filter((p: any) => p.shared);
  const others = (user.projects || []).filter((p: any) => !p.shared);

  return (
    <ProtectedRoute>
      <div className="space-y-3 py-5">
        <Card>
          <div className="flex flex-wrap items-center gap-4">
            <Avatar name={name} size={72} src={user.avatarUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-bold text-fg">{name}</p>
              <p className="mt-0.5 truncate text-xs text-fg-muted">{user.position || 'بدون سمت'}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge tone="brand">{roleLabel(user.role)}</Badge>
                {departments.map((d) => <Badge key={d} tone="neutral">{d}</Badge>)}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
            {user.email && (
              <a href={`mailto:${user.email}`} dir="ltr"
                 className="tnum rounded-full bg-sunken px-3.5 py-2 text-xs text-fg-secondary transition-colors hover:bg-hover hover:text-fg">
                {user.email}
              </a>
            )}
            {user.phone && (
              <a href={`tel:${user.phone}`} dir="ltr"
                 className="tnum rounded-full bg-sunken px-3.5 py-2 text-xs text-fg-secondary transition-colors hover:bg-hover hover:text-fg">
                {user.phone}
              </a>
            )}
            <Link href="/dashboard/chat"
                  className="rounded-full bg-pill px-3.5 py-2 text-xs font-medium text-pill-fg transition-opacity hover:opacity-90">
              پیام
            </Link>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Card>
            <h2 className="text-sm font-semibold text-fg">پروژه‌ها</h2>
            {shared.length === 0 && others.length === 0 ? (
              <p className="py-8 text-center text-xs text-fg-muted">عضو پروژه‌ای نیست</p>
            ) : (
              <div className="mt-3 space-y-3">
                {shared.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[11px] text-fg-muted">پروژه‌های مشترک با شما</p>
                    <div className="flex flex-wrap gap-1.5">
                      {shared.map((p: any) => (
                        <Link key={p.id} href={`/dashboard/projects/${p.id}`}>
                          <Badge tone="brand">{p.name}</Badge>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {others.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[11px] text-fg-muted">سایر پروژه‌ها</p>
                    <div className="flex flex-wrap gap-1.5">
                      {others.map((p: any) => (
                        <Link key={p.id} href={`/dashboard/projects/${p.id}`}>
                          <Badge tone="neutral">{p.name}</Badge>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Renders nothing when the viewer is not entitled to these numbers. */}
          <PerformanceSummary userId={id} title={`عملکرد ${name}`} />
        </div>
      </div>
    </ProtectedRoute>
  );
}
