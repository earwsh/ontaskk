'use client';

import { useEffect, useState } from 'react';

function getStoredUser() {
  try {
    const stored = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    if (!stored || !token) return null;
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export default function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      window.location.href = '/login';
      return;
    }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      window.location.href = '/dashboard';
      return;
    }
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return <>{children}</>;
}
