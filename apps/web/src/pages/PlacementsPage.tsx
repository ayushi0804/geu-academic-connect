import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, MapPin } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DynamicForm, type Field } from '@/components/DynamicForm';
import { ResourcePage } from '@/components/ResourcePage';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Modal, PageHeader, Pagination, Select, SkeletonRows, StatusBadge, Tabs } from '@/components/ui';
import { api, toastError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi, useDebounced } from '@/lib/hooks';
import { fmtDate, fmtDateTime } from '@/lib/utils';
import { DownloadBtn } from './AssignmentsPage';
import { PlacementAnalytics } from './DashboardPage';

const money = (o: any) => (o.packageLpa ? `${o.packageLpa} LPA` : o.stipendPerMonth ? `₹${o.stipendPerMonth.toLocaleString()}/mo` : 'Not disclosed');

function Opportunities() {
  const qc = useQueryClient();
  const [q, setQ] = useState(''); const [kind, setKind] = useState(''); const [page, setPage] = useState(1); const [apply, setApply] = useState<any>(null);
  const dq = useDebounced(q);
  const list = useApi<any[]>('/opportunities', { q: dq, kind, page, limit: 6 });
  const m = useMutation({ mutationFn: (b: any) => api(`/opportunities/${apply._id}/apply`, { body: b }), onSuccess: () => { toast.success('Application submitted'); setApply(null); qc.invalidateQueries({ queryKey: ['/opportunities'] }); qc.invalidateQueries({ queryKey: ['/applications'] }); }, onError: toastError });
  const fields: Field[] = [{ name: 'resume', label: 'Resume (PDF or Word)', type: 'file', required: true, filePurpose: 'resume' }, { name: 'coverNote', label: 'Cover note (optional)', type: 'textarea', maxLength: 1500 }];
  const items = list.data?.data ?? [];
  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap gap-2 p-3"><Input aria-label="Search opportunities" placeholder="Search roles, skills, locations…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="min-w-48 flex-1" />
        <Select aria-label="Type" className="w-auto" value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }}><option value="">Jobs & internships</option><option value="job">Jobs</option><option value="internship">Internships</option></Select></Card>
      {list.isLoading ? <Card><SkeletonRows /></Card> : list.isError ? <Card><ErrorState error={list.error} onRetry={() => list.refetch()} /></Card> : items.length === 0 ? <Card><EmptyState title="No open opportunities" hint="New listings appear here as the placement cell publishes them." /></Card> : items.map((o) => (
        <Card key={o._id} className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><Badge tone={o.kind === 'job' ? 'primary' : 'accent'}>{o.kind}</Badge><Badge>{o.workMode}</Badge>{o.applicationStatus && <StatusBadge value={o.applicationStatus} />}</div>
          <h3 className="mt-1 font-display text-lg font-semibold">{o.title}</h3>
          <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted-fg"><span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{o.company?.name}</span>{o.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{o.location}</span>}<span>{money(o)}</span></p>
          {o.description && <p className="mt-2 text-sm">{o.description}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">{o.skills?.map((s: string) => <Badge key={s}>{s}</Badge>)}</div>
          <p className="mt-2 text-xs text-muted-fg">Min CGPA {o.minCgpa || 'none'} · Semester {o.minSemester}+ · Deadline {fmtDate(o.deadline)}</p>
          {!o.eligible && <p className="mt-1 text-xs text-danger">Not eligible: {o.ineligibleReasons.join('; ')}</p>}</div>
          <Button disabled={!o.eligible || !!o.applicationStatus || o.expired} onClick={() => setApply(o)}>{o.applicationStatus ? 'Applied' : o.expired ? 'Closed' : 'Apply'}</Button></div></Card>))}
      <Card><Pagination meta={list.data?.meta} onPage={setPage} /></Card>
      <Modal open={!!apply} onClose={() => setApply(null)} title={`Apply: ${apply?.title ?? ''}`}>{apply && <DynamicForm fields={fields} onSubmit={(v) => m.mutate(v)} loading={m.isPending} onCancel={() => setApply(null)} submitLabel="Submit application" />}</Modal>
    </div>
  );
}

