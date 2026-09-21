import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';

const router = Router();

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, displayName, role, departmentIds, phone, nationalId, position, birthDate, startDate } = req.body;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email, password: hashedPassword, firstName, lastName, displayName, role,
        phone, nationalId, position,
        birthDate: birthDate ? new Date(birthDate) : undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        departmentMemberships: departmentIds?.length
          ? { create: departmentIds.map((id: number) => ({ departmentId: id })) }
          : undefined,
      },
      include: { departmentMemberships: { include: { department: true } } },
    });
    const orgWideRoles = ['CEO', 'TECHNICAL_MANAGER', 'INTERNAL_MANAGER', 'STRATEGY_MANAGER'];
    if (orgWideRoles.includes(role) && departmentIds?.length) {
      const allDepts = await prisma.department.findMany({ select: { id: true } });
      for (const dept of allDepts) {
        if (!departmentIds.includes(dept.id)) {
          await prisma.userDepartment.create({ data: { userId: user.id, departmentId: dept.id } });
        }
      }
    }
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName },
      process.env.JWT_SECRET!,
      { expiresIn: '24h' }
    );
    res.status(201).json({
      token,
      user: {
        id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
        displayName: user.displayName, role: user.role,
        departments: user.departmentMemberships.map((m: any) => m.department),
        phone: user.phone, nationalId: user.nationalId,
        position: user.position, birthDate: user.birthDate, startDate: user.startDate,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({
      where: { email },
      include: { departmentMemberships: { include: { department: true } } },
    });
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Wrong password' });
    }
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName },
      process.env.JWT_SECRET!,
      { expiresIn: '24h' }
    );
    res.json({
      token,
      user: {
        id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
        displayName: user.displayName, role: user.role,
        departments: user.departmentMemberships.map((m: any) => m.department),
        phone: user.phone, nationalId: user.nationalId,
        position: user.position, birthDate: user.birthDate, startDate: user.startDate,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

export default router;
