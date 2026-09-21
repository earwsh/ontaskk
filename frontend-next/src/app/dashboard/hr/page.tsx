import { redirect } from 'next/navigation';

/** The role was renamed to «مدیر داخلی»; keep old bookmarks working. */
export default function HrRedirect() {
  redirect('/dashboard/internal');
}
