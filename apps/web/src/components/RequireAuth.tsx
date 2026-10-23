import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, type Role } from '@/lib/auth';
import { UnauthorizedPage } from '@/pages/ErrorPages';
import { Spinner } from './ui';

/** Route guard: redirects anonymous users to /login and shows an access page for the wrong role. Real enforcement is on the API. */
export function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner label="Checking your session…" />;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (roles && !roles.includes(user.role)) return <UnauthorizedPage />;
  return <>{children}</>;
}
