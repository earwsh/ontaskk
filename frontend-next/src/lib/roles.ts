/**
 * The single source of role names and ordering for the UI.
 *
 * These labels were previously copy-pasted into eight files, which is how
 * "مدیر منابع انسانی" ended up written three different ways. Renaming a role
 * now means editing one line here.
 */
export type Role =
  | 'CEO'
  | 'TECHNICAL_MANAGER'
  | 'INTERNAL_MANAGER'
  | 'STRATEGY_MANAGER'
  | 'DEPARTMENT_MANAGER'
  | 'EMPLOYEE'
  | 'CUSTOMER';

export const roleLabels: Record<string, string> = {
  CEO: 'مدیر عامل',
  TECHNICAL_MANAGER: 'مدیر فنی',
  INTERNAL_MANAGER: 'مدیر داخلی',
  STRATEGY_MANAGER: 'مدیر استراتژی',
  DEPARTMENT_MANAGER: 'مدیر دپارتمان',
  EMPLOYEE: 'کارمند',
  CUSTOMER: 'مشتری',
};

/**
 * Authority order, highest first: مدیرعامل ← مدیر فنی ← مدیر داخلی.
 * Used for sorting people lists so seniority reads top-down.
 */
export const roleOrder: Role[] = [
  'CEO',
  'TECHNICAL_MANAGER',
  'INTERNAL_MANAGER',
  'STRATEGY_MANAGER',
  'DEPARTMENT_MANAGER',
  'EMPLOYEE',
  'CUSTOMER',
];

export const roleRank = (role: string): number => {
  const i = roleOrder.indexOf(role as Role);
  return i === -1 ? roleOrder.length : i;
};

export const roleLabel = (role: string): string => roleLabels[role] || role;

/** Assignable roles for the user form and registration, in authority order. */
export const assignableRoles = roleOrder
  .filter((r) => r !== 'CUSTOMER')
  .map((value) => ({ value, label: roleLabels[value] }));
