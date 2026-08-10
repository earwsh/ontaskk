import 'dotenv/config';
import prisma from './lib/prisma';

async function main() {
  try {
    console.log('Testing task creation...');
    // Find a valid project and user first
    const project = await prisma.project.findFirst();
    const user = await prisma.user.findFirst();
    
    if (!project || !user) {
      console.log('No project or user found to test with.');
      return;
    }
    
    const task = await prisma.task.create({
      data: {
        title: 'تست ایجاد تسک جدید',
        description: 'توضیحات تست',
        projectId: project.id,
        createdById: user.id,
        approverId: user.id,
        status: 'TODO',
        startDate: new Date(),
        deadline: new Date(),
        estimatedMinutes: 30,
        weight: 30,
        assignees: {
          create: [{ userId: user.id }],
        },
        subtasks: {
          create: [{ title: 'کار فرعی اول' }],
        },
      },
    });
    console.log('Success! Task created with ID:', task.id);
    // Cleanup
    await prisma.taskSubtask.deleteMany({ where: { taskId: task.id } });
    await prisma.taskAssignee.deleteMany({ where: { taskId: task.id } });
    await prisma.task.delete({ where: { id: task.id } });
    console.log('Cleanup successful');
  } catch (err) {
    console.error('Task creation failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
