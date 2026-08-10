import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

const userSelect: any = {
  id: true, email: true, firstName: true, lastName: true, displayName: true,
  role: true, phone: true, nationalId: true, position: true,
  birthDate: true, startDate: true, createdAt: true, updatedAt: true,
  departmentMemberships: { include: { department: true } },
};

router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: userSelect,
  });
  res.json(user);
});

router.get('/', authenticate, authorize('CEO', 'HR_MANAGER'), async (_req: AuthRequest, res: Response) => {
  const users = await prisma.user.findMany({ select: userSelect });
  res.json(users);
});

router.post('/', authenticate, authorize('CEO', 'HR_MANAGER'), async (req: AuthRequest, res: Response) => {
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
    const orgWideRoles = ['CEO', 'TECHNICAL_MANAGER', 'HR_MANAGER', 'STRATEGY_MANAGER'];
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

router.put('/:id', authenticate, authorize('CEO', 'HR_MANAGER'), async (req: AuthRequest, res: Response) => {
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
      const orgWideRoles = ['CEO', 'TECHNICAL_MANAGER', 'HR_MANAGER', 'STRATEGY_MANAGER'];
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

router.delete('/:id', authenticate, authorize('CEO', 'HR_MANAGER'), async (req: AuthRequest, res: Response) => {
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
