import { Router, Response } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

const deptInclude = {
  _count: { select: { members: true } },
  manager: { select: { id: true, firstName: true, lastName: true, email: true } },
};

router.get('/', authenticate, async (_req: AuthRequest, res: Response) => {
  const departments = await prisma.department.findMany({
    include: deptInclude,
    orderBy: { name: 'asc' },
  });
  res.json(departments);
});

router.get('/:id/users', authenticate, authorize('TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'CEO'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const memberEntries = await prisma.userDepartment.findMany({
      where: { departmentId: id },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } } },
    });
    const memberUsers = memberEntries.map((m) => m.user);
    const orgWideUsers = await prisma.user.findMany({
      where: { role: { in: ['CEO', 'TECHNICAL_MANAGER', 'HR_MANAGER', 'STRATEGY_MANAGER'] }, id: { notIn: memberUsers.map((u) => u.id) } },
      select: { id: true, firstName: true, lastName: true, email: true, role: true },
    });
    const allUsers = [...memberUsers, ...orgWideUsers].sort((a, b) => a.firstName.localeCompare(b.firstName));
    res.json(allUsers);
  } catch {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.post('/', authenticate, authorize('TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'CEO'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Department name is required' });
    }
    const department = await prisma.department.create({
      data: { name, description },
      include: deptInclude,
    });
    const orgWideUsers = await prisma.user.findMany({
      where: { role: { in: ['CEO', 'TECHNICAL_MANAGER', 'HR_MANAGER', 'STRATEGY_MANAGER'] } },
      select: { id: true },
    });
    if (orgWideUsers.length) {
      await prisma.userDepartment.createMany({
        data: orgWideUsers.map((u) => ({ userId: u.id, departmentId: department.id })),
        skipDuplicates: true,
      });
    }
    res.status(201).json(department);
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return res.status(400).json({ error: 'Department name already exists' });
    }
    res.status(500).json({ error: 'Failed to create department' });
  }
});

router.put('/:id', authenticate, authorize('TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'CEO'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const { name, description } = req.body;
    const existing = await prisma.department.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Department not found' });
    }
    const data: any = {};
    if (name) data.name = name;
    if (description !== undefined) data.description = description;
    const department = await prisma.department.update({
      where: { id },
      data,
      include: deptInclude,
    });
    res.json(department);
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return res.status(400).json({ error: 'Department name already exists' });
    }
    res.status(500).json({ error: 'Failed to update department' });
  }
});

router.post('/:id/set-manager', authenticate, authorize('TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'CEO'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const userId = parseInt(req.body.userId);

    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const department = await prisma.department.findUnique({ where: { id } });
    if (!department) {
      return res.status(404).json({ error: 'Department not found' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const oldManagerId = department.managerId;

    const existingManagedDept = await prisma.department.findFirst({
      where: { managerId: userId, id: { not: id } },
    });

    if (oldManagerId) {
      const oldManager = await prisma.user.findUnique({ where: { id: oldManagerId } });
      const newRole = oldManager && oldManager.role === 'DEPARTMENT_MANAGER' ? 'EMPLOYEE' : oldManager?.role;
      await prisma.user.update({
        where: { id: oldManagerId },
        data: { role: newRole },
      });
    }

    if (existingManagedDept) {
      await prisma.department.update({
        where: { id: existingManagedDept.id },
        data: { managerId: null },
      });
    }

    const finalRole = user.role === 'EMPLOYEE' ? 'DEPARTMENT_MANAGER' : user.role;
    await prisma.user.update({
      where: { id: userId },
      data: { role: finalRole },
    });

    await prisma.department.update({
      where: { id },
      data: { managerId: userId },
    });

    await prisma.userDepartment.upsert({
      where: { userId_departmentId: { userId, departmentId: id } },
      update: {},
      create: { userId, departmentId: id },
    });

    const updated = await prisma.department.findUnique({
      where: { id },
      include: deptInclude,
    });

    res.json(updated);
  } catch (err: any) {
    console.error('set-manager error:', err?.message || err);
    res.status(500).json({ error: 'Failed to set manager' });
  }
});

router.post('/:id/remove-manager', authenticate, authorize('TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'CEO'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const department = await prisma.department.findUnique({ where: { id } });
    if (!department) {
      return res.status(404).json({ error: 'Department not found' });
    }
    if (!department.managerId) {
      return res.status(400).json({ error: 'Department has no manager' });
    }

    const oldManager = await prisma.user.findUnique({ where: { id: department.managerId } });
    if (oldManager && oldManager.role === 'DEPARTMENT_MANAGER') {
      await prisma.user.update({
        where: { id: department.managerId },
        data: { role: 'EMPLOYEE' },
      });
    }

    await prisma.department.update({
      where: { id },
      data: { managerId: null },
    });

    const updated = await prisma.department.findUnique({
      where: { id },
      include: deptInclude,
    });

    res.json(updated);
  } catch (err) {
    console.error('remove-manager error:', err);
    res.status(500).json({ error: 'Failed to remove manager' });
  }
});

router.delete('/:id', authenticate, authorize('TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'CEO'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const existing = await prisma.department.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Department not found' });
    }
    const memberCount = await prisma.userDepartment.count({ where: { departmentId: id } });
    if (memberCount > 0) {
      return res.status(400).json({ error: `Cannot delete department with ${memberCount} active member(s)` });
    }
    await prisma.department.delete({ where: { id } });
    res.json({ message: 'Department deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete department' });
  }
});

export default router;
