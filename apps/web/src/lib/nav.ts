import { BarChart3, Bell, BookOpen, Briefcase, CalendarDays, CalendarRange, ClipboardCheck, FileText, GraduationCap, History, LayoutDashboard, Library, Megaphone, Settings, ShieldCheck, Users, Workflow, type LucideIcon } from 'lucide-react';
import type { Role } from './auth';

export interface NavItem { to: string; label: string; icon: LucideIcon; roles: Role[]; group?: 'Administration' }
const ALL: Role[] = ['student', 'faculty', 'admin', 'placement'];
export const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ALL },
  { to: '/timetable', label: 'Timetable', icon: CalendarDays, roles: ['student', 'faculty', 'admin'] },
  { to: '/calendar', label: 'Calendar', icon: CalendarRange, roles: ['student', 'faculty', 'admin'] },
  { to: '/attendance', label: 'Attendance', icon: ClipboardCheck, roles: ['student', 'faculty', 'admin'] },
  { to: '/assignments', label: 'Assignments', icon: FileText, roles: ['student', 'faculty', 'admin'] },
  { to: '/materials', label: 'Materials', icon: Library, roles: ['student', 'faculty', 'admin'] },
  { to: '/results', label: 'Results', icon: GraduationCap, roles: ['student', 'faculty'] },
  { to: '/notices', label: 'Notices', icon: Megaphone, roles: ALL },
  { to: '/placements', label: 'Placements', icon: Briefcase, roles: ['student', 'placement', 'admin'] },
  { to: '/directory', label: 'Directory', icon: BookOpen, roles: ALL },
  { to: '/reports', label: 'Analytics & reports', icon: BarChart3, roles: ['admin', 'placement'] },
  { to: '/notifications', label: 'Notifications', icon: Bell, roles: ALL },
  { to: '/admin/users', label: 'Users', icon: Users, roles: ['admin'], group: 'Administration' },
  { to: '/admin/academics', label: 'Academic setup', icon: Workflow, roles: ['admin'], group: 'Administration' },
  { to: '/admin/allocations', label: 'Allocations & enrollment', icon: ShieldCheck, roles: ['admin'], group: 'Administration' },
  { to: '/admin/timetable', label: 'Timetable manager', icon: CalendarDays, roles: ['admin'], group: 'Administration' },
  { to: '/admin/audit', label: 'Audit logs', icon: History, roles: ['admin'], group: 'Administration' },
  { to: '/admin/settings', label: 'Configuration', icon: Settings, roles: ['admin'], group: 'Administration' },
];
export const labelFor = (path: string) => NAV.find((n) => (n.to === '/' ? path === '/' : path.startsWith(n.to)))?.label ?? (path.startsWith('/profile') ? 'Profile' : path.startsWith('/search') ? 'Search' : 'Page');
