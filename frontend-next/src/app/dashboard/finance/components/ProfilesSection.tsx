'use client';

import { useState, useEffect, useCallback } from 'react';
import Card from '@/components/ui/Card';
import { useToast } from '@/components/Toast';
import api from '@/lib/api';

interface EmployeeWithProfile {
  id: number;
  firstName: string;
  lastName: string;
  displayName?: string | null;
  role: string;
  position?: string | null;
  nationalId?: string | null;
  financialProfile?: {
    id: number;
    baseSalary: number;
    hourlyRate?: number | null;
    bankIban?: string | null;
    bankCardNumber?: string | null;
    bankName?: string | null;
    maxAdvanceLimit?: number | null;
    notes?: string | null;
  } | null;
}

export default function ProfilesSection() {
  const { showToast } = useToast();
  const [employees, setEmployees] = useState<EmployeeWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<EmployeeWithProfile | null>(null);

  // Edit form state
  const [nationalId, setNationalId] = useState('');
  const [baseSalary, setBaseSalary] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [bankIban, setBankIban] = useState('');
  const [bankCardNumber, setBankCardNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [maxAdvanceLimit, setMaxAdvanceLimit] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/finance/profiles');
      setEmployees(data || []);
    } catch {
      showToast('خطا در دریافت پروفایل‌های مالی پرسنل', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const handleOpenEdit = (emp: EmployeeWithProfile) => {
    setSelectedUser(emp);
    const p = emp.financialProfile;
    setNationalId(emp.nationalId || '');
    setBaseSalary(p?.baseSalary ? String(p.baseSalary) : '15000000');
    setHourlyRate(p?.hourlyRate ? String(p.hourlyRate) : '');
    setBankIban(p?.bankIban || '');
    setBankCardNumber(p?.bankCardNumber || '');
    setBankName(p?.bankName || '');
    setMaxAdvanceLimit(p?.maxAdvanceLimit ? String(p.maxAdvanceLimit) : '5000000');
    setNotes(p?.notes || '');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    setSaving(true);
    try {
      await api.put(`/finance/profiles/${selectedUser.id}`, {
        nationalId: nationalId.trim() || undefined,
        baseSalary: Number(baseSalary.replace(/,/g, '')) || 0,
        hourlyRate: hourlyRate ? Number(hourlyRate.replace(/,/g, '')) : undefined,
        bankIban: bankIban.trim() || undefined,
        bankCardNumber: bankCardNumber.trim() || undefined,
        bankName: bankName.trim() || undefined,
        maxAdvanceLimit: maxAdvanceLimit ? Number(maxAdvanceLimit.replace(/,/g, '')) : undefined,
        notes: notes.trim() || undefined,
      });

      const fullName = [selectedUser.firstName, selectedUser.lastName].filter(Boolean).map(s => s.trim()).join(' ');
      showToast(`تنظیمات حقوق ${fullName} با موفقیت ذخیره شد`, 'success');
      setSelectedUser(null);
      fetchProfiles();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'خطا در ذخیره اطلاعات', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-fg">پروفایل مالی و تعریف حقوق پرسنل</h2>
          <p className="text-xs text-fg-muted mt-0.5">
            در این بخش پایه حقوق ماهانه، شماره شبا و سقف مجاز مساعده هر یک از پرسنل تعیین می‌شود.
          </p>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="border-b border-line bg-sunken text-fg-secondary font-medium">
                <th className="py-3 px-4">نام و نام خانوادگی</th>
                <th className="py-3 px-4">شماره پرسنلی (کد ملی)</th>
                <th className="py-3 px-4">سمت و نقش</th>
                <th className="py-3 px-4">پایه حقوق ماهانه (تومان)</th>
                <th className="py-3 px-4">سقف مجاز مساعده</th>
                <th className="py-3 px-4">شماره شبا و حساب</th>
                <th className="py-3 px-4 text-center">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-fg-secondary">در حال دریافت اطلاعات...</td>
                </tr>
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-fg-secondary">پرسنلی یافت نشد.</td>
                </tr>
              ) : (
                employees.map((emp) => {
                  const fullName = [emp.firstName, emp.lastName].filter(Boolean).map((s: string) => s.trim()).join(' ') || emp.displayName || 'پرسنل';
                  const prof = emp.financialProfile;
                  const salary = prof?.baseSalary || 15000000;
                  const advanceLimit = prof?.maxAdvanceLimit || 5000000;
                  return (
                    <tr key={emp.id} className="hover:bg-hover transition-colors">
                      <td className="py-3 px-4 font-bold text-fg">
                        <div>{fullName}</div>
                        {emp.displayName && (
                          <div className="text-[10px] font-normal text-fg-muted">({emp.displayName})</div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono font-medium text-fg">
                        {emp.nationalId ? emp.nationalId : <span className="text-fg-muted text-[11px]">ثبت نشده</span>}
                      </td>
                      <td className="py-3 px-4 text-fg-secondary">
                        <div>{emp.position || '—'}</div>
                        <div className="text-[10px] text-fg-muted">{emp.role}</div>
                      </td>
                      <td className="py-3 px-4 font-mono font-extrabold text-fg">
                        {salary.toLocaleString('fa-IR')}
                      </td>
                      <td className="py-3 px-4 font-mono text-fg-secondary">
                        {advanceLimit.toLocaleString('fa-IR')}
                      </td>
                      <td className="py-3 px-4 text-fg-secondary font-mono text-[11px] dir-ltr text-right max-w-xs truncate">
                        {prof?.bankIban || '—'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleOpenEdit(emp)}
                          className="rounded-lg bg-card border border-line px-3 py-1 text-xs font-semibold text-fg hover:bg-hover shadow-flat transition-colors cursor-pointer"
                        >
                          تنظیم حقوق
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Edit Profile Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-card border border-line p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h3 className="text-base font-extrabold text-fg">
                  تنظیم مشخصات حقوق {selectedUser.firstName} {selectedUser.lastName}
                </h3>
                <p className="text-xs text-fg-muted mt-0.5">
                  کد ملی / پرسنلی: {selectedUser.nationalId || 'ثبت نشده'} • نقش: {selectedUser.role}
                </p>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="rounded-full p-1 text-fg-muted hover:text-fg hover:bg-hover"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-fg mb-1">شماره پرسنلی (کد ملی ۱۰ رقمی)</label>
                <input
                  type="text"
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value)}
                  placeholder="مثال: ۰۰۱۸۴۷۵۹۲۳"
                  maxLength={10}
                  className="w-full rounded-tile bg-sunken px-3.5 py-2.5 text-xs text-fg focus:bg-hover outline-none font-mono dir-ltr text-right"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-fg mb-1">پایه حقوق ماهانه (تومان) *</label>
                  <input
                    type="text"
                    required
                    value={Number(baseSalary.replace(/,/g, '')).toLocaleString('fa-IR')}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/[^0-9]/g, '');
                      setBaseSalary(clean);
                    }}
                    placeholder="۱۵,۰۰۰,۰۰۰"
                    className="w-full rounded-tile bg-sunken px-3.5 py-2.5 text-xs text-fg focus:bg-hover outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-fg mb-1">سقف مجاز مساعده ماهانه (تومان)</label>
                  <input
                    type="text"
                    value={maxAdvanceLimit ? Number(maxAdvanceLimit.replace(/,/g, '')).toLocaleString('fa-IR') : ''}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/[^0-9]/g, '');
                      setMaxAdvanceLimit(clean);
                    }}
                    placeholder="۵,۰۰۰,۰۰۰"
                    className="w-full rounded-tile bg-sunken px-3.5 py-2.5 text-xs text-fg focus:bg-hover outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-fg mb-1">نام بانک</label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="مثال: بانک سامان، ملت، پاسارگاد"
                    className="w-full rounded-tile bg-sunken px-3.5 py-2.5 text-xs text-fg focus:bg-hover outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-fg mb-1">شماره کارت ۱۶ رقمی</label>
                  <input
                    type="text"
                    value={bankCardNumber}
                    onChange={(e) => setBankCardNumber(e.target.value)}
                    placeholder="۶۰۳۷-۹۹۷۵-..."
                    className="w-full rounded-tile bg-sunken px-3.5 py-2.5 text-xs text-fg focus:bg-hover outline-none font-mono dir-ltr text-right"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-fg mb-1">شماره شبا (IBAN برای واریز پایا)</label>
                <input
                  type="text"
                  value={bankIban}
                  onChange={(e) => setBankIban(e.target.value)}
                  placeholder="IR..."
                  className="w-full rounded-tile bg-sunken px-3.5 py-2.5 text-xs text-fg focus:bg-hover outline-none font-mono dir-ltr text-right"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-fg mb-1">یادداشت اداری / شرایط قرارداد</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="توضیحات و یادداشت‌های مربوط به قرارداد یا نحوه محاسبه..."
                  className="w-full rounded-tile bg-sunken px-3.5 py-2.5 text-xs text-fg focus:bg-hover outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-line">
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  className="rounded-full bg-card border border-line px-4 py-2 text-xs font-medium text-fg-secondary hover:text-fg shadow-flat"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-full bg-pill px-5 py-2 text-xs font-bold text-pill-fg shadow-flat hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? 'در حال ذخیره...' : 'ذخیره تنظیمات حقوق'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
