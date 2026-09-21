import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { uploadsDir, ensureUploadsDir, removeStoredFile } from '../lib/uploads';
import { managedDepartmentIds } from '../lib/departments';
import { employeeMonthlyStats } from '../services/employeeStats';

const router = Router();

const userSelect: any = {
  id: true, email: true, firstName: true, lastName: true, displayName: true,
  role: true, phone: true, nationalId: true, position: true, avatarUrl: true,
  birthDate: true, startDate: true, createdAt: true, updatedAt: true,
  departmentMemberships: { include: { department: true } },
};

/**
 * What a colleague may see about someone else.
 *
 * Work identity and how to reach them — nothing from the personnel file.
 * National ID and birth date stay out on purpose: they are HR's business and
 * appear nowhere outside the CEO and internal manager's own screens.
 */
const colleagueSelect: any = {
  id: true, firstName: true, lastName: true, displayName: true,
  role: true, position: true, avatarUrl: true, email: true, phone: true,
  departmentMemberships: { include: { department: { select: { id: true, name: true } } } },
};

router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: userSelect,
  });
  res.json(user);
});

/* ──────────────────────────────────────────────────────────────────────────
   Own profile.

   Everything here is scoped to the token's own user id; none of it takes an
   id from the request. Before this existed a person could not change their
   own password at all — the only route that could was the manager-only
   PUT /users/:id, so every password change went through the CEO typing a new
   one, which means it passed through a second person on the way.
   ────────────────────────────────────────────────────────────────────────── */

/** The fields a person owns about themselves. Anything else is the org's. */
const SELF_EDITABLE = ['displayName', 'phone'] as const;

router.patch('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data: any = {};
    // A whitelist, not a blocklist: an unexpected field (role, email,
    // nationalId, departmentIds) is dropped silently rather than applied.
    for (const key of SELF_EDITABLE) {
      if (req.body[key] !== undefined) {
        const value = typeof req.body[key] === 'string' ? req.body[key].trim() : req.body[key];
        data[key] = value === '' ? null : value;
      }
    }
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'چیزی برای تغییر ارسال نشده است' });
    }
    const user = await prisma.user.update({ where: { id: req.user!.id }, data, select: userSelect });
    res.json(user);
  } catch (err) {
    console.error('update own profile error:', err);
    res.status(500).json({ error: 'خطا در ذخیره اطلاعات' });
  }
});

router.post('/me/password', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'رمز فعلی و رمز جدید هر دو لازم است' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'رمز جدید باید حداقل ۸ کاراکتر باشد' });
    }
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(404).json({ error: 'کاربر پیدا نشد' });

    // Requiring the current password is what stops someone who sits down at an
    // unattended, still-logged-in machine from taking the account over.
    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) return res.status(400).json({ error: 'رمز فعلی درست نیست' });
    if (await bcrypt.compare(newPassword, user.password)) {
      return res.status(400).json({ error: 'رمز جدید با رمز فعلی یکسان است' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { password: await bcrypt.hash(newPassword, 10) },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('change own password error:', err);
    res.status(500).json({ error: 'خطا در تغییر رمز' });
  }
});

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => { ensureUploadsDir(); cb(null, uploadsDir); },
    filename: (req: any, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `avatar-${req.user.id}-${Date.now()}${ext}`);
    },
  }),
  // A profile photo has no business being large, and the disk is shared with
  // every task attachment.
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    cb(null, allowed.includes(file.mimetype));
  },
});

router.post('/me/avatar', authenticate, avatarUpload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'فقط تصویر تا ۴ مگابایت پذیرفته می‌شود' });
    const previous = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { avatarUrl: true } });
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { avatarUrl: `/uploads/${req.file.filename}` },
      select: userSelect,
    });
    // The old photo has nothing pointing at it any more.
    removeStoredFile(previous?.avatarUrl);
    res.json(user);
  } catch (err) {
    console.error('upload avatar error:', err);
    res.status(500).json({ error: 'خطا در بارگذاری تصویر' });
  }
});

router.delete('/me/avatar', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const previous = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { avatarUrl: true } });
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { avatarUrl: null },
      select: userSelect,
    });
    removeStoredFile(previous?.avatarUrl);
    res.json(user);
  } catch (err) {
    console.error('remove avatar error:', err);
    res.status(500).json({ error: 'خطا در حذف تصویر' });
  }
});

