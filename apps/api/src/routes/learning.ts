import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { Assignment, LearningMaterial, Submission, User, UploadedFile } from '../models';
import { audit } from '../services/audit';
import { assertTeaches, enrolledSubjectIds, studentsOfSubject, teachingSubjectIds } from '../services/access';
import { claimFiles, deleteFile } from '../services/files';
import { notify } from '../services/notify';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors';
import { apiRouter, asyncH, escapeRegex, isOid, oid, ok, pageMeta, pageQuery } from '../utils/http';
import type { AuthUser } from '../types';

export const router = apiRouter('Assignments & Materials');
const staff = [authenticate, requireRole('faculty', 'admin')];

export async function assignmentScope(u: AuthUser): Promise<any> {
  if (u.role === 'admin') return {};
  if (u.role === 'faculty') return { subject: { $in: await teachingSubjectIds(u.id) } };
  if (u.role === 'student') {
    return { subject: { $in: await enrolledSubjectIds(u.id) }, status: 'published', $or: [{ section: { $exists: false } }, { section: null }, { section: '' }, { section: u.section ?? '__none__' }] };
  }
  throw forbidden();
}

async function audienceStudents(a: any): Promise<string[]> {
  const list = await studentsOfSubject(String(a.subject), a.section || undefined);
  return list.map((s: any) => String(s._id));
}

const asgBody = z.object({
  subject: oid, section: z.string().trim().max(10).optional(), title: z.string().trim().min(3).max(160), instructions: z.string().max(5000).optional(),
  attachments: z.array(oid).max(5).default([]), dueDate: z.coerce.date(), maxMarks: z.coerce.number().min(1).max(1000).default(10),
  status: z.enum(['draft', 'published']).default('draft'), allowLate: z.boolean().default(false), allowResubmission: z.boolean().default(true),
});

