import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Loader2, X } from 'lucide-react';
import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'; size?: 'sm' | 'md'; loading?: boolean };
export const Button = forwardRef<HTMLButtonElement, BtnProps>(({ variant = 'primary', size = 'md', loading, className, children, disabled, ...p }, ref) => (
  <button ref={ref} type="button" disabled={disabled || loading} {...p}
    className={cn('inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50', size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2 text-sm',
      { primary: 'bg-primary text-primary-fg hover:opacity-90', secondary: 'bg-muted text-fg hover:bg-border', ghost: 'text-fg hover:bg-muted', danger: 'bg-danger text-white hover:opacity-90', outline: 'border border-border bg-card hover:bg-muted' }[variant], className)}>
    {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{children}
  </button>
));
Button.displayName = 'Button';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => <input ref={ref} className={cn('field', className)} {...p} />);
Input.displayName = 'Input';
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => <textarea ref={ref} rows={3} className={cn('field', className)} {...p} />);
Textarea.displayName = 'Textarea';
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => <select ref={ref} className={cn('field pr-8', className)} {...p} />);
Select.displayName = 'Select';

export const Card = ({ className, children, ...p }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) => <div className={cn('rounded-xl border border-border bg-card shadow-card', className)} {...p}>{children}</div>;
export const CardHeader = ({ title, action, sub }: { title: ReactNode; action?: ReactNode; sub?: ReactNode }) => (
  <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
    <div><h3 className="text-base font-semibold">{title}</h3>{sub && <p className="text-xs text-muted-fg">{sub}</p>}</div>{action}
  </div>
);

const tones: Record<string, string> = {
  neutral: 'bg-muted text-muted-fg', success: 'bg-success/15 text-success', warning: 'bg-warning/15 text-warning', danger: 'bg-danger/15 text-danger', primary: 'bg-primary/15 text-primary', accent: 'bg-accent/20 text-fg',
};
export const Badge = ({ tone = 'neutral', children, className }: { tone?: keyof typeof tones; children: ReactNode; className?: string }) => <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize', tones[tone], className)}>{children}</span>;
const STATUS_TONE: Record<string, string> = {
  active: 'success', published: 'success', accepted: 'success', selected: 'success', open: 'success', present: 'success', graded: 'success', completed: 'success',
  invited: 'warning', draft: 'warning', pending: 'warning', applied: 'primary', shortlisted: 'primary', interview: 'accent', offered: 'accent', late: 'warning', scheduled: 'primary', upcoming: 'primary', submitted: 'primary', high: 'warning', normal: 'neutral', low: 'neutral', leave: 'neutral',
  inactive: 'danger', rejected: 'danger', declined: 'danger', absent: 'danger', closed: 'neutral', withdrawn: 'neutral', cancelled: 'danger', urgent: 'danger', dropped: 'danger',
};
export const StatusBadge = ({ value }: { value?: string }) => (value ? <Badge tone={(STATUS_TONE[value] ?? 'neutral') as any}>{value}</Badge> : <span className="text-muted-fg">—</span>);

