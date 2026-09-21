import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { callPython } from '../services/analysisClient';
import { toGregorian } from '../lib/jalaali';

const router = Router();

const FINANCIAL_ROLES = ['CEO', 'INTERNAL_MANAGER', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER'];

function canManageFinancials(role: string) {
  return FINANCIAL_ROLES.includes(role);
}

// Generate unique invoice number
async function generateInvoiceNumber(): Promise<string> {
  const now = new Date();
  // Approximate Persian year (1404/1405)
  const gregorianYear = now.getFullYear();
  const jalaliYear = gregorianYear - 621;
  const prefix = `INV-${jalaliYear}-`;
  
  const lastInvoice = await prisma.invoice.findFirst({
    where: {
      invoiceNumber: { startsWith: prefix },
    },
    orderBy: { id: 'desc' },
    select: { invoiceNumber: true },
  });

  if (!lastInvoice) {
    return `${prefix}001`;
  }

  const parts = lastInvoice.invoiceNumber.split('-');
  const lastSeq = parseInt(parts[parts.length - 1] || '0', 10);
  const nextSeq = String(lastSeq + 1).padStart(3, '0');
  return `${prefix}${nextSeq}`;
}

// GET /api/invoices - List invoices with filtering and KPI summary
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!canManageFinancials(user.role)) {
      return res.status(403).json({ error: 'دسترسی غیرمجاز به بخش مالی.' });
    }

    const { projectId, status, search } = req.query;

    const where: any = {};

    if (projectId && !isNaN(Number(projectId))) {
      where.projectId = Number(projectId);
    }

    if (status && typeof status === 'string' && status !== 'ALL') {
      where.status = status;
    }

    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim();
      where.OR = [
        { invoiceNumber: { contains: q, mode: 'insensitive' } },
        { title: { contains: q, mode: 'insensitive' } },
        { clientName: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [invoices, allInvoices] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          project: {
            select: { id: true, name: true, client: true },
          },
          createdBy: {
            select: { id: true, firstName: true, lastName: true },
          },
          _count: {
            select: { items: true },
          },
        },
        orderBy: { issueDate: 'desc' },
      }),
      // KPI metrics over all active invoices (or filtered project)
      prisma.invoice.findMany({
        where: projectId && !isNaN(Number(projectId)) ? { projectId: Number(projectId) } : {},
        select: {
          status: true,
          totalAmount: true,
          dueDate: true,
        },
      }),
    ]);

    const now = new Date();
    let totalRevenue = 0;
    let totalPending = 0;
    let totalOverdue = 0;
    let draftCount = 0;

    for (const inv of allInvoices) {
      if (inv.status === 'PAID') {
        totalRevenue += inv.totalAmount;
      } else if (inv.status === 'ISSUED') {
        totalPending += inv.totalAmount;
        if (inv.dueDate && new Date(inv.dueDate) < now) {
          totalOverdue += inv.totalAmount;
        }
      } else if (inv.status === 'DRAFT') {
        draftCount++;
      }
    }

    res.json({
      invoices,
      summary: {
        totalRevenue,
        totalPending,
        totalOverdue,
        draftCount,
        totalCount: allInvoices.length,
      },
    });
  } catch (err: any) {
    console.error('Error fetching invoices:', err);
    res.status(500).json({ error: 'خطا در دریافت لیست فاکتورها' });
  }
});

