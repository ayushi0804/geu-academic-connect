import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AcademicEvent, AcademicYear, AppSettings, Attendance, Assessment, Assignment, Department, Enrollment, FacultyAssignment, Program, Semester, Subject, Timetable, User } from '../models';
import { audit } from '../services/audit';
import { crudRoutes } from '../services/crud';
import { currentYearId } from '../services/settings';
import { apiRouter, asyncH, isOid, oid, ok, pageMeta, pageQuery } from '../utils/http';
import { badRequest, notFound } from '../utils/errors';

export const router = apiRouter('Academic structure');
const admin = [authenticate, requireRole('admin')];
const dated = (a: any, b: any) => { if (a && b && new Date(b) < new Date(a)) throw badRequest('End date must be after start date'); };

crudRoutes(router, {
  path: '/departments', model: Department, resource: 'department', writeRoles: ['admin'],
  create: z.object({ name: z.string().trim().min(2).max(120), code: z.string().trim().min(2).max(12), description: z.string().max(500).optional() }),
  search: ['name', 'code'], sortable: ['name', 'code', 'createdAt'], defaultSort: { name: 1 },
  guardDelete: async (d) => ((await User.exists({ department: d._id })) || (await Subject.exists({ department: d._id })) || (await Program.exists({ department: d._id })) ? 'Department is in use by users, programs or subjects' : null),
});

crudRoutes(router, {
  path: '/programs', model: Program, resource: 'program', writeRoles: ['admin'],
  create: z.object({ name: z.string().trim().min(2).max(120), code: z.string().trim().min(2).max(16), department: oid, durationSemesters: z.coerce.number().int().min(1).max(12).default(8) }),
  search: ['name', 'code'], filters: { department: 'oid' }, populate: { path: 'department', select: 'name code' }, defaultSort: { name: 1 },
  beforeSave: async (d) => { if (d.department && !(await Department.exists({ _id: d.department }))) throw badRequest('Department does not exist'); },
  guardDelete: async (p) => ((await User.exists({ program: p._id })) || (await Subject.exists({ program: p._id })) ? 'Program is in use' : null),
});

const syncCurrentYear = async (doc: any) => {
  if (doc.isCurrent) {
    await AcademicYear.updateMany({ _id: { $ne: doc._id } }, { isCurrent: false });
    await AppSettings.updateOne({ key: 'app' }, { currentAcademicYear: doc._id }, { upsert: true });
  }
};
crudRoutes(router, {
  path: '/academic-years', model: AcademicYear, resource: 'academic_year', writeRoles: ['admin'],
  create: z.object({ label: z.string().trim().min(4).max(20), startDate: z.coerce.date(), endDate: z.coerce.date(), isCurrent: z.boolean().default(false) }),
  search: ['label'], defaultSort: { startDate: -1 },
  beforeSave: async (d, _r, e) => dated(d.startDate ?? e?.startDate, d.endDate ?? e?.endDate),
  afterSave: syncCurrentYear,
  guardDelete: async (y) => ((await Semester.exists({ academicYear: y._id })) || (await Enrollment.exists({ academicYear: y._id })) ? 'Academic year has semesters or enrollments' : null),
});

crudRoutes(router, {
  path: '/semesters', model: Semester, resource: 'semester', writeRoles: ['admin'],
  create: z.object({ academicYear: oid, number: z.coerce.number().int().min(1).max(12), name: z.string().trim().max(60).optional(), startDate: z.coerce.date(), endDate: z.coerce.date(), isCurrent: z.boolean().default(false) }),
  filters: { academicYear: 'oid', number: 'number' }, populate: { path: 'academicYear', select: 'label' }, sortable: ['number', 'startDate'], defaultSort: { startDate: -1 },
  beforeSave: async (d, _r, e) => dated(d.startDate ?? e?.startDate, d.endDate ?? e?.endDate),
  afterSave: async (doc) => { if (doc.isCurrent) await Semester.updateMany({ _id: { $ne: doc._id }, academicYear: doc.academicYear }, { isCurrent: false }); },
});

