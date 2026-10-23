import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { Attendance, Subject, User } from '../models';
import { audit } from '../services/audit';
import { assertTeaches, canViewStudent, studentsOfSubject, teachingSubjectIds } from '../services/access';
import { attendanceBySubject, calcAttendancePct, overallAttendance } from '../services/academics';
import { notify } from '../services/notify';
import { getSettings } from '../services/settings';
import { addDaysStr, todayStr } from '../utils/dates';
import { badRequest, forbidden } from '../utils/errors';
import { apiRouter, asyncH, dateStr, oid, ok, pageMeta, pageQuery, sendCsv, toId } from '../utils/http';

export const router = apiRouter('Attendance');
const staff = [authenticate, requireRole('faculty', 'admin')];
const STATUS = z.enum(['present', 'absent', 'late', 'leave']);

async function assertEditable(role: string, date: string) {
  const s: any = await getSettings();
  const today = todayStr();
  if (date > today) throw badRequest('Attendance cannot be marked for a future date');
  if (role !== 'admin' && date < addDaysStr(today, -s.attendanceEditWindowDays)) {
    throw forbidden(`Attendance older than ${s.attendanceEditWindowDays} days can only be edited by an administrator`);
  }
}

router.get('/attendance/sheet', ...staff, validate({ query: z.object({ subject: oid, section: z.string().min(1).max(10), date: dateStr }) }), asyncH(async (req, res) => {
  const { subject, section, date } = req.query as any;
  await assertTeaches(req.user!, subject, section);
  const students = await studentsOfSubject(subject, section);
  const recs: any[] = await Attendance.find({ subject, date, student: { $in: students.map((s: any) => s._id) } }).lean();
  const map = new Map(recs.map((r) => [String(r.student), r.status]));
  const s: any = await getSettings();
  const today = todayStr();
  const locked = req.user!.role !== 'admin' && (date > today || date < addDaysStr(today, -s.attendanceEditWindowDays));
  ok(res, { date, locked, students: students.map((st: any) => ({ ...st, status: map.get(String(st._id)) ?? null })) });
}));

router.put('/attendance/sheet', ...staff, validate({
  body: z.object({ subject: oid, section: z.string().min(1).max(10), date: dateStr, records: z.array(z.object({ student: oid, status: STATUS })).min(1).max(500) }),
}), asyncH(async (req, res) => {
  const { subject, section, date, records } = req.body as { subject: string; section: string; date: string; records: { student: string; status: string }[] };
  await assertTeaches(req.user!, subject, section);
  await assertEditable(req.user!.role, date);
  const allowed = new Set((await studentsOfSubject(subject, section)).map((s: any) => String(s._id)));
  const ids = records.map((r) => r.student);
  if (new Set(ids).size !== ids.length) throw badRequest('Duplicate students in request');
  if (ids.some((i) => !allowed.has(i))) throw badRequest('Some students are not enrolled in this subject/section');

  const existing: any[] = await Attendance.find({ subject, date, student: { $in: ids } }).lean();
  const byStudent = new Map(existing.map((e) => [String(e.student), e]));
  const ops: any[] = [];
  const changed: string[] = [];
  let created = 0, updated = 0, unchanged = 0;
  for (const r of records) {
    const cur = byStudent.get(r.student);
    if (!cur) {
      ops.push({ insertOne: { document: { subject: toId(subject), student: toId(r.student), section, date, status: r.status, markedBy: toId(req.user!.id), history: [] } } });
      created++; changed.push(r.student);
    } else if (cur.status !== r.status) {
      ops.push({ updateOne: { filter: { _id: cur._id }, update: { $set: { status: r.status, markedBy: toId(req.user!.id) }, $push: { history: { by: toId(req.user!.id), at: new Date(), from: cur.status, to: r.status } } } } });
      updated++; changed.push(r.student);
    } else unchanged++;
  }
  if (ops.length) await Attendance.bulkWrite(ops, { ordered: false }); // unique index prevents duplicate rows under concurrency (surfaces as 409)
  await audit(req, updated ? 'attendance.edit' : 'attendance.mark', 'attendance', subject, { section, date, created, updated, unchanged });

  // Low-attendance warnings for students whose record changed to absent/late
  const s: any = await getSettings();
  const subj: any = await Subject.findById(subject).select('code name').lean();
  for (const r of records.filter((x) => changed.includes(x.student) && (x.status === 'absent' || x.status === 'late'))) {
    const [row] = await attendanceBySubject(r.student, { subjects: [subject] });
    if (row?.belowThreshold) {
      await notify([r.student], { type: 'attendance', title: `Low attendance in ${subj?.code}`, message: `Your attendance is ${row.percentage}% (minimum ${s.attendanceThreshold}%).`, link: '/attendance', dedupeKey: `lowatt:${subject}:${r.student}:${date}` });
    }
  }
  ok(res, { created, updated, unchanged });
}));

async function resolveStudent(req: any): Promise<{ studentId: string; subjects?: string[] }> {
  const u = req.user!;
  const target = (req.query.student as string) || (u.role === 'student' ? u.id : undefined);
  if (!target) throw badRequest('student is required');
  if (!(await canViewStudent(u, target))) throw forbidden();
  // Faculty only see attendance for subjects they teach
  return { studentId: target, subjects: u.role === 'faculty' ? await teachingSubjectIds(u.id) : undefined };
}
const studentQ = z.object({ student: oid.optional() });

