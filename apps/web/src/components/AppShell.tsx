import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, ChevronsLeft, ChevronsRight, LogOut, Menu, Moon, Search, Sun, User as UserIcon, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { NAV, labelFor } from '@/lib/nav';
import { useTheme } from '@/lib/theme';
import { cn, fmtDateTime, initials } from '@/lib/utils';
import { Badge, useDropdown } from './ui';

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden><rect width="32" height="32" rx="8" fill="hsl(224 52% 22%)" /><path d="M8 21l8-10 8 10M12 21l4-5 4 5" stroke="hsl(40 62% 62%)" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      {!compact && <div className="leading-tight"><p className="font-display text-[15px] font-semibold">Academic Connect</p><p className="text-[10px] uppercase tracking-widest opacity-60">Demo campus platform</p></div>}
    </div>
  );
}

function NotificationBell() {
  const dd = useDropdown();
  const qc = useQueryClient();
  const list = useApi<any[]>('/notifications', { limit: 5 }, { refetchInterval: 60_000 });
  const readAll = useMutation({ mutationFn: () => api('/notifications/read-all', { method: 'POST', body: {} }), onSuccess: () => qc.invalidateQueries({ queryKey: ['/notifications'] }) });
  const unread = list.data?.meta?.unread ?? 0;
  return (
    <div className="relative" ref={dd.ref}>
      <button aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={dd.open} onClick={() => dd.setOpen(!dd.open)} className="relative rounded-lg p-2 hover:bg-muted">
        <Bell className="h-5 w-5" />{unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {dd.open && (
        <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] animate-fade rounded-xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5"><p className="text-sm font-semibold">Notifications</p>
            <button disabled={!unread} onClick={() => readAll.mutate()} className="text-xs text-primary disabled:opacity-40">Mark all read</button></div>
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {(list.data?.data ?? []).length === 0 && <li className="p-6 text-center text-sm text-muted-fg">You’re all caught up.</li>}
            {list.data?.data.map((n: any) => (
              <li key={n._id}><Link to={n.link ?? '/notifications'} onClick={() => dd.setOpen(false)} className={cn('block px-4 py-2.5 text-sm hover:bg-muted', !n.read && 'bg-primary/5')}>
                <p className={cn(!n.read && 'font-medium')}>{n.title}</p><p className="text-xs text-muted-fg">{fmtDateTime(n.createdAt)}</p></Link></li>
            ))}
          </ul>
          <Link to="/notifications" onClick={() => dd.setOpen(false)} className="block border-t border-border px-4 py-2.5 text-center text-sm text-primary">View all</Link>
        </div>
      )}
    </div>
  );
}

