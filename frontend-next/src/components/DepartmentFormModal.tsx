'use client';

import { useState, useEffect } from 'react';

interface DepartmentFormData {
  name: string;
  description: string;
}

interface DepartmentFormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: DepartmentFormData) => void;
  initialData?: Partial<DepartmentFormData>;
  mode: 'create' | 'edit';
}

const emptyForm: DepartmentFormData = { name: '', description: '' };

export default function DepartmentFormModal({ open, onClose, onSubmit, initialData, mode }: DepartmentFormModalProps) {
  const [form, setForm] = useState<DepartmentFormData>(emptyForm);

  useEffect(() => {
    if (initialData) {
      setForm({ ...emptyForm, ...initialData });
    } else {
      setForm(emptyForm);
    }
  }, [initialData, open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  const inputClass = "w-full px-4 py-2.5 bg-card border border-line rounded-xl text-fg placeholder-text-muted focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all duration-200";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-line rounded-[20px] w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scale-in">
        <div className="sticky top-0 bg-card border-b border-line px-6 py-4 flex items-center justify-between rounded-t-[20px] z-10">
          <h2 className="text-lg font-semibold text-fg">
            {mode === 'create' ? 'دپارتمان جدید' : 'ویرایش دپارتمان'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-fg-muted hover:text-fg hover:bg-card-hover transition-all">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-1.5">نام دپارتمان *</label>
            <input
              type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputClass} placeholder="مثال: فنی"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-1.5">توضیحات</label>
            <textarea
              value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={`${inputClass} min-h-[100px] resize-none`} placeholder="توضیحات (اختیاری)"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="flex-1 py-2.5 bg-pill hover:opacity-90 text-pill-fg rounded-xl font-medium transition-all duration-200"
            >
              {mode === 'create' ? 'ایجاد دپارتمان' : 'ذخیره تغییرات'}
            </button>
            <button
              type="button" onClick={onClose}
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
