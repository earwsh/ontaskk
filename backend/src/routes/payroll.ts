import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { calculatePeriodPayroll, getJalaliMonthRange } from '../services/payrollCalculator';

const router = Router();

const FINANCIAL_ADMIN_ROLES = ['CEO', 'INTERNAL_MANAGER', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER'];

function canManagePayroll(role: string) {
  return FINANCIAL_ADMIN_ROLES.includes(role);
}

// ─────────────────────────────────────────────────────────────────────────────
// Advances (مساعده)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/finance/advances
 * List advances (Admin sees all, filtered by status/period; normal employee sees own)
 */
router.get('/advances', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const { status, period, type } = req.query;

    const where: any = {};
    if (!canManagePayroll(user.role)) {
      where.userId = user.id;
    } else if (req.query.userId) {
      where.userId = Number(req.query.userId);
    }

    if (status && status !== 'ALL') {
      where.status = status;
    }
    if (type && type !== 'ALL') {
      where.type = type;
    }
    if (period) {
      where.recoveryPeriod = String(period);
    }

    const advances = await prisma.personnelAdvance.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            displayName: true,
            role: true,
            position: true,
            avatarUrl: true,
            nationalId: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            displayName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(advances);
  } catch (error: any) {
    console.error('Error fetching advances:', error);
    res.status(500).json({ error: 'خطا در واکشی لیست درخواست‌های مالی' });
  }
});

/**
 * POST /api/finance/advances
 * Request an advance, loan, or petty cash reimbursement
 */
router.post('/advances', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const { amount, reason, recoveryPeriod, type = 'ADVANCE', installments = 1, attachmentUrl } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'مبلغ درخواستی نامعتبر است' });
    }

    if (!['ADVANCE', 'LOAN', 'PETTY_CASH'].includes(type)) {
      return res.status(400).json({ error: 'نوع درخواست نامعتبر است' });
    }

    // Check financial profile limits if type is ADVANCE
    if (type === 'ADVANCE') {
      const profile = await prisma.employeeFinancialProfile.findUnique({
        where: { userId: user.id },
      });

      if (profile?.maxAdvanceLimit && profile.maxAdvanceLimit > 0 && amount > profile.maxAdvanceLimit) {
        return res.status(400).json({
          error: `مبلغ درخواستی بیشتر از سقف مجاز مساعده (${profile.maxAdvanceLimit.toLocaleString()} تومان) است`,
        });
      }
    }

    const advance = await prisma.personnelAdvance.create({
      data: {
        userId: user.id,
        type,
        amount: Number(amount),
        reason: reason || null,
        installments: type === 'LOAN' ? (Number(installments) || 1) : 1,
        attachmentUrl: attachmentUrl || null,
        recoveryPeriod: recoveryPeriod || null,
        status: 'PENDING',
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            displayName: true,
            nationalId: true,
          },
        },
      },
    });

    res.status(201).json(advance);
  } catch (error: any) {
    console.error('Error creating financial request:', error);
    res.status(500).json({ error: 'خطا در ثبت درخواست مالی' });
  }
});

/**
 * PATCH /api/finance/advances/:id/review
 * Approve or Reject advance (Admin only)
 */
router.patch('/advances/:id/review', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!canManagePayroll(user.role)) {
      return res.status(403).json({ error: 'دسترسی غیرمجاز. فقط مدیران ارشد مجاز به تایید مساعده هستند.' });
    }

    const id = Number(req.params.id);
    const { status, rejectionReason, recoveryPeriod } = req.body;

    if (!['APPROVED', 'REJECTED', 'PAID'].includes(status)) {
      return res.status(400).json({ error: 'وضعیت ارسال‌شده نامعتبر است' });
    }

    const advance = await prisma.personnelAdvance.update({
      where: { id },
      data: {
        status,
        approvedById: user.id,
        approvedAt: new Date(),
        rejectionReason: status === 'REJECTED' ? rejectionReason : null,
        paidAt: status === 'PAID' ? new Date() : undefined,
        recoveryPeriod: recoveryPeriod !== undefined ? recoveryPeriod : undefined,
      },
      include: {
        user: true,
      },
    });

    res.json(advance);
  } catch (error: any) {
    console.error('Error reviewing advance:', error);
    res.status(500).json({ error: 'خطا در تغییر وضعیت مساعده' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Payroll Periods & Payslips (حقوق و دستمزد)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/finance/payroll/periods
 * List payroll periods
 */
router.get('/payroll/periods', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!canManagePayroll(user.role)) {
      return res.status(403).json({ error: 'دسترسی غیرمجاز به مدیریت حقوق و دستمزد' });
    }

    const periods = await prisma.payrollPeriod.findMany({
      include: {
        approvedBy: {
          select: { id: true, firstName: true, lastName: true, displayName: true },
        },
        _count: {
          select: { payslips: true },
        },
      },
      orderBy: { periodKey: 'desc' },
    });

    res.json(periods);
  } catch (error: any) {
    console.error('Error fetching payroll periods:', error);
    res.status(500).json({ error: 'خطا در دریافت دوره‌های حقوق' });
  }
});

