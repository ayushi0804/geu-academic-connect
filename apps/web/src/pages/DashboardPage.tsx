import { Award, BookOpenCheck, Briefcase, CalendarClock, ClipboardCheck, FileClock, GraduationCap, Percent, Users, Building2, Layers, UserCheck, Activity } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AreaTrend, Bars, Donut, TrendChart } from '@/components/charts';
import { Badge, Card, CardHeader, EmptyState, ErrorState, PageHeader, ProgressBar, Select, Skeleton, StatCard, StatusBadge } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { DAYS, fmtDate, fmtDateTime, pct } from '@/lib/utils';

const Loading = () => <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>;
const List = ({ children, empty }: { children: React.ReactNode[]; empty: string }) => (children.length ? <ul className="divide-y divide-border">{children}</ul> : <p className="p-5 text-sm text-muted-fg">{empty}</p>);
const classLine = (e: any) => `${e.startTime}–${e.endTime} · ${e.room}`;

function ClassList({ items, empty, showDay }: { items: any[]; empty: string; showDay?: boolean }) {
  return <List empty={empty}>{items.map((e) => (
    <li key={e._id} className="flex items-center justify-between gap-3 px-5 py-3"><div><p className="text-sm font-medium">{e.subject?.code} · {e.subject?.name}</p><p className="text-xs text-muted-fg">{showDay && `${DAYS[e.dayOfWeek - 1]} · `}{classLine(e)}{e.faculty?.name ? ` · ${e.faculty.name}` : ''}</p></div><Badge>Sec {e.section}</Badge></li>
  ))}</List>;
}

