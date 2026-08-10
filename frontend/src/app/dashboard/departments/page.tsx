'use client';

import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import DepartmentFormModal from '@/components/DepartmentFormModal';
import SetManagerModal from '@/components/SetManagerModal';
import api from '@/lib/api';

interface Manager {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

interface Department {
  id: number;
  name: string;
  description: string | null;
  manager: Manager | null;
  _count: { users: number };
}

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingData, setEditingData] = useState<Record<string, string> | null>(null);
  const [managerModal, setManagerModal] = useState<{ open: boolean; deptId: number; deptName: string }>({ open: false, deptId: 0, deptName: '' });

  const fetchDepartments = async () => {
    try {
      const { data } = await api.get('/departments');
      setDepartments(data);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDepartments(); }, []);

  const openCreate = () => {
    setEditingData(null);
    setEditingId(null);
    setModalMode('create');
    setModalOpen(true);
  };

  const openEdit = (dept: Department) => {
    setEditingId(dept.id);
    setEditingData({ name: dept.name, description: dept.description || '' });
    setModalMode('edit');
    setModalOpen(true);
  };

  const handleSubmit = async (data: any) => {
    try {
      if (modalMode === 'create') {
        await api.post('/departments', data);
      } else if (editingId) {
        await api.put(`/departments/${editingId}`, data);
      }
      setModalOpen(false);
      setEditingId(null);
      fetchDepartments();
    } catch (err: any) {
      alert(err.response?.data?.error || 'خطا');
    }
  };

  const handleDelete = async (dept: Department) => {
    if (dept._count.users > 0) {
      alert(`این دپارتمان ${dept._count.users} کاربر فعال دارد. ابتدا کاربران را جابجا کنید.`);
      return;
    }
    if (!confirm(`آیا از حذف دپارتمان "${dept.name}" اطمینان دارید؟`)) return;
    try {
      await api.delete(`/departments/${dept.id}`);
      fetchDepartments();
    } catch (err: any) {
      alert(err.response?.data?.error || 'خطا در حذف');
    }
  };

  const handleRemoveManager = async (dept: Department) => {
    if (!confirm(`آیا از حذف مدیریت "${dept.manager?.firstName} ${dept.manager?.lastName}" از دپارتمان "${dept.name}" اطمینان دارید؟`)) return;
    try {
      await api.post(`/departments/${dept.id}/remove-manager`);
      fetchDepartments();
    } catch (err: any) {
      alert(err.response?.data?.error || 'خطا');
    }
  };

  return (
    <ProtectedRoute allowedRoles={['TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'CEO']}>
      <div className="animate-fade-in space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">مدیریت دپارتمان‌ها</h1>
            <p className="text-text-muted text-sm mt-1">ساخت و مدیریت دپارتمان‌های سازمان</p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl font-medium transition-all duration-200"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            دپارتمان جدید
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {loading ? (
            <div className="col-span-full flex items-center justify-center py-20 text-text-muted">در حال بارگذاری...</div>
          ) : departments.length === 0 ? (
            <div className="col-span-full flex items-center justify-center py-20 text-text-muted">هیچ دپارتمانی یافت نشد</div>
          ) : departments.map((dept) => (
            <div
              key={dept.id}
              className="bg-card border border-[rgba(255,255,255,0.06)] rounded-[20px] p-6 hover:bg-card-hover transition-all duration-300 group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(dept)} className="p-2 rounded-xl text-text-muted hover:text-primary hover:bg-primary/5 transition-all" title="ویرایش">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button onClick={() => handleDelete(dept)} className="p-2 rounded-xl text-text-muted hover:text-danger hover:bg-danger/5 transition-all" title="حذف">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              <h3 className="text-lg font-semibold text-white mb-1">{dept.name}</h3>
              <p className="text-sm text-text-muted mb-4 line-clamp-2">{dept.description || 'بدون توضیحات'}</p>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-text-secondary">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span>{dept._count.users} کاربر</span>
                </div>

                <div className="border-t border-[rgba(255,255,255,0.06)] pt-3 mt-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-text-secondary">
                      <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <span className="text-text-muted">مدیر:</span>
                      {dept.manager ? (
                        <span className="text-white">{dept.manager.firstName} {dept.manager.lastName}</span>
                      ) : (
                        <span className="text-text-muted">تعیین نشده</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    {dept.manager ? (
                      <>
                        <button
                          onClick={() => setManagerModal({ open: true, deptId: dept.id, deptName: dept.name })}
                          className="flex-1 py-2 px-3 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 text-xs font-medium transition-all"
                        >
                          تغییر مدیر
                        </button>
                        <button
                          onClick={() => handleRemoveManager(dept)}
                          className="py-2 px-3 rounded-xl bg-danger/10 text-danger hover:bg-danger/20 text-xs font-medium transition-all"
                        >
                          عزل
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setManagerModal({ open: true, deptId: dept.id, deptName: dept.name })}
                        className="w-full py-2 px-3 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 text-xs font-medium transition-all"
                      >
                        تعیین مدیر
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <DepartmentFormModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setEditingId(null); }}
          onSubmit={handleSubmit}
          initialData={editingData || undefined}
          mode={modalMode}
        />

        <SetManagerModal
          open={managerModal.open}
          onClose={() => setManagerModal({ ...managerModal, open: false })}
          departmentId={managerModal.deptId}
          departmentName={managerModal.deptName}
          onSuccess={fetchDepartments}
        />
      </div>
    </ProtectedRoute>
  );
}