/**
 * POST /api/finance/payroll/periods/preview
 * Preview payroll calculations before generating/saving
 */
router.post('/payroll/periods/preview', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!canManagePayroll(user.role)) {
      return res.status(403).json({ error: 'دسترسی غیرمجاز' });
    }

    const { periodKey } = req.body; // e.g. "1405-07"
    if (!periodKey) {
      return res.status(400).json({ error: 'شناسه دوره (مثلاً 1405-07) الزامی است' });
    }

    const calculation = await calculatePeriodPayroll(periodKey);
    res.json(calculation);
  } catch (error: any) {
    console.error('Error previewing payroll:', error);
    res.status(500).json({ error: error.message || 'خطا در محاسبه اولیه حقوق' });
  }
});

/**
 * POST /api/finance/payroll/periods/generate
 * Save or recalculate a payroll period and create payslips
 */
router.post('/payroll/periods/generate', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!canManagePayroll(user.role)) {
      return res.status(403).json({ error: 'دسترسی غیرمجاز' });
    }

    const { periodKey } = req.body;
    if (!periodKey) {
      return res.status(400).json({ error: 'شناسه دوره الزامی است' });
    }

    const calc = await calculatePeriodPayroll(periodKey);

    // Upsert PayrollPeriod
    const period = await prisma.payrollPeriod.upsert({
      where: { periodKey },
      create: {
        periodKey,
        title: calc.range.title,
        startDate: calc.range.startDate,
        endDate: calc.range.endDate,
        status: 'DRAFT',
        totalGross: calc.totalGross,
        totalDeductions: calc.totalDeductions,
        totalNet: calc.totalNet,
      },
      update: {
        title: calc.range.title,
        startDate: calc.range.startDate,
        endDate: calc.range.endDate,
        totalGross: calc.totalGross,
        totalDeductions: calc.totalDeductions,
        totalNet: calc.totalNet,
      },
    });

    // Upsert each employee's payslip
    for (const emp of calc.employees) {
      const payslip = await prisma.payslip.upsert({
        where: {
          payrollPeriodId_userId: {
            payrollPeriodId: period.id,
            userId: emp.userId,
          },
        },
        create: {
          payrollPeriodId: period.id,
          userId: emp.userId,
          status: 'DRAFT',
          workedMinutes: emp.workedMinutes,
          overtimeMinutes: emp.overtimeMinutes,
          tasksCompleted: emp.tasksCompleted,
          baseSalary: emp.baseSalary,
          overtimeAmount: emp.overtimeAmount,
          bonusesAmount: emp.bonusesAmount,
          advancesDeduction: emp.advancesDeduction,
          penaltiesAmount: emp.penaltiesAmount,
          grossPayable: emp.grossPayable,
          netPayable: emp.netPayable,
          bankIban: emp.bankIban,
        },
        update: {
          workedMinutes: emp.workedMinutes,
          overtimeMinutes: emp.overtimeMinutes,
          tasksCompleted: emp.tasksCompleted,
          baseSalary: emp.baseSalary,
          overtimeAmount: emp.overtimeAmount,
          bonusesAmount: emp.bonusesAmount,
          advancesDeduction: emp.advancesDeduction,
          penaltiesAmount: emp.penaltiesAmount,
          grossPayable: emp.grossPayable,
          netPayable: emp.netPayable,
          bankIban: emp.bankIban,
        },
      });

      // Link advances to this payslip
      if (emp.advanceIds.length > 0) {
        await prisma.personnelAdvance.updateMany({
          where: { id: { in: emp.advanceIds } },
          data: {
            payslipId: payslip.id,
            recoveryPeriod: periodKey,
          },
        });
      }
    }

    const updatedPeriod = await prisma.payrollPeriod.findUnique({
      where: { id: period.id },
      include: {
        payslips: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, displayName: true, role: true, position: true, nationalId: true, avatarUrl: true },
            },
          },
        },
      },
    });

    res.json(updatedPeriod);
  } catch (error: any) {
    console.error('Error generating payroll period:', error);
    res.status(500).json({ error: error.message || 'خطا در ثبت دوره حقوق' });
  }
});