crudRoutes(router, {
  path: '/subjects', model: Subject, resource: 'subject', writeRoles: ['admin'],
  create: z.object({ code: z.string().trim().min(2).max(16), name: z.string().trim().min(2).max(140), credits: z.coerce.number().int().min(1).max(12), department: oid, program: oid.optional(), semester: z.coerce.number().int().min(1).max(12), type: z.enum(['theory', 'lab', 'elective']).default('theory') }),
  search: ['name', 'code'], filters: { department: 'oid', semester: 'number', program: 'oid', type: 'string' },
  populate: { path: 'department', select: 'name code' }, sortable: ['code', 'name', 'credits', 'semester'], defaultSort: { code: 1 },
  beforeSave: async (d) => { if (d.department && !(await Department.exists({ _id: d.department }))) throw badRequest('Department does not exist'); },
  guardDelete: async (s) => {
    const used = (await Promise.all([FacultyAssignment.exists({ subject: s._id }), Enrollment.exists({ subject: s._id }), Timetable.exists({ subject: s._id }), Assignment.exists({ subject: s._id }), Assessment.exists({ subject: s._id })])).some(Boolean);
    return used ? 'Subject has allocations, enrollments, timetable entries, assignments or assessments' : null;
  },
});

crudRoutes(router, {
  path: '/events', model: AcademicEvent, resource: 'event', writeRoles: ['admin'],
  create: z.object({ title: z.string().trim().min(2).max(160), type: z.enum(['exam', 'holiday', 'event', 'deadline']).default('event'), startDate: z.coerce.date(), endDate: z.coerce.date().optional(), description: z.string().max(1000).optional(), department: oid.optional() }),
  search: ['title'], filters: { type: 'string', department: 'oid' }, defaultSort: { startDate: 1 }, sortable: ['startDate', 'title', 'type'],
  populate: { path: 'department', select: 'name code' },
  beforeSave: async (d, _r, e) => dated(d.startDate ?? e?.startDate, d.endDate ?? e?.endDate),
});

// ---------------- Faculty assignments (subject allocation) ----------------
router.get('/faculty-assignments', authenticate, requireRole('admin', 'faculty'), validate({ query: pageQuery.passthrough() }), asyncH(async (req, res) => {
  const { page, limit, subject, faculty, academicYear } = req.query as any;
  const f: any = {};
  if (req.user!.role === 'faculty') f.faculty = req.user!.id; else if (faculty && isOid(faculty)) f.faculty = faculty;
  if (subject && isOid(subject)) f.subject = subject;
  if (academicYear && isOid(academicYear)) f.academicYear = academicYear;
  const [items, total] = await Promise.all([
    FacultyAssignment.find(f).populate('subject', 'code name credits semester').populate('faculty', 'name email').populate('academicYear', 'label').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    FacultyAssignment.countDocuments(f),
  ]);
  ok(res, items, pageMeta(page, limit, total));
}));
router.post('/faculty-assignments', ...admin, validate({ body: z.object({ subject: oid, faculty: oid, section: z.string().trim().min(1).max(10), academicYear: oid.optional() }) }), asyncH(async (req, res) => {
  const fac: any = await User.findById(req.body.faculty).lean();
  if (!fac || fac.role !== 'faculty' || fac.status === 'inactive') throw badRequest('Selected user is not an active faculty member');
  if (!(await Subject.exists({ _id: req.body.subject }))) throw badRequest('Subject does not exist');
  const academicYear = req.body.academicYear ?? (await currentYearId());
  if (!academicYear) throw badRequest('No academic year configured');
  const doc = await FacultyAssignment.create({ ...req.body, academicYear }); // unique index rejects duplicates (409)
  await audit(req, 'subject.allocate', 'faculty_assignment', doc._id, req.body);
  ok(res, doc, undefined, 201);
}));
router.delete('/faculty-assignments/:id', ...admin, asyncH(async (req, res) => {
  if (!isOid(req.params.id)) throw notFound();
  const doc = await FacultyAssignment.findByIdAndDelete(req.params.id);
  if (!doc) throw notFound();
  await audit(req, 'subject.deallocate', 'faculty_assignment', doc._id);
  ok(res, { id: String(doc._id) });
}));

