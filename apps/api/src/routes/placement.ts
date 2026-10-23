import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { Application, Company, Interview, Offer, Opportunity, PlacementDrive, User } from '../models';
import { audit } from '../services/audit';
import { transcript } from '../services/academics';
import { claimFiles } from '../services/files';
import { notify } from '../services/notify';
import { crudRoutes } from '../services/crud';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors';
import { apiRouter, asyncH, escapeRegex, isOid, oid, ok, pageMeta, pageQuery } from '../utils/http';

export const router = apiRouter('Placement');
const officers = [authenticate, requireRole('placement', 'admin')];
const PW = ['placement', 'admin'] as const;

// Companies & recruiter contacts are visible to placement/admin only.
crudRoutes(router, {
  path: '/companies', model: Company, resource: 'company', readRoles: [...PW], writeRoles: [...PW],
  create: z.object({ name: z.string().trim().min(2).max(140), industry: z.string().max(80).optional(), website: z.string().url().max(200).optional().or(z.literal('')), description: z.string().max(2000).optional(), location: z.string().max(120).optional(), recruiters: z.array(z.object({ name: z.string().max(100), email: z.string().email().optional(), phone: z.string().max(20).optional() })).max(10).default([]) }),
  search: ['name', 'industry'], sortable: ['name', 'createdAt'], defaultSort: { name: 1 },
  guardDelete: async (c) => ((await Opportunity.exists({ company: c._id })) || (await PlacementDrive.exists({ company: c._id })) ? 'Company has drives or opportunities' : null),
});
crudRoutes(router, {
  path: '/drives', model: PlacementDrive, resource: 'drive', readRoles: ['student', ...PW], writeRoles: [...PW],
  create: z.object({ title: z.string().trim().min(2).max(160), company: oid, date: z.coerce.date(), venue: z.string().max(160).optional(), description: z.string().max(2000).optional(), status: z.enum(['upcoming', 'ongoing', 'completed', 'cancelled']).default('upcoming') }),
  search: ['title'], filters: { status: 'string', company: 'oid' }, populate: { path: 'company', select: 'name' }, sortable: ['date', 'title'], defaultSort: { date: -1 },
  beforeSave: async (d) => { if (d.company && !(await Company.exists({ _id: d.company }))) throw badRequest('Company does not exist'); },
});

const oppBody = z.object({
  company: oid, drive: oid.optional(), title: z.string().trim().min(2).max(160), kind: z.enum(['job', 'internship']), description: z.string().max(5000).optional(),
  skills: z.array(z.string().trim().max(40)).max(30).default([]), location: z.string().max(120).optional(), workMode: z.enum(['onsite', 'remote', 'hybrid']).default('onsite'),
  stipendPerMonth: z.coerce.number().min(0).optional(), packageLpa: z.coerce.number().min(0).optional(), minCgpa: z.coerce.number().min(0).max(10).default(0),
  minSemester: z.coerce.number().int().min(1).max(12).default(1), eligibleDepartments: z.array(oid).default([]), deadline: z.coerce.date(), status: z.enum(['draft', 'open', 'closed']).default('draft'),
});
const OPP_POP = [{ path: 'company', select: 'name industry website location' }, { path: 'eligibleDepartments', select: 'name code' }];

async function eligibility(student: any, o: any, cgpa?: number | null) {
  const reasons: string[] = [];
  if (o.eligibleDepartments?.length && !o.eligibleDepartments.some((d: any) => String(d._id ?? d) === String(student.department))) reasons.push('Your department is not eligible');
  if ((student.semester ?? 0) < (o.minSemester ?? 1)) reasons.push(`Requires semester ${o.minSemester}+`);
  if (o.minCgpa > 0) {
    const c = cgpa === undefined ? (await transcript(String(student._id))).cgpa : cgpa;
    if (c === null || c === undefined || c < o.minCgpa) reasons.push(`Requires CGPA ${o.minCgpa}+ (yours: ${c ?? 'n/a'})`);
  }
  return reasons;
}