function MyApplications() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1); const [open, setOpen] = useState<string | null>(null);
  const q = useApi<any[]>('/applications', { page, limit: 8 });
  const wd = useMutation({ mutationFn: (id: string) => api(`/applications/${id}/withdraw`, { method: 'POST', body: {} }), onSuccess: () => { toast.success('Application withdrawn'); qc.invalidateQueries({ queryKey: ['/applications'] }); }, onError: toastError });
  const items = q.data?.data ?? [];
  return (
    <Card>{q.isLoading ? <SkeletonRows /> : q.isError ? <ErrorState error={q.error} /> : items.length === 0 ? <EmptyState title="No applications yet" hint="Apply to an opportunity and track its progress here." /> : (
      <ul className="divide-y divide-border">{items.map((a) => (
        <li key={a._id} className="px-5 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">{a.opportunity?.title}</p><p className="text-xs text-muted-fg">{a.opportunity?.company?.name} · applied {fmtDate(a.createdAt)}</p></div>
          <div className="flex items-center gap-2"><StatusBadge value={a.status} /><Button variant="ghost" size="sm" onClick={() => setOpen(open === a._id ? null : a._id)}>History</Button>{['applied', 'shortlisted', 'interview'].includes(a.status) && <Button variant="outline" size="sm" loading={wd.isPending && wd.variables === a._id} onClick={() => wd.mutate(a._id)}>Withdraw</Button>}</div></div>
          {open === a._id && <ol className="mt-2 space-y-1 border-l-2 border-border pl-4 text-sm">{a.history.map((h: any, i: number) => <li key={i}><StatusBadge value={h.status} /> <span className="text-xs text-muted-fg">{fmtDateTime(h.at)}{h.note ? ` — ${h.note}` : ''}</span></li>)}</ol>}</li>))}</ul>)}<Pagination meta={q.data?.meta} onPage={setPage} /></Card>
  );
}

function MyInterviewsOffers() {
  const qc = useQueryClient();
  const iv = useApi<any[]>('/interviews'); const of = useApi<any[]>('/offers');
  const respond = useMutation({ mutationFn: ({ id, status }: any) => api(`/offers/${id}/respond`, { method: 'PATCH', body: { status } }), onSuccess: () => { toast.success('Response recorded'); qc.invalidateQueries({ queryKey: ['/offers'] }); }, onError: toastError });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card><div className="border-b border-border px-5 py-3 font-semibold">Interviews</div>{(iv.data?.data ?? []).length === 0 ? <EmptyState title="No interviews scheduled" /> : <ul className="divide-y divide-border">{iv.data!.data.map((i) => <li key={i._id} className="px-5 py-3 text-sm"><p className="font-medium">{i.application?.opportunity?.title} · {i.application?.opportunity?.company?.name}</p><p className="text-xs text-muted-fg">{fmtDateTime(i.scheduledAt)} · {i.mode} · {i.locationOrLink ?? 'details to follow'}</p><StatusBadge value={i.status} /></li>)}</ul>}</Card>
      <Card><div className="border-b border-border px-5 py-3 font-semibold">Offers</div>{(of.data?.data ?? []).length === 0 ? <EmptyState title="No offers yet" /> : <ul className="divide-y divide-border">{of.data!.data.map((o) => <li key={o._id} className="px-5 py-3 text-sm"><p className="font-medium">{o.roleTitle} · {o.application?.opportunity?.company?.name}</p><p className="text-xs text-muted-fg">{money(o)}{o.joiningDate ? ` · joining ${fmtDate(o.joiningDate)}` : ''}</p>
        <div className="mt-1 flex items-center gap-2"><StatusBadge value={o.status} />{o.status === 'offered' && <><Button size="sm" onClick={() => respond.mutate({ id: o._id, status: 'accepted' })}>Accept</Button><Button size="sm" variant="outline" onClick={() => respond.mutate({ id: o._id, status: 'declined' })}>Decline</Button></>}</div></li>)}</ul>}</Card>
    </div>
  );
}

const NEXT: Record<string, string[]> = { applied: ['shortlisted', 'rejected'], shortlisted: ['selected', 'rejected'], interview: ['selected', 'rejected'] };

