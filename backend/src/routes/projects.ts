import { Router, Response } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

const projectInclude = {
  department: { select: { id: true, name: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { tasks: true, members: true } },
};

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    let where: any = {};

    if (user.role === 'EMPLOYEE') {
      const projectIds = await prisma.projectMember.findMany({
        where: { userId: user.id },
        select: { projectId: true },
      });
      where = { id: { in: projectIds.map((p) => p.projectId) } };
    } else if (user.role === 'DEPARTMENT_MANAGER') {
      const managedDept = await prisma.department.findFirst({
        where: { managerId: user.id },
      });
      if (managedDept) {
        where = { departmentId: managedDept.id };
      }
    }

    const projects = await prisma.project.findMany({
      where,
      include: projectInclude,
      orderBy: { createdAt: 'desc' },
    });
    res.json(projects);
  } catch (err) {
    console.error('get projects error:', err);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        ...projectInclude,
        tasks: {
          include: {
            assignees: {
              include: { user: { select: { id: true, firstName: true, lastName: true } } },
            },
            approver: { select: { id: true, firstName: true, lastName: true } },
            createdBy: { select: { id: true, firstName: true, lastName: true } },
            _count: { select: { reports: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        members: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (err) {
    console.error('get project error:', err);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const { name, description, client, departmentId } = req.body;

    if (!name || !departmentId) {
      return res.status(400).json({ error: 'Name and department are required' });
    }

    if (user.role === 'DEPARTMENT_MANAGER') {
      const managedDept = await prisma.department.findFirst({
        where: { managerId: user.id },
      });
      if (!managedDept || managedDept.id !== departmentId) {
        return res.status(403).json({ error: 'You can only create projects in your department' });
      }
    } else if (user.role !== 'TECHNICAL_MANAGER' && user.role !== 'STRATEGY_MANAGER' && user.role !== 'CEO') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const project = await prisma.project.create({
      data: { name, description, client, departmentId, createdById: user.id },
      include: projectInclude,
    });

    const orgWideRoles: any[] = ['CEO', 'TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'HR_MANAGER'];
    const orgWideUsers = await prisma.user.findMany({
      where: { role: { in: orgWideRoles } },
      select: { id: true },
    });
    if (orgWideUsers.length) {
      await prisma.projectMember.createMany({
        data: orgWideUsers.map((u) => ({ projectId: project.id, userId: u.id })),
        skipDuplicates: true,
      });
    }

    const result = await prisma.project.findUnique({
      where: { id: project.id },
      include: {
        ...projectInclude,
        members: {
          include: { user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    res.status(201).json(result);
  } catch (err) {
    console.error('create project error:', err);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const user = req.user!;
    const { name, description, client, departmentId } = req.body;

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (user.role === 'DEPARTMENT_MANAGER') {
      const managedDept = await prisma.department.findFirst({
        where: { managerId: user.id },
      });
      if (!managedDept || managedDept.id !== project.departmentId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else if (user.role !== 'TECHNICAL_MANAGER' && user.role !== 'STRATEGY_MANAGER' && user.role !== 'CEO') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updated = await prisma.project.update({
      where: { id },
      data: { ...(name && { name }), ...(description !== undefined && { description }), ...(client !== undefined && { client }), ...(departmentId && { departmentId }) },
      include: projectInclude,
    });
    res.json(updated);
  } catch (err) {
    console.error('update project error:', err);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

router.delete('/:id', authenticate, authorize('TECHNICAL_MANAGER', 'STRATEGY_MANAGER', 'CEO'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    await prisma.project.delete({ where: { id } });
    res.json({ message: 'Project deleted successfully' });
  } catch (err) {
    console.error('delete project error:', err);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

router.get('/:id/members', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const members = await prisma.projectMember.findMany({
      where: { projectId: id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json(members);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

router.post('/:id/members', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const user = req.user!;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (user.role === 'DEPARTMENT_MANAGER') {
      const managedDept = await prisma.department.findFirst({ where: { managerId: user.id } });
      if (!managedDept || managedDept.id !== project.departmentId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else if (user.role !== 'TECHNICAL_MANAGER' && user.role !== 'STRATEGY_MANAGER' && user.role !== 'CEO') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const memberUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!memberUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const existing = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: id, userId } },
    });
    if (existing) {
      return res.status(400).json({ error: 'User is already a member' });
    }

    const member = await prisma.projectMember.create({
      data: { projectId: id, userId },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } } },
    });
    res.status(201).json(member);
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return res.status(400).json({ error: 'User is already a member' });
    }
    console.error('add member error:', err);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

router.delete('/:id/members/:userId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const userId = parseInt(req.params.userId as string);
    const user = req.user!;

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (user.role === 'DEPARTMENT_MANAGER') {
      const managedDept = await prisma.department.findFirst({ where: { managerId: user.id } });
      if (!managedDept || managedDept.id !== project.departmentId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else if (user.role !== 'TECHNICAL_MANAGER' && user.role !== 'STRATEGY_MANAGER' && user.role !== 'CEO') {
      return res.status(403).json({ error: 'Access denied' });
    }

    await prisma.projectMember.delete({
      where: { projectId_userId: { projectId: id, userId } },
    });
    res.json({ message: 'Member removed successfully' });
  } catch (err) {
    console.error('remove member error:', err);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

export default router;
