declare module 'jalaali-js' {
  interface JalaaliDate {
    jy: number;
    jm: number;
    jd: number;
  }

  interface GregorianDate {
    gy: number;
    gm: number;
    gd: number;
  }

  export function toGregorian(jy: number, jm: number, jd: number): GregorianDate;
  export function toJalaali(gy: number, gm: number, gd: number): JalaaliDate;
  export function isValidJalaaliDate(jy: number, jm: number, jd: number): boolean;
  export function isLeapJalaaliYear(jy: number): boolean;
  export function jalaaliMonthLength(jy: number, jm: number): number;
  export function jalCal(jy: number): any;
  export function j2d(jy: number, jm: number, jd: number): number;
  export function d2j(jdn: number): JalaaliDate;
  export function g2d(gy: number, gm: number, gd: number): number;
  export function d2g(jdn: number): GregorianDate;
  export function jalaaliToDateObject(jy: number, jm: number, jd: number): Date;
  export function jalaaliWeek(jy: number, jm: number, jd: number): number;
}
