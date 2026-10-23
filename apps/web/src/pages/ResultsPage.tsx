import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Bars } from '@/components/charts';
import type { Field } from '@/components/DynamicForm';
import { ResourcePage } from '@/components/ResourcePage';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, Modal, PageHeader, Select, SkeletonRows, StatCard, StatusBadge, Tabs } from '@/components/ui';
import { api, download, toastError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';

function StudentResults() {
  const q = useApi<any>('/results/transcript');
  const [open, setOpen] = useState<string | null>(null);
  if (q.isLoading) return <Card><SkeletonRows /></Card>;
  if (q.isError) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;
  const t = q.data!.data;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3"><StatCard label="CGPA" value={t.cgpa ?? '—'} hint="Credit-weighted, configurable grading policy" tone="accent" /><StatCard label="Subjects graded" value={t.subjects.filter((s: any) => s.grade).length} hint={`of ${t.subjects.length} enrolled`} /><StatCard label="Latest SGPA" value={t.semesters.at(-1)?.sgpa ?? '—'} tone="success" /></div>
      <Card><CardHeader title="SGPA by semester" /><div className="p-4"><Bars data={t.semesters.map((s: any) => ({ sem: `Sem ${s.semester}`, sgpa: s.sgpa }))} x="sem" bars={[{ key: 'sgpa', name: 'SGPA' }]} domain={[0, 10]} label="SGPA by semester" height={220} /></div></Card>
      <Card><CardHeader title="Subject performance" sub="Only published results are shown. Percentages are weighted by assessment weightage." />
        {t.subjects.length === 0 ? <EmptyState title="You’re not enrolled in any subjects yet" /> : <div className="overflow-x-auto"><table className="w-full min-w-[600px]"><thead className="bg-muted/50"><tr><th className="th">Subject</th><th className="th">Sem</th><th className="th">Credits</th><th className="th">Percentage</th><th className="th">Grade</th><th className="th" /></tr></thead>
          <tbody className="divide-y divide-border">{t.subjects.map((s: any) => (
            <Fragment key={s.subject._id}><tr><td className="td font-medium">{s.subject.code} · {s.subject.name}</td><td className="td">{s.semester}</td><td className="td">{s.credits}</td><td className="td">{s.percentage ?? '—'}{s.percentage !== null && '%'}</td><td className="td">{s.grade ? <Badge tone="primary">{s.grade} ({s.points})</Badge> : <span className="text-xs text-muted-fg">Awaiting results</span>}</td>
              <td className="td text-right">{s.assessments.length > 0 && <Button variant="ghost" size="sm" aria-expanded={open === s.subject._id} onClick={() => setOpen(open === s.subject._id ? null : s.subject._id)}>{open === s.subject._id ? 'Hide' : 'Details'}</Button>}</td></tr>
              {open === s.subject._id && <tr><td colSpan={6} className="bg-muted/40 px-6 py-3"><ul className="space-y-1 text-sm">{s.assessments.map((a: any) => <li key={a.id} className="flex justify-between"><span>{a.name} <span className="text-xs text-muted-fg">({a.type}, weight {a.weightage}%)</span></span><span className="tabular-nums">{a.marks}/{a.max}{a.remarks ? ` — ${a.remarks}` : ''}</span></li>)}</ul></td></tr>}</Fragment>))}</tbody></table></div>}</Card>
    </div>
  );
}

