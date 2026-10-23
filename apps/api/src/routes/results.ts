import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { Assessment, Result, User } from '../models';
import { audit } from '../services/audit';
import { assertTeaches, canViewStudent, studentsOfSubject, teachingSubjectIds } from '../services/access';
import { transcript } from '../services/academics';
import { notify } from '../services/notify';
import { currentYearId } from '../services/settings';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors';
import { apiRouter, asyncH, isOid, oid, ok, sendCsv, toId } from '../utils/http';

export const router = apiRouter('Assessments & Results');
const staff = [authenticate, requireRole('faculty', 'admin')];

const aBody = z.object({
  subject: oid, academicYear: oid.optional(), section: z.string().trim().max(10).optional(), name: z.string().trim().min(2).max(120),
  type: z.enum(['internal', 'assignment', 'quiz', 'exam']), maxMarks: z.coerce.number().min(1).max(1000), weightage: z.coerce.number().min(0).max(100),
});

router.get('/assessments', ...staff, validate({ query: z.object({ subject: oid.optional() }) }), asyncH(async (req, res) => {
  const u = req.user!;
  const f: any = {};
  const { subject } = req.query as any;
  if (u.role === 'faculty') {
    const mine = await teachingSubjectIds(u.id);
    if (subject && !mine.includes(subject)) throw forbidden();
    f.subject = subject ?? { $in: mine };
  } else if (subject) f.subject = subject;
  const items: any[] = await Assessment.find(f).populate('subject', 'code name').sort({ createdAt: -1 }).limit(300).lean();
  const counts = await Result.aggregate([{ $match: { assessment: { $in: items.map((i) => i._id) } } }, { $group: { _id: '$assessment', n: { $sum: 1 } } }]);
  const cm = new Map(counts.map((c: any) => [String(c._id), c.n]));
  // weightage total per subject so the UI can warn when it exceeds 100
  ok(res, items.map((i) => ({ ...i, resultCount: cm.get(String(i._id)) ?? 0 })));
}));

router.post('/assessments', ...staff, validate({ body: aBody }), asyncH(async (req, res) => {
  await assertTeaches(req.user!, req.body.subject, req.body.section || undefined);
  const academicYear = req.body.academicYear ?? (await currentYearId());
  if (!academicYear) throw badRequest('No academic year configured');
  const total: any[] = await Assessment.aggregate([{ $match: { subject: toId(req.body.subject), academicYear: toId(academicYear) } }, { $group: { _id: null, w: { $sum: '$weightage' } } }]);
  if ((total[0]?.w ?? 0) + req.body.weightage > 100) throw badRequest(`Total weightage for this subject would exceed 100% (currently ${total[0]?.w ?? 0}%)`);
  const a = await Assessment.create({ ...req.body, academicYear, createdBy: req.user!.id });
  await audit(req, 'assessment.create', 'assessment', a._id, req.body);
  ok(res, a, undefined, 201);
}));

async function loadAssessment(req: any) {
  if (!isOid(req.params.id)) throw notFound();
  const a: any = await Assessment.findById(req.params.id);
  if (!a) throw notFound();
  await assertTeaches(req.user!, String(a.subject), a.section || undefined);
  return a;
}

router.patch('/assessments/:id', ...staff, validate({ body: aBody.pick({ name: true, maxMarks: true, weightage: true }).partial() }), asyncH(async (req, res) => {
  const a = await loadAssessment(req);
  if (a.status === 'published' && req.body.maxMarks && req.body.maxMarks !== a.maxMarks) throw conflict('Unpublish the assessment before changing its maximum marks');
  if (req.body.maxMarks && (await Result.exists({ assessment: a._id, marks: { $gt: req.body.maxMarks } }))) throw badRequest('Existing marks exceed the new maximum');
  a.set(req.body); await a.save();
  await audit(req, 'assessment.update', 'assessment', a._id, req.body);
  ok(res, a);
}));
router.delete('/assessments/:id', ...staff, asyncH(async (req, res) => {
  const a = await loadAssessment(req);
  if (a.status === 'published') throw conflict('Unpublish the assessment before deleting it');
  await Result.deleteMany({ assessment: a._id });
  await a.deleteOne();
  await audit(req, 'assessment.delete', 'assessment', a._id);
  ok(res, { id: String(a._id) });
}));

router.get('/assessments/:id/marks', ...staff, asyncH(async (req, res) => {
  const a = await loadAssessment(req);
  const students = await studentsOfSubject(String(a.subject), a.section || undefined);
  const results: any[] = await Result.find({ assessment: a._id }).lean();
  const m = new Map(results.map((r) => [String(r.student), r]));
  ok(res, { assessment: a, rows: students.map((s: any) => ({ student: s, marks: m.get(String(s._id))?.marks ?? null, remarks: m.get(String(s._id))?.remarks ?? '' })) });
}));

