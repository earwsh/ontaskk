'use client';

import DatePicker, { DateObject } from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';

interface ShamsiDatePickerProps {
  value: string;
  onChange: (gregorianDate: string) => void;
  placeholder?: string;
}

export default function ShamsiDatePicker({ value, onChange, placeholder }: ShamsiDatePickerProps) {
  const dateValue = value
    ? new DateObject(value).setCalendar(persian).setLocale(persian_fa)
    : undefined;

  return (
    <DatePicker
      calendar={persian}
      locale={persian_fa}
      value={dateValue}
      onChange={(date: DateObject | null) => {
        if (date) {
          const g = date.toDate();
          // Avoid timezone offset shift by formatting local Date object parts
          const year = g.getFullYear();
          const month = String(g.getMonth() + 1).padStart(2, '0');
          const day = String(g.getDate()).padStart(2, '0');
          // If date picker returns Gregorian date after conversion:
          // dateObject with persian calendar date.toDate() returns Gregorian JS Date
          onChange(`${year}-${month}-${day}`);
        } else {
          onChange('');
        }
      }}
      placeholder={placeholder || 'انتخاب تاریخ'}
      inputClass="w-full px-4 py-2.5 bg-card border border-line rounded-xl text-fg placeholder-text-muted focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all duration-200"
      calendarPosition="bottom-right"
      render={(value: string, openCalendar: () => void) => (
        <input
          readOnly
          value={value}
          onFocus={openCalendar}
          onClick={openCalendar}
          placeholder={placeholder || 'انتخاب تاریخ'}
          className="w-full px-4 py-2.5 bg-card border border-line rounded-xl text-fg placeholder-text-muted focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all duration-200 cursor-pointer"
        />
      )}
    />
  );
}