function StudentDashboard() {
  const q = useApi<any>('/analytics/student');
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data!.data; const p = d.profile;
  const low = d.attendance.overall !== null && d.attendance.overall < d.threshold;
  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center justify-between gap-4 bg-sidebar p-6 text-sidebar-fg">
        <div><p className="text-xs uppercase tracking-widest opacity-60">Student · {p.idNumber ?? 'ID pending'}</p><h2 className="mt-1 font-display text-2xl font-semibold text-white">{p.name}</h2>
          <p className="mt-1 text-sm opacity-80">{p.program?.name ?? p.department?.name} · Semester {p.semester} · Section {p.section}</p></div>
        <div className="flex flex-wrap gap-2 text-sm"><Link className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20" to="/assignments">Submit work</Link><Link className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20" to="/attendance">My attendance</Link><Link className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20" to="/placements">Opportunities</Link></div>
      </Card>
      {d.reminders.length > 0 && <Card className="border-warning/50 bg-warning/5 p-4"><p className="mb-1 text-sm font-semibold text-warning">Reminders</p><ul className="list-inside list-disc text-sm">{d.reminders.map((r: string) => <li key={r}>{r}</li>)}</ul></Card>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="CGPA" value={d.cgpa ?? '—'} hint="From published results" icon={<Award className="h-4 w-4" />} tone="accent" />
        <StatCard label="Attendance" value={pct(d.attendance.overall)} hint={`Minimum ${d.threshold}%`} icon={<Percent className="h-4 w-4" />} tone={low ? 'danger' : 'success'} />
        <StatCard label="Pending assignments" value={d.pendingAssignments.length} icon={<FileClock className="h-4 w-4" />} tone="warning" />
        <StatCard label="Classes today" value={d.todayClasses.length} icon={<CalendarClock className="h-4 w-4" />} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Attendance trend" sub="Monthly percentage" /><div className="p-4"><TrendChart data={d.attendance.trend} x="month" lines={[{ key: 'percentage', name: 'Attendance' }]} label="Monthly attendance trend" /></div></Card>
        <Card><CardHeader title="SGPA by semester" /><div className="p-4"><Bars data={d.semesters.map((s: any) => ({ sem: `Sem ${s.semester}`, sgpa: s.sgpa }))} x="sem" bars={[{ key: 'sgpa', name: 'SGPA' }]} domain={[0, 10]} label="SGPA by semester" /></div></Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Subject attendance" action={<Link className="text-sm text-primary" to="/attendance">Details</Link>} />
          <div className="space-y-3 p-5">{d.attendance.subjects.length === 0 && <p className="text-sm text-muted-fg">No attendance recorded yet.</p>}{d.attendance.subjects.map((s: any) => (
            <div key={s.subject._id}><div className="mb-1 flex justify-between text-sm"><span>{s.subject.code} · {s.subject.name}</span><span className={s.belowThreshold ? 'font-semibold text-danger' : ''}>{pct(s.percentage)}</span></div><ProgressBar value={s.percentage ?? 0} tone={s.belowThreshold ? 'danger' : 'success'} /></div>))}</div></Card>
        <Card><CardHeader title="Subjects & grades" action={<Link className="text-sm text-primary" to="/results">Results</Link>} />
          <List empty="No enrolled subjects yet.">{d.subjects.map((s: any) => <li key={s._id} className="flex items-center justify-between px-5 py-3 text-sm"><span>{s.code} · {s.name} <span className="text-muted-fg">({s.credits} cr)</span></span>{s.grade ? <Badge tone="primary">{s.grade} · {s.percentage}%</Badge> : <span className="text-xs text-muted-fg">Awaiting results</span>}</li>)}</List></Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card><CardHeader title="Upcoming assignments" action={<Link className="text-sm text-primary" to="/assignments">All</Link>} />
          <List empty="You’re all caught up 🎉">{d.pendingAssignments.map((a: any) => <li key={a._id} className="px-5 py-3 text-sm"><p className="font-medium">{a.title}</p><p className="text-xs text-muted-fg">{a.subject} · due {fmtDateTime(a.dueDate)}</p></li>)}</List></Card>
        <Card><CardHeader title="Today’s classes" /><ClassList items={d.todayClasses} empty="No classes today." /></Card>
        <Card><CardHeader title="Next classes" action={<Link className="text-sm text-primary" to="/timetable">Timetable</Link>} /><ClassList items={d.upcomingClasses} empty="Timetable not published yet." showDay /></Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card><CardHeader title="Recent notices" action={<Link className="text-sm text-primary" to="/notices">All</Link>} />
          <List empty="No notices.">{d.notices.map((n: any) => <li key={n._id} className="flex items-center justify-between gap-2 px-5 py-3 text-sm"><span className="truncate">{n.pinned && '📌 '}{n.title}</span><StatusBadge value={n.priority} /></li>)}</List></Card>
        <Card><CardHeader title="Recent marks" /><List empty="No published marks yet.">{d.recentMarks.map((m: any, i: number) => <li key={i} className="flex justify-between px-5 py-3 text-sm"><span>{m.subject} · {m.name}</span><span className="font-medium tabular-nums">{m.marks}/{m.max}</span></li>)}</List></Card>
        <Card><CardHeader title="Open opportunities" action={<Link className="text-sm text-primary" to="/placements">Browse</Link>} /><List empty="No open opportunities.">{d.opportunities.map((o: any) => <li key={o._id} className="px-5 py-3 text-sm"><p className="font-medium">{o.title}</p><p className="text-xs text-muted-fg">{o.company} · {o.kind} · apply by {fmtDate(o.deadline)}</p></li>)}</List></Card>
      </div>
      <Card><CardHeader title="Recent activity" /><List empty="No activity yet.">{d.activity.map((n: any) => <li key={n._id} className="flex items-center justify-between px-5 py-2.5 text-sm"><span>{n.title}</span><span className="text-xs text-muted-fg">{fmtDateTime(n.createdAt)}</span></li>)}</List></Card>
    </div>
  );
}