export const Skeleton = ({ className }: { className?: string }) => <div className={cn('animate-pulse rounded-md bg-muted', className)} aria-hidden />;
export const Spinner = ({ label = 'Loading…' }: { label?: string }) => <div role="status" className="flex items-center justify-center gap-2 p-10 text-sm text-muted-fg"><Loader2 className="h-4 w-4 animate-spin" />{label}</div>;
export const SkeletonRows = ({ n = 5 }: { n?: number }) => <div className="space-y-2 p-4" role="status" aria-label="Loading">{Array.from({ length: n }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>;

export const EmptyState = ({ title, hint, action, icon }: { title: string; hint?: string; action?: ReactNode; icon?: ReactNode }) => (
  <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
    <div className="rounded-full bg-muted p-3 text-muted-fg">{icon ?? <Inbox className="h-5 w-5" />}</div>
    <p className="font-medium">{title}</p>{hint && <p className="max-w-sm text-sm text-muted-fg">{hint}</p>}{action}
  </div>
);
export const ErrorState = ({ error, onRetry }: { error: unknown; onRetry?: () => void }) => (
  <div role="alert" className="flex flex-col items-center gap-2 px-6 py-10 text-center">
    <div className="rounded-full bg-danger/15 p-3 text-danger"><AlertTriangle className="h-5 w-5" /></div>
    <p className="font-medium">We couldn’t load this</p>
    <p className="max-w-sm text-sm text-muted-fg">{error instanceof Error ? error.message : 'Unexpected error'}</p>
    {onRetry && <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>}
  </div>
);

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>{description && <p className="mt-1 max-w-2xl text-sm text-muted-fg">{description}</p>}</div>
      <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}

export function StatCard({ label, value, hint, icon, tone = 'primary' }: { label: string; value: ReactNode; hint?: string; icon?: ReactNode; tone?: 'primary' | 'success' | 'warning' | 'danger' | 'accent' }) {
  return (
    <Card className="animate-fade p-4">
      <div className="flex items-center justify-between"><p className="text-xs font-medium uppercase tracking-wide text-muted-fg">{label}</p>{icon && <span className={cn('rounded-lg p-1.5', tones[tone])}>{icon}</span>}</div>
      <p className="mt-2 font-display text-3xl font-semibold tabular-nums">{value}</p>{hint && <p className="mt-0.5 text-xs text-muted-fg">{hint}</p>}
    </Card>
  );
}

/** Accessible modal built on the native <dialog> element (focus trap + Esc handled by the browser). */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) (typeof d.showModal === 'function' ? d.showModal() : d.setAttribute('open', ''));
    if (!open && d.open) (typeof d.close === 'function' ? d.close() : d.removeAttribute('open'));
  }, [open]);
  return (
    <dialog ref={ref} aria-label={title} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}
      className={cn('m-auto w-[calc(100%-2rem)] rounded-2xl border border-border bg-card p-0 text-fg shadow-2xl', wide ? 'max-w-3xl' : 'max-w-lg')}>
      {open && (
        <div className="max-h-[85vh] overflow-y-auto">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-5 py-3"><h2 className="text-lg font-semibold">{title}</h2>
            <button aria-label="Close dialog" onClick={onClose} className="rounded-md p-1 hover:bg-muted"><X className="h-4 w-4" /></button></div>
          <div className="p-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger, loading, onConfirm, onClose }: { open: boolean; title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm text-muted-fg">{message}</p>
      <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button></div>
    </Modal>
  );
}

export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div role="tablist" className="no-print mb-5 flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cn('whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium -mb-px', value === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-fg hover:text-fg')}>{t.label}</button>
      ))}
    </div>
  );
}

export function Pagination({ meta, onPage }: { meta?: { page: number; totalPages: number; total: number }; onPage: (p: number) => void }) {
  if (!meta || meta.total === 0) return null;
  return (
    <div className="no-print flex items-center justify-between border-t border-border px-4 py-2.5 text-sm text-muted-fg">
      <span>{meta.total} result{meta.total === 1 ? '' : 's'}</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" aria-label="Previous page" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
        <span>Page {meta.page} of {meta.totalPages}</span>
        <Button variant="outline" size="sm" aria-label="Next page" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

export const Label = ({ htmlFor, children, required }: { htmlFor?: string; children: ReactNode; required?: boolean }) => <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium">{children}{required && <span className="text-danger" aria-hidden> *</span>}</label>;

export const ProgressBar = ({ value, tone = 'primary' }: { value: number; tone?: 'primary' | 'success' | 'warning' | 'danger' }) => (
  <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
    <div className={cn('h-full rounded-full transition-all', { primary: 'bg-primary', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' }[tone])} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
  </div>
);

export function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [open]);
  return { open, setOpen, ref };
}