router.get('/attendance/summary', authenticate, requireRole('student', 'faculty', 'admin'), validate({ query: studentQ }), asyncH(async (req, res) => {
  const { studentId, subjects } = await resolveStudent(req);
  const s: any = await getSettings();
  const rows = await attendanceBySubject(studentId, { subjects });
  const subs: any[] = await Subject.find({ _id: { $in: rows.map((r) => r.subject) } }).select('code name credits').lean();
  const sm = new Map(subs.map((x) => [String(x._id), x]));
  ok(res, { threshold: s.attendanceThreshold, overall: overallAttendance(rows, s.lateWeight), subjects: rows.map((r) => ({ ...r, subject: sm.get(r.subject) ?? { _id: r.subject } })) });
}));

router.get('/attendance/history', authenticate, requireRole('student', 'faculty', 'admin'), validate({ query: pageQuery.extend({ student: oid.optional(), subject: oid.optional(), from: dateStr.optional(), to: dateStr.optional() }) }), asyncH(async (req, res) => {
  const { page, limit, subject, from, to } = req.query as any;
  const { studentId, subjects } = await resolveStudent(req);
  const f: any = { student: studentId };
  if (subjects) f.subject = { $in: subjects };
  if (subject) { if (subjects && !subjects.includes(subject)) throw forbidden(); f.subject = subject; }
  if (from || to) f.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  const [items, total] = await Promise.all([
    Attendance.find(f).populate('subject', 'code name').sort({ date: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Attendance.countDocuments(f),
  ]);
  ok(res, items, pageMeta(page, limit, total));
}));

/** Monthly attendance % trend for a student. */
router.get('/attendance/trend', authenticate, requireRole('student', 'faculty', 'admin'), validate({ query: studentQ.extend({ subject: oid.optional() }) }), asyncH(async (req, res) => {
  const { studentId, subjects } = await resolveStudent(req);
  const s: any = await getSettings();
  const match: any = { student: toId(studentId) };
  const subject = (req.query as any).subject;
  if (subject) match.subject = toId(subject); else if (subjects) match.subject = { $in: subjects.map(toId) };
  const rows = await Attendance.aggregate([{ $match: match }, { $group: { _id: { m: { $substr: ['$date', 0, 7] }, s: '$status' }, n: { $sum: 1 } } }]);
  const months = new Map<string, any>();
  for (const r of rows) { const c = months.get(r._id.m) ?? { present: 0, absent: 0, late: 0, leave: 0 }; c[r._id.s] = r.n; months.set(r._id.m, c); }
  ok(res, Array.from(months.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([month, c]) => ({ month, percentage: calcAttendancePct(c, s.lateWeight), ...c })));
}));

/** Per-day class attendance trend for a subject/section (faculty/admin). */
router.get('/attendance/class-trend', ...staff, validate({ query: z.object({ subject: oid, section: z.string().max(10).optional(), from: dateStr.optional(), to: dateStr.optional() }) }), asyncH(async (req, res) => {
  const { subject, section, from, to } = req.query as any;
  await assertTeaches(req.user!, subject, section);
  const s: any = await getSettings();
  const match: any = { subject: toId(subject) };
  if (section) match.section = section;
  if (from || to) match.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  const rows = await Attendance.aggregate([{ $match: match }, { $group: { _id: { d: '$date', s: '$status' }, n: { $sum: 1 } } }]);
  const days = new Map<string, any>();
  for (const r of rows) { const c = days.get(r._id.d) ?? { present: 0, absent: 0, late: 0, leave: 0 }; c[r._id.s] = r.n; days.set(r._id.d, c); }
  ok(res, Array.from(days.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, c]) => ({ date, percentage: calcAttendancePct(c, s.lateWeight), ...c })));
}));

/** Class-wise report (JSON or CSV). */
router.get('/attendance/report', ...staff, validate({ query: z.object({ subject: oid, section: z.string().max(10).optional(), from: dateStr.optional(), to: dateStr.optional(), format: z.enum(['json', 'csv']).default('json') }) }), asyncH(async (req, res) => {
  const { subject, section, from, to, format } = req.query as any;
  await assertTeaches(req.user!, subject, section);
  const s: any = await getSettings();
  const students = await studentsOfSubject(subject, section);
  const match: any = { subject: toId(subject), student: { $in: students.map((x: any) => x._id) } };
  if (from || to) match.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  const agg = await Attendance.aggregate([{ $match: match }, { $group: { _id: { st: '$student', s: '$status' }, n: { $sum: 1 } } }]);
  const by = new Map<string, any>();
  for (const r of agg) { const c = by.get(String(r._id.st)) ?? { present: 0, absent: 0, late: 0, leave: 0 }; c[r._id.s] = r.n; by.set(String(r._id.st), c); }
  const rows = students.map((st: any) => {
    const c = by.get(String(st._id)) ?? { present: 0, absent: 0, late: 0, leave: 0 };
    const percentage = calcAttendancePct(c, s.lateWeight);
    return { studentId: st.idNumber ?? '', name: st.name, section: st.section ?? '', ...c, percentage, belowThreshold: percentage !== null && percentage < s.attendanceThreshold, _id: st._id };
  });
  if (format === 'csv') {
    await audit(req, 'report.export', 'attendance', subject, { format });
    return sendCsv(res, `attendance-${subject}.csv`, rows.map(({ _id, ...r }: any) => r));
  }
  ok(res, { threshold: s.attendanceThreshold, rows });
}));
void User;
