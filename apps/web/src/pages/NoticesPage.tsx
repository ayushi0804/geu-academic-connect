import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Pin, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import type { Field } from '@/components/DynamicForm';
import { ResourcePage } from '@/components/ResourcePage';
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, Pagination, Select, SkeletonRows, StatusBadge, Tabs } from '@/components/ui';
import { api, toastError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi, useDebounced } from '@/lib/hooks';
import { cn, fmtDate, fmtDateTime } from '@/lib/utils';
import { DownloadBtn } from './AssignmentsPage';

function NoticeList({ archive }: { archive?: boolean }) {
  const qc = useQueryClient();
  const [q, setQ] = useState(''); const [priority, setPriority] = useState(''); const [page, setPage] = useState(1); const [open, setOpen] = useState<string | null>(null);
  const dq = useDebounced(q);
  const list = useApi<any[]>('/notices', { q: dq, priority, page, limit: 8, archive: archive ? 'true' : undefined });
  const read = useMutation({ mutationFn: (id: string) => api(`/notices/${id}/read`, { method: 'POST', body: {} }), onSuccess: () => qc.invalidateQueries({ queryKey: ['/notices'] }) });
  const items = list.data?.data ?? [];
  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap gap-2 p-3"><Input aria-label="Search notices" placeholder="Search notices…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="min-w-48 flex-1" />
        <Select aria-label="Priority" value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }} className="w-auto"><option value="">All priorities</option>{['low', 'normal', 'high', 'urgent'].map((p) => <option key={p}>{p}</option>)}</Select></Card>
      {list.isLoading ? <Card><SkeletonRows /></Card> : list.isError ? <Card><ErrorState error={list.error} onRetry={() => list.refetch()} /></Card> : items.length === 0 ? <Card><EmptyState title={archive ? 'No archived notices' : 'No notices'} hint={q || priority ? 'Try clearing the filters.' : 'New announcements will appear here.'} /></Card> : items.map((n) => {
        const expanded = open === n._id;
        return (
          <Card key={n._id} className={cn('p-4', !n.read && !archive && 'border-l-4 border-l-primary')}>
            <button className="flex w-full items-start justify-between gap-3 text-left" aria-expanded={expanded} onClick={() => { setOpen(expanded ? null : n._id); if (!n.read && !archive) read.mutate(n._id); }}>
              <div><div className="flex flex-wrap items-center gap-2">{n.pinned && <Pin className="h-3.5 w-3.5 text-accent" aria-label="Pinned" />}<h3 className={cn('font-display text-lg', !n.read && !archive ? 'font-semibold' : 'font-medium')}>{n.title}</h3><StatusBadge value={n.priority} />{!n.read && !archive && <Badge tone="primary">new</Badge>}</div>
                <p className="mt-0.5 text-xs text-muted-fg">{n.createdBy?.name} · {fmtDate(n.publishAt)}{n.expiresAt ? ` · expires ${fmtDate(n.expiresAt)}` : ''}</p></div></button>
            {expanded && <div className="mt-3 border-t border-border pt-3"><p className="whitespace-pre-line text-sm">{n.body}</p>{n.attachments?.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{n.attachments.map((f: any) => <DownloadBtn key={f._id} id={f._id} name={f.originalName} label={f.originalName} />)}</div>}</div>}
          </Card>
        );
      })}
      <Card><Pagination meta={list.data?.meta} onPage={setPage} /></Card>
    </div>
  );
}

const PRIORITIES = ['low', 'normal', 'high', 'urgent'].map((v) => ({ value: v, label: v }));

