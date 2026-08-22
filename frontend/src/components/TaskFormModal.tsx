'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import TaskRecurrenceConfig, { RecurrenceConfigState } from '@/components/TaskRecurrenceConfig';

interface TaskFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  projectId: number;
  departmentId: number;
}

interface DeptUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

export default function TaskFormModal({ open, onClose, onSaved, projectId, departmentId }: TaskFormModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [users, setUsers] = useState<DeptUser[]>([]);
  const [saving, setSaving] = useState(false);
  const [recurrence, setRecurrence] = useState<RecurrenceConfigState>({
    isRecurring: false,
    recurrencePattern: 'DAILY',
    recurrenceDays: [],
    recurrenceEnd: '',
  });

  useEffect(() => {
    if (open) {
      api.get(`/departments/${departmentId}/users`).then(({ data }) => setUsers(data)).catch(() => {});
      setTitle('');
      setDescription('');
      setAssigneeId('');
      setRecurrence({
        isRecurring: false,
        recurrencePattern: 'DAILY',
        recurrenceDays: [],
        recurrenceEnd: '',
      });
    }
  }, [open, departmentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !assigneeId) return;
    setSaving(true);
    try {
      await api.post('/tasks', {
        title,
        description,
        projectId,
        assigneeIds: [parseInt(assigneeId)],
        isRecurring: recurrence.isRecurring,
        recurrencePattern: recurrence.isRecurring ? recurrence.recurrencePattern : undefined,
        recurrenceDays: recurrence.isRecurring ? recurrence.recurrenceDays : undefined,
        recurrenceEnd: recurrence.isRecurring && recurrence.recurrenceEnd ? recurrence.recurrenceEnd : undefined,
      });
      onSaved();
    } catch (err: any) {
      alert(err.response?.data?.error || 'خطا');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const inputClass = "w-full px-4 py-2.5 bg-[rgba(22,27,38,0.6)] border border-[rgba(255,255,255,0.08)] rounded-xl text-white placeholder-text-muted focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all duration-200";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-[rgba(255,255,255,0.06)] rounded-[20px] w-full max-w-xl max-h-[90vh] overflow-y-auto animate-scale-in">
        <div className="sticky top-0 bg-card border-b border-[rgba(255,255,255,0.06)] px-6 py-4 flex items-center justify-between rounded-t-[20px] z-10">
          <h2 className="text-lg font-semibold text-white">تسک جدید</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-text-muted hover:text-white hover:bg-card-hover transition-all">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">عنوان تسک *</label>
            <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="مثال: طراحی هدر سایت" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">توضیحات</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={`${inputClass} min-h-[80px] resize-none`} placeholder="توضیحات (اختیاری)" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">انجام‌دهنده *</label>
            <select required value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={inputClass}>
              <option value="">انتخاب کارمند</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.email})</option>
              ))}
            </select>
          </div>

          <TaskRecurrenceConfig value={recurrence} onChange={setRecurrence} />

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white rounded-xl font-medium transition-all duration-200">
              {saving ? 'در حال ذخیره...' : 'ایجاد تسک'}
            </button>
            <button type="button" onClick={onClose} className="px-6 py-2.5 bg-card-hover text-text-secondary hover:text-white rounded-xl font-medium transition-all duration-200">
              انصراف
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