function ApplicationsManager() {
  const qc = useQueryClient();
  const [iv, setIv] = useState<any>(null); const [offer, setOffer] = useState<any>(null);
  const inv = () => qc.invalidateQueries({ queryKey: ['/applications'] });
  const move = useMutation({ mutationFn: ({ id, status }: any) => api(`/applications/${id}/status`, { method: 'PATCH', body: { status } }), onSuccess: () => { toast.success('Status updated'); inv(); }, onError: toastError });
  const mkIv = useMutation({ mutationFn: (b: any) => api('/interviews', { body: { ...b, application: iv._id } }), onSuccess: () => { toast.success('Interview scheduled'); setIv(null); inv(); qc.invalidateQueries({ queryKey: ['/interviews'] }); }, onError: toastError });
  const mkOffer = useMutation({ mutationFn: (b: any) => api('/offers', { body: { ...b, application: offer._id } }), onSuccess: () => { toast.success('Offer issued'); setOffer(null); inv(); qc.invalidateQueries({ queryKey: ['/offers'] }); }, onError: toastError });
  const ivFields: Field[] = [{ name: 'scheduledAt', label: 'Date & time', type: 'datetime', required: true }, { name: 'mode', label: 'Mode', type: 'select', required: true, options: [{ value: 'online', label: 'Online' }, { value: 'onsite', label: 'On-site' }], default: 'online' }, { name: 'locationOrLink', label: 'Location or meeting link', type: 'text', maxLength: 300 }, { name: 'notes', label: 'Notes', type: 'textarea', maxLength: 1000 }];
  const offerFields: Field[] = [{ name: 'roleTitle', label: 'Role title', type: 'text', required: true, maxLength: 160 }, { name: 'packageLpa', label: 'Package (LPA)', type: 'number', min: 0, step: 0.1 }, { name: 'stipendPerMonth', label: 'Stipend per month (₹)', type: 'number', min: 0 }, { name: 'joiningDate', label: 'Joining date', type: 'date' }];
  return (
    <>
      <ResourcePage endpoint="/applications" noun="application" searchable filters={[{ key: 'status', label: 'Status', options: ['applied', 'shortlisted', 'interview', 'selected', 'rejected', 'withdrawn'].map((v) => ({ value: v, label: v })) }]} emptyHint="Applications appear when students apply to your opportunities."
        columns={[{ key: 'student', label: 'Student', render: (r) => <div><p className="font-medium">{r.student?.name}</p><p className="text-xs text-muted-fg">{r.student?.idNumber} · {r.student?.department?.code} · Sem {r.student?.semester}</p></div> }, { key: 'opportunity', label: 'Opportunity', render: (r) => <div><p>{r.opportunity?.title}</p><p className="text-xs text-muted-fg">{r.opportunity?.company?.name}</p></div> }, { key: 'cgpaAtApply', label: 'CGPA', render: (r) => r.cgpaAtApply ?? '—' }, { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> }]}
        rowActions={(r) => <div className="flex flex-wrap justify-end gap-1">{r.resume && <DownloadBtn id={r.resume._id} name={r.resume.originalName} label="Resume" />}
          {r.status === 'shortlisted' && <Button size="sm" variant="outline" onClick={() => setIv(r)}>Schedule interview</Button>}
          {(NEXT[r.status] ?? []).map((s) => s === 'selected' ? <Button key={s} size="sm" onClick={() => setOffer(r)}>Issue offer</Button> : <Button key={s} size="sm" variant={s === 'rejected' ? 'ghost' : 'secondary'} onClick={() => move.mutate({ id: r._id, status: s })}>{s === 'rejected' ? 'Reject' : 'Shortlist'}</Button>)}</div>} />
      <Modal open={!!iv} onClose={() => setIv(null)} title={`Interview: ${iv?.student?.name ?? ''}`}>{iv && <DynamicForm fields={ivFields} onSubmit={(v) => mkIv.mutate(v)} loading={mkIv.isPending} onCancel={() => setIv(null)} submitLabel="Schedule" />}</Modal>
      <Modal open={!!offer} onClose={() => setOffer(null)} title={`Offer: ${offer?.student?.name ?? ''}`}>{offer && <DynamicForm fields={offerFields} initial={{ roleTitle: offer.opportunity?.title }} onSubmit={(v) => mkOffer.mutate(v)} loading={mkOffer.isPending} onCancel={() => setOffer(null)} submitLabel="Issue offer" />}</Modal>
    </>
  );
}

