import { NavIcon } from './icons';

export interface NavLink {
  label: string;
  href: string;
  icon: NavIcon;
  /** Shows a «بزودی» chip and dims the entry until the feature is switched on. */
  soon?: boolean;
}

export interface NavGroup {
  /** Section heading. An empty string renders the group without a heading. */
  title: string;
  links: NavLink[];
}

export interface RoleNav {
  title: string;
  groups: NavGroup[];
}

const home = (href: string): NavLink => ({ label: 'داشبورد', href, icon: 'dashboard' });

const myFinanceLink: NavLink = { label: 'مالی و حقوق من', href: '/dashboard/my-finance', icon: 'finance' };

const myWork = (extra: NavLink[] = []): NavGroup => ({
  title: 'کار من',
  links: [
    { label: 'تسک‌های من', href: '/dashboard/my-tasks', icon: 'myTasks' },
    { label: 'پیام‌رسان', href: '/dashboard/chat', icon: 'chat' },
    myFinanceLink,
    ...extra,
  ],
});

const approvals: NavLink = { label: 'تایید تسک‌ها', href: '/dashboard/approvals', icon: 'approvals' };
export const qcLink: NavLink = { label: 'کنترل کیفیت', href: '/dashboard/qc', icon: 'qc' };
/** Site form inbox — CEO and technical manager only. */
const formsLink: NavLink = { label: 'فرم‌های سایت', href: '/dashboard/forms', icon: 'forms' };
const storageLink: NavLink = { label: 'فضای ذخیره‌سازی', href: '/dashboard/storage', icon: 'storage', soon: true };
const analyticsLink: NavLink = { label: 'تحلیل', href: '/dashboard/analytics', icon: 'analytics' };
const ticketsLink: NavLink = { label: 'تیکت‌های پشتیبانی', href: '/dashboard/tech/tickets', icon: 'ticket' };
const financeLink: NavLink = { label: 'مالی', href: '/dashboard/finance', icon: 'finance' };

export const roleNav: Record<string, RoleNav> = {
  CEO: {
    title: 'مدیر عامل',
    groups: [
      { title: '', links: [home('/dashboard/ceo')] },
      myWork(),
      {
        title: 'سازمان',
        links: [
          { label: 'کاربران', href: '/dashboard/users', icon: 'users' },
          { label: 'پروژه‌ها', href: '/dashboard/projects', icon: 'projects' },
          financeLink,
          { label: 'دپارتمان‌ها', href: '/dashboard/departments', icon: 'departments' },
          { label: 'تسک‌های سازمان', href: '/dashboard/tech/tasks', icon: 'orgTasks' },
          approvals,
          ticketsLink,
        ],
      },
      { title: 'تحلیل و ابزار', links: [analyticsLink, formsLink, storageLink] },
    ],
  },
  INTERNAL_MANAGER: {
    title: 'مدیر داخلی',
    groups: [
      { title: '', links: [home('/dashboard/internal')] },
      myWork(),
      {
        title: 'سازمان',
        links: [
          { label: 'کاربران', href: '/dashboard/users', icon: 'users' },
          { label: 'دپارتمان‌ها', href: '/dashboard/departments', icon: 'departments' },
          { label: 'پروژه‌ها', href: '/dashboard/projects', icon: 'projects' },
          financeLink,
          { label: 'تسک‌های سازمان', href: '/dashboard/tech/tasks', icon: 'orgTasks' },
          { label: 'حضور و غیاب', href: '/dashboard/internal/attendance', icon: 'attendance' },
          approvals,
        ],
      },
      { title: 'تحلیل و ابزار', links: [analyticsLink, formsLink] },
    ],
  },
  TECHNICAL_MANAGER: {
    title: 'مدیر فنی',
    groups: [
      { title: '', links: [home('/dashboard/tech')] },
      myWork(),
      {
        title: 'سازمان',
        links: [
          { label: 'دپارتمان‌ها', href: '/dashboard/departments', icon: 'departments' },
          { label: 'پروژه‌ها', href: '/dashboard/projects', icon: 'projects' },
          financeLink,
          { label: 'تسک‌های سازمان', href: '/dashboard/tech/tasks', icon: 'orgTasks' },
          approvals,
          ticketsLink,
        ],
      },
      {
        title: 'تحلیل و ابزار',
        links: [analyticsLink, formsLink, storageLink, { label: 'وب‌هوک‌ها', href: '/dashboard/webhooks', icon: 'webhook' }],
      },
    ],
  },
  STRATEGY_MANAGER: {
    title: 'مدیر استراتژی',
    groups: [
      { title: '', links: [home('/dashboard/tech')] },
      myWork(),
      {
        title: 'سازمان',
        links: [
          { label: 'دپارتمان‌ها', href: '/dashboard/departments', icon: 'departments' },
          { label: 'پروژه‌ها', href: '/dashboard/projects', icon: 'projects' },
          financeLink,
          { label: 'تسک‌های سازمان', href: '/dashboard/tech/tasks', icon: 'orgTasks' },
          approvals,
        ],
      },
      { title: 'تحلیل', links: [analyticsLink] },
    ],
  },
  DEPARTMENT_MANAGER: {
    title: 'مدیر دپارتمان',
    groups: [
      { title: '', links: [home('/dashboard/dept')] },
      myWork(),
      {
        title: 'دپارتمان',
        links: [
          { label: 'پروژه‌ها', href: '/dashboard/projects', icon: 'projects' },
          financeLink,
          { label: 'تسک‌های دپارتمان', href: '/dashboard/dept/tasks', icon: 'orgTasks' },
          approvals,
        ],
      },
      { title: 'تحلیل', links: [analyticsLink] },
    ],
  },
  EMPLOYEE: {
    title: 'کارمند',
    groups: [
      { title: '', links: [home('/dashboard/employee')] },
      myWork([{ label: 'پروژه‌ها', href: '/dashboard/projects', icon: 'projects' }]),
    ],
  },
  CUSTOMER: {
    title: 'مشتری',
    groups: [
      { title: '', links: [home('/dashboard/customer')] },
      { title: 'کار من', links: [{ label: 'پیام‌رسان', href: '/dashboard/chat', icon: 'chat' }] },
    ],
  },
};
