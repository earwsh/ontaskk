'use client';

import { useState, useEffect } from 'react';
import DatePicker from 'react-multi-date-picker';
import persian from 'react-date-object/locales/persian_fa';
import persianCalendar from 'react-date-object/calendars/persian';
import 'react-multi-date-picker/styles/layouts/mobile.css';
import api from '@/lib/api';
import { assignableRoles } from '@/lib/roles';

const roles = assignableRoles;

interface Department {
  id: number;
  name: string;
}

interface UserFormData {
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  password: string;
  role: string;
  position: string;
  nationalId: string;
  departmentIds: number[];
  phone: string;
  birthDate: string;
  startDate: string;
}

interface UserFormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: UserFormData) => void;
  initialData?: Partial<UserFormData>;
  mode: 'create' | 'edit';
}

const emptyForm: UserFormData = {
  firstName: '', lastName: '', displayName: '', email: '', password: '',
  role: 'EMPLOYEE', position: '', nationalId: '', departmentIds: [], phone: '',
  birthDate: '', startDate: '',
};

export default function UserFormModal({ open, onClose, onSubmit, initialData, mode }: UserFormModalProps) {
  const [form, setForm] = useState<UserFormData>(emptyForm);
  const [departments, setDepartments] = useState<Department[]>([]);

  useEffect(() => {
    api.get('/departments').then(({ data }) => setDepartments(data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (initialData) {
      setForm({ ...emptyForm, ...initialData, password: '' });
    } else {
      setForm(emptyForm);
    }
  }, [initialData, open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  const set = (key: keyof UserFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [key]: e.target.value });

  const inputClass = "w-full px-4 py-2.5 bg-card border border-line rounded-xl text-fg placeholder-text-muted focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all duration-200";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-line rounded-[20px] w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-scale-in">
        <div className="sticky top-0 bg-card border-b border-line px-6 py-4 flex items-center justify-between rounded-t-[20px] z-10">
          <h2 className="text-lg font-semibold text-fg">
            {mode === 'create' ? 'کاربر جدید' : 'ویرایش کاربر'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-fg-muted hover:text-fg hover:bg-card-hover transition-all">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1.5">نام *</label>
              <input type="text" required value={form.firstName} onChange={set('firstName')} className={inputClass} placeholder="نام" />
            </div>
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1.5">نام خانوادگی *</label>
              <input type="text" required value={form.lastName} onChange={set('lastName')} className={inputClass} placeholder="نام خانوادگی" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-1.5">نام نمایشی</label>
            <input type="text" value={form.displayName} onChange={set('displayName')} className={inputClass} placeholder="نام نمایشی (اختیاری)" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1.5">ایمیل *</label>
              <input type="email" required value={form.email} onChange={set('email')} className={inputClass} dir="ltr" placeholder="example@email.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1.5">
                رمز عبور {mode === 'create' ? '*' : '(اختیاری)'}
              </label>
              <input
                type="password"
                required={mode === 'create'}
                value={form.password}
                onChange={set('password')}
                className={inputClass}
                dir="ltr"
                placeholder={mode === 'edit' ? 'رمز جدید' : '••••••••'}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1.5">نقش *</label>
              <select value={form.role} onChange={set('role')} className={inputClass}>
                {roles.map((r) => (
                  <option key={r.value} value={r.value} className="bg-card">{r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1.5">سمت</label>
              <input type="text" value={form.position} onChange={set('position')} className={inputClass} placeholder="سمت (اختیاری)" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1.5">کد ملی</label>
              <input type="text" value={form.nationalId} onChange={set('nationalId')} className={inputClass} dir="ltr" placeholder="کد ملی (اختیاری)" />
            </div>
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1.5">دپارتمان‌ها</label>
              <div className="space-y-2 max-h-40 overflow-y-auto p-3 bg-card border border-line rounded-xl">
                {departments.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.departmentIds.includes(d.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setForm({ ...form, departmentIds: [...form.departmentIds, d.id] });
                        } else {
                          setForm({ ...form, departmentIds: form.departmentIds.filter((id) => id !== d.id) });
                        }
                      }}
                      className="rounded border-line bg-card text-brand focus:ring-primary/30"
                    />
                    <span className="text-sm text-fg">{d.name}</span>
                  </label>
                ))}
                {departments.length === 0 && <span className="text-xs text-fg-muted">دپارتمانی وجود ندارد</span>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1.5">تاریخ تولد</label>
              <DatePicker
                value={form.birthDate ? new Date(form.birthDate + 'T00:00:00') : undefined}
                onChange={(date: any) => {
                  if (date) {
                    const d = date instanceof Date ? date : date.toDate();
                    setForm({ ...form, birthDate: d.toISOString().split('T')[0] });
                  }
                }}
                calendar={persianCalendar}
                locale={persian}
                calendarPosition="bottom-right"
                inputClass={inputClass}
                containerClassName="w-full"
                format="YYYY/MM/DD"
                placeholder="تاریخ تولد"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-fg-secondary mb-1.5">تاریخ شروع به کار</label>
              <DatePicker
                value={form.startDate ? new Date(form.startDate + 'T00:00:00') : undefined}
                onChange={(date: any) => {
                  if (date) {
                    const d = date instanceof Date ? date : date.toDate();
                    setForm({ ...form, startDate: d.toISOString().split('T')[0] });
                  }
                }}
                calendar={persianCalendar}
                locale={persian}
                calendarPosition="bottom-right"
                inputClass={inputClass}
                containerClassName="w-full"
                format="YYYY/MM/DD"
                placeholder="تاریخ شروع به کار"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-1.5">تلفن</label>
            <input type="text" value={form.phone} onChange={set('phone')} className={inputClass} dir="ltr" placeholder="09123456789" />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="flex-1 py-2.5 bg-pill hover:opacity-90 text-pill-fg rounded-xl font-medium transition-all duration-200"
            >
              {mode === 'create' ? 'ایجاد کاربر' : 'ذخیره تغییرات'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 bg-card-hover text-fg-secondary hover:text-fg rounded-xl font-medium transition-all duration-200"
            >
              انصراف
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
