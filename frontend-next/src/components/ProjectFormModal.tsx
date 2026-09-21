'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';

interface ProjectData {
  id: number;
  name: string;
  description: string | null;
  client: string | null;
  departmentId: number;
  department?: { id: number; name: string };
}

interface ProjectFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  project?: ProjectData | null;
}

interface Department {
  id: number;
  name: string;
}

export default function ProjectFormModal({ open, onClose, onSaved, project }: ProjectFormModalProps) {
  const isEdit = !!project;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [client, setClient] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      api.get('/departments').then(({ data }) => setDepartments(data)).catch(() => {});
      if (project) {
        setName(project.name);
        setDescription(project.description || '');
        setClient(project.client || '');
        setDepartmentId(String(project.departmentId));
      } else {
        setName('');
        setDescription('');
        setClient('');
        setDepartmentId('');
      }
    }
  }, [open, project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !departmentId) return;
    setSaving(true);
    try {
      const body = { name, description, client, departmentId: parseInt(departmentId) };
      if (isEdit) {
        await api.put(`/projects/${project!.id}`, body);
      } else {
        await api.post('/projects', body);
      }
      onSaved();
    } catch (err: any) {
      alert(err.response?.data?.error || 'خطا');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const inputClass = "w-full px-4 py-2.5 bg-card border border-line rounded-xl text-fg placeholder-text-muted focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all duration-200";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-line rounded-[20px] w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scale-in">
        <div className="sticky top-0 bg-card border-b border-line px-6 py-4 flex items-center justify-between rounded-t-[20px] z-10">
          <h2 className="text-lg font-semibold text-fg">{isEdit ? 'ویرایش پروژه' : 'پروژه جدید'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-fg-muted hover:text-fg hover:bg-card-hover transition-all">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-1.5">نام پروژه *</label>
            <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="مثال: سایت فروشگاهی" />
          </div>
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-1.5">توضیحات</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={`${inputClass} min-h-[80px] resize-none`} placeholder="توضیحات پروژه" />
          </div>
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-1.5">کارفرما</label>
            <input type="text" value={client} onChange={(e) => setClient(e.target.value)} className={inputClass} placeholder="نام کارفرما (اختیاری)" />
          </div>
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-1.5">دپارتمان *</label>
            <select required value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className={inputClass}>
              <option value="">انتخاب دپارتمان</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit" disabled={saving}
              className="flex-1 py-2.5 bg-pill hover:opacity-90 disabled:opacity-40 text-pill-fg rounded-xl font-medium transition-all duration-200"
            >
              {saving ? 'در حال ذخیره...' : isEdit ? 'ذخیره تغییرات' : 'ایجاد پروژه'}
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