function FacultyDashboard() {
  const q = useApi<any>('/analytics/faculty');
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data!.data;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Classes taught" value={d.totals.classes} icon={<Layers className="h-4 w-4" />} /><StatCard label="Students" value={d.totals.students} icon={<Users className="h-4 w-4" />} tone="success" />
        <StatCard label="Pending grading" value={d.totals.pendingGradingCount} icon={<FileClock className="h-4 w-4" />} tone="warning" /><StatCard label="Draft assessments" value={d.totals.draftAssessments} hint="Results not yet published" icon={<BookOpenCheck className="h-4 w-4" />} tone="accent" />
      </div>
      <Card><CardHeader title="My classes" sub="Attendance covers the last 180 days" action={<Link className="text-sm text-primary" to="/attendance">Mark attendance</Link>} />
        {d.classes.length === 0 ? <EmptyState title="No subjects assigned yet" hint="An administrator allocates subjects to you under Allocations." /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[560px]"><thead className="bg-muted/50"><tr><th className="th">Subject</th><th className="th">Section</th><th className="th">Students</th><th className="th">Attendance</th><th className="th">Avg. result</th></tr></thead>
            <tbody className="divide-y divide-border">{d.classes.map((c: any) => <tr key={c._id}><td className="td font-medium">{c.subject.code} · {c.subject.name}</td><td className="td">{c.section}</td><td className="td">{c.students}</td>
              <td className="td"><span className={c.attendance !== null && c.attendance < d.threshold ? 'font-semibold text-danger' : ''}>{pct(c.attendance)}</span></td><td className="td">{pct(c.averagePercentage)}</td></tr>)}</tbody></table></div>)}</Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Class performance" sub="Average % over published assessments" /><div className="p-4"><Bars data={d.classes.map((c: any) => ({ name: `${c.subject.code}-${c.section}`, avg: c.averagePercentage }))} x="name" bars={[{ key: 'avg', name: 'Average %' }]} unit="%" domain={[0, 100]} label="Class average by subject" /></div></Card>
        <Card><CardHeader title="Attendance trend" /><div className="p-4"><TrendChart data={d.attendanceTrend} x="month" lines={[{ key: 'percentage', name: 'Attendance' }]} label="Attendance trend" /></div></Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Pending grading" action={<Link className="text-sm text-primary" to="/assignments">Review</Link>} /><List empty="Nothing waiting for grading.">{d.pendingGrading.map((p: any) => <li key={p.assignment._id} className="flex justify-between px-5 py-3 text-sm"><span>{p.assignment.title}</span><Badge tone="warning">{p.pending} to grade</Badge></li>)}</List></Card>
        <Card><CardHeader title="Teaching today" /><ClassList items={d.todayClasses} empty="No classes today." /></Card>
      </div>
    </div>
  );
}

