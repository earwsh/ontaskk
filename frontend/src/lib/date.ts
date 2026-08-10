import { toGregorian, toJalaali } from 'jalaali-js';

export function shamsiToGregorian(str: string): string {
  const parts = str.split('/').map(Number);
  if (parts.length !== 3) return str;
  const [jy, jm, jd] = parts;
  const g = toGregorian(jy, jm, jd);
  const year = g.gy;
  const month = String(g.gm).padStart(2, '0');
  const day = String(g.gd).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function gregorianToShamsi(dateStr: string): string {
  if (!dateStr) return '';
  const cleanDateStr = dateStr.split('T')[0];
  const parts = cleanDateStr.split('-').map(Number);
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    const j = toJalaali(parts[0], parts[1], parts[2]);
    return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
  }
  const d = new Date(dateStr);
  const j = toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
}

export function todayShamsi(): string {
  const now = new Date();
  const j = toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
}