router.get('/assignments', authenticate, requireRole('student', 'faculty', 'admin'), validate({ query: pageQuery.passthrough() }), asyncH(async (req, res) => {
  const { page, limit, q, subject, status } = req.query as any;
  const u = req.user!;
  const f: any = { ...(await assignmentScope(u)) };
  if (subject && isOid(subject)) { if (f.subject?.$in && !f.subject.$in.includes(subject)) throw forbidden(); f.subject = subject; }
  if (status && u.role !== 'student') f.status = String(status);
  if (q) f.title = new RegExp(escapeRegex(q), 'i');
  const [items, total] = await Promise.all([
    Assignment.find(f).populate('subject', 'code name').populate('attachments', 'originalName size').sort({ dueDate: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Assignment.countDocuments(f),
  ]);
  let data: any[] = items;
  if (u.role === 'student') {
    const subs: any[] = await Submission.find({ student: u.id, assignment: { $in: items.map((a: any) => a._id) } }).populate('file', 'originalName').lean();
    const m = new Map(subs.map((s) => [String(s.assignment), s]));
    data = items.map((a: any) => ({ ...a, mySubmission: m.get(String(a._id)) ?? null }));
  } else {
    const counts = await Submission.aggregate([{ $match: { assignment: { $in: items.map((a: any) => a._id) } } }, { $group: { _id: '$assignment', total: { $sum: 1 }, graded: { $sum: { $cond: [{ $eq: ['$status', 'graded'] }, 1, 0] } } } }]);
    const cm = new Map(counts.map((c: any) => [String(c._id), c]));
    data = items.map((a: any) => ({ ...a, submissionCount: cm.get(String(a._id))?.total ?? 0, gradedCount: cm.get(String(a._id))?.graded ?? 0 }));
  }
  ok(res, data, pageMeta(page, limit, total));
}));

router.get('/assignments/:id', authenticate, requireRole('student', 'faculty', 'admin'), asyncH(async (req, res) => {
  if (!isOid(req.params.id)) throw notFound();
  const a: any = await Assignment.findOne({ _id: req.params.id, ...(await assignmentScope(req.user!)) }).populate('subject', 'code name').populate('attachments', 'originalName size').lean();
  if (!a) throw notFound();
  if (req.user!.role === 'student') a.mySubmission = await Submission.findOne({ assignment: a._id, student: req.user!.id }).populate('file', 'originalName').lean();
  ok(res, a);
}));

router.post('/assignments', ...staff, validate({ body: asgBody }), asyncH(async (req, res) => {
  await assertTeaches(req.user!, req.body.subject, req.body.section || undefined);
  await claimFiles(req.body.attachments, { owner: req.user!.id, purposes: ['assignment'], subject: req.body.subject, admin: req.user!.role === 'admin' });
  const a: any = await Assignment.create({ ...req.body, createdBy: req.user!.id });
  await audit(req, 'assignment.create', 'assignment', a._id, { title: a.title, status: a.status });
  if (a.status === 'published') await notify(await audienceStudents(a), { type: 'assignment', title: `New assignment: ${a.title}`, message: `Due ${a.dueDate.toISOString().slice(0, 10)}`, link: '/assignments' });
  ok(res, a, undefined, 201);
}));

async function loadOwned(req: any) {
  if (!isOid(req.params.id)) throw notFound();
  const a: any = await Assignment.findById(req.params.id);
  if (!a) throw notFound();
  await assertTeaches(req.user!, String(a.subject), a.section || undefined);
  return a;
}

router.patch('/assignments/:id', ...staff, validate({ body: asgBody.omit({ subject: true }).partial() }), asyncH(async (req, res) => {
  const a = await loadOwned(req);
  const wasDraft = a.status === 'draft';
  const dueChanged = req.body.dueDate && +new Date(req.body.dueDate) !== +a.dueDate;
  if (req.body.attachments) await claimFiles(req.body.attachments, { owner: req.user!.id, purposes: ['assignment'], subject: String(a.subject), admin: req.user!.role === 'admin' });
  a.set(req.body); await a.save();
  await audit(req, 'assignment.update', 'assignment', a._id, req.body);
  if (a.status === 'published') {
    if (wasDraft) await notify(await audienceStudents(a), { type: 'assignment', title: `New assignment: ${a.title}`, link: '/assignments' });
    else if (dueChanged) await notify(await audienceStudents(a), { type: 'assignment', title: `Deadline changed: ${a.title}`, message: `New due date ${a.dueDate.toISOString().slice(0, 10)}`, link: '/assignments' });
  }
  ok(res, a);
}));

router.delete('/assignments/:id', ...staff, asyncH(async (req, res) => {
  const a = await loadOwned(req);
  if (await Submission.exists({ assignment: a._id })) throw conflict('Assignment has submissions. Set it back to draft instead of deleting.');
  await a.deleteOne();
  await audit(req, 'assignment.delete', 'assignment', a._id);
  ok(res, { id: String(a._id) });
}));

router.post('/assignments/:id/submit', authenticate, requireRole('student'), validate({ body: z.object({ file: oid, comment: z.string().max(1000).optional() }) }), asyncH(async (req, res) => {
  if (!isOid(req.params.id)) throw notFound();
  const u = req.user!;
  const a: any = await Assignment.findOne({ _id: req.params.id, ...(await assignmentScope(u)) });
  if (!a) throw notFound();
  const now = new Date();
  const isLate = now > a.dueDate;
  if (isLate && !a.allowLate) throw forbidden('The deadline has passed and late submissions are not accepted for this assignment');
  const existing: any = await Submission.findOne({ assignment: a._id, student: u.id });
  if (existing?.status === 'graded') throw conflict('This submission has already been graded and cannot be changed');
  if (existing && !a.allowResubmission) throw conflict('Resubmission is not allowed for this assignment');
  await claimFiles([req.body.file], { owner: u.id, purposes: ['submission'], subject: String(a.subject) });
  let sub: any;
  if (existing) {
    const old = existing.file;
    existing.set({ file: req.body.file, comment: req.body.comment, submittedAt: now, isLate, attempts: existing.attempts + 1 });
    sub = await existing.save();
    await deleteFile(old);
  } else sub = await Submission.create({ assignment: a._id, student: u.id, file: req.body.file, comment: req.body.comment, submittedAt: now, isLate });
  await audit(req, 'submission.submit', 'submission', sub._id, { assignment: String(a._id), isLate });
  ok(res, sub, undefined, existing ? 200 : 201);
}));

router.get('/assignments/:id/submissions', ...staff, asyncH(async (req, res) => {
  const a = await loadOwned(req);
  const students = await studentsOfSubject(String(a.subject), a.section || undefined);
  const subs: any[] = await Submission.find({ assignment: a._id }).populate('file', 'originalName size').lean();
  const m = new Map(subs.map((s) => [String(s.student), s]));
  ok(res, { assignment: { _id: a._id, title: a.title, maxMarks: a.maxMarks, dueDate: a.dueDate }, rows: students.map((s: any) => ({ student: s, submission: m.get(String(s._id)) ?? null })) });
}));

router.patch('/assignments/:id/submissions/:sid/grade', ...staff, validate({ body: z.object({ marks: z.coerce.number().min(0), feedback: z.string().max(2000).optional() }) }), asyncH(async (req, res) => {
  const a = await loadOwned(req);
  if (!isOid(req.params.sid)) throw notFound();
  const sub: any = await Submission.findOne({ _id: req.params.sid, assignment: a._id });
  if (!sub) throw notFound();
  if (req.body.marks > a.maxMarks) throw badRequest(`Marks cannot exceed ${a.maxMarks}`);
  const before = sub.marks;
  sub.set({ marks: req.body.marks, feedback: req.body.feedback, status: 'graded', gradedBy: req.user!.id, gradedAt: new Date() });
  await sub.save();
  await audit(req, 'submission.grade', 'submission', sub._id, { from: before, to: sub.marks });
  await notify([sub.student], { type: 'marks', title: `Assignment graded: ${a.title}`, message: `You scored ${sub.marks}/${a.maxMarks}`, link: '/assignments' });
  ok(res, sub);
}));

// ---------------- Learning materials ----------------
const matBody = z.object({ subject: oid, title: z.string().trim().min(2).max(160), description: z.string().max(1000).optional(), category: z.enum(['lecture', 'notes', 'reference', 'lab', 'previous-paper', 'other']).default('lecture'), file: oid });

router.get('/materials', authenticate, requireRole('student', 'faculty', 'admin'), validate({ query: pageQuery.passthrough() }), asyncH(async (req, res) => {
  const { page, limit, q, subject, category } = req.query as any;
  const u = req.user!;
  const f: any = {};
  if (u.role === 'student') f.subject = { $in: await enrolledSubjectIds(u.id) };
  else if (u.role === 'faculty') f.subject = { $in: await teachingSubjectIds(u.id) };
  if (subject && isOid(subject)) { if (f.subject?.$in && !f.subject.$in.includes(subject)) throw forbidden(); f.subject = subject; }
  if (category) f.category = String(category);
  if (q) f.title = new RegExp(escapeRegex(q), 'i');
  const [items, total] = await Promise.all([
    LearningMaterial.find(f).populate('subject', 'code name').populate('file', 'originalName size').populate('uploadedBy', 'name').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    LearningMaterial.countDocuments(f),
  ]);
  ok(res, items, pageMeta(page, limit, total));
}));
router.post('/materials', ...staff, validate({ body: matBody }), asyncH(async (req, res) => {
  await assertTeaches(req.user!, req.body.subject);
  await claimFiles([req.body.file], { owner: req.user!.id, purposes: ['material'], subject: req.body.subject, admin: req.user!.role === 'admin' });
  const m = await LearningMaterial.create({ ...req.body, uploadedBy: req.user!.id });
  await audit(req, 'material.create', 'material', m._id, { title: req.body.title });
  ok(res, m, undefined, 201);
}));
router.delete('/materials/:id', ...staff, asyncH(async (req, res) => {
  if (!isOid(req.params.id)) throw notFound();
  const m: any = await LearningMaterial.findById(req.params.id);
  if (!m) throw notFound();
  await assertTeaches(req.user!, String(m.subject));
  await m.deleteOne();
  await deleteFile(m.file);
  await audit(req, 'material.delete', 'material', m._id);
  ok(res, { id: String(m._id) });
}));
void User; void UploadedFile;
