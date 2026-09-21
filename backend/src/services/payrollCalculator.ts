import prisma from '../lib/prisma';
import { toGregorian } from '../lib/jalaali';
import { JALALI_MONTHS } from './employeeStats';

export interface MonthDateRange {
  startDate: Date;
  endDate: Date;
  title: string;
  periodKey: string;
}

/**
 * Calculates start and end Date in UTC (Tehran offset adjusted) for a given Jalali month key (e.g. '1405-07').
 */
export function getJalaliMonthRange(periodKey: string): MonthDateRange {
  const [jy, jm] = periodKey.split('-').map(Number);
  if (!jy || !jm || jm < 1 || jm > 12) {
    throw new Error('Invalid period key format. Expected YYYY-MM (e.g. 1405-07)');
  }

  const gStart = toGregorian(jy, jm, 1);
  const startDate = new Date(Date.UTC(gStart.gy, gStart.gm - 1, gStart.gd, 0, 0, 0) - 3.5 * 3600 * 1000);

  // Month length in Jalali
  let daysInMonth = 30;
  if (jm <= 6) daysInMonth = 31;
  else if (jm === 12) {
    // Leap year check for Jalali
    const isLeap = ((jy - (jy > 0 ? 474 : 473)) % 2820 + 474 + 38) * 682 % 2816 < 682;
    daysInMonth = isLeap ? 30 : 29;
  }

  const gEnd = toGregorian(jy, jm, daysInMonth);
  const endDate = new Date(Date.UTC(gEnd.gy, gEnd.gm - 1, gEnd.gd, 23, 59, 59, 999) - 3.5 * 3600 * 1000);
  const title = `حقوق ${JALALI_MONTHS[jm - 1]} ${jy}`;

  return { startDate, endDate, title, periodKey };
}

/**
 * Standard working minutes in a regular month (26 working days * 8 hours = 208 hours = 12,480 minutes).
 */
export const STANDARD_MONTHLY_WORKING_MINUTES = 12480;

export interface EmployeePayrollCalculation {
  userId: number;
  userName: string;
  role: string;
  baseSalary: number;
  hourlyRate: number;
  workedMinutes: number;
  overtimeMinutes: number;
  tasksCompleted: number;
  overtimeAmount: number;
  bonusesAmount: number;
  advancesDeduction: number;
  penaltiesAmount: number;
  grossPayable: number;
  netPayable: number;
  bankIban: string | null;
  advanceIds: number[];
}

/**
 * Calculates payroll inputs for all eligible employees for a given period.
 */
export async function calculatePeriodPayroll(periodKey: string): Promise<{
  range: MonthDateRange;
  employees: EmployeePayrollCalculation[];
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
}> {
  const range = getJalaliMonthRange(periodKey);

  // 1. Fetch active employees (excluding CUSTOMER role)
  const users = await prisma.user.findMany({
    where: {
      role: { not: 'CUSTOMER' },
    },
    include: {
      financialProfile: true,
      userAdvances: {
        where: {
          status: { in: ['APPROVED', 'PAID'] },
          OR: [
            { recoveryPeriod: periodKey },
            { recoveryPeriod: null },
          ],
        },
      },
    },
    orderBy: { firstName: 'asc' },
  });

  const userIds = users.map((u) => u.id);

  // 2. Fetch completed tasks and minutes in this Jalali date window
  type TaskStat = {
    userId: number;
    doneCount: bigint;
    totalMinutes: bigint;
  };

  const taskStats = await prisma.$queryRawUnsafe<TaskStat[]>(
    `SELECT a."userId"                                              AS "userId",
            COUNT(t."id")                                           AS "doneCount",
            COALESCE(SUM(t."estimatedHours" * 60 + t."estimatedMinutes"), 0) AS "totalMinutes"
       FROM "TaskAssignee" a
       JOIN "Task" t ON t."id" = a."taskId"
      WHERE a."userId" = ANY($1::int[])
        AND t."status" = 'DONE'
        AND NOT (t."isRecurring" = true AND t."recurringParentId" IS NULL)
        AND COALESCE(t."approvedAt", a."completedAt", t."updatedAt") >= $2
        AND COALESCE(t."approvedAt", a."completedAt", t."updatedAt") <= $3
      GROUP BY a."userId"`,
    userIds,
    range.startDate,
    range.endDate
  );

  const statsMap = new Map<number, { doneCount: number; totalMinutes: number }>();
  for (const s of taskStats) {
    statsMap.set(s.userId, {
      doneCount: Number(s.doneCount),
      totalMinutes: Number(s.totalMinutes),
    });
  }

  let totalGross = 0;
  let totalDeductions = 0;
  let totalNet = 0;

  const employees: EmployeePayrollCalculation[] = [];

  for (const user of users) {
    const profile = user.financialProfile;
    // Default base salary: 15,000,000 Tomans if not set in profile
    const baseSalary = profile?.baseSalary && profile.baseSalary > 0 ? profile.baseSalary : 15000000;
    // Hourly rate derived from base salary / 160 hours or profile override
    const hourlyRate = profile?.hourlyRate && profile.hourlyRate > 0 ? profile.hourlyRate : Math.round(baseSalary / 160);

    const stat = statsMap.get(user.id) || { doneCount: 0, totalMinutes: 0 };
    const workedMinutes = stat.totalMinutes;
    const tasksCompleted = stat.doneCount;

    // Overtime: minutes above standard working minutes
    const overtimeMinutes = Math.max(0, workedMinutes - STANDARD_MONTHLY_WORKING_MINUTES);
    const overtimeAmount = Math.round((overtimeMinutes / 60) * hourlyRate * 1.4); // 1.4x overtime rate

    // Advances to be deducted in this period
    const applicableAdvances = user.userAdvances || [];
    const advancesDeduction = applicableAdvances.reduce((sum, a) => sum + a.amount, 0);
    const advanceIds = applicableAdvances.map((a) => a.id);

    const bonusesAmount = 0;
    const penaltiesAmount = 0;

    const grossPayable = baseSalary + overtimeAmount + bonusesAmount;
    const netPayable = Math.max(0, grossPayable - (advancesDeduction + penaltiesAmount));

    totalGross += grossPayable;
    totalDeductions += advancesDeduction + penaltiesAmount;
    totalNet += netPayable;

    const fullStaffName = [user.firstName, user.lastName].filter(Boolean).map((s: string) => s.trim()).join(' ') || user.displayName?.trim() || 'پرسنل';

    employees.push({
      userId: user.id,
      userName: fullStaffName,
      role: user.role,
      baseSalary,
      hourlyRate,
      workedMinutes,
      overtimeMinutes,
      tasksCompleted,
      overtimeAmount,
      bonusesAmount,
      advancesDeduction,
      penaltiesAmount,
      grossPayable,
      netPayable,
      bankIban: profile?.bankIban || null,
      advanceIds,
    });
  }

  return {
    range,
    employees,
    totalGross,
    totalDeductions,
    totalNet,
  };
}