// GET /api/invoices/smart-breakdown/:projectId - Smart clustering & aggregation of billable deliverables via Python/Rust
router.get('/smart-breakdown/:projectId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!canManageFinancials(user.role)) {
      return res.status(403).json({ error: 'دسترسی غیرمجاز.' });
    }

    const projectId = parseInt(String(req.params.projectId), 10);
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'شناسه پروژه نامعتبر است.' });
    }

    const { year, month } = req.query;
    const taskWhere: any = { projectId, status: 'DONE' };
    let selectedMonthLabel: string | null = null;

    if (year && month && year !== 'ALL' && month !== 'ALL') {
      const jy = parseInt(String(year), 10);
      const jm = parseInt(String(month), 10);
      if (!isNaN(jy) && !isNaN(jm) && jm >= 1 && jm <= 12) {
        const persianMonths = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
        selectedMonthLabel = `${persianMonths[jm - 1]} ${jy}`;
        const startG = toGregorian(jy, jm, 1);
        const daysInMonth = jm <= 6 ? 31 : (jm <= 11 ? 30 : 29);
        const endG = toGregorian(jy, jm, daysInMonth);
        const startDate = new Date(Date.UTC(startG.gy, startG.gm - 1, startG.gd, 0, 0, 0));
        const endDate = new Date(Date.UTC(endG.gy, endG.gm - 1, endG.gd, 23, 59, 59, 999));

        taskWhere.OR = [
          { deadline: { gte: startDate, lte: endDate } },
          {
            AND: [
              { deadline: null },
              { createdAt: { gte: startDate, lte: endDate } },
            ],
          },
        ];
      }
    }

    const [project, doneTasks] = await Promise.all([
      prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, name: true, client: true },
      }),
      prisma.task.findMany({
        where: taskWhere,
        select: {
          id: true,
          title: true,
          description: true,
          estimatedHours: true,
          estimatedMinutes: true,
          weight: true,
          deadline: true,
        },
        orderBy: { id: 'asc' },
      }),
    ]);

    if (!project) {
      return res.status(404).json({ error: 'پروژه یافت نشد.' });
    }

    // Call python analysis microservice
    let analysisResult: any = null;
    try {
      analysisResult = await callPython('/analyze/billing', { tasks: doneTasks });
    } catch (e) {
      console.warn('Python analysis microservice unreachable, falling back to internal engine:', e);
    }

    const DELIVERABLE_RULES = [
      {
        key: 'seo_articles',
        title: 'تألیف مقالات سئو',
        defaultDescription: 'تألیف، نگارش و بهینه‌سازی مقالات تخصصی سئو و انتشار در وب‌سایت',
        unit: 'مقاله',
        unitMode: 'count',
        keywords: ['تألیف', 'تالیف', 'مقاله', 'محتوا', 'بلاگ', 'پست وبلاگ', 'article', 'blog', 'content'],
      },
      {
        key: 'reels',
        title: 'تولید و تدوین ریلز',
        defaultDescription: 'سناریونویسی، تولید، ضبط و تدوین ویدیوهای ریلز اینستاگرام',
        unit: 'ویدیو',
        unitMode: 'count',
        keywords: ['ریلز', 'reels', 'ریل', 'ویدیو ریلز', 'ویدئو ریلز', 'کلیپ اینستاگرام'],
      },
      {
        key: 'stories',
        title: 'طراحی و انتشار استوری',
        defaultDescription: 'طراحی گرافیکی، سناریونویسی تعاملی و انتشار استوری‌های اینستاگرام',
        unit: 'استوری',
        unitMode: 'count',
        keywords: ['استوری', 'story', 'stories', 'استوری‌ها'],
      },
      {
        key: 'graphic_design',
        title: 'طراحی گرافیک و پست',
        defaultDescription: 'طراحی گرافیکی کاور، پست‌های اسلایدی و بنرهای تبلیغاتی',
        unit: 'طرح',
        unitMode: 'count',
        keywords: ['طراحی پست', 'کاور', 'بنر', 'اسلایدی', 'پوستر', 'گرافیک', 'فتوشاپ', 'banner', 'poster'],
      },
      {
        key: 'seo_technical',
        title: 'سئو تکنیکال و آپدیت وب‌سایت',
        defaultDescription: 'بهینه‌سازی فنی، بررسی سرچ کنسول، رفع خطاهای تکنیکال و بازنویسی صفحات قدیمی',
        unit: 'ساعت',
        unitMode: 'hours',
        keywords: ['آپدیت', 'بروزرسانی', 'سرچ کنسول', 'تکنیکال', 'آنپیج', 'onpage', 'لینک سازی', 'بک لینک', 'ایندکس', 'search console'],
      },
      {
        key: 'development',
        title: 'توسعه و پشتیبانی فنی',
        defaultDescription: 'خدمات توسعه نرم‌افزار، برنامه‌نویسی، پیاده‌سازی قابلیت‌ها و رفع باگ‌ها',
        unit: 'ساعت',
        unitMode: 'hours',
        keywords: ['توسعه', 'برنامه نویسی', 'کد', 'فرانت', 'بک اند', 'frontend', 'backend', 'باگ', 'bug', 'طراحی ui', 'ui', 'api'],
      },
    ];

    let deliverables: any[] = [];
    let computedBy = 'python-nlp';

    if (analysisResult && Array.isArray(analysisResult.deliverables)) {
      deliverables = analysisResult.deliverables;
      computedBy = analysisResult.computedBy || 'python-nlp';
    } else {
      // Fallback internal engine
      computedBy = 'internal-rule-engine';
      const groups: Record<string, any> = {};
      for (const rule of DELIVERABLE_RULES) {
        groups[rule.key] = {
          key: rule.key,
          title: rule.title,
          description: rule.defaultDescription,
          unit: rule.unit,
          unitMode: rule.unitMode,
          count: 0,
          totalMinutes: 0,
          totalHours: 0,
          tasks: [],
        };
      }
      groups['other'] = {
        key: 'other',
        title: 'سایر خدمات و فعالیت‌ها',
        description: 'سایر فعالیت‌ها و خدمات اجرایی پروژه',
        unit: 'ساعت',
        unitMode: 'hours',
        count: 0,
        totalMinutes: 0,
        totalHours: 0,
        tasks: [],
      };

      for (const task of doneTasks) {
        const text = `${task.title || ''} ${task.description || ''}`.toLowerCase();
        const weight = task.weight || (task.estimatedHours ? task.estimatedHours * 60 : 60);

        let matchedKey = 'other';
        for (const rule of DELIVERABLE_RULES) {
          if (rule.keywords.some((kw) => text.includes(kw.toLowerCase()))) {
            matchedKey = rule.key;
            break;
          }
        }

        const grp = groups[matchedKey];
        grp.count += 1;
        grp.totalMinutes += weight;
        grp.tasks.push({
          id: task.id,
          title: task.title,
          weight,
          hours: Math.round((weight / 60) * 10) / 10,
          deadline: task.deadline,
        });
      }

      deliverables = Object.values(groups)
        .filter((g) => g.count > 0)
        .map((g) => {
          const totalHours = g.totalMinutes ? Math.round((g.totalMinutes / 60) * 10) / 10 : g.count * 1.5;
          return {
            ...g,
            totalHours,
            suggestedQuantity: g.unitMode === 'hours' ? totalHours : g.count,
          };
        })
        .sort((a, b) => b.count - a.count);
    }

    res.json({
      project,
      totalTasksAnalyzed: doneTasks.length,
      deliverables,
      rawTasks: doneTasks.map((t) => ({
        id: t.id,
        title: t.title,
        deadline: t.deadline,
        weight: t.weight || 60,
        hours: t.estimatedHours || (t.weight ? Math.round((t.weight / 60) * 10) / 10 : 1),
      })),
      computedBy,
      selectedMonth: selectedMonthLabel,
    });
  } catch (err: any) {
    console.error('Error in smart-breakdown:', err);
    res.status(500).json({ error: 'خطا در تحلیل هوشمند تسک‌ها' });
  }
});