router.put('/assessments/:id/marks', ...staff, validate({ body: z.object({ records: z.array(z.object({ student: oid, marks: z.coerce.number().min(0), remarks: z.string().max(300).optional() })).min(1).max(500) }) }), asyncH(async (req, res) => {
  const a = await loadAssessment(req);
  const allowed = new Set((await studentsOfSubject(String(a.subject), a.section || undefined)).map((s: any) => String(s._id)));
  const recs = req.body.records as { student: string; marks: number; remarks?: string }[];
  for (const r of recs) {
    if (!allowed.has(r.student)) throw badRequest('Some students are not enrolled in this subject');
    if (r.marks > a.maxMarks) throw badRequest(`Marks cannot exceed ${a.maxMarks}`);
  }
  const existing: any[] = await Result.find({ assessment: a._id, student: { $in: recs.map((r) => r.student) } }).lean();
  const em = new Map(existing.map((e) => [String(e.student), e]));
  const ops: any[] = []; const changed: string[] = [];
  for (const r of recs) {
    const cur = em.get(r.student);
    if (!cur) { ops.push({ insertOne: { document: { assessment: a._id, subject: a.subject, student: toId(r.student), marks: r.marks, remarks: r.remarks, enteredBy: toId(req.user!.id), history: [] } } }); changed.push(r.student); }
    else if (cur.marks !== r.marks || (r.remarks ?? '') !== (cur.remarks ?? '')) {
      ops.push({ updateOne: { filter: { _id: cur._id }, update: { $set: { marks: r.marks, remarks: r.remarks, enteredBy: toId(req.user!.id) }, ...(cur.marks !== r.marks ? { $push: { history: { by: toId(req.user!.id), at: new Date(), from: cur.marks, to: r.marks } } } : {}) } } });
      if (cur.marks !== r.marks) changed.push(r.student);
    }
  }
  if (ops.length) await Result.bulkWrite(ops, { ordered: false });
  await audit(req, 'marks.update', 'assessment', a._id, { changed: changed.length, published: a.status === 'published' });
  if (a.status === 'published' && changed.length) await notify(changed, { type: 'marks', title: `Marks updated: ${a.name}`, link: '/results' });
  ok(res, { saved: ops.length });
}));

async function setPublish(req: any, res: any, publish: boolean) {
  const a = await loadAssessment(req);
  if (publish === (a.status === 'published')) throw conflict(`Assessment is already ${a.status}`);
  if (publish && !(await Result.exists({ assessment: a._id }))) throw badRequest('Enter marks before publishing');
  a.status = publish ? 'published' : 'draft';
  a.publishedAt = publish ? new Date() : undefined;
  await a.save();
  await audit(req, publish ? 'results.publish' : 'results.unpublish', 'assessment', a._id, { name: a.name });
  if (publish) await notify((await Result.find({ assessment: a._id }).distinct('student')).map(String), { type: 'marks', title: `Results published: ${a.name}`, link: '/results' });
  ok(res, a);
}
router.post('/assessments/:id/publish', ...staff, asyncH((req, res) => setPublish(req, res, true)));
router.post('/assessments/:id/unpublish', ...staff, asyncH((req, res) => setPublish(req, res, false)));

/** Student transcript (published results only). Faculty/admin may pass ?student=. */
router.get('/results/transcript', authenticate, requireRole('student', 'faculty', 'admin'), validate({ query: z.object({ student: oid.optional() }) }), asyncH(async (req, res) => {
  const u = req.user!;
  const target = (req.query as any).student ?? u.id;
  if (u.role !== 'student' && !(req.query as any).student) throw badRequest('student is required');
  if (!(await canViewStudent(u, target))) throw forbidden();
  ok(res, await transcript(target, u.role === 'faculty' ? await teachingSubjectIds(u.id) : undefined));
}));

/** Per-assessment class performance (faculty/admin). */
router.get('/results/performance/:subjectId', ...staff, asyncH(async (req, res) => {
  if (!isOid(req.params.subjectId)) throw notFound();
  await assertTeaches(req.user!, req.params.subjectId);
  const assessments: any[] = await Assessment.find({ subject: req.params.subjectId }).sort({ createdAt: 1 }).lean();
  const out = [];
  for (const a of assessments) {
    const rs: any[] = await Result.find({ assessment: a._id }).select('marks').lean();
    const pcts = rs.map((r) => (r.marks / a.maxMarks) * 100);
    const buckets = [0, 0, 0, 0, 0]; // <40, 40-59, 60-69, 70-79, 80+
    pcts.forEach((p) => { buckets[p < 40 ? 0 : p < 60 ? 1 : p < 70 ? 2 : p < 80 ? 3 : 4]++; });
    out.push({ assessment: a._id, name: a.name, type: a.type, status: a.status, count: rs.length, average: pcts.length ? Math.round((pcts.reduce((x, y) => x + y, 0) / pcts.length) * 10) / 10 : null, highest: pcts.length ? Math.round(Math.max(...pcts) * 10) / 10 : null, lowest: pcts.length ? Math.round(Math.min(...pcts) * 10) / 10 : null, distribution: buckets });
  }
  ok(res, out);
}));

router.get('/results/export/:assessmentId', ...staff, asyncH(async (req, res) => {
  (req.params as any).id = req.params.assessmentId;
  const a = await loadAssessment(req);
  const rs: any[] = await Result.find({ assessment: a._id }).populate('student', 'name idNumber').lean();
  await audit(req, 'report.export', 'results', a._id);
  sendCsv(res, `results-${a.name}.csv`, rs.map((r) => ({ studentId: r.student?.idNumber ?? '', name: r.student?.name ?? '', marks: r.marks, maxMarks: a.maxMarks, remarks: r.remarks ?? '' })));
}));
void User;
