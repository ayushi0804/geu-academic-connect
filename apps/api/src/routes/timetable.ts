import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AcademicEvent, Assignment, FacultyAssignment, Timetable, User, Enrollment } from '../models';
import { audit } from '../services/audit';
import { enrolledSubjectIds, teachingSubjectIds } from '../services/access';
import { notify } from '../services/notify';
import { dayOfWeek, hhmm } from '../utils/dates';
import { badRequest, conflict, notFound } from '../utils/errors';
import { apiRouter, asyncH, isOid, oid, ok, timeStr } from '../utils/http';
import type { AuthUser } from '../types';

export const router = apiRouter('Timetable & Calendar');
const POP = [{ path: 'subject', select: 'code name' }, { path: 'faculty', select: 'name' }];

async function scopeFor(u: AuthUser, query: any = {}) {
  if (u.role === 'student') {
    const f: any = { subject: { $in: await enrolledSubjectIds(u.id) } };
    if (u.section) f.section = u.section;
    return f;
  }
  if (u.role === 'faculty') return { faculty: u.id };
  const f: any = {};
  for (const k of ['section', 'room'] as const) if (query[k]) f[k] = String(query[k]);
  for (const k of ['faculty', 'subject'] as const) if (query[k] && isOid(query[k])) f[k] = query[k];
  if (query.day) f.dayOfWeek = Number(query.day);
  return f;
}
export const timetableFor = async (u: AuthUser, query: any = {}) => Timetable.find(await scopeFor(u, query)).populate(POP).sort({ dayOfWeek: 1, startTime: 1 }).limit(500).lean();

router.get('/timetable', authenticate, requireRole('student', 'faculty', 'admin'), asyncH(async (req, res) => ok(res, await timetableFor(req.user!, req.query))));
router.get('/timetable/today', authenticate, requireRole('student', 'faculty', 'admin'), asyncH(async (req, res) => {
  const d = dayOfWeek();
  ok(res, (await timetableFor(req.user!, req.query)).filter((e: any) => e.dayOfWeek === d));
}));
router.get('/timetable/upcoming', authenticate, requireRole('student', 'faculty', 'admin'), asyncH(async (req, res) => {
  const all: any[] = await timetableFor(req.user!, req.query);
  const now = { d: dayOfWeek(), t: hhmm() };
  const rank = (e: any) => { const diff = (e.dayOfWeek - now.d + 7) % 7; return diff === 0 && e.startTime <= now.t ? 7 : diff; };
  ok(res, [...all].sort((a, b) => rank(a) - rank(b) || a.startTime.localeCompare(b.startTime)).slice(0, 5));
}));

const body = z.object({
  subject: oid, faculty: oid, section: z.string().trim().min(1).max(10), room: z.string().trim().min(1).max(30),
  dayOfWeek: z.coerce.number().int().min(1).max(7), startTime: timeStr, endTime: timeStr, semester: z.coerce.number().int().min(1).max(12).optional(),
});

async function checkConflicts(d: any, excludeId?: string) {
  if (d.endTime <= d.startTime) throw badRequest('End time must be after start time');
  const clash: any[] = await Timetable.find({
    ...(excludeId ? { _id: { $ne: excludeId } } : {}), dayOfWeek: d.dayOfWeek, startTime: { $lt: d.endTime }, endTime: { $gt: d.startTime },
    $or: [{ room: d.room }, { faculty: d.faculty }, { section: d.section }],
  }).populate('subject', 'code').lean();
  if (clash.length) {
    const details = clash.flatMap((c) => [
      ...(c.room === d.room ? [{ type: 'room', with: `${c.subject?.code} ${c.startTime}-${c.endTime}` }] : []),
      ...(String(c.faculty) === String(d.faculty) ? [{ type: 'faculty', with: `${c.subject?.code} ${c.startTime}-${c.endTime}` }] : []),
      ...(c.section === d.section ? [{ type: 'section', with: `${c.subject?.code} ${c.startTime}-${c.endTime}` }] : []),
    ]);
    throw conflict(`Schedule conflict: ${Array.from(new Set(details.map((x) => x.type))).join(', ')}`, details);
  }
  const fac: any = await User.findById(d.faculty).lean();
  if (!fac || fac.role !== 'faculty') throw badRequest('Selected user is not faculty');
  if (!(await FacultyAssignment.exists({ faculty: d.faculty, subject: d.subject, section: d.section }))) throw badRequest('Faculty is not allocated to this subject and section');
}
async function notifyAffected(entry: any, title: string) {
  const students = (await Enrollment.find({ subject: entry.subject, status: 'active' }).distinct('student')).map(String);
  const ids = (await User.find({ _id: { $in: students }, section: entry.section }).distinct('_id')).map(String);
  await notify([...ids, entry.faculty], { type: 'timetable', title, message: `Day ${entry.dayOfWeek}, ${entry.startTime}-${entry.endTime}, room ${entry.room}`, link: '/timetable' });
}
const admin = [authenticate, requireRole('admin')];