// GET /api/invoices/suggest-items/:projectId - Fetch completed project tasks for invoice line items
router.get('/suggest-items/:projectId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!canManageFinancials(user.role)) {
      return res.status(403).json({ error: 'دسترسی غیرمجاز.' });
    }

    const projectId = parseInt(String(req.params.projectId), 10);
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'شناسه پروژه نامعتبر است.' });
    }

    const { year, month } = req.query;
    const taskWhere: any = { projectId, status: 'DONE' };
    let selectedMonthLabel: string | null = null;

    if (year && month && year !== 'ALL' && month !== 'ALL') {
      const jy = parseInt(String(year), 10);
      const jm = parseInt(String(month), 10);
      if (!isNaN(jy) && !isNaN(jm) && jm >= 1 && jm <= 12) {
        const persianMonths = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
        selectedMonthLabel = `${persianMonths[jm - 1]} ${jy}`;
        const startG = toGregorian(jy, jm, 1);
        const daysInMonth = jm <= 6 ? 31 : (jm <= 11 ? 30 : 29);
        const endG = toGregorian(jy, jm, daysInMonth);
        const startDate = new Date(Date.UTC(startG.gy, startG.gm - 1, startG.gd, 0, 0, 0));
        const endDate = new Date(Date.UTC(endG.gy, endG.gm - 1, endG.gd, 23, 59, 59, 999));

        taskWhere.OR = [
          { deadline: { gte: startDate, lte: endDate } },
          {
            AND: [
              { deadline: null },
              { createdAt: { gte: startDate, lte: endDate } },
            ],
          },
        ];
      }
    }

    const [project, doneTasks] = await Promise.all([
      prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, name: true, client: true },
      }),
      prisma.task.findMany({
        where: taskWhere,
        select: {
          id: true,
          title: true,
          estimatedHours: true,
          estimatedMinutes: true,
          weight: true,
          deadline: true,
        },
        orderBy: { id: 'asc' },
      }),
    ]);

    if (!project) {
      return res.status(404).json({ error: 'پروژه یافت نشد.' });
    }

    const suggestedItems = doneTasks.map((t) => {
      const hours = t.estimatedHours || (t.estimatedMinutes ? Math.round((t.estimatedMinutes / 60) * 10) / 10 : 1);
      return {
        taskId: t.id,
        description: `انجام تسک: ${t.title}`,
        quantity: Math.max(1, hours),
        unit: 'نفر-ساعت',
        unitPrice: 0,
        totalPrice: 0,
      };
    });

    res.json({
      project,
      selectedMonth: selectedMonthLabel,
      suggestedItems,
    });
  } catch (err: any) {
    console.error('Error suggesting invoice items:', err);
    res.status(500).json({ error: 'خطا در واکشی تسک‌های پروژه' });
  }
});

