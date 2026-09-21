'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';

interface DeptUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

interface SetManagerModalProps {
  open: boolean;
  onClose: () => void;
  departmentId: number;
  departmentName: string;
  onSuccess: () => void;
}

export default function SetManagerModal({ open, onClose, departmentId, departmentName, onSuccess }: SetManagerModalProps) {
  const [users, setUsers] = useState<DeptUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && departmentId) {
      api.get(`/departments/${departmentId}/users`)
        .then(({ data }) => setUsers(data))
        .catch(() => {});
    }
  }, [open, departmentId]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;
    setLoading(true);
    setError('');
    try {
      await api.post(`/departments/${departmentId}/set-manager`, { userId: parseInt(selectedUserId) });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'خطا');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full px-4 py-2.5 bg-card border border-line rounded-xl text-fg placeholder-text-muted focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all duration-200";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-line rounded-[20px] w-full max-w-lg animate-scale-in">
        <div className="border-b border-line px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-fg">تعیین مدیر برای {departmentName}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-fg-muted hover:text-fg hover:bg-card-hover transition-all">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm text-center">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-1.5">کاربران این دپارتمان</label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className={inputClass}
              required
            >
              <option value="" className="bg-card">انتخاب کاربر...</option>
              {users.map((u) => (
                <option key={u.id} value={u.id} className="bg-card">
                  {u.firstName} {u.lastName} ({u.email})
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading || !selectedUserId}
              className="flex-1 py-2.5 bg-pill hover:opacity-90 text-pill-fg rounded-xl font-medium transition-all duration-200 disabled:opacity-50"
            >
              {loading ? 'در حال ذخیره...' : 'تعیین به عنوان مدیر'}
            </button>
            <button type="button" onClick={onClose} className="px-6 py-2.5 bg-card-hover text-fg-secondary hover:text-fg rounded-xl font-medium transition-all duration-200">
              انصراف
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