/**
 * Minimal people list for pickers (QC reviewer, approver, assignee).
 *
 * Deliberately NOT the full `/users` payload: that carries phone numbers,
 * national IDs and birth dates, which only HR and the CEO should see. A name
 * and a role is all a picker needs, so more roles can be trusted with it.
 */
router.get('/directory', authenticate, authorize('CEO', 'INTERNAL_MANAGER', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'DEPARTMENT_MANAGER'), async (_req: AuthRequest, res: Response) => {
  const users = await prisma.user.findMany({
    where: { role: { not: 'CUSTOMER' } },
    select: { id: true, firstName: true, lastName: true, role: true, position: true },
    orderBy: [{ firstName: 'asc' }],
  });
  res.json(users);
});

/* ──────────────────────────────────────────────────────────────────────────
   A colleague's profile.

   Open to everyone in the organisation, because knowing who someone is and
   how to reach them is the point. It returns `colleagueSelect`, which is
   deliberately narrower than the manager payload — see the note there.
   ────────────────────────────────────────────────────────────────────────── */
router.get('/:id/profile', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'شناسه نامعتبر است' });

    const user = await prisma.user.findUnique({ where: { id }, select: colleagueSelect });
    if (!user) return res.status(404).json({ error: 'کاربر پیدا نشد' });

    // Projects they work on, and which of them the viewer shares — the useful
    // context when you open someone's profile before asking them something.
    const [theirs, mine] = await Promise.all([
      prisma.projectMember.findMany({
        where: { userId: id },
        select: { project: { select: { id: true, name: true } } },
      }),
      prisma.projectMember.findMany({ where: { userId: req.user!.id }, select: { projectId: true } }),
    ]);
    const mineIds = new Set(mine.map((m) => m.projectId));

    res.json({
      ...user,
      projects: theirs.map((p) => ({ ...p.project, shared: mineIds.has(p.project.id) })),
    });
  } catch (err) {
    console.error('colleague profile error:', err);
    res.status(500).json({ error: 'خطا در دریافت پروفایل' });
  }
});

/**
 * Someone's monthly numbers.
 *
 * Visible to the person themselves and to managers — the same figures the
 * employee analytics tab shows, so nobody is measured by something they
 * cannot see. A department manager only gets their own people.
 */
router.get('/:id/performance', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'شناسه نامعتبر است' });
    const viewer = req.user!;

    let allowed = viewer.id === id;
    if (!allowed && ['CEO', 'INTERNAL_MANAGER', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER'].includes(viewer.role)) {
      allowed = true;
    }
    if (!allowed && viewer.role === 'DEPARTMENT_MANAGER') {
      const deptIds = await managedDepartmentIds(viewer.id);
      const member = await prisma.userDepartment.findFirst({
        where: { userId: id, departmentId: { in: deptIds } },
      });
      allowed = Boolean(member);
    }
    if (!allowed) return res.status(403).json({ error: 'Access denied' });

    const data = await employeeMonthlyStats([id], 6);
    res.json({ months: data.months, employee: data.employees[0] ?? null });
  } catch (err) {
    console.error('user performance error:', err);
    res.status(500).json({ error: 'خطا در محاسبه عملکرد' });
  }
});

router.get('/', authenticate, authorize('CEO', 'INTERNAL_MANAGER'), async (_req: AuthRequest, res: Response) => {
  const users = await prisma.user.findMany({ select: userSelect });
  res.json(users);
});

