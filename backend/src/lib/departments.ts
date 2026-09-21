import prisma from './prisma';

/**
 * Which departments a user manages.
 *
 * One person can run several departments, so this always returns a list. The
 * code used to ask `findFirst({ where: { managerId } })` in eleven places,
 * which silently picked whichever department the database happened to return
 * first — every other department they ran became invisible to them.
 */
export async function managedDepartmentIds(userId: number): Promise<number[]> {
  const rows = await prisma.department.findMany({
    where: { managerId: userId },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Project ids belonging to any department the user manages. */
export async function managedProjectIds(userId: number): Promise<number[]> {
  const deptIds = await managedDepartmentIds(userId);
  if (deptIds.length === 0) return [];
  const rows = await prisma.project.findMany({
    where: { departmentId: { in: deptIds } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Does the user manage the department this thing belongs to? */
export async function managesDepartment(userId: number, departmentId: number | null | undefined): Promise<boolean> {
  if (departmentId == null) return false;
  const count = await prisma.department.count({
    where: { id: departmentId, managerId: userId },
  });
  return count > 0;
}
