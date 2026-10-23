import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ResourcePage } from '@/components/ResourcePage';
import { Badge, Button, Card, CardHeader, ErrorState, Input, Label, PageHeader, Select, SkeletonRows } from '@/components/ui';
import { api, toastError } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { fmtDateTime } from '@/lib/utils';

export function AuditLogsPage() {
  const types = ['user', 'subject', 'enrollment', 'attendance', 'assessment', 'results', 'notice', 'application', 'opportunity', 'offer', 'settings', 'auth', 'report', 'timetable'];
  return (
    <>
      <PageHeader title="Audit logs" description="Who did what, and when. Passwords, tokens and other secrets are never recorded." />
      <ResourcePage endpoint="/audit-logs" noun="log entry" pageSize={15} filters={[{ key: 'resourceType', label: 'Resource', options: types.map((t) => ({ value: t, label: t })) }]} emptyHint="Important actions are recorded automatically."
        columns={[{ key: 'createdAt', label: 'When', render: (r) => <span className="whitespace-nowrap text-xs">{fmtDateTime(r.createdAt)}</span> }, { key: 'actor', label: 'Actor', render: (r) => <div><p className="text-sm">{r.actor?.name ?? r.actorEmail ?? 'system'}</p><p className="text-xs text-muted-fg">{r.actor?.role}</p></div> },
          { key: 'action', label: 'Action', render: (r) => <Badge tone={/delete|deactivate|failed/.test(r.action) ? 'danger' : /publish|role_change/.test(r.action) ? 'warning' : 'primary'}>{r.action}</Badge> }, { key: 'resourceType', label: 'Resource', render: (r) => <span className="text-xs">{r.resourceType}{r.resourceId ? ` · ${String(r.resourceId).slice(-6)}` : ''}</span> },
          { key: 'metadata', label: 'Details', render: (r) => r.metadata ? <details className="max-w-xs text-xs"><summary className="cursor-pointer text-primary">View</summary><pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-2">{JSON.stringify(r.metadata, null, 1)}</pre></details> : '—' }]} />
    </>
  );
}

interface Band { min: string; grade: string; points: string }

export function SettingsPage() {
  const qc = useQueryClient();
  const s = useApi<any>('/settings');
  const years = useApi<any[]>('/academic-years', { limit: 50 });
  const [f, setF] = useState({ attendanceThreshold: '', lateWeight: '', attendanceEditWindowDays: '', currentAcademicYear: '' });
  const [bands, setBands] = useState<Band[]>([]);
  const [errs, setErrs] = useState<string[]>([]);
  useEffect(() => { const d = s.data?.data; if (d) { setF({ attendanceThreshold: String(d.attendanceThreshold), lateWeight: String(d.lateWeight), attendanceEditWindowDays: String(d.attendanceEditWindowDays), currentAcademicYear: d.currentAcademicYear ?? '' }); setBands(d.gradingPolicy.map((b: any) => ({ min: String(b.min), grade: b.grade, points: String(b.points) }))); } }, [s.data]);
  const save = useMutation({ mutationFn: (b: any) => api('/settings', { method: 'PUT', body: b }), onSuccess: () => { toast.success('Configuration saved'); qc.invalidateQueries({ queryKey: ['/settings'] }); }, onError: toastError });
  const submit = () => {
    const e: string[] = [];
    const num = (v: string, lo: number, hi: number, label: string) => { const n = Number(v); if (v === '' || Number.isNaN(n) || n < lo || n > hi) e.push(`${label} must be between ${lo} and ${hi}`); return n; };
    const attendanceThreshold = num(f.attendanceThreshold, 0, 100, 'Attendance threshold'); const lateWeight = num(f.lateWeight, 0, 1, 'Late weight'); const attendanceEditWindowDays = num(f.attendanceEditWindowDays, 0, 365, 'Edit window');
    const gradingPolicy = bands.map((b, i) => ({ min: num(b.min, 0, 100, `Band ${i + 1} minimum`), grade: b.grade.trim(), points: num(b.points, 0, 10, `Band ${i + 1} points`) }));
    if (gradingPolicy.some((b) => !b.grade)) e.push('Every band needs a grade label');
    if (!gradingPolicy.some((b) => b.min === 0)) e.push('One band must start at 0');
    if (new Set(gradingPolicy.map((b) => b.min)).size !== gradingPolicy.length) e.push('Band minimums must be unique');
    setErrs(e); if (e.length) return;
    save.mutate({ attendanceThreshold, lateWeight, attendanceEditWindowDays, gradingPolicy, ...(f.currentAcademicYear ? { currentAcademicYear: f.currentAcademicYear } : {}) });
  };
  if (s.isLoading) return <Card><SkeletonRows /></Card>;
  if (s.isError) return <Card><ErrorState error={s.error} onRetry={() => s.refetch()} /></Card>;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <>
      <PageHeader title="Configuration" description="Institution-wide rules. These are demo defaults — they do not reproduce any official GEU policy." />
      {errs.length > 0 && <div role="alert" className="mb-4 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger"><ul className="list-inside list-disc">{errs.map((e) => <li key={e}>{e}</li>)}</ul></div>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Attendance rules" sub="% = (present + late × weight) ÷ (present + late + absent). Approved leave is excluded." />
          <div className="space-y-4 p-5"><div><Label htmlFor="thr">Minimum attendance threshold (%)</Label><Input id="thr" type="number" value={f.attendanceThreshold} onChange={set('attendanceThreshold')} /></div>
            <div><Label htmlFor="lw">Late weight (0–1)</Label><Input id="lw" type="number" step="0.1" value={f.lateWeight} onChange={set('lateWeight')} /></div>
            <div><Label htmlFor="ew">Faculty edit window (days)</Label><Input id="ew" type="number" value={f.attendanceEditWindowDays} onChange={set('attendanceEditWindowDays')} /></div>
            <div><Label htmlFor="ay">Current academic year</Label><Select id="ay" value={f.currentAcademicYear} onChange={set('currentAcademicYear')}><option value="">Unchanged</option>{years.data?.data.map((y) => <option key={y._id} value={y._id}>{y.label}</option>)}</Select></div></div></Card>
        <Card><CardHeader title="Grading policy" sub="Weighted percentage → grade → points. CGPA/SGPA = Σ(points × credits) ÷ Σ credits."
          action={<Button size="sm" variant="outline" onClick={() => setBands((b) => [...b, { min: '', grade: '', points: '' }])}><Plus className="h-4 w-4" />Band</Button>} />
          <div className="space-y-2 p-5"><div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-xs font-semibold uppercase text-muted-fg"><span>Min %</span><span>Grade</span><span>Points</span><span /></div>
            {bands.map((b, i) => <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">{(['min', 'grade', 'points'] as const).map((k) => <Input key={k} aria-label={`Band ${i + 1} ${k}`} value={b[k]} onChange={(e) => setBands((x) => x.map((y, j) => (j === i ? { ...y, [k]: e.target.value } : y)))} />)}
              <Button variant="ghost" size="sm" aria-label={`Remove band ${i + 1}`} disabled={bands.length <= 2} onClick={() => setBands((x) => x.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-danger" /></Button></div>)}</div></Card>
      </div>
      <div className="mt-6 flex items-center justify-between rounded-xl border border-border bg-card p-4"><p className="text-sm text-muted-fg">Email delivery: <Badge tone={s.data!.data.emailConfigured ? 'success' : 'neutral'}>{s.data!.data.emailConfigured ? 'SMTP configured' : 'not configured — in-app only'}</Badge></p><Button loading={save.isPending} onClick={submit}>Save configuration</Button></div>
    </>
  );
}
