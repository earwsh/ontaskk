'use client';

import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import UserFormModal from '@/components/UserFormModal';
import api from '@/lib/api';

interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  role: string;
  position: string | null;
  nationalId: string | null;
  departmentMemberships: { department: { id: number; name: string } }[];
  phone: string | null;
  birthDate: string | null;
  startDate: string | null;
  createdAt: string;
}

const roleBadge: Record<string, string> = {
  CEO: 'bg-purple-500/20 text-purple-400',
  HR_MANAGER: 'bg-blue-500/20 text-blue-400',
  TECHNICAL_MANAGER: 'bg-cyan-500/20 text-cyan-400',
  STRATEGY_MANAGER: 'bg-violet-500/20 text-violet-400',
  DEPARTMENT_MANAGER: 'bg-amber-500/20 text-amber-400',
  EMPLOYEE: 'bg-green-500/20 text-green-400',
  CUSTOMER: 'bg-slate-500/20 text-slate-400',
};

const roleLabel: Record<string, string> = {
  CEO: 'مدیر عامل',
  HR_MANAGER: 'مدیر منابع انسانی',
  TECHNICAL_MANAGER: 'مدیر فنی',
  STRATEGY_MANAGER: 'مدیر استراتژی',
  DEPARTMENT_MANAGER: 'مدیر دپارتمان',
  EMPLOYEE: 'کارمند',
  CUSTOMER: 'مشتری',
};

function toJalali(dateStr: string | null) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('fa-IR');
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [editingUser, setEditingUser] = useState<any>(null);

  const fetchUsers = async () => {
    try {
      const { data } = await api.get('/users');
      setUsers(data);
    } catch {
      // redirect handled by api interceptor
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const openCreate = () => {
    setEditingUser(null);
    setModalMode('create');
    setModalOpen(true);
  };

  const openEdit = (user: User) => {
    setEditingUserId(user.id);
    setEditingUser({
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.displayName || '',
      email: user.email,
      role: user.role,
      position: user.position || '',
      nationalId: user.nationalId || '',
      departmentIds: user.departmentMemberships?.map((m) => m.department.id) || [],
      phone: user.phone || '',
      birthDate: user.birthDate ? user.birthDate.split('T')[0] : '',
      startDate: user.startDate ? user.startDate.split('T')[0] : '',
    } as any);
    setModalMode('edit');
    setModalOpen(true);
  };

  const handleSubmit = async (data: any) => {
    try {
      if (modalMode === 'create') {
        await api.post('/users', data);
      } else if (editingUserId) {
        await api.put(`/users/${editingUserId}`, data);
      }
      setModalOpen(false);
      setEditingUserId(null);
      fetchUsers();
    } catch (err: any) {
      alert(err.response?.data?.error || 'خطا');
    }
  };

  const handleDelete = async (user: User) => {
    if (!confirm(`آیا از حذف "${user.firstName} ${user.lastName}" اطمینان دارید؟`)) return;
    try {
      await api.delete(`/users/${user.id}`);
      fetchUsers();
    } catch (err: any) {
      alert(err.response?.data?.error || 'خطا در حذف');
    }
  };

  return (
    <ProtectedRoute allowedRoles={['CEO', 'HR_MANAGER']}>
      <div className="animate-fade-in space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">مدیریت کاربران</h1>
            <p className="text-text-muted text-sm mt-1">مدیریت کاربران و دسترسی‌های سیستم</p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl font-medium transition-all duration-200"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            کاربر جدید
          </button>
        </div>

        <div className="bg-card border border-[rgba(255,255,255,0.06)] rounded-[20px] overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-text-muted">در حال بارگذاری...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgba(255,255,255,0.06)]">
                    <th className="text-right px-4 py-3 text-text-muted font-medium whitespace-nowrap">نام</th>
                    <th className="text-right px-4 py-3 text-text-muted font-medium whitespace-nowrap">نام نمایشی</th>
                    <th className="text-right px-4 py-3 text-text-muted font-medium whitespace-nowrap">کد ملی</th>
                    <th className="text-right px-4 py-3 text-text-muted font-medium whitespace-nowrap">نقش</th>
                    <th className="text-right px-4 py-3 text-text-muted font-medium whitespace-nowrap">سمت</th>
                    <th className="text-right px-4 py-3 text-text-muted font-medium whitespace-nowrap">تاریخ تولد</th>
                    <th className="text-right px-4 py-3 text-text-muted font-medium whitespace-nowrap">شروع به کار</th>
                    <th className="text-right px-4 py-3 text-text-muted font-medium whitespace-nowrap">دپارتمان</th>
                    <th className="text-right px-4 py-3 text-text-muted font-medium whitespace-nowrap">تلفن</th>
                    <th className="text-right px-4 py-3 text-text-muted font-medium whitespace-nowrap">ایمیل</th>
                    <th className="text-center px-4 py-3 text-text-muted font-medium whitespace-nowrap">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-[rgba(255,255,255,0.03)] hover:bg-card-hover transition-colors">
                      <td className="px-4 py-3 text-white whitespace-nowrap">{user.firstName} {user.lastName}</td>
                      <td className="px-4 py-3 text-text-secondary whitespace-nowrap">{user.displayName || '-'}</td>
                      <td className="px-4 py-3 text-text-secondary whitespace-nowrap font-mono dir-ltr">{user.nationalId || '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-medium ${roleBadge[user.role] || 'bg-gray-500/20 text-gray-400'}`}>
                          {roleLabel[user.role] || user.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-text-secondary whitespace-nowrap">{user.position || '-'}</td>
                      <td className="px-4 py-3 text-text-secondary whitespace-nowrap">{toJalali(user.birthDate)}</td>
                      <td className="px-4 py-3 text-text-secondary whitespace-nowrap">{toJalali(user.startDate)}</td>
                      <td className="px-4 py-3 text-text-secondary whitespace-nowrap">
                        {user.departmentMemberships?.map((m) => m.department.name).join(', ') || '-'}
                      </td>
                      <td className="px-4 py-3 text-text-secondary whitespace-nowrap">{user.phone || '-'}</td>
                      <td className="px-4 py-3 text-text-secondary whitespace-nowrap dir-ltr text-xs">{user.email}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => openEdit(user)} className="p-2 rounded-xl text-text-muted hover:text-primary hover:bg-primary/5 transition-all" title="ویرایش">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button onClick={() => handleDelete(user)} className="p-2 rounded-xl text-text-muted hover:text-danger hover:bg-danger/5 transition-all" title="حذف">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <UserFormModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setEditingUserId(null); }}
          onSubmit={handleSubmit}
          initialData={editingUser || undefined}
          mode={modalMode}
        />
      </div>
    </ProtectedRoute>
  );
}