/**
 * GET /api/finance/payroll/periods/:id
 * Get details of a single payroll period with its payslips
 */
router.get('/payroll/periods/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!canManagePayroll(user.role)) {
      return res.status(403).json({ error: 'دسترسی غیرمجاز' });
    }

    const id = Number(req.params.id);
    const period = await prisma.payrollPeriod.findUnique({
      where: { id },
      include: {
        approvedBy: {
          select: { id: true, firstName: true, lastName: true, displayName: true },
        },
        payslips: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                displayName: true,
                role: true,
                position: true,
                avatarUrl: true,
                nationalId: true,
              },
            },
            advances: true,
          },
          orderBy: { netPayable: 'desc' },
        },
      },
    });

    if (!period) {
      return res.status(404).json({ error: 'دوره حقوق یافت نشد' });
    }

    res.json(period);
  } catch (error: any) {
    console.error('Error fetching payroll period details:', error);
    res.status(500).json({ error: 'خطا در دریافت جزئیات دوره حقوق' });
  }
});

/**
 * PATCH /api/finance/payroll/periods/:id/approve
 * Approve full payroll period
 */
router.patch('/payroll/periods/:id/approve', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!['CEO', 'INTERNAL_MANAGER', 'TECHNICAL_MANAGER'].includes(user.role)) {
      return res.status(403).json({ error: 'فقط مدیران ارشد (مدیرعامل، مدیر داخلی، مدیر فنی) می‌توانند لیست حقوق را نهایی و تأیید کنند' });
    }

    const id = Number(req.params.id);
    const period = await prisma.payrollPeriod.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedById: user.id,
        approvedAt: new Date(),
        payslips: {
          updateMany: {
            where: {},
            data: { status: 'APPROVED' },
          },
        },
      },
    });

    // Mark all linked advances as recovered
    await prisma.personnelAdvance.updateMany({
      where: {
        payslip: { payrollPeriodId: id },
      },
      data: { status: 'RECOVERED' },
    });

    res.json(period);
  } catch (error: any) {
    console.error('Error approving payroll period:', error);
    res.status(500).json({ error: 'خطا در تایید دوره حقوق' });
  }
});

/**
 * PATCH /api/finance/payroll/payslips/:id
 * Manually adjust a single employee's payslip
 */
router.patch('/payroll/payslips/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!canManagePayroll(user.role)) {
      return res.status(403).json({ error: 'دسترسی غیرمجاز' });
    }

    const id = Number(req.params.id);
    const { baseSalary, bonusesAmount, penaltiesAmount, notes, status } = req.body;

    const existing = await prisma.payslip.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'فیش حقوقی یافت نشد' });
    }

    const updatedBase = baseSalary !== undefined ? Number(baseSalary) : existing.baseSalary;
    const updatedBonuses = bonusesAmount !== undefined ? Number(bonusesAmount) : existing.bonusesAmount;
    const updatedPenalties = penaltiesAmount !== undefined ? Number(penaltiesAmount) : existing.penaltiesAmount;

    const gross = updatedBase + existing.overtimeAmount + updatedBonuses;
    const net = Math.max(0, gross - (existing.advancesDeduction + updatedPenalties));

    const payslip = await prisma.payslip.update({
      where: { id },
      data: {
        baseSalary: updatedBase,
        bonusesAmount: updatedBonuses,
        penaltiesAmount: updatedPenalties,
        grossPayable: gross,
        netPayable: net,
        notes: notes !== undefined ? notes : existing.notes,
        status: status || existing.status,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, displayName: true } },
      },
    });

    res.json(payslip);
  } catch (error: any) {
    console.error('Error updating payslip:', error);
    res.status(500).json({ error: 'خطا در به‌روزرسانی فیش حقوقی' });
  }
});

