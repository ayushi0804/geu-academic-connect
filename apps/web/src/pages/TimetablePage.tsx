import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Select, SkeletonRows, Tabs } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { DAYS, fmtDate } from '@/lib/utils';

const todayDow = ((new Date().getDay() + 6) % 7) + 1;

export function TimetablePage() {
  const [tab, setTab] = useState('week');
  const q = useApi<any[]>('/timetable');
  const rows = q.data?.data ?? [];
  const byDay = useMemo(() => DAYS.slice(0, 6).map((d, i) => ({ day: d, dow: i + 1, items: rows.filter((r) => r.dayOfWeek === i + 1) })), [rows]);
  return (
    <>
      <PageHeader title="Timetable" description="Your weekly class schedule. Today is highlighted." />
      <Tabs tabs={[{ id: 'week', label: 'Weekly view' }, { id: 'list', label: 'Today & upcoming' }]} value={tab} onChange={setTab} />
      {q.isLoading ? <Card><SkeletonRows /></Card> : q.isError ? <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card> : rows.length === 0 ? <Card><EmptyState title="No timetable yet" hint="Classes appear here once an administrator schedules them for your subjects." /></Card> : tab === 'week' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {byDay.map((d) => (
            <Card key={d.day} className={d.dow === todayDow ? 'ring-2 ring-primary' : ''}>
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5"><h2 className="font-display text-base font-semibold">{d.day}</h2>{d.dow === todayDow && <Badge tone="primary">Today</Badge>}</div>
              {d.items.length === 0 ? <p className="p-4 text-sm text-muted-fg">No classes</p> : <ul className="divide-y divide-border">{d.items.map((e: any) => (
                <li key={e._id} className="flex gap-3 px-4 py-3"><div className="w-24 shrink-0 font-mono text-xs text-muted-fg">{e.startTime}<br />{e.endTime}</div>
                  <div className="min-w-0 text-sm"><p className="truncate font-medium">{e.subject?.code} · {e.subject?.name}</p><p className="text-xs text-muted-fg">Room {e.room} · Sec {e.section}{e.faculty?.name ? ` · ${e.faculty.name}` : ''}</p></div></li>))}</ul>}
            </Card>
          ))}
        </div>
      ) : <TodayUpcoming />}
    </>
  );
}

function TodayUpcoming() {
  const today = useApi<any[]>('/timetable/today'); const up = useApi<any[]>('/timetable/upcoming');
  const L = ({ items, empty }: { items: any[]; empty: string }) => items.length ? <ul className="divide-y divide-border">{items.map((e) => <li key={e._id} className="px-5 py-3 text-sm"><p className="font-medium">{e.subject?.code} · {e.subject?.name}</p><p className="text-xs text-muted-fg">{DAYS[e.dayOfWeek - 1]} {e.startTime}–{e.endTime} · Room {e.room}</p></li>)}</ul> : <p className="p-5 text-sm text-muted-fg">{empty}</p>;
  return <div className="grid gap-6 lg:grid-cols-2"><Card><div className="border-b border-border px-5 py-3 font-semibold">Today’s classes</div><L items={today.data?.data ?? []} empty="No classes today." /></Card><Card><div className="border-b border-border px-5 py-3 font-semibold">Upcoming classes</div><L items={up.data?.data ?? []} empty="Nothing scheduled." /></Card></div>;
}

const TYPE_TONE: Record<string, any> = { exam: 'danger', holiday: 'success', event: 'primary', deadline: 'warning' };

export function CalendarPage() {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [type, setType] = useState('');
  const from = cursor.toISOString(); const to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59).toISOString();
  const q = useApi<any[]>('/calendar', { from, to, type });
  const items = q.data?.data ?? [];
  const first = (cursor.getDay() + 6) % 7; const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((first + days) / 7) * 7 }, (_, i) => i - first + 1);
  const at = (n: number) => items.filter((e) => { const d = new Date(e.start); return d.getDate() === n && d.getMonth() === cursor.getMonth(); });
  const move = (n: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));
  return (
    <>
      <PageHeader title="Academic calendar" description="Examinations, holidays, events and assignment deadlines." actions={<Select aria-label="Filter by type" className="w-auto" value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option><option value="exam">Exams</option><option value="holiday">Holidays</option><option value="event">Events</option><option value="deadline">Deadlines</option></Select>} />
      <Card>
        <div className="flex items-center justify-between border-b border-border px-4 py-3"><Button variant="outline" size="sm" aria-label="Previous month" onClick={() => move(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <h2 className="font-display text-lg font-semibold">{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2><Button variant="outline" size="sm" aria-label="Next month" onClick={() => move(1)}><ChevronRight className="h-4 w-4" /></Button></div>
        {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
          <div className="hidden md:block"><div className="grid grid-cols-7 border-b border-border text-center text-xs font-semibold uppercase text-muted-fg">{DAYS.map((d) => <div key={d} className="py-2">{d.slice(0, 3)}</div>)}</div>
            <div className="grid grid-cols-7">{cells.map((n, i) => <div key={i} className="min-h-24 border-b border-r border-border p-1.5 text-xs">{n >= 1 && n <= days && <><span className={`mb-1 inline-block rounded-full px-1.5 ${new Date().toDateString() === new Date(cursor.getFullYear(), cursor.getMonth(), n).toDateString() ? 'bg-primary text-primary-fg' : 'text-muted-fg'}`}>{n}</span>
              {at(n).slice(0, 3).map((e) => <div key={e.id} title={e.title} className={`mb-0.5 truncate rounded px-1 py-0.5 ${{ exam: 'bg-danger/15 text-danger', holiday: 'bg-success/15 text-success', event: 'bg-primary/15 text-primary', deadline: 'bg-warning/15 text-warning' }[e.type as string]}`}>{e.title}</div>)}{at(n).length > 3 && <span className="text-muted-fg">+{at(n).length - 3} more</span>}</>}</div>)}</div></div>)}
        <div className="p-4 md:border-t md:border-border"><h3 className="mb-2 text-sm font-semibold">This month</h3>
          {q.isLoading ? <SkeletonRows n={3} /> : items.length === 0 ? <p className="text-sm text-muted-fg">Nothing scheduled this month.</p> : <ul className="space-y-2">{items.map((e) => <li key={e.id} className="flex items-center justify-between gap-2 text-sm"><span>{e.title}</span><span className="flex items-center gap-2"><span className="text-xs text-muted-fg">{fmtDate(e.start)}</span><Badge tone={TYPE_TONE[e.type]}>{e.type}</Badge></span></li>)}</ul>}</div>
      </Card>
    </>
  );
}
