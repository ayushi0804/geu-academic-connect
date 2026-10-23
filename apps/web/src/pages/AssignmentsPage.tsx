import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, Paperclip } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DynamicForm, type Field } from '@/components/DynamicForm';
import { ResourcePage } from '@/components/ResourcePage';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Modal, PageHeader, Pagination, SkeletonRows, StatusBadge, Textarea } from '@/components/ui';
import { api, download, toastError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { fmtDateTime, fmtSize } from '@/lib/utils';

export const DownloadBtn = ({ id, name, label }: { id: string; name: string; label?: string }) => (
  <Button variant="outline" size="sm" onClick={() => download(`/files/${id}/download`, name).catch(toastError)} aria-label={`Download ${name}`}><Download className="h-3.5 w-3.5" />{label ?? 'Download'}</Button>
);

function SubmitDialog({ a, onClose }: { a: any; onClose: () => void }) {
  const qc = useQueryClient();
  const m = useMutation({ mutationFn: (b: any) => api(`/assignments/${a._id}/submit`, { body: b }), onSuccess: () => { toast.success('Submitted'); qc.invalidateQueries({ queryKey: ['/assignments'] }); onClose(); }, onError: toastError });
  const fields: Field[] = [{ name: 'file', label: 'Your file', type: 'file', required: true, filePurpose: 'submission', fileSubject: a.subject?._id, help: 'PDF, Word, PowerPoint, Excel, text, image or ZIP — up to the server limit.' }, { name: 'comment', label: 'Comment (optional)', type: 'textarea', maxLength: 1000 }];
  return <Modal open onClose={onClose} title={`Submit: ${a.title}`}><DynamicForm fields={fields} onSubmit={(v) => m.mutate(v)} loading={m.isPending} onCancel={onClose} submitLabel={a.mySubmission ? 'Resubmit' : 'Submit'} /></Modal>;
}

function StudentAssignments() {
  const [page, setPage] = useState(1); const [sub, setSub] = useState<any>(null);
  const q = useApi<any[]>('/assignments', { page, limit: 8 });
  if (q.isLoading) return <Card><SkeletonRows /></Card>;
  if (q.isError) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;
  const items = q.data!.data;
  if (!items.length) return <Card><EmptyState title="No assignments yet" hint="Published assignments for your subjects will show up here." /></Card>;
  return (
    <div className="space-y-3">
      {items.map((a) => {
        const s = a.mySubmission; const overdue = new Date(a.dueDate) < new Date();
        const locked = s?.status === 'graded' || (s && !a.allowResubmission) || (overdue && !a.allowLate);
        return (
          <Card key={a._id} className="p-4"><div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0"><p className="text-xs text-muted-fg">{a.subject?.code} · {a.subject?.name}</p><h3 className="font-display text-lg font-semibold">{a.title}</h3>
              <p className="mt-1 whitespace-pre-line text-sm text-muted-fg">{a.instructions}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs"><Badge tone={overdue && !s ? 'danger' : 'neutral'}>Due {fmtDateTime(a.dueDate)}</Badge><Badge>{a.maxMarks} marks</Badge>
                {s ? <><StatusBadge value={s.status} />{s.isLate && <Badge tone="warning">late</Badge>}{s.status === 'graded' && <Badge tone="success">{s.marks}/{a.maxMarks}</Badge>}</> : <Badge tone={overdue ? 'danger' : 'warning'}>{overdue ? 'missing' : 'not submitted'}</Badge>}</div>
              {s?.feedback && <p className="mt-2 rounded-lg bg-muted p-2 text-sm"><span className="font-medium">Feedback: </span>{s.feedback}</p>}
              {a.attachments?.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{a.attachments.map((f: any) => <DownloadBtn key={f._id} id={f._id} name={f.originalName} label={`${f.originalName} (${fmtSize(f.size)})`} />)}</div>}</div>
            <Button disabled={!!locked} onClick={() => setSub(a)}><Paperclip className="h-4 w-4" />{s ? 'Resubmit' : 'Submit'}</Button></div></Card>
        );
      })}
      <Card><Pagination meta={q.data!.meta} onPage={setPage} /></Card>
      {sub && <SubmitDialog a={sub} onClose={() => setSub(null)} />}
    </div>
  );
}

function Review({ a, onClose }: { a: any; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useApi<any>(`/assignments/${a._id}/submissions`);
  const [grades, setGrades] = useState<Record<string, { marks: string; feedback: string }>>({});
  const grade = useMutation({
    mutationFn: ({ sid, marks, feedback }: any) => api(`/assignments/${a._id}/submissions/${sid}/grade`, { method: 'PATCH', body: { marks: Number(marks), feedback } }),
    onSuccess: () => { toast.success('Graded'); qc.invalidateQueries({ queryKey: [`/assignments/${a._id}/submissions`] }); qc.invalidateQueries({ queryKey: ['/assignments'] }); }, onError: toastError,
  });
  return (
    <Modal open onClose={onClose} title={`Submissions: ${a.title}`} wide>
      {q.isLoading ? <SkeletonRows /> : q.isError ? <ErrorState error={q.error} /> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[640px]"><thead className="bg-muted/50"><tr><th className="th">Student</th><th className="th">Status</th><th className="th">File</th><th className="th">Marks (/{a.maxMarks})</th><th className="th" /></tr></thead>
          <tbody className="divide-y divide-border">{q.data!.data.rows.map(({ student, submission: s }: any) => {
            const g = grades[student._id] ?? { marks: s?.marks ?? '', feedback: s?.feedback ?? '' };
            return <tr key={student._id}><td className="td"><p className="font-medium">{student.name}</p><p className="text-xs text-muted-fg">{student.idNumber}</p></td>
              <td className="td">{s ? <><StatusBadge value={s.status} /> {s.isLate && <Badge tone="warning">late</Badge>}<p className="mt-1 text-xs text-muted-fg">{fmtDateTime(s.submittedAt)}</p></> : <Badge tone="danger">missing</Badge>}</td>
              <td className="td">{s && <DownloadBtn id={s.file._id} name={s.file.originalName} label="Open" />}</td>
              <td className="td">{s && <div className="space-y-1"><Input aria-label={`Marks for ${student.name}`} type="number" min={0} max={a.maxMarks} className="w-24" value={g.marks} onChange={(e) => setGrades((x) => ({ ...x, [student._id]: { ...g, marks: e.target.value } }))} /><Textarea aria-label="Feedback" rows={1} placeholder="Feedback" value={g.feedback} onChange={(e) => setGrades((x) => ({ ...x, [student._id]: { ...g, feedback: e.target.value } }))} /></div>}</td>
              <td className="td">{s && <Button size="sm" disabled={g.marks === ''} loading={grade.isPending && grade.variables?.sid === s._id} onClick={() => grade.mutate({ sid: s._id, ...g })}>Save</Button>}</td></tr>;
          })}</tbody></table></div>)}
    </Modal>
  );
}

function ManageAssignments() {
  const [reviewing, setReviewing] = useState<any>(null);
  const fields: Field[] = [
    { name: 'subject', label: 'Subject', type: 'ref', required: true, endpoint: '/faculty-assignments', optionValue: (i) => i.subject._id, optionLabel: (i) => `${i.subject.code} · ${i.subject.name}`, readOnlyOnEdit: true },
    { name: 'section', label: 'Section (blank = all)', type: 'text', maxLength: 10 }, { name: 'title', label: 'Title', type: 'text', required: true, minLength: 3, maxLength: 160 },
    { name: 'instructions', label: 'Instructions', type: 'textarea', maxLength: 5000 }, { name: 'dueDate', label: 'Due date', type: 'datetime', required: true },
    { name: 'maxMarks', label: 'Maximum marks', type: 'number', required: true, min: 1, max: 1000, default: 10 },
    { name: 'status', label: 'Status', type: 'select', required: true, options: [{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published (notifies students)' }], default: 'draft' },
    { name: 'attachment', label: 'Attachment (optional)', type: 'file', filePurpose: 'assignment', fileSubjectField: 'subject', hideOnEdit: true },
    { name: 'allowLate', label: 'Allow late submissions', type: 'checkbox' }, { name: 'allowResubmission', label: 'Allow resubmission', type: 'checkbox', default: true },
  ];
  return (
    <>
      <ResourcePage endpoint="/assignments" noun="assignment" canCreate canEdit canDelete fields={fields} wide pageSize={8} filters={[{ key: 'status', label: 'Status', options: [{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }] }]}
        mapPayload={(p) => { const { attachment, section, ...rest } = p; return { ...rest, section: section ?? '', ...(attachment ? { attachments: [attachment] } : {}) }; }}
        emptyHint="Create an assignment for one of your subjects. Publishing notifies enrolled students."
        columns={[{ key: 'title', label: 'Assignment', render: (r) => <div><p className="font-medium">{r.title}</p><p className="text-xs text-muted-fg">{r.subject?.code}{r.section ? ` · Sec ${r.section}` : ''}</p></div> }, { key: 'dueDate', label: 'Due', render: (r) => fmtDateTime(r.dueDate), sortable: false }, { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
          { key: 'submissionCount', label: 'Submissions', render: (r) => `${r.submissionCount ?? 0} (${r.gradedCount ?? 0} graded)` }]}
        rowActions={(r) => <Button variant="outline" size="sm" onClick={() => setReviewing(r)}>Submissions</Button>} />
      {reviewing && <Review a={reviewing} onClose={() => setReviewing(null)} />}
    </>
  );
}

export function AssignmentsPage() {
  const { user } = useAuth();
  const staff = user?.role !== 'student';
  return <><PageHeader title="Assignments" description={staff ? 'Create assignments, review submissions and grade work.' : 'View deadlines, submit your work and read feedback.'} />{staff && user?.role === 'admin' && <p className="mb-3 rounded-lg bg-muted p-3 text-sm text-muted-fg">Administrators can view and manage all assignments; creating one requires an existing subject allocation.</p>}{staff ? <ManageAssignments /> : <StudentAssignments />}</>;
}
