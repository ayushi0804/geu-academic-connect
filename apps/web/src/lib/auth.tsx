import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { api } from './api';

export type Role = 'student' | 'faculty' | 'admin' | 'placement';
export interface User { _id: string; name: string; email: string; role: Role; department?: any; program?: any; semester?: number; section?: string; idNumber?: string; designation?: string; phone?: string; photo?: string; profileCompletion?: number; notificationPrefs?: Record<string, boolean>; status: string }
interface Ctx { user: User | null; loading: boolean; login: (email: string, password: string) => Promise<User>; logout: () => Promise<void>; refresh: () => Promise<unknown> }
const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['me'], queryFn: async () => (await api<{ user: User }>('/auth/me')).data.user, retry: false, staleTime: 5 * 60_000 });
  useEffect(() => {
    const h = () => qc.setQueryData(['me'], null);
    window.addEventListener('gac:unauthorized', h);
    return () => window.removeEventListener('gac:unauthorized', h);
  }, [qc]);
  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api<{ user: User }>('/auth/login', { body: { email, password } });
    //qc.clear();
    qc.setQueryData(['me'], data.user);
    return data.user;
  }, [qc]);
  const logout = useCallback(async () => { await api('/auth/logout', { method: 'POST', body: {} }).catch(() => undefined);  qc.setQueryData(['me'], null); }, [qc]);
  const value = useMemo<Ctx>(() => ({ user: q.data ?? null, loading: q.isLoading, login, logout, refresh: () => qc.invalidateQueries({ queryKey: ['me'] }) }), [q.data, q.isLoading, login, logout, qc]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => { const c = useContext(AuthCtx); if (!c) throw new Error('useAuth must be used inside AuthProvider'); return c; };
