'use client';

import ShamsiDatePicker from './ShamsiDatePicker';

export type RecurrencePattern = 'DAILY' | 'WEEKLY' | 'MONTHLY_DAYS' | 'ODD_DAYS' | 'EVEN_DAYS';

export interface RecurrenceConfigState {
  isRecurring: boolean;
  recurrencePattern: RecurrencePattern;
  recurrenceDays: number[];
  recurrenceEnd: string;
}

interface TaskRecurrenceConfigProps {
  value: RecurrenceConfigState;
  onChange: (value: RecurrenceConfigState) => void;
  compact?: boolean;
}

const WEEK_DAYS = [
  { id: 0, label: 'شنبه', short: 'ش' },
  { id: 1, label: '۱شنبه', short: 'ی' },
  { id: 2, label: '۲شنبه', short: 'د' },
  { id: 3, label: '۳شنبه', short: 'س' },
  { id: 4, label: '۴شنبه', short: 'چ' },
  { id: 5, label: '۵شنبه', short: 'پ' },
  { id: 6, label: 'جمعه', short: 'ج' },
];

const PATTERNS: { id: RecurrencePattern; label: string; desc: string; icon: string }[] = [
  {
    id: 'DAILY',
    label: 'روزانه',
    desc: 'هر روز تکرار شود',
    icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    id: 'WEEKLY',
    label: 'هفتگی',
    desc: 'در روزهای مشخص هفته',
    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  },
  {
    id: 'MONTHLY_DAYS',
    label: 'روزهای ماه',
    desc: 'روزهای خاص از ماه شمسی',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  },
  {
    id: 'ODD_DAYS',
    label: 'روزهای فرد',
    desc: 'روزهای ۱، ۳، ۵، ۷، ۹، ... ماه شمسی',
    icon: 'M7 20l4-16m2 16l4-16M6 9h14M4 15h14',
  },
  {
    id: 'EVEN_DAYS',
    label: 'روزهای زوج',
    desc: 'روزهای ۲، ۴، ۶، ۸، ۱۰، ... ماه شمسی',
    icon: 'M4 6h16M4 12h16M4 18h16',
  },
];