router.post('/', authenticate, authorize('CEO', 'INTERNAL_MANAGER'), async (req: AuthRequest, res: Response) => {
  try {
    const { email, password, firstName, lastName, displayName, role, departmentIds, phone, nationalId, position, birthDate, startDate } = req.body;
    if (!email || !password || !firstName || !lastName || !role) {
      return res.status(400).json({ error: 'Required fields: email, password, firstName, lastName, role' });
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    const cleanNationalId = nationalId || undefined;
    if (cleanNationalId) {
      const existingNationalId = await prisma.user.findUnique({ where: { nationalId: cleanNationalId } });
      if (existingNationalId) {
        return res.status(400).json({ error: 'National ID already exists' });
      }
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email, password: hashedPassword, firstName, lastName, displayName: displayName || undefined, role,
        phone: phone || undefined, nationalId: cleanNationalId, position: position || undefined,
        birthDate: birthDate ? new Date(birthDate) : undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        departmentMemberships: departmentIds?.length
          ? { create: departmentIds.map((id: number) => ({ departmentId: id })) }
          : undefined,
      },
      select: userSelect,
    }) as any;
    const orgWideRoles = ['CEO', 'TECHNICAL_MANAGER', 'INTERNAL_MANAGER', 'STRATEGY_MANAGER'];
    if (orgWideRoles.includes(role) && departmentIds?.length) {
      const deptIds = (await prisma.department.findMany({ select: { id: true } })).map((d: any) => d.id);
      for (const did of deptIds) {
        if (!departmentIds.includes(did)) {
          await prisma.userDepartment.create({ data: { userId: user.id, departmentId: did } });
        }
      }
    }
    res.status(201).json(user);
  } catch (err) {
    console.error('create user error:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.put('/:id', authenticate, authorize('CEO', 'INTERNAL_MANAGER'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const { email, password, firstName, lastName, displayName, role, departmentIds, phone, nationalId, position, birthDate, startDate } = req.body;
    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (email && email !== existingUser.email) {
      const emailExists = await prisma.user.findUnique({ where: { email } });
      if (emailExists) return res.status(400).json({ error: 'Email already exists' });
    }
    if (nationalId && nationalId !== existingUser.nationalId) {
      const nationalIdExists = await prisma.user.findUnique({ where: { nationalId } });
      if (nationalIdExists) return res.status(400).json({ error: 'National ID already exists' });
    }
    const data: any = {};
    if (email) data.email = email;
    if (firstName) data.firstName = firstName;
    if (lastName) data.lastName = lastName;
    if (displayName !== undefined) data.displayName = displayName;
    if (role) data.role = role;
    if (phone !== undefined) data.phone = phone || null;
    if (nationalId !== undefined) data.nationalId = nationalId || null;
    if (position !== undefined) data.position = position || null;
    if (birthDate !== undefined) data.birthDate = birthDate ? new Date(birthDate) : null;
    if (startDate !== undefined) data.startDate = startDate ? new Date(startDate) : null;
    if (password) data.password = await bcrypt.hash(password, 10);

    if (departmentIds !== undefined) {
      await prisma.userDepartment.deleteMany({ where: { userId: id } });
      if (departmentIds.length) {
        await prisma.userDepartment.createMany({
          data: departmentIds.map((deptId: number) => ({ userId: id, departmentId: deptId })),
        });
      }
      const orgWideRoles = ['CEO', 'TECHNICAL_MANAGER', 'INTERNAL_MANAGER', 'STRATEGY_MANAGER'];
      const finalRole = role || existingUser.role;
      if (orgWideRoles.includes(finalRole)) {
        const allDepts = await prisma.department.findMany({ select: { id: true } });
        for (const dept of allDepts) {
          const exists = await prisma.userDepartment.findUnique({
            where: { userId_departmentId: { userId: id, departmentId: dept.id } },
          });
          if (!exists) {
            await prisma.userDepartment.create({ data: { userId: id, departmentId: dept.id } });
          }
        }
      }
    }

    const user = await prisma.user.update({ where: { id }, data, select: userSelect });
    res.json(user);
  } catch (err) {
    console.error('update user error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.delete('/:id', authenticate, authorize('CEO', 'INTERNAL_MANAGER'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const adminId = req.user!.id;

    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (id === adminId) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }

    await prisma.notification.deleteMany({ where: { userId: id } });
    await prisma.taskReport.deleteMany({ where: { userId: id } });
    await prisma.taskAssignee.deleteMany({ where: { userId: id } });
    await prisma.projectMember.deleteMany({ where: { userId: id } });
    await prisma.department.updateMany({ where: { managerId: id }, data: { managerId: null } });
    await prisma.task.updateMany({ where: { approvedById: id }, data: { approvedById: null } });
    await prisma.task.updateMany({ where: { createdById: id }, data: { createdById: adminId } });
    await prisma.project.updateMany({ where: { createdById: id }, data: { createdById: adminId } });

    await prisma.user.delete({ where: { id } });
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;