function ProfileMenu() {
  const dd = useDropdown();
  const { user, logout } = useAuth();
  const nav = useNavigate();
  if (!user) return null;
  return (
    <div className="relative" ref={dd.ref}>
      <button onClick={() => dd.setOpen(!dd.open)} aria-expanded={dd.open} aria-label="Account menu" className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-muted">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-fg">{initials(user.name)}</span>
        <span className="hidden text-left leading-tight md:block"><span className="block text-sm font-medium">{user.name}</span><span className="block text-xs capitalize text-muted-fg">{user.role}</span></span>
      </button>
      {dd.open && (
        <div className="absolute right-0 z-40 mt-2 w-56 animate-fade rounded-xl border border-border bg-card p-1 shadow-2xl">
          <div className="px-3 py-2 text-xs text-muted-fg">{user.email}</div>
          <Link to="/profile" onClick={() => dd.setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted"><UserIcon className="h-4 w-4" />Profile & settings</Link>
          <button onClick={async () => { await logout(); nav('/login'); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger hover:bg-muted"><LogOut className="h-4 w-4" />Sign out</button>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { theme, toggle } = useTheme();
  const loc = useLocation();
  const nav = useNavigate();
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('gac-sidebar') === '1'; } catch { return false; } });
  const [mobile, setMobile] = useState(false);
  const [q, setQ] = useState('');
  useEffect(() => setMobile(false), [loc.pathname]);
  useEffect(() => { try { localStorage.setItem('gac-sidebar', collapsed ? '1' : '0'); } catch { /* ignore */ } }, [collapsed]);
  const items = NAV.filter((n) => user && n.roles.includes(user.role));
  const groups: [string, typeof items][] = [['Workspace', items.filter((i) => !i.group)], ['Administration', items.filter((i) => i.group)]];

  const side = (compact: boolean) => (
    <nav aria-label="Main navigation" className="flex h-full flex-col bg-sidebar text-sidebar-fg">
      <div className="flex h-16 items-center justify-between px-4 text-white"><Link to="/" aria-label="Home"><Logo compact={compact} /></Link>
        <button className="rounded p-1 hover:bg-white/10 lg:hidden" aria-label="Close menu" onClick={() => setMobile(false)}><X className="h-5 w-5" /></button></div>
      <div className="flex-1 space-y-5 overflow-y-auto px-2 py-3">
        {groups.filter(([, g]) => g.length).map(([name, g]) => (
          <div key={name}>
            {!compact && <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest opacity-50">{name}</p>}
            <ul className="space-y-0.5">{g.map((n) => (
              <li key={n.to}><NavLink to={n.to} end={n.to === '/'} title={compact ? n.label : undefined}
                className={({ isActive }) => cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors', isActive ? 'bg-white/10 font-medium text-white shadow-[inset_3px_0_0_hsl(40_62%_62%)]' : 'hover:bg-white/5')}>
                <n.icon className="h-[18px] w-[18px] shrink-0" />{!compact && <span className="truncate">{n.label}</span>}</NavLink></li>
            ))}</ul>
          </div>
        ))}
      </div>
      <button onClick={() => setCollapsed(!collapsed)} className="m-2 hidden items-center justify-center gap-2 rounded-lg p-2 text-xs hover:bg-white/10 lg:flex" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
        {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" />Collapse</>}</button>
    </nav>
  );

  const crumbs = ['Home', ...(loc.pathname === '/' ? [] : loc.pathname.startsWith('/admin') ? ['Administration', labelFor(loc.pathname)] : [labelFor(loc.pathname)])];
  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-fg">Skip to content</a>
      <aside className={cn('fixed inset-y-0 left-0 z-30 hidden transition-[width] lg:block', collapsed ? 'w-16' : 'w-64')}>{side(collapsed)}</aside>
      {mobile && <div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-black/50" onClick={() => setMobile(false)} /><aside className="absolute inset-y-0 left-0 w-72 animate-fade">{side(false)}</aside></div>}
      <div className={cn('transition-[padding]', collapsed ? 'lg:pl-16' : 'lg:pl-64')}>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur">
          <button className="rounded-lg p-2 hover:bg-muted lg:hidden" aria-label="Open menu" onClick={() => setMobile(true)}><Menu className="h-5 w-5" /></button>
          <form role="search" className="relative max-w-md flex-1" onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= 2) { nav(`/search?q=${encodeURIComponent(q.trim())}`); } }}>
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-fg" />
            <input aria-label="Global search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notices, subjects, materials…" className="field pl-9" />
          </form>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} className="rounded-lg p-2 hover:bg-muted">{theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</button>
            <NotificationBell /><ProfileMenu />
          </div>
        </header>
        <nav aria-label="Breadcrumb" className="no-print px-4 pt-4 text-xs text-muted-fg sm:px-8">
          <ol className="flex flex-wrap items-center gap-1.5">{crumbs.map((c, i) => <li key={i} className="flex items-center gap-1.5">{i > 0 && <span aria-hidden>/</span>}{i === crumbs.length - 1 ? <span aria-current="page" className="text-fg">{c}</span> : i === 0 ? <Link to="/" className="hover:text-fg">{c}</Link> : <span>{c}</span>}</li>)}</ol>
        </nav>
        <main id="main" className="px-4 pb-16 pt-4 sm:px-8"><div className="mx-auto max-w-7xl animate-fade">{children}</div></main>
        <footer className="no-print border-t border-border px-8 py-4 text-center text-xs text-muted-fg">GEU Academic Connect is a <Badge tone="accent">fictional demo</Badge> project — not an official Graphic Era University system.</footer>
      </div>
    </div>
  );
}