// ---------------- Enrollments ----------------
router.get('/enrollments', authenticate, requireRole('admin', 'faculty', 'student'), validate({ query: pageQuery.passthrough() }), asyncH(async (req, res) => {
  const { page, limit, subject, student, status, academicYear } = req.query as any;
  const f: any = {};
  const u = req.user!;
  if (u.role === 'student') f.student = u.id;
  else {
    if (student && isOid(student)) f.student = student;
    if (u.role === 'faculty') {
      const mine = (await FacultyAssignment.find({ faculty: u.id }).distinct('subject')).map(String);
      if (subject && isOid(subject)) { if (!mine.includes(subject)) throw badRequest('Not your subject'); f.subject = subject; } else f.subject = { $in: mine };
    }
  }
  if (u.role !== 'faculty' && subject && isOid(subject)) f.subject = subject;
  if (status) f.status = String(status);
  if (academicYear && isOid(academicYear)) f.academicYear = academicYear;
  const [items, total] = await Promise.all([
    Enrollment.find(f).populate('student', 'name email idNumber section semester').populate('subject', 'code name credits semester').populate('academicYear', 'label').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Enrollment.countDocuments(f),
  ]);
  ok(res, items, pageMeta(page, limit, total));
}));
router.post('/enrollments', ...admin, validate({ body: z.object({ student: oid, subject: oid, academicYear: oid.optional() }) }), asyncH(async (req, res) => {
  const st: any = await User.findById(req.body.student).lean();
  if (!st || st.role !== 'student') throw badRequest('Selected user is not a student');
  if (!(await Subject.exists({ _id: req.body.subject }))) throw badRequest('Subject does not exist');
  const academicYear = req.body.academicYear ?? (await currentYearId());
  if (!academicYear) throw badRequest('No academic year configured');
  const doc = await Enrollment.create({ ...req.body, academicYear });
  await audit(req, 'enrollment.create', 'enrollment', doc._id, req.body);
  ok(res, doc, undefined, 201);
}));
router.post('/enrollments/bulk', ...admin, validate({ body: z.object({ subject: oid, academicYear: oid.optional(), department: oid.optional(), program: oid.optional(), semester: z.coerce.number().int().min(1).max(12).optional(), section: z.string().trim().max(10).optional() }) }), asyncH(async (req, res) => {
  const { subject, department, program, semester, section } = req.body;
  if (!(await Subject.exists({ _id: subject }))) throw badRequest('Subject does not exist');
  if (!department && !program && !semester && !section) throw badRequest('Provide at least one filter (department, program, semester or section)');
  const academicYear = req.body.academicYear ?? (await currentYearId());
  if (!academicYear) throw badRequest('No academic year configured');
  const q: any = { role: 'student', status: { $ne: 'inactive' } };
  Object.entries({ department, program, semester, section }).forEach(([k, v]) => v && (q[k] = v));
  const ids = await User.find(q).distinct('_id');
  const existing = new Set((await Enrollment.find({ subject, academicYear, student: { $in: ids } }).distinct('student')).map(String));
  const fresh = ids.filter((i: any) => !existing.has(String(i)));
  if (fresh.length) await Enrollment.insertMany(fresh.map((student: any) => ({ student, subject, academicYear })), { ordered: false });
  await audit(req, 'enrollment.bulk', 'enrollment', subject, { matched: ids.length, created: fresh.length });
  ok(res, { matched: ids.length, created: fresh.length, skippedExisting: ids.length - fresh.length });
}));
router.patch('/enrollments/:id', ...admin, validate({ body: z.object({ status: z.enum(['active', 'dropped', 'completed']) }) }), asyncH(async (req, res) => {
  if (!isOid(req.params.id)) throw notFound();
  const doc = await Enrollment.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
  if (!doc) throw notFound();
  await audit(req, 'enrollment.update', 'enrollment', doc._id, req.body);
  ok(res, doc);
}));
router.delete('/enrollments/:id', ...admin, asyncH(async (req, res) => {
  if (!isOid(req.params.id)) throw notFound();
  const doc: any = await Enrollment.findById(req.params.id);
  if (!doc) throw notFound();
  if (await Attendance.exists({ student: doc.student, subject: doc.subject })) throw badRequest('Enrollment has attendance records. Mark it as "dropped" instead of deleting.');
  await doc.deleteOne();
  await audit(req, 'enrollment.delete', 'enrollment', doc._id);
  ok(res, { id: String(doc._id) });
}));