// GET /api/invoices/:id - Get single invoice detail
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!canManageFinancials(user.role)) {
      return res.status(403).json({ error: 'دسترسی غیرمجاز.' });
    }

    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'شناسه فاکتور نامعتبر است.' });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            client: true,
            department: { select: { id: true, name: true } },
          },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        items: {
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: 'فاکتور مورد نظر یافت نشد.' });
    }

    res.json(invoice);
  } catch (err: any) {
    console.error('Error fetching invoice:', err);
    res.status(500).json({ error: 'خطا در دریافت اطلاعات فاکتور' });
  }
});

// POST /api/invoices - Create new invoice
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!canManageFinancials(user.role)) {
      return res.status(403).json({ error: 'شما دسترسی ایجاد فاکتور را ندارید.' });
    }

    const {
      title,
      projectId,
      sellerName = 'تسکان (Task-On)',
      sellerPhone,
      sellerAddress,
      sellerTaxId,
      clientName,
      clientPhone,
      clientAddress,
      clientTaxId,
      issueDate,
      dueDate,
      status = 'DRAFT',
      discount = 0,
      taxRate = 0,
      previousDebt = 0,
      paidAmount = 0,
      currency = 'تومان',
      notes,
      iban1,
      iban2,
      paymentAccounts,
      items = [],
    } = req.body;

    if (!title || !projectId || !clientName) {
      return res.status(400).json({ error: 'عنوان فاکتور، پروژه و نام کارفرما الزامی هستند.' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'حداقل یک ردیف کالا یا خدمات باید ثبت شود.' });
    }

    // Calculate item totals and subtotal
    let subtotal = 0;
    const sanitizedItems = items.map((item: any) => {
      const quantity = Math.max(0.01, parseFloat(item.quantity) || 1);
      const unitPrice = Math.max(0, parseFloat(item.unitPrice) || 0);
      const totalPrice = Math.round(quantity * unitPrice);
      subtotal += totalPrice;
      return {
        description: (item.description || '').trim(),
        quantity,
        unit: (item.unit || 'مورد').trim(),
        unitPrice,
        totalPrice,
        taskId: item.taskId ? parseInt(item.taskId, 10) : null,
      };
    });

    const parsedDiscount = Math.max(0, parseFloat(discount) || 0);
    const parsedTaxRate = Math.max(0, parseFloat(taxRate) || 0);
    const taxableAmount = Math.max(0, subtotal - parsedDiscount);
    const taxAmount = Math.round((taxableAmount * parsedTaxRate) / 100);
    const totalAmount = Math.max(0, taxableAmount + taxAmount);
    
    // Accounting: Debtor & Creditor calculations
    const parsedPreviousDebt = Math.max(0, parseFloat(previousDebt) || 0);
    const parsedPaidAmount = Math.max(0, parseFloat(paidAmount) || 0);
    const finalAmount = totalAmount + parsedPreviousDebt - parsedPaidAmount;

    const invoiceNumber = await generateInvoiceNumber();

    // If paymentAccounts provided, derive iban1 and iban2 as fallbacks
    let derivedIban1 = iban1;
    let derivedIban2 = iban2;
    if (Array.isArray(paymentAccounts) && paymentAccounts.length > 0) {
      if (paymentAccounts[0]?.iban) derivedIban1 = paymentAccounts[0].iban;
      if (paymentAccounts[1]?.iban) derivedIban2 = paymentAccounts[1].iban;
    }

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        title: title.trim(),
        projectId: Number(projectId),
        sellerName: sellerName ? sellerName.trim() : 'تسکان (Task-On)',
        sellerPhone: sellerPhone ? sellerPhone.trim() : null,
        sellerAddress: sellerAddress ? sellerAddress.trim() : null,
        sellerTaxId: sellerTaxId ? sellerTaxId.trim() : null,
        clientName: clientName.trim(),
        clientPhone: clientPhone ? clientPhone.trim() : null,
        clientAddress: clientAddress ? clientAddress.trim() : null,
        clientTaxId: clientTaxId ? clientTaxId.trim() : null,
        issueDate: issueDate ? new Date(issueDate) : new Date(),
        dueDate: dueDate ? new Date(dueDate) : null,
        status,
        subtotal,
        discount: parsedDiscount,
        taxRate: parsedTaxRate,
        taxAmount,
        totalAmount,
        previousDebt: parsedPreviousDebt,
        paidAmount: parsedPaidAmount,
        finalAmount,
        currency,
        notes: notes ? notes.trim() : null,
        iban1: derivedIban1 !== undefined ? (derivedIban1 ? derivedIban1.trim() : null) : 'IR82 0120 0000 0000 1234 5678 90',
        iban2: derivedIban2 !== undefined ? (derivedIban2 ? derivedIban2.trim() : null) : 'IR56 0560 0000 0000 9876 5432 10',
        paymentAccounts: paymentAccounts || null,
        createdById: user.id,
        items: {
          create: sanitizedItems,
        },
      },
      include: {
        items: true,
        project: { select: { id: true, name: true, client: true } },
      },
    });

    res.status(201).json(invoice);
  } catch (err: any) {
    console.error('Error creating invoice:', err);
    res.status(500).json({ error: 'خطا در ثبت فاکتور جدید' });
  }
});