router.post('/timetable', ...admin, validate({ body }), asyncH(async (req, res) => {
  await checkConflicts(req.body);
  const doc: any = await Timetable.create(req.body);
  await audit(req, 'timetable.create', 'timetable', doc._id, req.body);
  await notifyAffected(doc, 'New class scheduled');
  ok(res, await Timetable.findById(doc._id).populate(POP).lean(), undefined, 201);
}));
router.patch('/timetable/:id', ...admin, validate({ body: body.partial() }), asyncH(async (req, res) => {
  if (!isOid(req.params.id)) throw notFound();
  const doc: any = await Timetable.findById(req.params.id);
  if (!doc) throw notFound();
  const merged = { ...doc.toObject(), ...req.body };
  merged.subject = String(merged.subject); merged.faculty = String(merged.faculty);
  await checkConflicts(merged, req.params.id);
  doc.set(req.body); await doc.save();
  await audit(req, 'timetable.update', 'timetable', doc._id, req.body);
  await notifyAffected(doc, 'Class schedule changed');
  ok(res, await Timetable.findById(doc._id).populate(POP).lean());
}));
router.delete('/timetable/:id', ...admin, asyncH(async (req, res) => {
  if (!isOid(req.params.id)) throw notFound();
  const doc: any = await Timetable.findByIdAndDelete(req.params.id);
  if (!doc) throw notFound();
  await audit(req, 'timetable.delete', 'timetable', doc._id);
  await notifyAffected(doc, 'Class cancelled');
  ok(res, { id: String(doc._id) });
}));

/** Academic calendar: events + assignment deadlines relevant to the user. */
router.get('/calendar', authenticate, requireRole('student', 'faculty', 'admin'), validate({ query: z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), type: z.string().optional() }) }), asyncH(async (req, res) => {
  const { from, to, type } = req.query as any;
  const range: any = from || to ? { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } : undefined;
  const u = req.user!;
  const evQ: any = {};
  if (range) evQ.startDate = range;
  if (type && type !== 'deadline') evQ.type = type;
  if (u.department && u.role !== 'admin') evQ.$or = [{ department: { $exists: false } }, { department: null }, { department: u.department }];
  const events: any[] = type === 'deadline' ? [] : await AcademicEvent.find(evQ).sort({ startDate: 1 }).limit(300).lean();
  const out = events.map((e) => ({ id: String(e._id), title: e.title, type: e.type, start: e.startDate, end: e.endDate, source: 'event' }));
  if (!type || type === 'deadline') {
    const subjects = u.role === 'student' ? await enrolledSubjectIds(u.id) : u.role === 'faculty' ? await teachingSubjectIds(u.id) : null;
    const aq: any = { status: 'published' };
    if (subjects) aq.subject = { $in: subjects };
    if (range) aq.dueDate = range;
    const asg: any[] = await Assignment.find(aq).populate('subject', 'code').limit(300).lean();
    out.push(...asg.map((a) => ({ id: String(a._id), title: `${a.subject?.code}: ${a.title} due`, type: 'deadline', start: a.dueDate, end: undefined, source: 'assignment' })));
  }
  ok(res, out.sort((a, b) => +new Date(a.start) - +new Date(b.start)));
}));
