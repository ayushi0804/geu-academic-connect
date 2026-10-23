import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Bars, TrendChart } from '@/components/charts';
import { Pagination } from '@/components/ui';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, PageHeader, ProgressBar, Select, SkeletonRows, StatCard, StatusBadge, Tabs } from '@/components/ui';
import { api, download, toastError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { fmtDate, pct, todayISO } from '@/lib/utils';

const STATUSES = [['present', 'P', 'Present'], ['absent', 'A', 'Absent'], ['late', 'L', 'Late'], ['leave', 'LV', 'Approved leave']] as const;

function StudentAttendance() {
  const [subject, setSubject] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [page, setPage] = useState(1);
  const sum = useApi<any>('/attendance/summary'); const trend = useApi<any[]>('/attendance/trend', { subject });
  const hist = useApi<any[]>('/attendance/history', { subject, from, to, page, limit: 10 });
  if (sum.isLoading) return <SkeletonRows />;
  if (sum.isError) return <ErrorState error={sum.error} onRetry={() => sum.refetch()} />;
  const s = sum.data!.data;
  const low = s.subjects.filter((x: any) => x.belowThreshold);
  return (
    <div className="space-y-6">
      {low.length > 0 && <Card className="flex items-start gap-3 border-danger/40 bg-danger/5 p-4"><AlertTriangle className="mt-0.5 h-5 w-5 text-danger" /><div className="text-sm"><p className="font-semibold text-danger">Low attendance warning</p><p>Below {s.threshold}% in: {low.map((x: any) => `${x.subject.code} (${x.percentage}%)`).join(', ')}.</p></div></Card>}
      <div className="grid gap-4 sm:grid-cols-3"><StatCard label="Overall attendance" value={pct(s.overall)} tone={s.overall !== null && s.overall < s.threshold ? 'danger' : 'success'} /><StatCard label="Required minimum" value={`${s.threshold}%`} tone="accent" /><StatCard label="Subjects tracked" value={s.subjects.length} /></div>
      <Card><CardHeader title="Subject-wise attendance" sub="Late counts as a partial present; approved leave is excluded from the total." />
        {s.subjects.length === 0 ? <EmptyState title="No attendance recorded yet" hint="Records appear after your faculty marks attendance." /> : <div className="overflow-x-auto"><table className="w-full min-w-[640px]"><thead className="bg-muted/50"><tr><th className="th">Subject</th><th className="th">Present</th><th className="th">Late</th><th className="th">Absent</th><th className="th">Leave</th><th className="th w-48">Percentage</th></tr></thead>
          <tbody className="divide-y divide-border">{s.subjects.map((r: any) => <tr key={r.subject._id}><td className="td font-medium">{r.subject.code} · {r.subject.name}</td><td className="td">{r.present}</td><td className="td">{r.late}</td><td className="td">{r.absent}</td><td className="td">{r.leave}</td>
            <td className="td"><div className="flex items-center gap-2"><div className="flex-1"><ProgressBar value={r.percentage ?? 0} tone={r.belowThreshold ? 'danger' : 'success'} /></div><span className={`w-12 text-right text-sm tabular-nums ${r.belowThreshold ? 'font-semibold text-danger' : ''}`}>{pct(r.percentage)}</span></div></td></tr>)}</tbody></table></div>}</Card>
      <Card><CardHeader title="Attendance trend" action={<Select aria-label="Subject" className="w-auto" value={subject} onChange={(e) => { setSubject(e.target.value); setPage(1); }}><option value="">All subjects</option>{s.subjects.map((r: any) => <option key={r.subject._id} value={r.subject._id}>{r.subject.code}</option>)}</Select>} /><div className="p-4"><TrendChart data={trend.data?.data} x="month" lines={[{ key: 'percentage', name: 'Attendance' }]} label="Attendance trend" /></div></Card>
      <Card><CardHeader title="History" action={<div className="flex gap-2"><Input aria-label="From date" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-auto" /><Input aria-label="To date" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-auto" /></div>} />
        {hist.isLoading ? <SkeletonRows n={4} /> : (hist.data?.data ?? []).length === 0 ? <EmptyState title="No records in this range" /> : <div className="overflow-x-auto"><table className="w-full"><thead className="bg-muted/50"><tr><th className="th">Date</th><th className="th">Subject</th><th className="th">Status</th></tr></thead><tbody className="divide-y divide-border">{hist.data!.data.map((h: any) => <tr key={h._id}><td className="td">{fmtDate(h.date)}</td><td className="td">{h.subject?.code} · {h.subject?.name}</td><td className="td"><StatusBadge value={h.status} /></td></tr>)}</tbody></table></div>}
        <Pagination meta={hist.data?.meta} onPage={setPage} /></Card>
    </div>
  );
}

function useClasses() {
  const q = useApi<any[]>('/faculty-assignments', { limit: 100 });
  const classes = (q.data?.data ?? []).map((a: any) => ({ key: `${a.subject._id}|${a.section}`, subject: a.subject._id, section: a.section, label: `${a.subject.code} · ${a.subject.name} — Sec ${a.section}${a.faculty?.name ? ` (${a.faculty.name})` : ''}` }));
  return { classes, loading: q.isLoading };
}
const ClassSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
  const { classes, loading } = useClasses();
  return <Select aria-label="Class" value={value} onChange={(e) => onChange(e.target.value)} disabled={loading} className="min-w-64 flex-1"><option value="">{loading ? 'Loading…' : classes.length ? 'Select a class…' : 'No classes assigned'}</option>{classes.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</Select>;
};

function MarkAttendance() {
  const qc = useQueryClient();
  const [cls, setCls] = useState(''); const [date, setDate] = useState(todayISO());
  const [subject, section] = cls.split('|');
  const sheet = useApi<any>('/attendance/sheet', { subject, section, date }, { enabled: !!cls });
  const [vals, setVals] = useState<Record<string, string>>({});
  useEffect(() => { if (sheet.data) setVals(Object.fromEntries(sheet.data.data.students.map((s: any) => [s._id, s.status ?? '']))); }, [sheet.data]);
  const save = useMutation({
    mutationFn: () => api('/attendance/sheet', { method: 'PUT', body: { subject, section, date, records: Object.entries(vals).filter(([, v]) => v).map(([student, status]) => ({ student, status })) } }),
    onSuccess: (r: any) => { toast.success(`Saved: ${r.data.created} new, ${r.data.updated} updated, ${r.data.unchanged} unchanged`); qc.invalidateQueries({ queryKey: ['/attendance/sheet'] }); },
    onError: toastError,
  });
  const d = sheet.data?.data; const marked = Object.values(vals).filter(Boolean).length;
  return (
    <Card>
      <div className="flex flex-wrap gap-2 border-b border-border p-3"><ClassSelect value={cls} onChange={setCls} /><Input aria-label="Date" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" /></div>
      {!cls ? <EmptyState title="Choose a class and date" hint="Pick one of your assigned classes to load the student list." /> : sheet.isLoading ? <SkeletonRows /> : sheet.isError ? <ErrorState error={sheet.error} onRetry={() => sheet.refetch()} /> : d.students.length === 0 ? <EmptyState title="No enrolled students" hint="Students must be enrolled in this subject (and section) by an administrator." /> : (
        <>
          {d.locked && <p className="border-b border-border bg-warning/10 px-4 py-2 text-sm text-warning">This date is outside your edit window (or in the future). Only administrators can change it.</p>}
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"><p className="text-sm text-muted-fg">{marked} of {d.students.length} marked</p>
            <div className="flex gap-2"><Button variant="outline" size="sm" disabled={d.locked} onClick={() => setVals(Object.fromEntries(d.students.map((s: any) => [s._id, 'present'])))}>Mark all present</Button><Button size="sm" loading={save.isPending} disabled={d.locked || marked === 0} onClick={() => save.mutate()}>Save attendance</Button></div></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[560px]"><thead className="bg-muted/50"><tr><th className="th">ID</th><th className="th">Student</th><th className="th">Status</th></tr></thead>
            <tbody className="divide-y divide-border">{d.students.map((s: any) => <tr key={s._id}><td className="td font-mono text-xs">{s.idNumber ?? '—'}</td><td className="td font-medium">{s.name}</td>
              <td className="td"><div role="radiogroup" aria-label={`Status for ${s.name}`} className="flex gap-1">{STATUSES.map(([v, short, long]) => <button key={v} type="button" role="radio" aria-checked={vals[s._id] === v} aria-label={long} title={long} disabled={d.locked} onClick={() => setVals((x) => ({ ...x, [s._id]: v }))}
                className={`h-8 min-w-8 rounded-md border px-2 text-xs font-semibold ${vals[s._id] === v ? { present: 'border-success bg-success text-white', absent: 'border-danger bg-danger text-white', late: 'border-warning bg-warning text-white', leave: 'border-primary bg-primary text-primary-fg' }[v] : 'border-border hover:bg-muted'}`}>{short}</button>)}</div></td></tr>)}</tbody></table></div>
        </>
      )}
    </Card>
  );
}

function AttendanceReport() {
  const [cls, setCls] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [subject, section] = cls.split('|');
  const rep = useApi<any>('/attendance/report', { subject, section, from, to }, { enabled: !!cls });
  const trend = useApi<any[]>('/attendance/class-trend', { subject, section, from, to }, { enabled: !!cls });
  const rows = rep.data?.data.rows ?? [];
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3"><ClassSelect value={cls} onChange={setCls} /><Input aria-label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" /><Input aria-label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" />
        <Button variant="outline" disabled={!cls} onClick={() => download('/attendance/report', 'attendance.csv', { subject, section, from, to, format: 'csv' }).catch(toastError)}><Download className="h-4 w-4" />Export CSV</Button></div>
      {!cls ? <EmptyState title="Select a class to see its report" /> : rep.isLoading ? <SkeletonRows /> : rep.isError ? <ErrorState error={rep.error} onRetry={() => rep.refetch()} /> : (
        <>
          <div className="grid gap-4 p-4 lg:grid-cols-2"><div><h3 className="mb-2 text-sm font-semibold">Daily class attendance</h3><TrendChart data={trend.data?.data} x="date" lines={[{ key: 'percentage', name: 'Attendance' }]} label="Daily class attendance" /></div>
            <div><h3 className="mb-2 text-sm font-semibold">Students by attendance</h3><Bars data={rows.map((r: any) => ({ name: r.name.split(' ')[0], pct: r.percentage }))} x="name" bars={[{ key: 'pct', name: 'Attendance %' }]} unit="%" domain={[0, 100]} label="Student attendance" /></div></div>
          {rows.length === 0 ? <EmptyState title="No students in this class" /> : <div className="overflow-x-auto"><table className="w-full min-w-[640px]"><thead className="bg-muted/50"><tr><th className="th">ID</th><th className="th">Student</th><th className="th">P</th><th className="th">L</th><th className="th">A</th><th className="th">LV</th><th className="th">%</th></tr></thead>
            <tbody className="divide-y divide-border">{rows.map((r: any) => <tr key={r._id}><td className="td font-mono text-xs">{r.studentId}</td><td className="td font-medium">{r.name}</td><td className="td">{r.present}</td><td className="td">{r.late}</td><td className="td">{r.absent}</td><td className="td">{r.leave}</td><td className="td">{r.belowThreshold ? <Badge tone="danger">{pct(r.percentage)} · low</Badge> : pct(r.percentage)}</td></tr>)}</tbody></table></div>}
        </>
      )}
    </Card>
  );
}

export function AttendancePage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('mark');
  const staff = user?.role !== 'student';
  return (
    <>
      <PageHeader title="Attendance" description={staff ? 'Mark daily attendance for your classes, review history and export reports.' : 'Track your attendance across subjects. Calculation: (present + late × weight) ÷ (present + late + absent); approved leave is excluded.'} />
      {staff ? <><Tabs tabs={[{ id: 'mark', label: 'Mark attendance' }, { id: 'report', label: 'Class reports' }]} value={tab} onChange={setTab} />{tab === 'mark' ? <MarkAttendance /> : <AttendanceReport />}</> : <StudentAttendance />}
    </>
  );
}
