import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, GraduationCap, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { Logo } from '@/components/AppShell';
import { Button, Input, Label } from '@/components/ui';
import { api, errMsg } from '@/lib/api';
import { useAuth } from '@/lib/auth';

function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 text-sidebar-fg lg:flex">
        <div className="text-white"><Logo /></div>
        <div className="relative z-10 max-w-md">
          <p className="font-display text-4xl font-semibold leading-tight text-white">One place for classes, grades and careers.</p>
          <p className="mt-4 text-sm leading-relaxed opacity-80">Attendance, assignments, results, timetables, notices and placements — for students, faculty, administrators and placement officers.</p>
          <ul className="mt-8 space-y-3 text-sm"><li className="flex items-center gap-3"><ShieldCheck className="h-4 w-4 text-accent" />Role-based access, audited changes</li><li className="flex items-center gap-3"><GraduationCap className="h-4 w-4 text-accent" />Every figure computed from live records</li></ul>
        </div>
        <p className="text-xs opacity-60">Fictional demo project. Not affiliated with or endorsed by Graphic Era University.</p>
        <svg className="pointer-events-none absolute -bottom-24 -right-24 opacity-[.07]" width="520" height="520" viewBox="0 0 32 32" aria-hidden><path d="M2 26L16 6l14 20M8 26l8-11 8 11" stroke="white" strokeWidth="1.2" fill="none" /></svg>
      </section>
      <main className="flex items-center justify-center bg-bg p-6">
        <div className="w-full max-w-sm animate-fade">
          <div className="mb-8 lg:hidden"><Logo /></div>
          <h1 className="text-3xl font-semibold">{title}</h1><p className="mb-6 mt-1 text-sm text-muted-fg">{subtitle}</p>{children}
        </div>
      </main>
    </div>
  );
}

export const loginSchema = z.object({ email: z.string().min(1, 'Email is required').email('Enter a valid email address'), password: z.string().min(1, 'Password is required') });

export function LoginForm({ onLogin }: { onLogin: (email: string, password: string) => Promise<unknown> }) {
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });
  return (
    <form noValidate onSubmit={handleSubmit(async (v) => { setError(''); try { await onLogin(v.email, v.password); } catch (e) { setError(errMsg(e)); } })} className="space-y-4">
      {error && <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
      <div><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="username" aria-invalid={!!errors.email} {...register('email')} />{errors.email && <p role="alert" className="mt-1 text-xs text-danger">{errors.email.message}</p>}</div>
      <div><Label htmlFor="password">Password</Label>
        <div className="relative"><Input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" aria-invalid={!!errors.password} className="pr-10" {...register('password')} />
          <button type="button" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)} className="absolute right-2 top-2 rounded p-0.5 text-muted-fg hover:text-fg">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
        {errors.password && <p role="alert" className="mt-1 text-xs text-danger">{errors.password.message}</p>}</div>
      <Button type="submit" className="w-full" loading={isSubmitting}>Sign in</Button>
    </form>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your GEU Academic Connect account.">
      <LoginForm onLogin={async (e, p) => { await login(e, p); nav((loc.state as any)?.from ?? '/', { replace: true }); }} />
      <p className="mt-4 text-center text-sm"><Link to="/forgot-password" className="text-primary hover:underline">Forgot your password?</Link></p>
      <p className="mt-8 rounded-lg bg-muted p-3 text-xs text-muted-fg">Accounts are created by an administrator. Demo credentials are set up with <code className="font-mono">npm run seed:demo</code> (see README).</p>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const [done, setDone] = useState<any>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(z.object({ email: z.string().email('Enter a valid email address') })) });
  return (
    <AuthLayout title="Reset your password" subtitle="We’ll prepare a single-use link that expires in one hour.">
      {done ? (
        <div className="space-y-3 text-sm"><p className="rounded-lg bg-success/10 p-3 text-success">{done.message}</p>
          {done.devResetLink ? <p className="rounded-lg border border-border p-3 text-xs">Email is not configured on this server, so (development only) here is your link: <Link className="break-all text-primary underline" to={`/set-password?${done.devResetLink.split('?')[1]}`}>open reset page</Link></p>
            : <p className="text-muted-fg">{done.emailConfigured ? 'Check your inbox for the link.' : 'Email delivery is not configured. Ask an administrator to issue a new invitation.'}</p>}
          <Link to="/login" className="text-primary hover:underline">Back to sign in</Link></div>
      ) : (
        <form noValidate className="space-y-4" onSubmit={handleSubmit(async (v) => { try { setDone((await api('/auth/forgot-password', { body: v })).data); } catch (e) { toast.error(errMsg(e)); } })}>
          <div><Label htmlFor="fe">Email</Label><Input id="fe" type="email" aria-invalid={!!errors.email} {...register('email')} />{errors.email && <p role="alert" className="mt-1 text-xs text-danger">{String(errors.email.message)}</p>}</div>
          <Button type="submit" className="w-full" loading={isSubmitting}>Send reset link</Button><p className="text-center text-sm"><Link to="/login" className="text-primary hover:underline">Back to sign in</Link></p>
        </form>
      )}
    </AuthLayout>
  );
}

export const passwordSchema = z.object({
  password: z.string().min(10, 'At least 10 characters').regex(/[a-z]/, 'Include a lowercase letter').regex(/[A-Z]/, 'Include an uppercase letter').regex(/\d/, 'Include a number'),
  confirm: z.string(),
}).refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

export function SetPasswordPage() {
  const [sp] = useSearchParams();
  const token = sp.get('token') ?? ''; const invite = sp.get('type') === 'invite';
  const nav = useNavigate();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(passwordSchema) });
  return (
    <AuthLayout title={invite ? 'Activate your account' : 'Choose a new password'} subtitle="Use at least 10 characters with upper and lower case letters and a number.">
      {token.length !== 64 ? <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">This link is incomplete. Request a new one.</p> : (
        <form noValidate className="space-y-4" onSubmit={handleSubmit(async (v) => { try { await api('/auth/set-password', { body: { token, password: v.password } }); toast.success('Password saved. You can sign in now.'); nav('/login'); } catch (e) { toast.error(errMsg(e)); } })}>
          <div><Label htmlFor="np">New password</Label><Input id="np" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register('password')} />{errors.password && <p role="alert" className="mt-1 text-xs text-danger">{String(errors.password.message ?? '')}</p>}</div>
          <div><Label htmlFor="cp">Confirm password</Label><Input id="cp" type="password" autoComplete="new-password" aria-invalid={!!errors.confirm} {...register('confirm')} />{errors.confirm && <p role="alert" className="mt-1 text-xs text-danger">{String(errors.confirm.message ?? '')}</p>}</div>
          <Button type="submit" className="w-full" loading={isSubmitting}>{invite ? 'Activate account' : 'Save password'}</Button>
        </form>
      )}
    </AuthLayout>
  );
}
