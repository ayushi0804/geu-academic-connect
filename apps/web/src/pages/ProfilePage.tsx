import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { DynamicForm, type Field } from '@/components/DynamicForm';
import { Button, Card, CardHeader, Input, Label, PageHeader, ProgressBar, Tabs } from '@/components/ui';
import { api, toastError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { initials } from '@/lib/utils';
import { passwordSchema } from './AuthPages';

const PREFS: [string, string, string][] = [['assignment', 'Assignments', 'New assignments, deadline changes and reminders'], ['notice', 'Notices', 'New announcements for you'], ['marks', 'Marks & results', 'Published or updated marks'], ['attendance', 'Attendance warnings', 'When attendance drops below the threshold'], ['timetable', 'Timetable changes', 'New, changed or cancelled classes'], ['placement', 'Placements', 'New opportunities and application updates'], ['email', 'Email copies', 'Only works if the server has SMTP configured']];

export function ProfilePage() {
  const { user, refresh } = useAuth();
  const { theme, toggle } = useTheme();
  const [tab, setTab] = useState('profile');
  const patch = useMutation({ mutationFn: (b: any) => api('/auth/me', { method: 'PATCH', body: b }), onSuccess: () => { toast.success('Saved'); refresh(); }, onError: toastError });
  const pw = useMutation({ mutationFn: (b: any) => api('/auth/change-password', { body: b }), onSuccess: () => toast.success('Password changed. Other sessions were signed out.'), onError: toastError });
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ resolver: zodResolver(z.object({ currentPassword: z.string().min(1, 'Required'), password: passwordSchema.innerType().shape.password, confirm: z.string() }).refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })) });
  if (!user) return null;
  const fields: Field[] = [{ name: 'name', label: 'Full name', type: 'text', required: true, minLength: 2, maxLength: 120 }, { name: 'phone', label: 'Phone', type: 'text', maxLength: 20 }, { name: 'photo', label: 'Profile photo (PNG/JPG)', type: 'file', filePurpose: 'avatar' }];
  const row = (k: string, v: any) => v ? <div key={k} className="flex justify-between gap-4 py-1.5 text-sm"><dt className="text-muted-fg">{k}</dt><dd className="text-right font-medium">{v}</dd></div> : null;
  return (
    <>
      <PageHeader title="Profile & settings" />
      <Tabs tabs={[{ id: 'profile', label: 'Profile' }, { id: 'security', label: 'Security' }, { id: 'notifications', label: 'Notifications' }, { id: 'appearance', label: 'Appearance' }]} value={tab} onChange={setTab} />
      {tab === 'profile' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <Card className="p-5"><div className="mb-4 flex items-center gap-4">{user.photo ? <img src={`/api/v1/files/${user.photo}/download`} alt="" className="h-16 w-16 rounded-full object-cover" /> : <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-xl font-semibold text-primary-fg">{initials(user.name)}</span>}
            <div><p className="font-display text-xl font-semibold">{user.name}</p><p className="text-sm capitalize text-muted-fg">{user.role}</p></div></div>
            <div className="mb-4"><div className="mb-1 flex justify-between text-xs"><span>Profile completion</span><span>{user.profileCompletion ?? 0}%</span></div><ProgressBar value={user.profileCompletion ?? 0} tone="success" /></div>
            <dl className="divide-y divide-border">{row('Email', user.email)}{row('ID', user.idNumber)}{row('Department', user.department?.name)}{row('Program', user.program?.name)}{row('Semester', user.semester)}{row('Section', user.section)}{row('Designation', user.designation)}{row('Status', user.status)}</dl>
            <p className="mt-3 text-xs text-muted-fg">Academic details are managed by administrators.</p></Card>
          <Card><CardHeader title="Edit profile" /><div className="p-5"><DynamicForm fields={fields} initial={user as any} loading={patch.isPending} onSubmit={(v) => patch.mutate(v)} /></div></Card>
        </div>)}
      {tab === 'security' && <Card className="max-w-lg"><CardHeader title="Change password" sub="You’ll stay signed in here; other devices are signed out." />
        <form noValidate className="space-y-4 p-5" onSubmit={handleSubmit((v) => pw.mutate({ currentPassword: v.currentPassword, newPassword: v.password }, { onSuccess: () => reset() }))}>
          {([['currentPassword', 'Current password', 'current-password'], ['password', 'New password', 'new-password'], ['confirm', 'Confirm new password', 'new-password']] as const).map(([n, l, ac]) => <div key={n}><Label htmlFor={n}>{l}</Label><Input id={n} type="password" autoComplete={ac} aria-invalid={!!(errors as any)[n]} {...register(n)} />{(errors as any)[n] && <p role="alert" className="mt-1 text-xs text-danger">{(errors as any)[n].message}</p>}</div>)}
          <Button type="submit" loading={pw.isPending}>Update password</Button></form></Card>}
      {tab === 'notifications' && <Card className="max-w-2xl"><CardHeader title="In-app notification preferences" sub="Choose which events create notifications for you." /><ul className="divide-y divide-border">{PREFS.map(([k, l, h]) => (
        <li key={k} className="flex items-center justify-between gap-4 px-5 py-3"><div><p className="text-sm font-medium">{l}</p><p className="text-xs text-muted-fg">{h}</p></div>
          <input type="checkbox" role="switch" aria-label={l} className="h-5 w-5 accent-[hsl(var(--primary))]" checked={user.notificationPrefs?.[k] ?? k !== 'email'} onChange={(e) => patch.mutate({ notificationPrefs: { [k]: e.target.checked } })} /></li>))}</ul></Card>}
      {tab === 'appearance' && <Card className="max-w-lg p-5"><p className="mb-3 text-sm text-muted-fg">Your theme is remembered on this device.</p><Button variant="outline" onClick={toggle}>{theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}Switch to {theme === 'dark' ? 'light' : 'dark'} theme</Button></Card>}
    </>
  );
}