// PUT /api/invoices/:id - Update invoice
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!canManageFinancials(user.role)) {
      return res.status(403).json({ error: 'دسترسی غیرمجاز.' });
    }

    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'شناسه نامعتبر است.' });
    }

    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'فاکتور یافت نشد.' });
    }

    const {
      title,
      projectId,
      sellerName,
      sellerPhone,
      sellerAddress,
      sellerTaxId,
      clientName,
      clientPhone,
      clientAddress,
      clientTaxId,
      issueDate,
      dueDate,
      status,
      discount = 0,
      taxRate = 0,
      previousDebt = 0,
      paidAmount = 0,
      currency = 'تومان',
      notes,
      iban1,
      iban2,
      paymentAccounts,
      items = [],
    } = req.body;

    let subtotal = 0;
    const sanitizedItems = items.map((item: any) => {
      const quantity = Math.max(0.01, parseFloat(item.quantity) || 1);
      const unitPrice = Math.max(0, parseFloat(item.unitPrice) || 0);
      const totalPrice = Math.round(quantity * unitPrice);
      subtotal += totalPrice;
      return {
        description: (item.description || '').trim(),
        quantity,
        unit: (item.unit || 'مورد').trim(),
        unitPrice,
        totalPrice,
        taskId: item.taskId ? parseInt(item.taskId, 10) : null,
      };
    });

    const parsedDiscount = Math.max(0, parseFloat(discount) || 0);
    const parsedTaxRate = Math.max(0, parseFloat(taxRate) || 0);
    const taxableAmount = Math.max(0, subtotal - parsedDiscount);
    const taxAmount = Math.round((taxableAmount * parsedTaxRate) / 100);
    const totalAmount = Math.max(0, taxableAmount + taxAmount);

    const parsedPreviousDebt = Math.max(0, parseFloat(previousDebt) || 0);
    const parsedPaidAmount = Math.max(0, parseFloat(paidAmount) || 0);
    const finalAmount = totalAmount + parsedPreviousDebt - parsedPaidAmount;

    let derivedIban1 = iban1 !== undefined ? iban1 : existing.iban1;
    let derivedIban2 = iban2 !== undefined ? iban2 : existing.iban2;
    if (Array.isArray(paymentAccounts) && paymentAccounts.length > 0) {
      if (paymentAccounts[0]?.iban) derivedIban1 = paymentAccounts[0].iban;
      if (paymentAccounts[1]?.iban) derivedIban2 = paymentAccounts[1].iban;
    }

    // Delete existing items and recreate
    await prisma.invoiceItem.deleteMany({ where: { invoiceId: id } });

    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        title: title ? title.trim() : existing.title,
        projectId: projectId ? Number(projectId) : existing.projectId,
        sellerName: sellerName !== undefined ? (sellerName ? sellerName.trim() : null) : existing.sellerName,
        sellerPhone: sellerPhone !== undefined ? (sellerPhone ? sellerPhone.trim() : null) : existing.sellerPhone,
        sellerAddress: sellerAddress !== undefined ? (sellerAddress ? sellerAddress.trim() : null) : existing.sellerAddress,
        sellerTaxId: sellerTaxId !== undefined ? (sellerTaxId ? sellerTaxId.trim() : null) : existing.sellerTaxId,
        clientName: clientName ? clientName.trim() : existing.clientName,
        clientPhone: clientPhone !== undefined ? (clientPhone ? clientPhone.trim() : null) : existing.clientPhone,
        clientAddress: clientAddress !== undefined ? (clientAddress ? clientAddress.trim() : null) : existing.clientAddress,
        clientTaxId: clientTaxId !== undefined ? (clientTaxId ? clientTaxId.trim() : null) : existing.clientTaxId,
        issueDate: issueDate ? new Date(issueDate) : existing.issueDate,
        dueDate: dueDate !== undefined ? (dueDate ? new Date(dueDate) : null) : existing.dueDate,
        status: status || existing.status,
        subtotal,
        discount: parsedDiscount,
        taxRate: parsedTaxRate,
        taxAmount,
        totalAmount,
        previousDebt: parsedPreviousDebt,
        paidAmount: parsedPaidAmount,
        finalAmount,
        currency,
        notes: notes !== undefined ? (notes ? notes.trim() : null) : existing.notes,
        iban1: derivedIban1 ? derivedIban1.trim() : null,
        iban2: derivedIban2 ? derivedIban2.trim() : null,
        paymentAccounts: paymentAccounts !== undefined ? paymentAccounts : existing.paymentAccounts,
        items: {
          create: sanitizedItems,
        },
      },
      include: {
        items: true,
        project: { select: { id: true, name: true, client: true } },
      },
    });

    res.json(updated);
  } catch (err: any) {
    console.error('Error updating invoice:', err);
    res.status(500).json({ error: 'خطا در ویرایش فاکتور' });
  }
});