function AdminDashboard() {
  const [days, setDays] = useState('180');
  const q = useApi<any>('/analytics/admin', { days });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data!.data; const t = d.totals;
  return (
    <div className="space-y-6">
      <div className="flex justify-end"><Select aria-label="Time range" className="w-auto" value={days} onChange={(e) => setDays(e.target.value)}><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="180">Last 180 days</option><option value="365">Last year</option></Select></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Students" value={t.students} icon={<GraduationCap className="h-4 w-4" />} /><StatCard label="Faculty" value={t.faculty} icon={<Users className="h-4 w-4" />} tone="success" />
        <StatCard label="Departments" value={t.departments} icon={<Building2 className="h-4 w-4" />} tone="accent" /><StatCard label="Subjects" value={t.subjects} icon={<BookOpenCheck className="h-4 w-4" />} />
        <StatCard label="Active accounts" value={t.activeAccounts} hint={`${t.invitedAccounts} invited · ${t.inactiveAccounts} inactive`} icon={<UserCheck className="h-4 w-4" />} tone="success" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Students by department" /><div className="p-4"><Bars data={d.departmentDistribution} x="name" bars={[{ key: 'students', name: 'Students' }]} label="Students per department" /></div></Card>
        <Card><CardHeader title="Attendance trend" sub={`Overall ${pct(d.attendance.overall)}`} /><div className="p-4"><TrendChart data={d.attendance.trend} x="month" lines={[{ key: 'percentage', name: 'Attendance' }]} label="Institution attendance trend" /></div></Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2"><CardHeader title="Semester-wise statistics" /><div className="p-4"><Bars data={d.semesterStats.map((s: any) => ({ sem: `Sem ${s.semester}`, students: s.students, attendance: s.attendance }))} x="sem" bars={[{ key: 'students', name: 'Students' }, { key: 'attendance', name: 'Attendance %' }]} label="Students and attendance by semester" /></div></Card>
        <Card><CardHeader title="Assignments" /><dl className="space-y-2 p-5 text-sm">{[['Published', d.assignments.published], ['Submissions', d.assignments.submissions], ['Graded', d.assignments.graded], ['Late', d.assignments.late], ['Submission rate', pct(d.assignments.submissionRate)]].map(([k, v]) => <div key={String(k)} className="flex justify-between"><dt className="text-muted-fg">{k}</dt><dd className="font-medium tabular-nums">{v}</dd></div>)}</dl></Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2"><CardHeader title="Recent administrative activity" action={<Link className="text-sm text-primary" to="/admin/audit">Audit logs</Link>} />
          <List empty="No activity yet.">{d.recentActivity.map((a: any) => <li key={a._id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm"><span><span className="font-mono text-xs">{a.action}</span> <span className="text-muted-fg">by {a.actor?.name ?? a.actorEmail ?? 'system'}</span></span><span className="text-xs text-muted-fg">{fmtDateTime(a.createdAt)}</span></li>)}</List></Card>
        <Card><CardHeader title="System health" action={<Activity className="h-4 w-4 text-muted-fg" />} /><dl className="space-y-2 p-5 text-sm">
          <div className="flex justify-between"><dt className="text-muted-fg">Database</dt><dd><Badge tone={d.system.database === 'connected' ? 'success' : 'danger'}>{d.system.database}</Badge></dd></div>
          <div className="flex justify-between"><dt className="text-muted-fg">Uptime</dt><dd>{Math.round(d.system.uptimeSeconds / 60)} min</dd></div><div className="flex justify-between"><dt className="text-muted-fg">Memory</dt><dd>{d.system.memoryMb} MB</dd></div>
          <div className="flex justify-between"><dt className="text-muted-fg">Email</dt><dd><Badge tone={d.system.emailConfigured ? 'success' : 'neutral'}>{d.system.emailConfigured ? 'configured' : 'in-app only'}</Badge></dd></div><div className="flex justify-between"><dt className="text-muted-fg">Node</dt><dd>{d.system.node}</dd></div></dl></Card>
      </div>
    </div>
  );
}

export function PlacementAnalytics() {
  const q = useApi<any>('/analytics/placement');
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data!.data;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Applications" value={d.totalApplications} icon={<Briefcase className="h-4 w-4" />} /><StatCard label="Selected" value={d.funnel[3].count} icon={<Award className="h-4 w-4" />} tone="success" />
        <StatCard label="Conversion" value={pct(d.conversionRate)} hint="Selected ÷ applied" icon={<Percent className="h-4 w-4" />} tone="accent" />
        <StatCard label="Avg. package" value={d.packages ? `${d.packages.average} LPA` : '—'} hint={d.packages ? `Highest ${d.packages.highest} LPA · ${d.packages.offers} offers` : 'No offers recorded'} icon={<ClipboardCheck className="h-4 w-4" />} tone="warning" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Selection funnel" /><div className="p-4"><Bars data={d.funnel} x="stage" bars={[{ key: 'count', name: 'Students' }]} label="Application funnel" /></div></Card>
        <Card><CardHeader title="Department-wise selections" /><div className="p-4"><Bars data={d.departmentWise} x="department" bars={[{ key: 'selected', name: 'Selected' }]} label="Selections by department" /></div></Card>
        <Card><CardHeader title="Applications over time" /><div className="p-4"><AreaTrend data={d.applicationsByMonth} x="month" y="applications" name="Applications" /></div></Card>
        <Card><CardHeader title="Opportunities by type" /><div className="p-4"><Donut data={d.opportunitiesByKind} name="kind" value="count" label="Opportunities by type" /></div></Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Upcoming interviews" /><List empty="No interviews scheduled.">{d.upcomingInterviews.map((i: any) => <li key={i._id} className="flex justify-between px-5 py-3 text-sm"><span>{i.application?.student?.name} · {i.application?.opportunity?.title}</span><span className="text-xs text-muted-fg">{fmtDateTime(i.scheduledAt)}</span></li>)}</List></Card>
        <Card><CardHeader title="Top companies by applications" /><List empty="No applications yet.">{d.topCompanies.map((c: any) => <li key={c._id} className="flex justify-between px-5 py-3 text-sm"><span>{c.company}</span><Badge>{c.applications}</Badge></li>)}</List></Card>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;
  const titles = { student: 'My dashboard', faculty: 'Faculty dashboard', admin: 'Administration overview', placement: 'Placement dashboard' } as const;
  return (
    <>
      <PageHeader title={titles[user.role]} description={`Welcome back, ${user.name.split(' ')[0]}. Every figure below is calculated from live database records.`} />
      {user.role === 'student' ? <StudentDashboard /> : user.role === 'faculty' ? <FacultyDashboard /> : user.role === 'admin' ? <AdminDashboard /> : <PlacementAnalytics />}
    </>
  );
}