function Manager() {
  const [tab, setTab] = useState('overview');
  const dateF = { name: 'date', label: 'Date', type: 'datetime', required: true } as Field;
  const company: Field[] = [{ name: 'name', label: 'Company name', type: 'text', required: true, minLength: 2, maxLength: 140 }, { name: 'industry', label: 'Industry', type: 'text', maxLength: 80 }, { name: 'website', label: 'Website', type: 'text', maxLength: 200, placeholder: 'https://' }, { name: 'location', label: 'Location', type: 'text', maxLength: 120 }, { name: 'description', label: 'Description', type: 'textarea', maxLength: 2000 },
    { name: 'recruiterName', label: 'Recruiter name', type: 'text', maxLength: 100 }, { name: 'recruiterEmail', label: 'Recruiter email', type: 'email' }, { name: 'recruiterPhone', label: 'Recruiter phone', type: 'text', maxLength: 20 }];
  const opp: Field[] = [
    { name: 'company', label: 'Company', type: 'ref', required: true, endpoint: '/companies', hideOnEdit: true }, { name: 'title', label: 'Title', type: 'text', required: true, maxLength: 160 }, { name: 'kind', label: 'Type', type: 'select', required: true, options: [{ value: 'job', label: 'Job' }, { value: 'internship', label: 'Internship' }] },
    { name: 'workMode', label: 'Work mode', type: 'select', required: true, options: ['onsite', 'remote', 'hybrid'].map((v) => ({ value: v, label: v })), default: 'onsite' }, { name: 'location', label: 'Location', type: 'text' }, { name: 'packageLpa', label: 'Package (LPA)', type: 'number', min: 0, step: 0.1 }, { name: 'stipendPerMonth', label: 'Stipend / month (₹)', type: 'number', min: 0 },
    { name: 'minCgpa', label: 'Minimum CGPA', type: 'number', min: 0, max: 10, step: 0.1, default: 0 }, { name: 'minSemester', label: 'Minimum semester', type: 'number', min: 1, max: 12, default: 1 }, { name: 'eligibleDepartments', label: 'Eligible departments (none = all)', type: 'multiref', endpoint: '/departments', optionLabel: (d) => d.code },
    { name: 'skills', label: 'Required skills (comma separated)', type: 'tags' }, { name: 'deadline', label: 'Application deadline', type: 'datetime', required: true }, { name: 'status', label: 'Status', type: 'select', required: true, options: [{ value: 'draft', label: 'Draft' }, { value: 'open', label: 'Open (notifies eligible students)' }, { value: 'closed', label: 'Closed' }], default: 'draft' }, { name: 'description', label: 'Description', type: 'textarea', maxLength: 5000 },
  ];
  return (
    <>
      <Tabs tabs={[['overview', 'Overview'], ['applications', 'Applications'], ['opportunities', 'Opportunities'], ['companies', 'Companies'], ['drives', 'Drives'], ['interviews', 'Interviews'], ['offers', 'Offers']].map(([id, label]) => ({ id, label }))} value={tab} onChange={setTab} />
      {tab === 'overview' && <PlacementAnalytics />}
      {tab === 'applications' && <ApplicationsManager />}
      {tab === 'companies' && <ResourcePage embedded endpoint="/companies" noun="company" canCreate canEdit canDelete fields={company} wide
        transformInitial={(r) => ({ ...r, recruiterName: r.recruiters?.[0]?.name, recruiterEmail: r.recruiters?.[0]?.email, recruiterPhone: r.recruiters?.[0]?.phone })}
        mapPayload={(p) => { const { recruiterName, recruiterEmail, recruiterPhone, website, ...rest } = p; return { ...rest, website: website ?? '', recruiters: recruiterName ? [{ name: recruiterName, email: recruiterEmail, phone: recruiterPhone }] : [] }; }}
        columns={[{ key: 'name', label: 'Company', sortable: true, render: (r) => <span className="font-medium">{r.name}</span> }, { key: 'industry', label: 'Industry' }, { key: 'location', label: 'Location' }, { key: 'recruiters', label: 'Recruiter', render: (r) => r.recruiters?.[0]?.name ?? '—' }]} />}
      {tab === 'drives' && <ResourcePage embedded endpoint="/drives" noun="drive" canCreate canEdit canDelete wide
        fields={[{ name: 'title', label: 'Title', type: 'text', required: true, maxLength: 160 }, { name: 'company', label: 'Company', type: 'ref', required: true, endpoint: '/companies' }, dateF, { name: 'venue', label: 'Venue', type: 'text' }, { name: 'status', label: 'Status', type: 'select', required: true, options: ['upcoming', 'ongoing', 'completed', 'cancelled'].map((v) => ({ value: v, label: v })), default: 'upcoming' }, { name: 'description', label: 'Description', type: 'textarea' }]}
        columns={[{ key: 'title', label: 'Drive', render: (r) => <span className="font-medium">{r.title}</span> }, { key: 'company', label: 'Company', render: (r) => r.company?.name }, { key: 'date', label: 'Date', render: (r) => fmtDateTime(r.date) }, { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> }]} />}
      {tab === 'opportunities' && <ResourcePage embedded endpoint="/opportunities" noun="opportunity" canCreate canEdit canDelete fields={opp} wide filters={[{ key: 'status', label: 'Status', options: ['draft', 'open', 'closed'].map((v) => ({ value: v, label: v })) }, { key: 'kind', label: 'Type', options: [{ value: 'job', label: 'Job' }, { value: 'internship', label: 'Internship' }] }]}
        transformInitial={(r) => ({ ...r, company: r.company?._id, eligibleDepartments: r.eligibleDepartments ?? [] })} mapPayload={(p) => p}
        columns={[{ key: 'title', label: 'Role', render: (r) => <div><p className="font-medium">{r.title}</p><p className="text-xs text-muted-fg">{r.company?.name}</p></div> }, { key: 'kind', label: 'Type', render: (r) => <Badge>{r.kind}</Badge> }, { key: 'pay', label: 'Pay', render: money }, { key: 'minCgpa', label: 'Min CGPA' }, { key: 'deadline', label: 'Deadline', render: (r) => fmtDate(r.deadline) }, { key: 'applicationCount', label: 'Applicants' }, { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> }]} />}
      {tab === 'interviews' && <ResourcePage embedded endpoint="/interviews" noun="interview" searchable={false} canEdit
        fields={[{ name: 'scheduledAt', label: 'Date & time', type: 'datetime' }, { name: 'mode', label: 'Mode', type: 'select', options: [{ value: 'online', label: 'Online' }, { value: 'onsite', label: 'On-site' }] }, { name: 'locationOrLink', label: 'Location or link', type: 'text' }, { name: 'status', label: 'Status', type: 'select', options: ['scheduled', 'completed', 'cancelled'].map((v) => ({ value: v, label: v })) }, { name: 'notes', label: 'Notes', type: 'textarea' }]}
        emptyHint="Schedule interviews from the Applications tab once candidates are shortlisted."
        columns={[{ key: 'who', label: 'Candidate', render: (r) => <div><p className="font-medium">{r.application?.student?.name}</p><p className="text-xs text-muted-fg">{r.application?.opportunity?.title} · {r.application?.opportunity?.company?.name}</p></div> }, { key: 'scheduledAt', label: 'When', render: (r) => fmtDateTime(r.scheduledAt) }, { key: 'mode', label: 'Mode' }, { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> }]} />}
      {tab === 'offers' && <ResourcePage embedded endpoint="/offers" noun="offer" searchable={false} canEdit
        fields={[{ name: 'roleTitle', label: 'Role', type: 'text' }, { name: 'packageLpa', label: 'Package (LPA)', type: 'number', min: 0, step: 0.1 }, { name: 'joiningDate', label: 'Joining date', type: 'date' }, { name: 'status', label: 'Status', type: 'select', options: ['offered', 'accepted', 'declined'].map((v) => ({ value: v, label: v })) }]}
        emptyHint="Offers are issued from the Applications tab."
        columns={[{ key: 'who', label: 'Candidate', render: (r) => <div><p className="font-medium">{r.application?.student?.name}</p><p className="text-xs text-muted-fg">{r.application?.student?.department?.code}</p></div> }, { key: 'company', label: 'Company', render: (r) => r.application?.opportunity?.company?.name }, { key: 'roleTitle', label: 'Role' }, { key: 'packageLpa', label: 'Package', render: money }, { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> }]} />}
    </>
  );
}

export function PlacementsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('opps');
  const student = user?.role === 'student';
  return (
    <>
      <PageHeader title="Placements & internships" description={student ? 'Browse opportunities you’re eligible for, apply, and track every step. Eligibility is verified on the server.' : 'Manage companies, drives, opportunities, applications, interviews and offers. Figures are records entered by the placement cell.'} />
      {student ? <><Tabs tabs={[{ id: 'opps', label: 'Opportunities' }, { id: 'apps', label: 'My applications' }, { id: 'io', label: 'Interviews & offers' }]} value={tab} onChange={setTab} />{tab === 'opps' ? <Opportunities /> : tab === 'apps' ? <MyApplications /> : <MyInterviewsOffers />}</> : <Manager />}
    </>
  );
}