export default function TaskRecurrenceConfig({ value, onChange, compact = false }: TaskRecurrenceConfigProps) {
  const toggleRecurring = (enabled: boolean) => {
    onChange({
      ...value,
      isRecurring: enabled,
      recurrencePattern: value.recurrencePattern || 'DAILY',
    });
  };

  const setPattern = (pattern: RecurrencePattern) => {
    onChange({
      ...value,
      recurrencePattern: pattern,
      recurrenceDays: pattern === 'WEEKLY' ? value.recurrenceDays : pattern === 'MONTHLY_DAYS' ? value.recurrenceDays : [],
    });
  };

  const toggleWeekDay = (day: number) => {
    const current = value.recurrenceDays || [];
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort((a, b) => a - b);
    onChange({ ...value, recurrenceDays: next });
  };

  const toggleMonthDay = (day: number) => {
    const current = value.recurrenceDays || [];
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort((a, b) => a - b);
    onChange({ ...value, recurrenceDays: next });
  };

  const setRecurrenceEnd = (date: string) => {
    onChange({ ...value, recurrenceEnd: date });
  };

  return (
    <div className="bg-[rgba(22,27,38,0.4)] border border-[rgba(255,255,255,0.06)] rounded-2xl p-4 space-y-4">
      {/* Header Toggle */}
      <div
        onClick={() => toggleRecurring(!value.isRecurring)}
        className="flex items-center justify-between cursor-pointer select-none group"
      >
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
            value.isRecurring ? 'bg-primary/20 text-primary' : 'bg-[rgba(255,255,255,0.06)] text-text-muted group-hover:text-white'
          }`}>
            <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <div>
            <span className="text-sm font-semibold text-white block group-hover:text-primary-hover transition-colors">
              تکرار خودکار تسک
            </span>
            <span className="text-[11px] text-text-muted">
              ایجاد اتوماتیک نمونه‌های این تسک طبق زمان‌بندی مشخص
            </span>
          </div>
        </div>

        <button
          type="button"
          dir="ltr"
          role="switch"
          aria-checked={value.isRecurring}
          onClick={(e) => {
            e.stopPropagation();
            toggleRecurring(!value.isRecurring);
          }}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            value.isRecurring ? 'bg-primary' : 'bg-[rgba(255,255,255,0.15)]'
          }`}
        >
          <span
            aria-hidden="true"
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
              value.isRecurring ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Recurrence Details */}
      {value.isRecurring && (
        <div className="space-y-4 pt-2 border-t border-[rgba(255,255,255,0.06)] animate-fade-in">
          {/* Pattern Selection Grid */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-2">نوع تکرار</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {PATTERNS.map((p) => {
                const active = value.recurrencePattern === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPattern(p.id)}
                    className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer flex flex-col justify-between ${
                      active
                        ? 'border-primary bg-primary/10 text-white shadow-[0_0_12px_rgba(99,102,241,0.2)]'
                        : 'border-[rgba(255,255,255,0.06)] bg-[rgba(22,27,38,0.5)] text-text-secondary hover:text-white hover:border-[rgba(255,255,255,0.12)]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold">{p.label}</span>
                      <svg className={`w-3.5 h-3.5 ${active ? 'text-primary' : 'text-text-muted'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={p.icon} />
                      </svg>
                    </div>
                    <span className="text-[10px] text-text-muted line-clamp-2 leading-tight">{p.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sub-options based on pattern */}
          {value.recurrencePattern === 'WEEKLY' && (
            <div className="p-3 bg-[rgba(22,27,38,0.6)] rounded-xl border border-[rgba(255,255,255,0.04)] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-secondary font-medium">روزهای تکرار در هفته:</span>
                <span className="text-[11px] text-text-muted">
                  {value.recurrenceDays?.length
                    ? `${value.recurrenceDays.length} روز انتخاب شده`
                    : 'هر هفته در همان روز ایجاد تسک'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {WEEK_DAYS.map((d) => {
                  const selected = value.recurrenceDays?.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleWeekDay(d.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                        selected
                          ? 'bg-primary text-white shadow-sm'
                          : 'bg-[rgba(255,255,255,0.05)] text-text-muted hover:text-white hover:bg-[rgba(255,255,255,0.1)]'
                      }`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {value.recurrencePattern === 'MONTHLY_DAYS' && (
            <div className="p-3 bg-[rgba(22,27,38,0.6)] rounded-xl border border-[rgba(255,255,255,0.04)] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-secondary font-medium">روزهای ماه شمسی (۱ تا ۳۱):</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onChange({ ...value, recurrenceDays: [1, 15] })}
                    className="text-[10px] text-primary hover:underline cursor-pointer"
                  >
                    ۱ و ۱۵ هر ماه
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ ...value, recurrenceDays: [1, 15, 30] })}
                    className="text-[10px] text-primary hover:underline cursor-pointer"
                  >
                    ۱، ۱۵ و ۳۰
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-7 sm:grid-cols-11 md:grid-cols-16 gap-1">
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => {
                  const selected = value.recurrenceDays?.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleMonthDay(d)}
                      className={`h-7 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center justify-center ${
                        selected
                          ? 'bg-primary text-white shadow-sm font-bold'
                          : 'bg-[rgba(255,255,255,0.05)] text-text-muted hover:text-white hover:bg-[rgba(255,255,255,0.1)]'
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {value.recurrencePattern === 'ODD_DAYS' && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 font-bold text-sm">
                فرد
              </div>
              <p className="text-xs text-amber-200/90 leading-relaxed">
                این تسک در تمامی <strong>روزهای فرد ماه شمسی</strong> (روزهای ۱، ۳، ۵، ۷، ۹، ۱۱، ۱۳، ۱۵، ۱۷، ۱۹، ۲۱، ۲۳، ۲۵، ۲۷، ۲۹ و ۳۱) به صورت خودکار ایجاد و به اعضا محول خواهد شد.
              </p>
            </div>
          )}

          {value.recurrencePattern === 'EVEN_DAYS' && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 font-bold text-sm">
                زوج
              </div>
              <p className="text-xs text-emerald-200/90 leading-relaxed">
                این تسک در تمامی <strong>روزهای زوج ماه شمسی</strong> (روزهای ۲، ۴، ۶، ۸، ۱۰، ۱۲، ۱۴، ۱۶، ۱۸، ۲۰، ۲۲، ۲۴، ۲۶، ۲۸ و ۳۰) به صورت خودکار ایجاد و به اعضا محول خواهد شد.
              </p>
            </div>
          )}

          {/* End Date */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                پایان تکرار (اختیاری)
              </label>
              <ShamsiDatePicker
                value={value.recurrenceEnd}
                onChange={setRecurrenceEnd}
                placeholder="بدون تاریخ انقضا (همیشگی)"
              />
            </div>
            <div className="text-[11px] text-text-muted md:pt-4">
              در صورت خالی بودن، تسک تا زمان توقف یا حذف آن توسط مدیر به تکرار خود ادامه می‌دهد.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