/**
 * GET /api/finance/payroll/my-payslips
 * Employee personal payslips view
 */
router.get('/payroll/my-payslips', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const payslips = await prisma.payslip.findMany({
      where: {
        userId: user.id,
        payrollPeriod: {
          status: { in: ['APPROVED', 'PAID', 'CLOSED'] },
        },
      },
      include: {
        payrollPeriod: true,
        advances: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            displayName: true,
            role: true,
            position: true,
            nationalId: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(payslips);
  } catch (error: any) {
    console.error('Error fetching my payslips:', error);
    res.status(500).json({ error: 'خطا در واکشی فیش‌های حقوقی شما' });
  }
});

/**
 * GET /api/finance/my-summary
 * Summary of personal financial profile, bank details, and active requests
 */
router.get('/my-summary', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const [profile, userData, recentRequests, activeAdvances] = await Promise.all([
      prisma.employeeFinancialProfile.findUnique({
        where: { userId: user.id },
      }),
      prisma.user.findUnique({
        where: { id: user.id },
        select: { id: true, firstName: true, lastName: true, displayName: true, role: true, position: true, nationalId: true },
      }),
      prisma.personnelAdvance.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.personnelAdvance.findMany({
        where: {
          userId: user.id,
          status: { in: ['APPROVED', 'PAID'] },
          payslipId: null,
        },
      }),
    ]);

    const activeDeductionsTotal = activeAdvances.reduce((sum, a) => sum + a.amount, 0);

    res.json({
      user: userData,
      financialProfile: profile,
      recentRequests,
      activeDeductionsTotal,
    });
  } catch (error: any) {
    console.error('Error fetching my finance summary:', error);
    res.status(500).json({ error: 'خطا در واکشی خلاصه وضعیت مالی' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Employee Financial Profiles (پروفایل مالی پرسنل)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/finance/profiles
 * List employee financial profiles
 */
router.get('/profiles', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!canManagePayroll(user.role)) {
      return res.status(403).json({ error: 'دسترسی غیرمجاز' });
    }

    const users = await prisma.user.findMany({
      where: { role: { not: 'CUSTOMER' } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        displayName: true,
        role: true,
        position: true,
        avatarUrl: true,
        nationalId: true,
        financialProfile: true,
      },
      orderBy: { firstName: 'asc' },
    });

    res.json(users);
  } catch (error: any) {
    console.error('Error fetching financial profiles:', error);
    res.status(500).json({ error: 'خطا در واکشی پروفایل‌های مالی' });
  }
});

/**
 * PUT /api/finance/profiles/:userId
 * Create or update employee financial profile
 */
router.put('/profiles/:userId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!canManagePayroll(user.role)) {
      return res.status(403).json({ error: 'دسترسی غیرمجاز' });
    }

    const targetUserId = Number(req.params.userId);
    const { baseSalary, hourlyRate, bankIban, bankCardNumber, bankName, maxAdvanceLimit, notes, nationalId } = req.body;

    if (nationalId !== undefined) {
      await prisma.user.update({
        where: { id: targetUserId },
        data: { nationalId: nationalId ? String(nationalId).trim() : null },
      });
    }

    const profile = await prisma.employeeFinancialProfile.upsert({
      where: { userId: targetUserId },
      create: {
        userId: targetUserId,
        baseSalary: Number(baseSalary) || 0,
        hourlyRate: hourlyRate !== undefined ? Number(hourlyRate) : undefined,
        bankIban,
        bankCardNumber,
        bankName,
        maxAdvanceLimit: maxAdvanceLimit !== undefined ? Number(maxAdvanceLimit) : undefined,
        notes,
      },
      update: {
        baseSalary: baseSalary !== undefined ? Number(baseSalary) : undefined,
        hourlyRate: hourlyRate !== undefined ? Number(hourlyRate) : undefined,
        bankIban,
        bankCardNumber,
        bankName,
        maxAdvanceLimit: maxAdvanceLimit !== undefined ? Number(maxAdvanceLimit) : undefined,
        notes,
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, displayName: true, role: true, position: true, nationalId: true },
        },
      },
    });

    res.json(profile);
  } catch (error: any) {
    console.error('Error updating financial profile:', error);
    res.status(500).json({ error: 'خطا در ذخیره پروفایل مالی' });
  }
});

export default router;