function ManageNotices() {
  const { user } = useAuth();
  const faculty = user?.role === 'faculty'; const placement = user?.role === 'placement';
  const dept = typeof user?.department === 'object' ? user.department?._id : user?.department;
  const fields: Field[] = [
    { name: 'title', label: 'Title', type: 'text', required: true, minLength: 3, maxLength: 200 }, { name: 'body', label: 'Message', type: 'textarea', required: true, maxLength: 10000 },
    { name: 'priority', label: 'Priority', type: 'select', required: true, options: PRIORITIES, default: 'normal' }, { name: 'status', label: 'Status', type: 'select', required: true, options: [{ value: 'draft', label: 'Draft (hidden)' }, { value: 'published', label: 'Published' }], default: 'draft' },
    { name: 'publishAt', label: 'Publish at (optional)', type: 'datetime' }, { name: 'expiresAt', label: 'Expires at (optional)', type: 'datetime' },
    { name: 'audienceRoles', label: 'Audience roles (none = everyone)', type: 'multiselect', options: (faculty || placement ? ['student'] : ['student', 'faculty', 'placement', 'admin']).map((v) => ({ value: v, label: v })), required: faculty || placement },
    { name: 'audienceDepartments', label: 'Departments (none = all)', type: 'multiref', endpoint: '/departments', optionLabel: (d) => d.code, required: faculty, help: faculty ? 'Faculty can only address students of their own department.' : undefined },
    { name: 'audienceSemesters', label: 'Semesters (comma separated, optional)', type: 'tags', help: 'Example: 3, 5' }, { name: 'audienceSections', label: 'Sections (comma separated, optional)', type: 'tags' },
    { name: 'pinned', label: 'Pin to top', type: 'checkbox' }, { name: 'attachment', label: 'Attachment (optional)', type: 'file', filePurpose: 'notice', hideOnEdit: true },
  ];
  const own = (r: any) => user?.role === 'admin' || r.createdBy?._id === user?._id;
  return (
    <ResourcePage endpoint="/notices" noun="notice" baseQuery={{ scope: 'manage' }} canCreate canEdit={own} canDelete={own} fields={fields} wide pageSize={8}
      createDefaults={{ audienceRoles: faculty || placement ? ['student'] : [], audienceDepartments: faculty && dept ? [dept] : [] }}
      transformInitial={(r) => ({ ...r, audienceRoles: r.audience?.roles ?? [], audienceDepartments: r.audience?.departments ?? [], audienceSemesters: r.audience?.semesters ?? [], audienceSections: r.audience?.sections ?? [] })}
      mapPayload={(p) => { const { audienceRoles, audienceDepartments, audienceSemesters, audienceSections, attachment, publishAt, expiresAt, ...rest } = p;
        return { ...rest, ...(publishAt ? { publishAt } : {}), expiresAt: expiresAt ?? null, audience: { roles: audienceRoles ?? [], departments: audienceDepartments ?? [], semesters: (audienceSemesters ?? []).map(Number).filter((n: number) => !Number.isNaN(n)), sections: audienceSections ?? [] }, ...(attachment ? { attachments: [attachment] } : {}) }; }}
      filters={[{ key: 'priority', label: 'Priority', options: PRIORITIES }]}
      columns={[{ key: 'title', label: 'Notice', render: (r) => <div><p className="font-medium">{r.pinned && '📌 '}{r.title}</p><p className="text-xs text-muted-fg">{r.createdBy?.name} · {fmtDate(r.publishAt)}</p></div> }, { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> }, { key: 'priority', label: 'Priority', render: (r) => <StatusBadge value={r.priority} /> },
        { key: 'audience', label: 'Audience', render: (r) => <span className="text-xs">{(r.audience?.roles?.length ? r.audience.roles.join(', ') : 'everyone')}{r.audience?.departments?.length ? ` · ${r.audience.departments.map((d: any) => d.code).join(', ')}` : ''}{r.audience?.semesters?.length ? ` · sem ${r.audience.semesters.join('/')}` : ''}</span> }, { key: 'readCount', label: 'Read by', render: (r) => r.readCount ?? 0 }]} />
  );
}

export function NoticesPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('inbox');
  const author = user?.role !== 'student';
  return (
    <>
      <PageHeader title="Notices & announcements" description="Official updates targeted to your role, department, semester and section." />
      <Tabs tabs={[{ id: 'inbox', label: 'Inbox' }, { id: 'archive', label: 'Archive' }, ...(author ? [{ id: 'manage', label: user?.role === 'admin' ? 'Manage all' : 'My notices' }] : [])]} value={tab} onChange={setTab} />
      {tab === 'manage' ? <ManageNotices /> : <NoticeList key={tab} archive={tab === 'archive'} />}
    </>
  );
}

export function NotificationsPage() {
  const qc = useQueryClient();
  const [unread, setUnread] = useState(false); const [page, setPage] = useState(1);
  const q = useApi<any[]>('/notifications', { unread: unread ? 'true' : undefined, page, limit: 15 });
  const inv = () => qc.invalidateQueries({ queryKey: ['/notifications'] });
  const markAll = useMutation({ mutationFn: () => api('/notifications/read-all', { method: 'POST', body: {} }), onSuccess: () => { toast.success('All marked as read'); inv(); }, onError: toastError });
  const mark = useMutation({ mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'POST', body: {} }), onSuccess: inv, onError: toastError });
  const del = useMutation({ mutationFn: (id: string) => api(`/notifications/${id}`, { method: 'DELETE' }), onSuccess: inv, onError: toastError });
  const items = q.data?.data ?? [];
  return (
    <>
      <PageHeader title="Notifications" description="Deadlines, notices, marks, attendance warnings, timetable changes and placement updates." actions={<Button variant="outline" disabled={!q.data?.meta?.unread} loading={markAll.isPending} onClick={() => markAll.mutate()}>Mark all as read</Button>} />
      <Tabs tabs={[{ id: 'all', label: 'All' }, { id: 'unread', label: `Unread${q.data?.meta?.unread ? ` (${q.data.meta.unread})` : ''}` }]} value={unread ? 'unread' : 'all'} onChange={(t) => { setUnread(t === 'unread'); setPage(1); }} />
      <Card>{q.isLoading ? <SkeletonRows /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : items.length === 0 ? <EmptyState icon={<Bell className="h-5 w-5" />} title={unread ? 'No unread notifications' : 'No notifications yet'} hint="You’ll be notified here about deadlines, notices, marks and more." /> : (
        <ul className="divide-y divide-border">{items.map((n) => (
          <li key={n._id} className={cn('flex items-start gap-3 px-4 py-3', !n.read && 'bg-primary/5')}>
            <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-primary')} aria-label={n.read ? 'Read' : 'Unread'} />
            <div className="min-w-0 flex-1"><Link to={n.link ?? '/'} onClick={() => !n.read && mark.mutate(n._id)} className="text-sm font-medium hover:underline">{n.title}</Link>{n.message && <p className="truncate text-sm text-muted-fg">{n.message}</p>}<p className="text-xs text-muted-fg"><Badge>{n.type}</Badge> {fmtDateTime(n.createdAt)}</p></div>
            {!n.read && <Button variant="ghost" size="sm" onClick={() => mark.mutate(n._id)}>Mark read</Button>}<Button variant="ghost" size="sm" aria-label="Delete notification" onClick={() => del.mutate(n._id)}><Trash2 className="h-4 w-4" /></Button>
          </li>))}</ul>)}<Pagination meta={q.data?.meta} onPage={setPage} /></Card>
    </>
  );
}