// PATCH /api/invoices/:id/status - Update invoice status
router.patch('/:id/status', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!canManageFinancials(user.role)) {
      return res.status(403).json({ error: 'دسترسی غیرمجاز.' });
    }

    const id = parseInt(String(req.params.id), 10);
    const { status } = req.body;

    if (!['DRAFT', 'ISSUED', 'PAID', 'CANCELLED'].includes(status)) {
      return res.status(400).json({ error: 'وضعیت فاکتور نامعتبر است.' });
    }

    const invoice = await prisma.invoice.update({
      where: { id },
      data: {
        status,
        paidAt: status === 'PAID' ? new Date() : null,
      },
    });

    res.json(invoice);
  } catch (err: any) {
    console.error('Error updating invoice status:', err);
    res.status(500).json({ error: 'خطا در تغییر وضعیت فاکتور' });
  }
});

// DELETE /api/invoices/:id - Delete invoice
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!canManageFinancials(user.role)) {
      return res.status(403).json({ error: 'دسترسی غیرمجاز برای حذف فاکتور.' });
    }

    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'شناسه نامعتبر است.' });
    }

    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) {
      return res.status(404).json({ error: 'فاکتور یافت نشد.' });
    }

    await prisma.invoiceItem.deleteMany({ where: { invoiceId: id } });
    await prisma.invoice.delete({ where: { id } });

    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting invoice:', err);
    res.status(500).json({ error: 'خطا در حذف فاکتور' });
  }
});

export default router;
