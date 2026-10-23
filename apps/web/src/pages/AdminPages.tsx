import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Mail, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DynamicForm, type Field } from '@/components/DynamicForm';
import { ResourcePage } from '@/components/ResourcePage';
import { Badge, Button, Modal, PageHeader, StatusBadge, Tabs } from '@/components/ui';
import { api, toastError } from '@/lib/api';
import { DAYS, fmtDate } from '@/lib/utils';

const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => toast.success('Link copied')).catch(() => toast.message(t));
const opt = (a: string[]) => a.map((v) => ({ value: v, label: v }));

const InviteNotice = (r: any) => r?.inviteLink ? (
  <div className="flex flex-wrap items-center gap-2"><Mail className="h-4 w-4" /><span>{r.emailSent ? 'Invitation emailed.' : 'Email isn’t configured — share this single-use activation link (valid 72 hours) with the user:'}</span>
    <code className="max-w-full truncate rounded bg-muted px-2 py-0.5 text-xs">{r.inviteLink}</code><Button size="sm" variant="outline" onClick={() => copy(r.inviteLink)}><Copy className="h-3.5 w-3.5" />Copy</Button></div>) : null;

export function UsersPage() {
  const fields: Field[] = [
    { name: 'name', label: 'Full name', type: 'text', required: true, minLength: 2, maxLength: 120 }, { name: 'email', label: 'Email', type: 'email', required: true, readOnlyOnEdit: true },
    { name: 'role', label: 'Role', type: 'select', required: true, options: opt(['student', 'faculty', 'placement', 'admin']) }, { name: 'status', label: 'Account status', type: 'select', options: opt(['active', 'inactive']), hideOnCreate: true, help: 'Deactivating signs the user out immediately.' },
    { name: 'idNumber', label: 'Student / faculty ID', type: 'text', maxLength: 40 }, { name: 'department', label: 'Department', type: 'ref', endpoint: '/departments', optionLabel: (d) => `${d.code} · ${d.name}`, help: 'Required for students and faculty.' },
    { name: 'program', label: 'Program (students)', type: 'ref', endpoint: '/programs' }, { name: 'semester', label: 'Semester (students)', type: 'number', min: 1, max: 12 }, { name: 'section', label: 'Section (students)', type: 'text', maxLength: 10 },
    { name: 'designation', label: 'Designation', type: 'text', maxLength: 80 }, { name: 'phone', label: 'Phone', type: 'text', maxLength: 20 },
  ];
  const resend = useMutation({ mutationFn: (id: string) => api<any>(`/users/${id}/invite`, { body: {} }), onSuccess: (r) => { toast.success(r.data.emailSent ? 'Invitation emailed' : 'New invite link created'); copy(r.data.inviteLink); }, onError: toastError });
  return (
    <>
      <PageHeader title="User management" description="Create accounts by invitation, assign roles and manage account status. There is no public registration." />
      <ResourcePage endpoint="/users" noun="user" canCreate canEdit fields={fields} wide afterCreateNotice={InviteNotice}
        filters={[{ key: 'role', label: 'Role', options: opt(['student', 'faculty', 'placement', 'admin']) }, { key: 'status', label: 'Status', options: opt(['active', 'invited', 'inactive']) }, { key: 'department', label: 'Department', endpoint: '/departments', optionLabel: (d) => d.code }]}
        transformInitial={(r) => ({ ...r, status: r.status === 'invited' ? '' : r.status })} mapPayload={(p, editing) => (editing && !p.status ? (({ status: _s, ...rest }) => rest)(p as any) : p)}
        columns={[{ key: 'name', label: 'User', sortable: true, render: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-muted-fg">{r.email}</p></div> }, { key: 'role', label: 'Role', sortable: true, render: (r) => <Badge tone={r.role === 'admin' ? 'accent' : 'primary'}>{r.role}</Badge> }, { key: 'idNumber', label: 'ID', render: (r) => <span className="font-mono text-xs">{r.idNumber ?? '—'}</span> }, { key: 'department', label: 'Dept', render: (r) => r.department?.code ?? '—' }, { key: 'status', label: 'Status', sortable: true, render: (r) => <StatusBadge value={r.status} /> }]}
        rowActions={(r) => r.status === 'invited' ? <Button variant="outline" size="sm" loading={resend.isPending && resend.variables === r._id} onClick={() => resend.mutate(r._id)}>New invite link</Button> : null} />
    </>
  );
}

export function AcademicsPage() {
  const [tab, setTab] = useState('departments');
  const tabs = ['departments', 'programs', 'academic years', 'semesters', 'subjects', 'events'];
  return (
    <>
      <PageHeader title="Academic setup" description="Departments, programs, academic years, semesters, subjects and the academic calendar." />
      <Tabs tabs={tabs.map((t) => ({ id: t, label: t[0].toUpperCase() + t.slice(1) }))} value={tab} onChange={setTab} />
      {tab === 'departments' && <ResourcePage embedded endpoint="/departments" noun="department" canCreate canEdit canDelete defaultSort="name"
        fields={[{ name: 'name', label: 'Name', type: 'text', required: true, minLength: 2, maxLength: 120 }, { name: 'code', label: 'Code', type: 'text', required: true, minLength: 2, maxLength: 12 }, { name: 'description', label: 'Description', type: 'textarea', maxLength: 500 }]}
        columns={[{ key: 'code', label: 'Code', sortable: true, render: (r) => <Badge tone="primary">{r.code}</Badge> }, { key: 'name', label: 'Name', sortable: true }, { key: 'description', label: 'Description' }]} />}
      {tab === 'programs' && <ResourcePage embedded endpoint="/programs" noun="program" canCreate canEdit canDelete filters={[{ key: 'department', label: 'Department', endpoint: '/departments', optionLabel: (d) => d.code }]}
        fields={[{ name: 'name', label: 'Name', type: 'text', required: true, maxLength: 120 }, { name: 'code', label: 'Code', type: 'text', required: true, maxLength: 16 }, { name: 'department', label: 'Department', type: 'ref', required: true, endpoint: '/departments' }, { name: 'durationSemesters', label: 'Duration (semesters)', type: 'number', min: 1, max: 12, default: 8 }]}
        columns={[{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'department', label: 'Department', render: (r) => r.department?.code }, { key: 'durationSemesters', label: 'Semesters' }]} />}
      {tab === 'academic years' && <ResourcePage embedded endpoint="/academic-years" noun="academic year" canCreate canEdit canDelete
        fields={[{ name: 'label', label: 'Label', type: 'text', required: true, placeholder: '2026-27', minLength: 4, maxLength: 20 }, { name: 'startDate', label: 'Start date', type: 'date', required: true }, { name: 'endDate', label: 'End date', type: 'date', required: true }, { name: 'isCurrent', label: 'Current academic year', type: 'checkbox' }]}
        columns={[{ key: 'label', label: 'Year', render: (r) => <span className="font-medium">{r.label}</span> }, { key: 'startDate', label: 'Starts', render: (r) => fmtDate(r.startDate) }, { key: 'endDate', label: 'Ends', render: (r) => fmtDate(r.endDate) }, { key: 'isCurrent', label: 'Current', render: (r) => r.isCurrent ? <Badge tone="success">current</Badge> : '—' }]} />}
      {tab === 'semesters' && <ResourcePage embedded endpoint="/semesters" noun="semester" canCreate canEdit canDelete searchable={false} filters={[{ key: 'academicYear', label: 'Year', endpoint: '/academic-years', optionLabel: (y) => y.label }]}
        fields={[{ name: 'academicYear', label: 'Academic year', type: 'ref', required: true, endpoint: '/academic-years', optionLabel: (y) => y.label }, { name: 'number', label: 'Semester number', type: 'number', required: true, min: 1, max: 12 }, { name: 'name', label: 'Display name', type: 'text' }, { name: 'startDate', label: 'Start date', type: 'date', required: true }, { name: 'endDate', label: 'End date', type: 'date', required: true }, { name: 'isCurrent', label: 'Current semester', type: 'checkbox' }]}
        columns={[{ key: 'number', label: 'Sem', sortable: true }, { key: 'academicYear', label: 'Year', render: (r) => r.academicYear?.label }, { key: 'startDate', label: 'Starts', render: (r) => fmtDate(r.startDate) }, { key: 'endDate', label: 'Ends', render: (r) => fmtDate(r.endDate) }, { key: 'isCurrent', label: 'Current', render: (r) => r.isCurrent ? <Badge tone="success">current</Badge> : '—' }]} />}
      {tab === 'subjects' && <ResourcePage embedded endpoint="/subjects" noun="subject" canCreate canEdit canDelete wide defaultSort="code" filters={[{ key: 'department', label: 'Department', endpoint: '/departments', optionLabel: (d) => d.code }, { key: 'semester', label: 'Semester', options: Array.from({ length: 8 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })) }]}
        fields={[{ name: 'code', label: 'Subject code', type: 'text', required: true, maxLength: 16 }, { name: 'name', label: 'Name', type: 'text', required: true, maxLength: 140 }, { name: 'credits', label: 'Credits', type: 'number', required: true, min: 1, max: 12 }, { name: 'semester', label: 'Semester', type: 'number', required: true, min: 1, max: 12 }, { name: 'department', label: 'Department', type: 'ref', required: true, endpoint: '/departments', optionLabel: (d) => d.code }, { name: 'program', label: 'Program', type: 'ref', endpoint: '/programs' }, { name: 'type', label: 'Type', type: 'select', required: true, options: opt(['theory', 'lab', 'elective']), default: 'theory' }]}
        columns={[{ key: 'code', label: 'Code', sortable: true, render: (r) => <span className="font-mono text-xs">{r.code}</span> }, { key: 'name', label: 'Subject', sortable: true }, { key: 'credits', label: 'Credits', sortable: true }, { key: 'semester', label: 'Sem', sortable: true }, { key: 'department', label: 'Dept', render: (r) => r.department?.code }, { key: 'type', label: 'Type', render: (r) => <Badge>{r.type}</Badge> }]} />}
      {tab === 'events' && <ResourcePage embedded endpoint="/events" noun="event" canCreate canEdit canDelete defaultSort="startDate" filters={[{ key: 'type', label: 'Type', options: opt(['exam', 'holiday', 'event', 'deadline']) }]}
        fields={[{ name: 'title', label: 'Title', type: 'text', required: true, maxLength: 160 }, { name: 'type', label: 'Type', type: 'select', required: true, options: opt(['exam', 'holiday', 'event', 'deadline']), default: 'event' }, { name: 'startDate', label: 'Starts', type: 'datetime', required: true }, { name: 'endDate', label: 'Ends', type: 'datetime' }, { name: 'department', label: 'Department (blank = university-wide)', type: 'ref', endpoint: '/departments', optionLabel: (d) => d.code }, { name: 'description', label: 'Description', type: 'textarea', maxLength: 1000 }]}
        columns={[{ key: 'title', label: 'Event', sortable: true }, { key: 'type', label: 'Type', render: (r) => <Badge>{r.type}</Badge> }, { key: 'startDate', label: 'Starts', sortable: true, render: (r) => fmtDate(r.startDate) }, { key: 'department', label: 'Scope', render: (r) => r.department?.code ?? 'University' }]} />}
    </>
  );
}

function BulkEnroll({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const m = useMutation({ mutationFn: (b: any) => api<any>('/enrollments/bulk', { body: b }), onSuccess: (r) => { toast.success(`Matched ${r.data.matched}: enrolled ${r.data.created}, already enrolled ${r.data.skippedExisting}`); qc.invalidateQueries({ queryKey: ['/enrollments'] }); onClose(); }, onError: toastError });
  const fields: Field[] = [{ name: 'subject', label: 'Subject', type: 'ref', required: true, endpoint: '/subjects', optionLabel: (s) => `${s.code} · ${s.name}` }, { name: 'department', label: 'Department', type: 'ref', endpoint: '/departments', optionLabel: (d) => d.code }, { name: 'program', label: 'Program', type: 'ref', endpoint: '/programs' }, { name: 'semester', label: 'Semester', type: 'number', min: 1, max: 12 }, { name: 'section', label: 'Section', type: 'text', maxLength: 10 }];
  return <Modal open onClose={onClose} title="Bulk enroll students"><p className="mb-3 text-sm text-muted-fg">Enrolls every active student matching the filters (at least one required). Existing enrollments are skipped.</p><DynamicForm fields={fields} onSubmit={(v) => m.mutate(v)} loading={m.isPending} onCancel={onClose} submitLabel="Enroll matching students" /></Modal>;
}

export function AllocationsPage() {
  const [tab, setTab] = useState('faculty'); const [bulk, setBulk] = useState(false);
  return (
    <>
      <PageHeader title="Allocations & enrollment" description="Assign faculty to subject sections and enroll students. Duplicates are rejected by database constraints." />
      <Tabs tabs={[{ id: 'faculty', label: 'Faculty allocation' }, { id: 'enroll', label: 'Student enrollment' }]} value={tab} onChange={setTab} />
      {tab === 'faculty' ? (
        <ResourcePage embedded endpoint="/faculty-assignments" noun="allocation" canCreate canDelete searchable={false} filters={[{ key: 'subject', label: 'Subject', endpoint: '/subjects', optionLabel: (s) => s.code }, { key: 'faculty', label: 'Faculty', endpoint: '/users/directory', optionLabel: (u) => u.name }]}
          fields={[{ name: 'subject', label: 'Subject', type: 'ref', required: true, endpoint: '/subjects', optionLabel: (s) => `${s.code} · ${s.name}` }, { name: 'faculty', label: 'Faculty member', type: 'ref', required: true, endpoint: '/users/directory', optionQuery: { role: 'faculty' }, optionLabel: (u) => `${u.name}${u.department?.code ? ` (${u.department.code})` : ''}` }, { name: 'section', label: 'Section', type: 'text', required: true, maxLength: 10, default: 'A' }]}
          columns={[{ key: 'subject', label: 'Subject', render: (r) => <span className="font-medium">{r.subject?.code} · {r.subject?.name}</span> }, { key: 'section', label: 'Section' }, { key: 'faculty', label: 'Faculty', render: (r) => r.faculty?.name }, { key: 'academicYear', label: 'Year', render: (r) => r.academicYear?.label }]} />
      ) : (
        <>
          <ResourcePage embedded endpoint="/enrollments" noun="enrollment" canCreate canEdit canDelete searchable={false} filters={[{ key: 'subject', label: 'Subject', endpoint: '/subjects', optionLabel: (s) => s.code }, { key: 'status', label: 'Status', options: opt(['active', 'dropped', 'completed']) }]}
            headerActions={<Button variant="outline" onClick={() => setBulk(true)}><UsersRound className="h-4 w-4" />Bulk enroll</Button>}
            fields={[{ name: 'student', label: 'Student', type: 'ref', required: true, endpoint: '/users', optionQuery: { role: 'student', status: 'active' }, optionLabel: (u) => `${u.name} (${u.idNumber ?? u.email})`, hideOnEdit: true }, { name: 'subject', label: 'Subject', type: 'ref', required: true, endpoint: '/subjects', optionLabel: (s) => `${s.code} · ${s.name}`, hideOnEdit: true }, { name: 'status', label: 'Status', type: 'select', required: true, options: opt(['active', 'dropped', 'completed']), hideOnCreate: true }]}
            columns={[{ key: 'student', label: 'Student', render: (r) => <div><p className="font-medium">{r.student?.name}</p><p className="text-xs text-muted-fg">{r.student?.idNumber} · Sem {r.student?.semester} · Sec {r.student?.section}</p></div> }, { key: 'subject', label: 'Subject', render: (r) => `${r.subject?.code} · ${r.subject?.name}` }, { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> }]} />
          {bulk && <BulkEnroll onClose={() => setBulk(false)} />}
        </>
      )}
    </>
  );
}

export function TimetableManagerPage() {
  return (
    <>
      <PageHeader title="Timetable manager" description="Schedule classes. Room, faculty and section clashes are detected on the server, and affected students and faculty are notified of changes." />
      <ResourcePage endpoint="/timetable" noun="class" canCreate canEdit canDelete searchable={false} pageSize={50} wide
        fields={[{ name: 'subject', label: 'Subject', type: 'ref', required: true, endpoint: '/subjects', optionLabel: (s) => `${s.code} · ${s.name}` }, { name: 'faculty', label: 'Faculty', type: 'ref', required: true, endpoint: '/users/directory', optionQuery: { role: 'faculty' }, optionLabel: (u) => u.name },
          { name: 'section', label: 'Section', type: 'text', required: true, maxLength: 10 }, { name: 'room', label: 'Room', type: 'text', required: true, maxLength: 30 }, { name: 'dayOfWeek', label: 'Day', type: 'select', required: true, options: DAYS.slice(0, 6).map((d, i) => ({ value: String(i + 1), label: d })) },
          { name: 'startTime', label: 'Start', type: 'time', required: true }, { name: 'endTime', label: 'End', type: 'time', required: true }, { name: 'semester', label: 'Semester', type: 'number', min: 1, max: 12 }]}
        emptyHint="Faculty must be allocated to the subject and section first (Allocations page)."
        columns={[{ key: 'dayOfWeek', label: 'Day', render: (r) => DAYS[r.dayOfWeek - 1] }, { key: 'time', label: 'Time', render: (r) => <span className="font-mono text-xs">{r.startTime}–{r.endTime}</span> }, { key: 'subject', label: 'Subject', render: (r) => `${r.subject?.code} · ${r.subject?.name}` }, { key: 'faculty', label: 'Faculty', render: (r) => r.faculty?.name }, { key: 'section', label: 'Sec' }, { key: 'room', label: 'Room' }]} />
    </>
  );
}
