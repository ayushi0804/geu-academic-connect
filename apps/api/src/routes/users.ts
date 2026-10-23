import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { Department, Enrollment, User } from '../models';
import { audit } from '../services/audit';
import { canViewStudent, teachingSubjectIds } from '../services/access';
import { emailEnabled, sendMail } from '../services/mailer';
import { apiRouter, asyncH, escapeRegex, isOid, oid, ok, pageMeta, pageQuery, parseSort } from '../utils/http';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors';
import { createToken, tokenLink } from './auth';

export const router = apiRouter('Users');
const admin = [authenticate, requireRole('admin')];

const base = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email().max(200),
  role: z.enum(['student', 'faculty', 'admin', 'placement']),
  idNumber: z.string().trim().max(40).optional(),
  department: oid.optional(),
  program: oid.optional(),
  academicYear: oid.optional(),
  semester: z.coerce.number().int().min(1).max(12).optional(),
  section: z.string().trim().max(10).optional(),
  designation: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(20).optional(),
});
const createSchema = base.superRefine((v, ctx) => {
  if (v.role === 'student') for (const f of ['department', 'semester', 'section'] as const) if (!v[f]) ctx.addIssue({ code: 'custom', path: [f], message: `${f} is required for students` });
  if (v.role === 'faculty' && !v.department) ctx.addIssue({ code: 'custom', path: ['department'], message: 'department is required for faculty' });
});
const updateSchema = base.partial().extend({ status: z.enum(['active', 'inactive', 'invited']).optional() });

async function sendInvite(user: any, req: any) {
  const raw = await createToken(user._id, 'invite', 72);
  const link = tokenLink(raw, 'invite');
  const emailSent = emailEnabled ? await sendMail(user.email, 'Your GEU Academic Connect invitation', `Activate your account within 72 hours: ${link}`) : false;
  await audit(req, 'user.invite', 'user', user._id);
  return { inviteLink: link, emailSent };
}

router.get('/users', ...admin, validate({ query: pageQuery.passthrough() }), asyncH(async (req, res) => {
  const { page, limit, q, sort, role, status, department, semester, section } = req.query as any;
  const f: any = {};
  if (role) f.role = String(role);
  if (status) f.status = String(status);
  if (department) { if (!isOid(department)) throw badRequest('Invalid department'); f.department = department; }
  if (semester) f.semester = Number(semester);
  if (section) f.section = String(section);
  if (q) { const r = new RegExp(escapeRegex(q), 'i'); f.$or = [{ name: r }, { email: r }, { idNumber: r }]; }
  const [items, total] = await Promise.all([
    User.find(f).populate('department', 'name code').sort(parseSort(sort, ['name', 'email', 'role', 'status', 'createdAt', 'idNumber'], { createdAt: -1 })).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(f),
  ]);
  ok(res, items, pageMeta(page, limit, total));
}));

/** Directory: everyone can see faculty; only admin/faculty can browse students (faculty: own students only). */
router.get('/users/directory', authenticate, validate({ query: pageQuery.extend({ role: z.enum(['faculty', 'student']).default('faculty'), department: oid.optional() }) }), asyncH(async (req, res) => {
  const { page, limit, q, role, department } = req.query as any;
  const u = req.user!;
  const f: any = { role, status: 'active' };
  if (role === 'student') {
    if (u.role === 'faculty') f._id = { $in: await Enrollment.find({ subject: { $in: await teachingSubjectIds(u.id) } }).distinct('student') };
    else if (u.role !== 'admin') throw forbidden();
  }
  if (department) f.department = department;
  if (q) { const r = new RegExp(escapeRegex(q), 'i'); f.$or = [{ name: r }, { idNumber: r }]; }
  const [items, total] = await Promise.all([
    User.find(f).select(role === 'faculty' ? 'name email designation department idNumber photo' : 'name email idNumber department semester section').populate('department', 'name code').sort({ name: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(f),
  ]);
  ok(res, items, pageMeta(page, limit, total));
}));

router.post('/users', ...admin, validate({ body: createSchema }), asyncH(async (req, res) => {
  if (req.body.department && !(await Department.exists({ _id: req.body.department }))) throw badRequest('Department does not exist');
  const user: any = await User.create({ ...req.body, status: 'invited' });
  await audit(req, 'user.create', 'user', user._id, { email: user.email, role: user.role });
  const invite = await sendInvite(user, req);
  ok(res, { user, ...invite }, undefined, 201);
}));

router.get('/users/:id', authenticate, asyncH(async (req, res) => {
  if (!isOid(req.params.id)) throw notFound();
  const target: any = await User.findById(req.params.id).populate('department', 'name code').populate('program', 'name code').lean();
  if (!target) throw notFound();
  const me = req.user!;
  const self = me.id === req.params.id;
  if (!self && me.role !== 'admin') {
    if (target.role === 'faculty') {
      const { email, ...rest } = target; ok(res, { _id: rest._id, name: rest.name, designation: rest.designation, department: rest.department, email });
      return;
    }
    if (target.role !== 'student' || !(await canViewStudent(me, req.params.id))) throw forbidden();
  }
  ok(res, target);
}));

router.patch('/users/:id', ...admin, validate({ body: updateSchema }), asyncH(async (req, res) => {
  if (!isOid(req.params.id)) throw notFound();
  const user: any = await User.findById(req.params.id).select('+tokenVersion');
  if (!user) throw notFound();
  const self = req.params.id === req.user!.id;
  const { status, role } = req.body;
  if (self && ((status && status !== 'active') || (role && role !== 'admin'))) throw badRequest('You cannot deactivate or demote your own account');
  const losingAdmin = user.role === 'admin' && user.status === 'active' && ((status && status !== 'active') || (role && role !== 'admin'));
  if (losingAdmin && (await User.countDocuments({ role: 'admin', status: 'active' })) <= 1) throw conflict('At least one active administrator is required');
  if (status === 'invited' && user.status !== 'invited') throw badRequest('Cannot move an activated account back to invited');
  const roleChanged = role && role !== user.role;
  const statusChanged = status && status !== user.status;
  const before = { role: user.role, status: user.status };
  user.set(req.body);
  if (roleChanged || status === 'inactive') user.tokenVersion = (user.tokenVersion ?? 0) + 1; // revoke sessions
  await user.save();
  if (roleChanged) await audit(req, 'user.role_change', 'user', user._id, { from: before.role, to: user.role });
  if (statusChanged) await audit(req, status === 'inactive' ? 'user.deactivate' : 'user.status_change', 'user', user._id, { from: before.status, to: user.status });
  await audit(req, 'user.update', 'user', user._id, req.body);
  ok(res, await User.findById(user._id).populate('department', 'name code').lean());
}));

router.post('/users/:id/invite', ...admin, asyncH(async (req, res) => {
  if (!isOid(req.params.id)) throw notFound();
  const user: any = await User.findById(req.params.id);
  if (!user) throw notFound();
  if (user.status !== 'invited') throw badRequest('This account is already activated');
  ok(res, await sendInvite(user, req));
}));