function MarksEntry({ a, onClose }: { a: any; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useApi<any>(`/assessments/${a._id}/marks`);
  const [vals, setVals] = useState<Record<string, { marks: string; remarks: string }>>({});
  useEffect(() => { if (q.data) setVals(Object.fromEntries(q.data.data.rows.map((r: any) => [r.student._id, { marks: r.marks ?? '', remarks: r.remarks ?? '' }]))); }, [q.data]);
  const bad = (v?: { marks: string }) => v && v.marks !== '' && (Number(v.marks) < 0 || Number(v.marks) > a.maxMarks || Number.isNaN(Number(v.marks)));
  const hasBad = Object.values(vals).some(bad);
  const save = useMutation({
    mutationFn: () => api(`/assessments/${a._id}/marks`, { method: 'PUT', body: { records: Object.entries(vals).filter(([, v]) => v.marks !== '').map(([student, v]) => ({ student, marks: Number(v.marks), remarks: v.remarks || undefined })) } }),
    onSuccess: () => { toast.success('Marks saved'); qc.invalidateQueries({ queryKey: ['/assessments'] }); qc.invalidateQueries({ queryKey: [`/assessments/${a._id}/marks`] }); onClose(); }, onError: toastError,
  });
  return (
    <Modal open onClose={onClose} title={`Marks: ${a.name} (max ${a.maxMarks})`} wide>
      {q.isLoading ? <SkeletonRows /> : q.isError ? <ErrorState error={q.error} /> : q.data!.data.rows.length === 0 ? <EmptyState title="No enrolled students" /> : (
        <>
          {a.status === 'published' && <p className="mb-3 rounded-lg bg-warning/10 p-2 text-sm text-warning">This assessment is published. Changes are audited and students are notified.</p>}
          <div className="overflow-x-auto"><table className="w-full"><thead className="bg-muted/50"><tr><th className="th">Student</th><th className="th">Marks</th><th className="th">Remarks</th></tr></thead>
            <tbody className="divide-y divide-border">{q.data!.data.rows.map((r: any) => { const v = vals[r.student._id] ?? { marks: '', remarks: '' }; return (
              <tr key={r.student._id}><td className="td"><p className="font-medium">{r.student.name}</p><p className="text-xs text-muted-fg">{r.student.idNumber}</p></td>
                <td className="td"><Input type="number" aria-label={`Marks for ${r.student.name}`} aria-invalid={!!bad(v)} min={0} max={a.maxMarks} step="0.5" className="w-28" value={v.marks} onChange={(e) => setVals((x) => ({ ...x, [r.student._id]: { ...v, marks: e.target.value } }))} />{bad(v) && <p role="alert" className="text-xs text-danger">0 – {a.maxMarks}</p>}</td>
                <td className="td"><Input aria-label="Remarks" maxLength={300} value={v.remarks} onChange={(e) => setVals((x) => ({ ...x, [r.student._id]: { ...v, remarks: e.target.value } }))} /></td></tr>); })}</tbody></table></div>
          <div className="mt-4 flex justify-between gap-2"><Button variant="outline" onClick={() => download(`/results/export/${a._id}`, 'results.csv').catch(toastError)}><Download className="h-4 w-4" />Export CSV</Button><div className="flex gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={save.isPending} disabled={hasBad} onClick={() => save.mutate()}>Save marks</Button></div></div>
        </>
      )}
    </Modal>
  );
}

function Performance() {
  const [subject, setSubject] = useState('');
  const fa = useApi<any[]>('/faculty-assignments', { limit: 100 });
  const subs = Array.from(new Map((fa.data?.data ?? []).map((a: any) => [a.subject._id, a.subject])).values()) as any[];
  const perf = useApi<any[]>(`/results/performance/${subject}`, {}, { enabled: !!subject });
  return (
    <Card><div className="border-b border-border p-3"><Select aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="max-w-sm"><option value="">Select a subject…</option>{subs.map((s) => <option key={s._id} value={s._id}>{s.code} · {s.name}</option>)}</Select></div>
      {!subject ? <EmptyState title="Select a subject to see class performance" /> : perf.isLoading ? <SkeletonRows /> : perf.isError ? <ErrorState error={perf.error} /> : perf.data!.data.length === 0 ? <EmptyState title="No assessments yet" /> : (
        <div className="grid gap-4 p-4 lg:grid-cols-2"><div><h3 className="mb-2 text-sm font-semibold">Average, highest and lowest (%)</h3><Bars data={perf.data!.data} x="name" bars={[{ key: 'average', name: 'Average' }, { key: 'highest', name: 'Highest' }, { key: 'lowest', name: 'Lowest' }]} unit="%" domain={[0, 100]} label="Assessment score summary" /></div>
          <div><h3 className="mb-2 text-sm font-semibold">Score distribution (all assessments)</h3><Bars data={['<40%', '40–59%', '60–69%', '70–79%', '80%+'].map((b, i) => ({ band: b, students: perf.data!.data.reduce((a: number, p: any) => a + p.distribution[i], 0) }))} x="band" bars={[{ key: 'students', name: 'Results' }]} label="Score distribution" /></div></div>)}</Card>
  );
}

function FacultyResults() {
  const [tab, setTab] = useState('assessments'); const [entry, setEntry] = useState<any>(null); const qc = useQueryClient();
  const toggle = useMutation({ mutationFn: (a: any) => api(`/assessments/${a._id}/${a.status === 'published' ? 'unpublish' : 'publish'}`, { method: 'POST', body: {} }), onSuccess: (_r, a) => { toast.success(a.status === 'published' ? 'Results unpublished' : 'Results published — students notified'); qc.invalidateQueries({ queryKey: ['/assessments'] }); }, onError: toastError });
  const fields: Field[] = [
    { name: 'subject', label: 'Subject', type: 'ref', required: true, endpoint: '/faculty-assignments', optionValue: (i) => i.subject._id, optionLabel: (i) => `${i.subject.code} · ${i.subject.name}`, hideOnEdit: true },
    { name: 'name', label: 'Assessment name', type: 'text', required: true, minLength: 2, maxLength: 120 }, { name: 'type', label: 'Type', type: 'select', required: true, hideOnEdit: true, options: ['internal', 'assignment', 'quiz', 'exam'].map((v) => ({ value: v, label: v })) },
    { name: 'maxMarks', label: 'Maximum marks', type: 'number', required: true, min: 1, max: 1000 }, { name: 'weightage', label: 'Weightage (%)', type: 'number', required: true, min: 0, max: 100, help: 'Total weightage per subject cannot exceed 100%.' },
  ];
  return (
    <>
      <Tabs tabs={[{ id: 'assessments', label: 'Assessments & marks' }, { id: 'performance', label: 'Class performance' }]} value={tab} onChange={setTab} />
      {tab === 'performance' ? <Performance /> : (
        <>
          <ResourcePage endpoint="/assessments" noun="assessment" canCreate canEdit canDelete={(r) => r.status !== 'published'} fields={fields} searchable={false} emptyHint="Create an assessment (internal, quiz or exam), enter marks, then publish."
            columns={[{ key: 'name', label: 'Assessment', render: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-muted-fg">{r.subject?.code} · {r.type}</p></div> }, { key: 'maxMarks', label: 'Max' }, { key: 'weightage', label: 'Weight', render: (r) => `${r.weightage}%` }, { key: 'resultCount', label: 'Marks entered' }, { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> }]}
            rowActions={(r) => <><Button variant="outline" size="sm" onClick={() => setEntry(r)}>Marks</Button><Button variant={r.status === 'published' ? 'secondary' : 'primary'} size="sm" loading={toggle.isPending && toggle.variables?._id === r._id} onClick={() => toggle.mutate(r)}>{r.status === 'published' ? 'Unpublish' : 'Publish'}</Button></>} />
          {entry && <MarksEntry a={entry} onClose={() => setEntry(null)} />}
        </>
      )}
    </>
  );
}

export function ResultsPage() {
  const { user } = useAuth();
  return <><PageHeader title="Results" description={user?.role === 'faculty' ? 'Configure assessments, enter marks and publish results to students.' : 'Your published results, SGPA and CGPA.'} />{user?.role === 'faculty' ? <FacultyResults /> : <StudentResults />}</>;
}