router.get('/opportunities', authenticate, requireRole('student', ...PW), validate({ query: pageQuery.passthrough() }), asyncH(async (req, res) => {
  const { page, limit, q, kind, status, company, workMode } = req.query as any;
  const u = req.user!;
  const f: any = {};
  if (u.role === 'student') f.status = 'open'; else if (status) f.status = String(status);
  if (kind) f.kind = String(kind);
  if (workMode) f.workMode = String(workMode);
  if (company && isOid(company)) f.company = company;
  if (q) { const r = new RegExp(escapeRegex(q), 'i'); f.$or = [{ title: r }, { skills: r }, { location: r }]; }
  const [items, total] = await Promise.all([
    Opportunity.find(f).populate(OPP_POP).sort({ deadline: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    Opportunity.countDocuments(f),
  ]);
  let data: any[] = items;
  if (u.role === 'student') {
    const me: any = await User.findById(u.id).lean();
    const cgpa = (await transcript(u.id)).cgpa;
    const apps: any[] = await Application.find({ student: u.id, opportunity: { $in: items.map((i: any) => i._id) } }).select('opportunity status').lean();
    const am = new Map(apps.map((a) => [String(a.opportunity), a.status]));
    data = await Promise.all(items.map(async (o: any) => { const reasons = await eligibility(me, o, cgpa); return { ...o, eligible: reasons.length === 0, ineligibleReasons: reasons, applicationStatus: am.get(String(o._id)) ?? null, expired: o.deadline < new Date() }; }));
  } else {
    const counts = await Application.aggregate([{ $match: { opportunity: { $in: items.map((i: any) => i._id) } } }, { $group: { _id: '$opportunity', n: { $sum: 1 } } }]);
    const cm = new Map(counts.map((c: any) => [String(c._id), c.n]));
    data = items.map((o: any) => ({ ...o, applicationCount: cm.get(String(o._id)) ?? 0 }));
  }
  ok(res, data, pageMeta(page, limit, total));
}));

router.post('/opportunities', ...officers, validate({ body: oppBody }), asyncH(async (req, res) => {
  if (!(await Company.exists({ _id: req.body.company }))) throw badRequest('Company does not exist');
  const o: any = await Opportunity.create({ ...req.body, createdBy: req.user!.id });
  await audit(req, 'opportunity.create', 'opportunity', o._id, { title: o.title, status: o.status });
  if (o.status === 'open') await announce(o);
  ok(res, o, undefined, 201);
}));
async function announce(o: any) {
  const q: any = { role: 'student', status: 'active', semester: { $gte: o.minSemester ?? 1 } };
  if (o.eligibleDepartments?.length) q.department = { $in: o.eligibleDepartments };
  const ids = (await User.find(q).distinct('_id')).map(String);
  await notify(ids, { type: 'placement', title: `New ${o.kind}: ${o.title}`, message: `Apply by ${o.deadline.toISOString().slice(0, 10)}`, link: '/placements', dedupeKey: `opp:${o._id}` });
}
router.patch('/opportunities/:id', ...officers, validate({ body: oppBody.omit({ company: true }).partial() }), asyncH(async (req, res) => {
  if (!isOid(req.params.id)) throw notFound();
  const o: any = await Opportunity.findById(req.params.id);
  if (!o) throw notFound();
  const was = o.status;
  o.set(req.body); await o.save();
  await audit(req, 'opportunity.update', 'opportunity', o._id, req.body);
  if (was !== 'open' && o.status === 'open') await announce(o);
  ok(res, o);
}));
router.delete('/opportunities/:id', ...officers, asyncH(async (req, res) => {
  if (!isOid(req.params.id)) throw notFound();
  const o: any = await Opportunity.findById(req.params.id);
  if (!o) throw notFound();
  if (await Application.exists({ opportunity: o._id })) throw conflict('Opportunity has applications. Close it instead of deleting.');
  await o.deleteOne();
  await audit(req, 'opportunity.delete', 'opportunity', o._id);
  ok(res, { id: String(o._id) });
}));

// ---- Applications ----
router.post('/opportunities/:id/apply', authenticate, requireRole('student'), validate({ body: z.object({ resume: oid, coverNote: z.string().max(1500).optional() }) }), asyncH(async (req, res) => {
  if (!isOid(req.params.id)) throw notFound();
  const u = req.user!;
  const o: any = await Opportunity.findById(req.params.id).lean();
  if (!o || o.status !== 'open') throw notFound('Opportunity not found or not open');
  if (o.deadline < new Date()) throw badRequest('The application deadline has passed');
  const me: any = await User.findById(u.id).lean();
  const cgpa = (await transcript(u.id)).cgpa;
  const reasons = await eligibility(me, o, cgpa);
  if (reasons.length) throw forbidden(`You are not eligible: ${reasons.join('; ')}`);
  if (await Application.exists({ opportunity: o._id, student: u.id })) throw conflict('You have already applied to this opportunity');
  await claimFiles([req.body.resume], { owner: u.id, purposes: ['resume'] });
  const a: any = await Application.create({ opportunity: o._id, student: u.id, resume: req.body.resume, coverNote: req.body.coverNote, cgpaAtApply: cgpa ?? undefined, history: [{ status: 'applied', by: u.id, at: new Date() }] });
  await audit(req, 'application.create', 'application', a._id, { opportunity: String(o._id) });
  await notify([o.createdBy], { type: 'placement', title: `New application: ${o.title}`, message: me.name, link: '/placements' });
  ok(res, a, undefined, 201);
}));

const APP_POP = [{ path: 'opportunity', select: 'title kind company deadline', populate: { path: 'company', select: 'name' } }, { path: 'student', select: 'name email idNumber semester section department', populate: { path: 'department', select: 'name code' } }, { path: 'resume', select: 'originalName' }];
router.get('/applications', authenticate, requireRole('student', ...PW), validate({ query: pageQuery.passthrough() }), asyncH(async (req, res) => {
  const { page, limit, q, status, opportunity } = req.query as any;
  const u = req.user!;
  const f: any = {};
  if (u.role === 'student') f.student = u.id;
  if (status) f.status = String(status);
  if (opportunity && isOid(opportunity)) f.opportunity = opportunity;
  if (q && u.role !== 'student') { const ids = await User.find({ role: 'student', $or: [{ name: new RegExp(escapeRegex(q), 'i') }, { idNumber: new RegExp(escapeRegex(q), 'i') }] }).distinct('_id'); f.student = { $in: ids }; }
  const [items, total] = await Promise.all([
    Application.find(f).populate(APP_POP).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Application.countDocuments(f),
  ]);
  ok(res, items, pageMeta(page, limit, total));
}));

const NEXT: Record<string, string[]> = { applied: ['shortlisted', 'rejected'], shortlisted: ['interview', 'selected', 'rejected'], interview: ['selected', 'rejected'], selected: [], rejected: [], withdrawn: [] };
async function transition(a: any, to: string, by: string, note?: string) {
  if (!NEXT[a.status]?.includes(to) && !(to === 'withdrawn' && ['applied', 'shortlisted', 'interview'].includes(a.status))) throw conflict(`Cannot move an application from "${a.status}" to "${to}"`);
  a.status = to; a.history.push({ status: to, by, at: new Date(), note });
  await a.save();
}
router.patch('/applications/:id/status', ...officers, validate({ body: z.object({ status: z.enum(['shortlisted', 'interview', 'selected', 'rejected']), note: z.string().max(300).optional() }) }), asyncH(async (req, res) => {
  if (!isOid(req.params.id)) throw notFound();
  const a: any = await Application.findById(req.params.id).populate('opportunity', 'title');
  if (!a) throw notFound();
  await transition(a, req.body.status, req.user!.id, req.body.note);
  await audit(req, 'placement.status_change', 'application', a._id, { to: req.body.status });
  await notify([a.student], { type: 'placement', title: `Application ${req.body.status}: ${a.opportunity?.title}`, message: req.body.note, link: '/placements' });
  ok(res, a);
}));
router.post('/applications/:id/withdraw', authenticate, requireRole('student'), asyncH(async (req, res) => {
  if (!isOid(req.params.id)) throw notFound();
  const a: any = await Application.findOne({ _id: req.params.id, student: req.user!.id });
  if (!a) throw notFound();
  await transition(a, 'withdrawn', req.user!.id);
  await audit(req, 'application.withdraw', 'application', a._id);
  ok(res, a);
}));
router.get('/applications/:id/resume', ...officers, asyncH(async (req, res) => {
  if (!isOid(req.params.id)) throw notFound();
  const a: any = await Application.findById(req.params.id).lean();
  if (!a) throw notFound();
  ok(res, { fileId: String(a.resume) }); // actual bytes are served by the permission-checked /files/:id/download
}));

// ---- Interviews ----
router.get('/interviews', authenticate, requireRole('student', ...PW), asyncH(async (req, res) => {
  const f: any = {};
  if (req.user!.role === 'student') f.application = { $in: await Application.find({ student: req.user!.id }).distinct('_id') };
  const items = await Interview.find(f).populate({ path: 'application', select: 'status student opportunity', populate: [{ path: 'opportunity', select: 'title company', populate: { path: 'company', select: 'name' } }, { path: 'student', select: 'name idNumber' }] }).sort({ scheduledAt: 1 }).limit(200).lean();
  ok(res, items);
}));
router.post('/interviews', ...officers, validate({ body: z.object({ application: oid, scheduledAt: z.coerce.date(), mode: z.enum(['online', 'onsite']).default('online'), locationOrLink: z.string().max(300).optional(), notes: z.string().max(1000).optional() }) }), asyncH(async (req, res) => {
  const a: any = await Application.findById(req.body.application).populate('opportunity', 'title');
  if (!a) throw badRequest('Application does not exist');
  if (req.body.scheduledAt < new Date()) throw badRequest('Interview must be scheduled in the future');
  if (a.status === 'shortlisted') await transition(a, 'interview', req.user!.id, 'Interview scheduled');
  else if (a.status !== 'interview') throw conflict('Only shortlisted candidates can be scheduled for interviews');
  const iv = await Interview.create({ ...req.body, createdBy: req.user!.id });
  await audit(req, 'interview.create', 'interview', iv._id, { application: String(a._id) });
  await notify([a.student], { type: 'placement', title: `Interview scheduled: ${a.opportunity?.title}`, message: req.body.scheduledAt.toISOString(), link: '/placements' });
  ok(res, iv, undefined, 201);
}));
router.patch('/interviews/:id', ...officers, validate({ body: z.object({ scheduledAt: z.coerce.date().optional(), mode: z.enum(['online', 'onsite']).optional(), locationOrLink: z.string().max(300).optional(), notes: z.string().max(1000).optional(), status: z.enum(['scheduled', 'completed', 'cancelled']).optional() }) }), asyncH(async (req, res) => {
  if (!isOid(req.params.id)) throw notFound();
  const iv: any = await Interview.findById(req.params.id);
  if (!iv) throw notFound();
  iv.set(req.body); await iv.save();
  await audit(req, 'interview.update', 'interview', iv._id, req.body);
  const a: any = await Application.findById(iv.application).lean();
  if (a && (req.body.scheduledAt || req.body.status === 'cancelled')) await notify([a.student], { type: 'placement', title: req.body.status === 'cancelled' ? 'Interview cancelled' : 'Interview rescheduled', link: '/placements' });
  ok(res, iv);
}));

// ---- Offers ----
router.get('/offers', authenticate, requireRole('student', ...PW), asyncH(async (req, res) => {
  const f: any = {};
  if (req.user!.role === 'student') f.application = { $in: await Application.find({ student: req.user!.id }).distinct('_id') };
  ok(res, await Offer.find(f).populate({ path: 'application', select: 'student opportunity', populate: [{ path: 'opportunity', select: 'title company', populate: { path: 'company', select: 'name' } }, { path: 'student', select: 'name idNumber department', populate: { path: 'department', select: 'name code' } }] }).sort({ createdAt: -1 }).limit(300).lean());
}));
router.post('/offers', ...officers, validate({ body: z.object({ application: oid, roleTitle: z.string().trim().min(2).max(160), packageLpa: z.coerce.number().min(0).max(1000).optional(), stipendPerMonth: z.coerce.number().min(0).optional(), joiningDate: z.coerce.date().optional() }) }), asyncH(async (req, res) => {
  const a: any = await Application.findById(req.body.application).populate('opportunity', 'title');
  if (!a) throw badRequest('Application does not exist');
  if (['shortlisted', 'interview'].includes(a.status)) await transition(a, 'selected', req.user!.id, 'Offer issued');
  else if (a.status !== 'selected') throw conflict('Offers can only be issued to shortlisted, interviewed or selected candidates');
  const offer = await Offer.create({ ...req.body, createdBy: req.user!.id }); // unique index: one offer per application
  await audit(req, 'offer.create', 'offer', offer._id, { application: String(a._id), packageLpa: req.body.packageLpa });
  await notify([a.student], { type: 'placement', title: `Offer received: ${a.opportunity?.title}`, message: req.body.roleTitle, link: '/placements' });
  ok(res, offer, undefined, 201);
}));
router.patch('/offers/:id/respond', authenticate, requireRole('student'), validate({ body: z.object({ status: z.enum(['accepted', 'declined']) }) }), asyncH(async (req, res) => {
  if (!isOid(req.params.id)) throw notFound();
  const offer: any = await Offer.findById(req.params.id);
  const a: any = offer && (await Application.findOne({ _id: offer.application, student: req.user!.id }));
  if (!offer || !a) throw notFound();
  if (offer.status !== 'offered') throw conflict('You have already responded to this offer');
  offer.status = req.body.status; await offer.save();
  await audit(req, 'offer.respond', 'offer', offer._id, { status: offer.status });
  ok(res, offer);
}));
router.patch('/offers/:id', ...officers, validate({ body: z.object({ status: z.enum(['offered', 'accepted', 'declined']).optional(), packageLpa: z.coerce.number().min(0).optional(), joiningDate: z.coerce.date().optional(), roleTitle: z.string().max(160).optional() }) }), asyncH(async (req, res) => {
  if (!isOid(req.params.id)) throw notFound();
  const offer: any = await Offer.findById(req.params.id);
  if (!offer) throw notFound();
  offer.set(req.body); await offer.save();
  await audit(req, 'offer.update', 'offer', offer._id, req.body);
  ok(res, offer);
}));
