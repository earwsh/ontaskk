'use client';

import { useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { assignableRoles } from '@/lib/roles';

const roles = assignableRoles;

export default function RegisterPage() {
  const [form, setForm] = useState({ email: '', password: '', firstName: '', lastName: '', role: 'EMPLOYEE', department: '', phone: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', form);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      window.location.href = '/dashboard';
    } catch (err: any) {
      setError(err.response?.data?.error || 'خطا در ثبت نام');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-surface">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.08),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(6,182,212,0.05),transparent_50%)]" />

      <div className="relative w-full max-w-md animate-slide-up">
        <div className="bg-card border border-line rounded-[20px] p-8 md:p-10">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 mb-4">
              <svg className="w-6 h-6 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-fg">تسکان</h1>
            <p className="text-fg-muted text-sm mt-1">مدیریت کارمندان</p>
          </div>

          <h2 className="text-lg font-semibold text-fg mb-6 text-center">ثبت نام</h2>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-fg-secondary mb-1.5">نام</label>
                <input
                  type="text"
                  required
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  className="w-full px-4 py-2.5 bg-card border border-line rounded-xl text-fg placeholder-text-muted focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all duration-200"
                  placeholder="نام"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-fg-secondary mb-1.5">نام خانوادگی</label>
                <input
                  type="text"
                  required
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  className="w-full px-4 py-2.5 bg-card border border-line rounded-xl text-fg placeholder-text-muted focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all duration-200"
                  placeholder="نام خانوادگی"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1.5">ایمیل</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-4 py-2.5 bg-card border border-line rounded-xl text-fg placeholder-text-muted focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all duration-200"
                dir="ltr"
                placeholder="example@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1.5">رمز عبور</label>
              <input
                type="password"
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-4 py-2.5 bg-card border border-line rounded-xl text-fg placeholder-text-muted focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all duration-200"
                dir="ltr"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1.5">نقش</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full px-4 py-2.5 bg-card border border-line rounded-xl text-fg focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all duration-200"
              >
                {roles.map((r) => (
                  <option key={r.value} value={r.value} className="bg-card">{r.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1.5">دپارتمان</label>
              <input
                type="text"
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                className="w-full px-4 py-2.5 bg-card border border-line rounded-xl text-fg placeholder-text-muted focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all duration-200"
                placeholder="دپارتمان (اختیاری)"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1.5">تلفن</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-4 py-2.5 bg-card border border-line rounded-xl text-fg placeholder-text-muted focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all duration-200"
                dir="ltr"
                placeholder="09123456789"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-pill hover:opacity-90 text-pill-fg rounded-xl font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'در حال ثبت نام...' : 'ثبت نام'}
            </button>
          </form>

          <p className="text-sm text-fg-muted text-center mt-6">
            حساب کاربری دارید؟{' '}
            <Link href="/login" className="text-brand-ink hover:text-brand transition-colors">
              ورود
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
