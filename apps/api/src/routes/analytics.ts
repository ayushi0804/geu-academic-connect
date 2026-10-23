import mongoose from 'mongoose';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { Application, Assignment, Attendance, Department, Enrollment, FacultyAssignment, Interview, Notice, Notification, Offer, Opportunity, Result, Submission, Subject, User, AuditLog } from '../models';
import { audit } from '../services/audit';
import { attendanceBySubject, calcAttendancePct, overallAttendance, transcript } from '../services/academics';
import { studentsOfSubject, teachingSubjectIds } from '../services/access';
import { visibleNoticeFilter } from '../services/notices';
import { getSettings } from '../services/settings';
import { addDaysStr, todayStr } from '../utils/dates';
import { apiRouter, asyncH, ok, sendCsv, toId } from '../utils/http';
import { assignmentScope } from './learning';
import { timetableFor } from './timetable';
import { dayOfWeek } from '../utils/dates';
import { emailEnabled } from '../services/mailer';

export const router = apiRouter('Analytics & Reports');
const rangeQ = z.object({ days: z.coerce.number().int().min(7).max(730).default(180) });
const r1 = (n: number) => Math.round(n * 10) / 10;

async function monthlyAttendance(match: any, lateWeight: number) {
  const rows = await Attendance.aggregate([{ $match: match }, { $group: { _id: { m: { $substr: ['$date', 0, 7] }, s: '$status' }, n: { $sum: 1 } } }]);
  const months = new Map<string, any>();
  for (const r of rows) { const c = months.get(r._id.m) ?? { present: 0, absent: 0, late: 0, leave: 0 }; c[r._id.s] = r.n; months.set(r._id.m, c); }
  return Array.from(months.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([month, c]) => ({ month, percentage: calcAttendancePct(c, lateWeight), ...c }));
}

router.get('/analytics/student', authenticate, requireRole('student'), asyncH(async (req, res) => {
  const u = req.user!;
  const s: any = await getSettings();
  const [me, tr, attRows, today, upcoming, notices, notifs] = await Promise.all([
    User.findById(u.id).populate('department', 'name code').populate('program', 'name code').lean(),
    transcript(u.id),
    attendanceBySubject(u.id),
    timetableFor(u).then((l: any[]) => l.filter((e) => e.dayOfWeek === dayOfWeek())),
    timetableFor(u).then((l: any[]) => l.slice(0, 5)),
    Notice.find(visibleNoticeFilter(u)).sort({ pinned: -1, publishAt: -1 }).limit(5).select('title priority publishAt pinned').lean(),
    Notification.find({ user: u.id }).sort({ createdAt: -1 }).limit(8).lean(),
  ]);
  const subs: any[] = await Subject.find({ _id: { $in: attRows.map((r) => r.subject) } }).select('code name').lean();
  const sm = new Map(subs.map((x) => [String(x._id), x]));
  const asg: any[] = await Assignment.find({ ...(await assignmentScope(u)), dueDate: { $gt: new Date(Date.now() - 7 * 86400_000) } }).populate('subject', 'code').sort({ dueDate: 1 }).limit(30).lean();
  const mine: any[] = await Submission.find({ student: u.id, assignment: { $in: asg.map((a) => a._id) } }).lean();
  const done = new Set(mine.map((m) => String(m.assignment)));
  const pending = asg.filter((a) => !done.has(String(a._id)) && (a.dueDate > new Date() || a.allowLate)).slice(0, 6);
  const recentResults: any[] = await Result.find({ student: u.id }).sort({ updatedAt: -1 }).limit(25).populate({ path: 'assessment', select: 'name maxMarks status', populate: { path: 'subject', select: 'code' } }).lean();
  const recentMarks = recentResults.filter((r) => r.assessment?.status === 'published').slice(0, 5).map((r) => ({ name: r.assessment.name, subject: r.assessment.subject?.code, marks: r.marks, max: r.assessment.maxMarks }));
  const opps: any[] = await Opportunity.find({ status: 'open', deadline: { $gt: new Date() } }).populate('company', 'name').sort({ deadline: 1 }).limit(4).lean();
  const trend = await monthlyAttendance({ student: toId(u.id) }, s.lateWeight);
  const lowSubjects = attRows.filter((r) => r.belowThreshold).map((r) => sm.get(r.subject)?.code);
  const reminders = [
    ...(lowSubjects.length ? [`Attendance below ${s.attendanceThreshold}% in ${lowSubjects.join(', ')}`] : []),
    ...pending.filter((a) => a.dueDate.getTime() - Date.now() < 2 * 86400_000).map((a) => `${a.subject?.code}: "${a.title}" is due soon`),
  ];
  ok(res, {
    profile: me, cgpa: tr.cgpa, semesters: tr.semesters, threshold: s.attendanceThreshold,
    attendance: { overall: overallAttendance(attRows, s.lateWeight), subjects: attRows.map((r) => ({ ...r, subject: sm.get(r.subject) ?? { _id: r.subject } })), trend },
    subjects: tr.subjects.map((x: any) => ({ _id: x.subject._id, code: x.subject.code, name: x.subject.name, credits: x.credits, percentage: x.percentage, grade: x.grade })),
    pendingAssignments: pending.map((a) => ({ _id: a._id, title: a.title, subject: a.subject?.code, dueDate: a.dueDate })), todayClasses: today, upcomingClasses: upcoming,
    notices, recentMarks, opportunities: opps.map((o) => ({ _id: o._id, title: o.title, company: o.company?.name, kind: o.kind, deadline: o.deadline })), reminders, activity: notifs,
  });
}));

