export interface JalaaliDate {
  jy: number;
  jm: number;
  jd: number;
}

export function toJalaali(gy: number, gm: number, gd: number): JalaaliDate {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    365 * gy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) -
    80 +
    gd +
    g_d_m[gm - 1];
  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return { jy, jm, jd };
}

export function toGregorian(jy: number, jm: number, jd: number) {
  let gy = jy <= 979 ? 621 : 1600;
  jy -= jy <= 979 ? 0 : 979;
  let days =
    365 * jy +
    Math.floor(jy / 33) * 8 +
    Math.floor(((jy % 33) + 3) / 4) +
    78 +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  gy += 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const gd_m = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  // `days` is zero-based here; the day of month is one more. Walking the
  // months on `days` itself returned every date one day early — 1 Shahrivar
  // 1405 came back as 22 August instead of 23 — so a Jalali month bucket
  // started a day before the month it named.
  let gd = days + 1;
  let gm = 0;
  while (gm < 13 && gd > gd_m[gm]) {
    gd -= gd_m[gm];
    gm++;
  }
  return { gy, gm, gd };
}

/**
 * Returns Persian weekday:
 * 0 = شنبه (Saturday)
 * 1 = یکشنبه (Sunday)
 * 2 = دوشنبه (Monday)
 * 3 = سه‌شنبه (Tuesday)
 * 4 = چهارشنبه (Wednesday)
 * 5 = پنج‌شنبه (Thursday)
 * 6 = جمعه (Friday)
 */
export function getPersianWeekday(date: Date): number {
  return (date.getDay() + 1) % 7;
}

export function getPersianDateInfo(date: Date = new Date()) {
  const gy = date.getFullYear();
  const gm = date.getMonth() + 1;
  const gd = date.getDate();
  const jalaali = toJalaali(gy, gm, gd);
  const weekday = getPersianWeekday(date);
  return {
    ...jalaali,
    weekday,
    isOddDay: jalaali.jd % 2 !== 0,
    isEvenDay: jalaali.jd % 2 === 0,
    formatted: `${jalaali.jy}/${String(jalaali.jm).padStart(2, '0')}/${String(jalaali.jd).padStart(2, '0')}`,
  };
}
