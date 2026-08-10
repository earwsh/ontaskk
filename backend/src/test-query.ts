import 'dotenv/config';
import prisma from './lib/prisma';

async function main() {
  try {
    console.log('Testing prisma task query...');
    const tasks = await prisma.task.findMany({
      take: 1,
      include: {
        project: {
          select: {
            id: true,
            name: true,
            departmentId: true,
            department: { select: { id: true, name: true } },
          },
        },
        assignees: {
          include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        },
        approver: { select: { id: true, firstName: true, lastName: true } },
        subtasks: { orderBy: { createdAt: 'asc' } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
        reports: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'asc' },
        },
        attachments: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    console.log('Success! Task query returned:', tasks.length, 'tasks');
  } catch (err) {
    console.error('Prisma task query failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