router.get('/analytics/faculty', authenticate, requireRole('faculty'), validate({ query: rangeQ.partial() }), asyncH(async (req, res) => {
  const u = req.user!;
  const s: any = await getSettings();
  const days = (req.query as any).days ?? 180;
  const fa: any[] = await FacultyAssignment.find({ faculty: u.id }).populate('subject', 'code name credits').populate('academicYear', 'label').lean();
  const subjectIds = Array.from(new Set(fa.map((f) => String(f.subject._id))));
  const classes = await Promise.all(fa.map(async (f) => {
    const students = await studentsOfSubject(String(f.subject._id), f.section);
    const rows = await Attendance.aggregate([{ $match: { subject: f.subject._id, section: f.section, date: { $gte: addDaysStr(todayStr(), -days) } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
    const c: any = { present: 0, absent: 0, late: 0, leave: 0 }; rows.forEach((r: any) => (c[r._id] = r.n));
    return { _id: f._id, subject: f.subject, section: f.section, students: students.length, attendance: calcAttendancePct(c, s.lateWeight), academicYear: f.academicYear?.label };
  }));
  const perf = await Result.aggregate([
    { $match: { subject: { $in: subjectIds.map(toId) } } },
    { $lookup: { from: 'assessments', localField: 'assessment', foreignField: '_id', as: 'a' } }, { $unwind: '$a' },
    { $group: { _id: '$subject', avg: { $avg: { $multiply: [{ $divide: ['$marks', '$a.maxMarks'] }, 100] } }, n: { $sum: 1 } } },
  ]);
  const pm = new Map(perf.map((p: any) => [String(p._id), p]));
  const asgs: any[] = await Assignment.find({ subject: { $in: subjectIds }, status: 'published' }).select('_id title subject dueDate section').lean();
  const pendingAgg = await Submission.aggregate([{ $match: { assignment: { $in: asgs.map((a) => a._id) }, status: 'submitted' } }, { $group: { _id: '$assignment', n: { $sum: 1 } } }]);
  const pendingGrading = pendingAgg.map((p: any) => ({ assignment: asgs.find((a) => String(a._id) === String(p._id)), pending: p.n })).filter((p) => p.assignment).sort((a, b) => b.pending - a.pending).slice(0, 8);
  const draftAssessments = await (await import('../models')).Assessment.countDocuments({ subject: { $in: subjectIds }, status: 'draft' });
  ok(res, {
    classes: classes.map((c) => ({ ...c, averagePercentage: pm.get(String(c.subject._id)) ? r1(pm.get(String(c.subject._id)).avg) : null })),
    totals: { classes: fa.length, students: classes.reduce((a, c) => a + c.students, 0), pendingGradingCount: pendingGrading.reduce((a, p) => a + p.pending, 0), draftAssessments },
    pendingGrading, todayClasses: (await timetableFor(u)).filter((e: any) => e.dayOfWeek === dayOfWeek()), threshold: s.attendanceThreshold,
    attendanceTrend: await monthlyAttendance({ subject: { $in: subjectIds.map(toId) }, date: { $gte: addDaysStr(todayStr(), -days) } }, s.lateWeight),
  });
}));

router.get('/analytics/admin', authenticate, requireRole('admin'), validate({ query: rangeQ.partial() }), asyncH(async (req, res) => {
  const s: any = await getSettings();
  const days = (req.query as any).days ?? 180;
  const since = addDaysStr(todayStr(), -days);
  const [roleCounts, statusCounts, deptCount, subjectCount, deptDist, semDist, attSem, enr, pubAsg, subs, recent, trend] = await Promise.all([
    User.aggregate([{ $match: { status: 'active' } }, { $group: { _id: '$role', n: { $sum: 1 } } }]),
    User.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Department.countDocuments(), Subject.countDocuments(),
    User.aggregate([{ $match: { role: 'student', status: 'active' } }, { $group: { _id: '$department', n: { $sum: 1 } } }, { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'd' } }, { $project: { name: { $ifNull: [{ $arrayElemAt: ['$d.code', 0] }, 'Unassigned'], }, students: '$n' } }, { $sort: { name: 1 } }]),
    User.aggregate([{ $match: { role: 'student', status: 'active' } }, { $group: { _id: '$semester', students: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Attendance.aggregate([{ $match: { date: { $gte: since } } }, { $lookup: { from: 'users', localField: 'student', foreignField: '_id', as: 'u' } }, { $unwind: '$u' }, { $group: { _id: { sem: '$u.semester', s: '$status' }, n: { $sum: 1 } } }]),
    Enrollment.aggregate([{ $match: { status: 'active' } }, { $group: { _id: '$subject', n: { $sum: 1 } } }]),
    Assignment.aggregate([{ $match: { status: 'published' } }, { $group: { _id: '$subject', n: { $sum: 1 } } }]),
    Submission.aggregate([{ $group: { _id: null, total: { $sum: 1 }, graded: { $sum: { $cond: [{ $eq: ['$status', 'graded'] }, 1, 0] } }, late: { $sum: { $cond: ['$isLate', 1, 0] } } } }]),
    AuditLog.find().sort({ createdAt: -1 }).limit(8).populate('actor', 'name role').lean(),
    monthlyAttendance({ date: { $gte: since } }, s.lateWeight),
  ]);
  const em = new Map(enr.map((e: any) => [String(e._id), e.n]));
  const expected = pubAsg.reduce((a: number, p: any) => a + p.n * (em.get(String(p._id)) ?? 0), 0);
  const sub = subs[0] ?? { total: 0, graded: 0, late: 0 };
  const semAtt = new Map<number, any>();
  for (const r of attSem) { const c = semAtt.get(r._id.sem) ?? { present: 0, absent: 0, late: 0, leave: 0 }; c[r._id.s] = r.n; semAtt.set(r._id.sem, c); }
  const byRole = Object.fromEntries(roleCounts.map((r: any) => [r._id, r.n]));
  const byStatus = Object.fromEntries(statusCounts.map((r: any) => [r._id, r.n]));
  ok(res, {
    totals: { students: byRole.student ?? 0, faculty: byRole.faculty ?? 0, placement: byRole.placement ?? 0, admins: byRole.admin ?? 0, departments: deptCount, subjects: subjectCount, activeAccounts: byStatus.active ?? 0, invitedAccounts: byStatus.invited ?? 0, inactiveAccounts: byStatus.inactive ?? 0 },
    departmentDistribution: deptDist,
    semesterStats: semDist.map((x: any) => ({ semester: x._id ?? 0, students: x.students, attendance: semAtt.has(x._id) ? calcAttendancePct(semAtt.get(x._id), s.lateWeight) : null })),
    attendance: { overall: overallAttendance(trend as any, s.lateWeight), trend },
    assignments: { published: pubAsg.reduce((a: number, p: any) => a + p.n, 0), submissions: sub.total, graded: sub.graded, late: sub.late, submissionRate: expected ? r1((sub.total / expected) * 100) : null },
    recentActivity: recent,
    system: { database: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState], uptimeSeconds: Math.round(process.uptime()), memoryMb: Math.round(process.memoryUsage().rss / 1048576), emailConfigured: emailEnabled, node: process.version },
  });
}));

router.get('/analytics/placement', authenticate, requireRole('placement', 'admin'), asyncH(async (_req, res) => {
  const [total, funnel, byKind, byDept, packages, upcoming, monthly, topCompanies, oppStatus] = await Promise.all([
    Application.countDocuments(),
    Application.aggregate([{ $group: { _id: null, applied: { $sum: 1 }, shortlisted: { $sum: { $cond: [{ $gt: [{ $size: { $setIntersection: [['shortlisted', 'interview', 'selected'], '$history.status'] } }, 0] }, 1, 0] } }, interview: { $sum: { $cond: [{ $in: ['interview', '$history.status'] }, 1, 0] } }, selected: { $sum: { $cond: [{ $eq: ['$status', 'selected'] }, 1, 0] } }, rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } } } }]),
    Opportunity.aggregate([{ $group: { _id: '$kind', n: { $sum: 1 } } }]),
    Application.aggregate([{ $match: { status: 'selected' } }, { $lookup: { from: 'users', localField: 'student', foreignField: '_id', as: 's' } }, { $unwind: '$s' }, { $group: { _id: '$s.department', selected: { $sum: 1 } } }, { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'd' } }, { $project: { department: { $ifNull: [{ $arrayElemAt: ['$d.code', 0] }, 'N/A'] }, selected: 1 } }, { $sort: { department: 1 } }]),
    Offer.aggregate([{ $match: { packageLpa: { $gt: 0 }, status: { $ne: 'declined' } } }, { $group: { _id: null, avg: { $avg: '$packageLpa' }, max: { $max: '$packageLpa' }, min: { $min: '$packageLpa' }, offers: { $sum: 1 } } }]),
    Interview.find({ status: 'scheduled', scheduledAt: { $gte: new Date() } }).sort({ scheduledAt: 1 }).limit(5).populate({ path: 'application', populate: [{ path: 'student', select: 'name' }, { path: 'opportunity', select: 'title' }] }).lean(),
    Application.aggregate([{ $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, applications: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Application.aggregate([{ $lookup: { from: 'opportunities', localField: 'opportunity', foreignField: '_id', as: 'o' } }, { $unwind: '$o' }, { $group: { _id: '$o.company', n: { $sum: 1 } } }, { $lookup: { from: 'companies', localField: '_id', foreignField: '_id', as: 'c' } }, { $project: { company: { $arrayElemAt: ['$c.name', 0] }, applications: '$n' } }, { $sort: { applications: -1 } }, { $limit: 6 }]),
    Opportunity.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  const f = funnel[0] ?? { applied: 0, shortlisted: 0, interview: 0, selected: 0, rejected: 0 };
  const p = packages[0];
  ok(res, {
    totalApplications: total, funnel: [{ stage: 'Applied', count: f.applied }, { stage: 'Shortlisted', count: f.shortlisted }, { stage: 'Interview', count: f.interview }, { stage: 'Selected', count: f.selected }],
    rejected: f.rejected, conversionRate: f.applied ? r1((f.selected / f.applied) * 100) : null,
    opportunitiesByKind: byKind.map((x: any) => ({ kind: x._id, count: x.n })), opportunitiesByStatus: oppStatus.map((x: any) => ({ status: x._id, count: x.n })),
    departmentWise: byDept, packages: p ? { average: r1(p.avg), highest: p.max, lowest: p.min, offers: p.offers } : null,
    upcomingInterviews: upcoming, applicationsByMonth: monthly.map((m: any) => ({ month: m._id, applications: m.applications })), topCompanies,
  });
}));

/** CSV/JSON exports. Access is enforced per report type. */
router.get('/reports/:type', authenticate, requireRole('admin', 'placement'), validate({ query: z.object({ format: z.enum(['json', 'csv']).default('csv') }) }), asyncH(async (req, res) => {
  const u = req.user!;
  const type = req.params.type;
  let rows: Record<string, unknown>[] = [];
  if (type === 'users' && u.role === 'admin') {
    rows = (await User.find().populate('department', 'code').lean()).map((x: any) => ({ name: x.name, email: x.email, role: x.role, status: x.status, idNumber: x.idNumber ?? '', department: x.department?.code ?? '', semester: x.semester ?? '', section: x.section ?? '' }));
  } else if (type === 'enrollments' && u.role === 'admin') {
    rows = (await Enrollment.find().populate('student', 'name idNumber').populate('subject', 'code name').lean()).map((e: any) => ({ studentId: e.student?.idNumber ?? '', student: e.student?.name ?? '', subject: e.subject?.code ?? '', status: e.status }));
  } else if (type === 'placement-applications') {
    rows = (await Application.find().populate('student', 'name idNumber').populate({ path: 'opportunity', select: 'title company', populate: { path: 'company', select: 'name' } }).lean()).map((a: any) => ({ studentId: a.student?.idNumber ?? '', student: a.student?.name ?? '', company: a.opportunity?.company?.name ?? '', opportunity: a.opportunity?.title ?? '', status: a.status, cgpaAtApply: a.cgpaAtApply ?? '', appliedAt: a.createdAt }));
  } else if (type === 'offers') {
    rows = (await Offer.find().populate({ path: 'application', populate: [{ path: 'student', select: 'name idNumber' }, { path: 'opportunity', select: 'title company', populate: { path: 'company', select: 'name' } }] }).lean()).map((o: any) => ({ studentId: o.application?.student?.idNumber ?? '', student: o.application?.student?.name ?? '', company: o.application?.opportunity?.company?.name ?? '', role: o.roleTitle, packageLpa: o.packageLpa ?? '', status: o.status }));
  } else return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Unknown or unauthorized report type' } });
  await audit(req, 'report.export', 'report', type, { rows: rows.length });
  if (req.query.format === 'json') return ok(res, rows);
  sendCsv(res, `${type}.csv`, rows);
}));
void teachingSubjectIds;
