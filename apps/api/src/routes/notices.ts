import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { Department, Notice, Notification } from '../models';
import { audit } from '../services/audit';
import { claimFiles } from '../services/files';
import { notify } from '../services/notify';
import { audienceUserIds, visibleNoticeFilter } from '../services/notices';
import { badRequest, forbidden, notFound } from '../utils/errors';
import { apiRouter, asyncH, escapeRegex, isOid, oid, ok, pageMeta, pageQuery } from '../utils/http';
import type { AuthUser } from '../types';

export const router = apiRouter('Notices & Notifications');
const author = [authenticate, requireRole('admin', 'faculty', 'placement')];

const audienceSchema = z.object({
  roles: z.array(z.enum(['student', 'faculty', 'admin', 'placement'])).default([]),
  departments: z.array(oid).default([]),
  semesters: z.array(z.coerce.number().int().min(1).max(12)).default([]),
  sections: z.array(z.string().max(10)).default([]),
}).default({});
const body = z.object({
  title: z.string().trim().min(3).max(200), body: z.string().trim().min(1).max(10000),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'), status: z.enum(['draft', 'published']).default('draft'),
  pinned: z.boolean().default(false), publishAt: z.coerce.date().optional(), expiresAt: z.coerce.date().nullable().optional(),
  audience: audienceSchema, attachments: z.array(oid).max(5).default([]),
});

/** Server-side audience restrictions per publisher role. */
async function assertAudienceAllowed(u: AuthUser, a: any) {
  if (a.departments?.length && (await Department.countDocuments({ _id: { $in: a.departments } })) !== a.departments.length) throw badRequest('Unknown department in audience');
  if (u.role === 'admin') return;
  if (u.role === 'faculty') {
    if (a.roles.length !== 1 || a.roles[0] !== 'student') throw forbidden('Faculty can only address students');
    if (!u.department || a.departments.length !== 1 || a.departments[0] !== u.department) throw forbidden('Faculty can only address students of their own department');
    return;
  }
  if (u.role === 'placement') {
    if (a.roles.length !== 1 || a.roles[0] !== 'student') throw forbidden('Placement officers can only address students');
    return;
  }
  throw forbidden();
}

router.get('/notices', authenticate, validate({ query: pageQuery.passthrough() }), asyncH(async (req, res) => {
  const { page, limit, q, priority, scope, archive } = req.query as any;
  const u = req.user!;
  const manage = scope === 'manage';
  if (manage && u.role === 'student') throw forbidden();
  const and: any[] = [];
  const now = new Date();
  if (manage) { if (u.role !== 'admin') and.push({ createdBy: u.id }); }
  else if (archive === 'true') { and.push(visibleNoticeFilter({ ...u }, now).$and[0], { expiresAt: { $lte: now } }); and.push(...visibleNoticeFilter(u, now).$and.slice(2)); }
  else and.push(visibleNoticeFilter(u, now));
  if (priority) and.push({ priority: String(priority) });
  if (q) { const r = new RegExp(escapeRegex(q), 'i'); and.push({ $or: [{ title: r }, { body: r }] }); }
  const f = and.length ? { $and: and } : {};
  const [items, total] = await Promise.all([
    Notice.find(f).populate('createdBy', 'name role').populate('attachments', 'originalName size').populate('audience.departments', 'name code').sort({ pinned: -1, publishAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Notice.countDocuments(f),
  ]);
  ok(res, items.map((n: any) => ({ ...n, read: (n.readBy ?? []).some((x: any) => String(x) === u.id), readBy: undefined, readCount: manage ? n.readBy?.length ?? 0 : undefined })), pageMeta(page, limit, total));
}));

router.post('/notices', ...author, validate({ body }), asyncH(async (req, res) => {
  await assertAudienceAllowed(req.user!, req.body.audience);
  await claimFiles(req.body.attachments, { owner: req.user!.id, purposes: ['notice'], admin: req.user!.role === 'admin' });
  const n: any = await Notice.create({ ...req.body, publishAt: req.body.publishAt ?? new Date(), createdBy: req.user!.id });
  await audit(req, n.status === 'published' ? 'notice.publish' : 'notice.create', 'notice', n._id, { title: n.title, audience: n.audience });
  await dispatch(n);
  ok(res, n, undefined, 201);
}));

async function dispatch(n: any) {
  if (n.status !== 'published' || n.notifiedAt || n.publishAt > new Date()) return;
  const ids = (await audienceUserIds(n.audience)).filter((i) => i !== String(n.createdBy));
  await notify(ids, { type: 'notice', title: `New notice: ${n.title}`, message: n.body.slice(0, 140), link: '/notices', dedupeKey: `notice:${n._id}` });
  await Notice.updateOne({ _id: n._id }, { notifiedAt: new Date() });
}

router.patch('/notices/:id', ...author, validate({ body: body.partial() }), asyncH(async (req, res) => {
  if (!isOid(req.params.id)) throw notFound();
  const n: any = await Notice.findById(req.params.id);
  if (!n) throw notFound();
  if (req.user!.role !== 'admin' && String(n.createdBy) !== req.user!.id) throw forbidden('You can only edit your own notices');
  const wasPublished = n.status === 'published';
  if (req.body.audience) await assertAudienceAllowed(req.user!, req.body.audience);
  if (req.body.attachments) await claimFiles(req.body.attachments, { owner: req.user!.id, purposes: ['notice'], admin: req.user!.role === 'admin' });
  n.set(req.body); await n.save();
  await audit(req, !wasPublished && n.status === 'published' ? 'notice.publish' : 'notice.update', 'notice', n._id, { title: n.title });
  await dispatch(n);
  ok(res, n);
}));
router.delete('/notices/:id', ...author, asyncH(async (req, res) => {
  if (!isOid(req.params.id)) throw notFound();
  const n: any = await Notice.findById(req.params.id);
  if (!n) throw notFound();
  if (req.user!.role !== 'admin' && String(n.createdBy) !== req.user!.id) throw forbidden();
  await n.deleteOne();
  await audit(req, 'notice.delete', 'notice', n._id);
  ok(res, { id: String(n._id) });
}));
router.post('/notices/:id/read', authenticate, asyncH(async (req, res) => {
  if (!isOid(req.params.id)) throw notFound();
  const r = await Notice.updateOne({ _id: req.params.id, ...visibleNoticeFilter(req.user!) }, { $addToSet: { readBy: req.user!.id } });
  if (!r.matchedCount) throw notFound();
  ok(res, { read: true });
}));

// ---------------- Notifications ----------------
router.get('/notifications', authenticate, validate({ query: pageQuery.extend({ unread: z.enum(['true', 'false']).optional() }) }), asyncH(async (req, res) => {
  const { page, limit, unread } = req.query as any;
  const f: any = { user: req.user!.id };
  if (unread === 'true') f.read = false;
  const [items, total, unreadCount] = await Promise.all([
    Notification.find(f).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Notification.countDocuments(f),
    Notification.countDocuments({ user: req.user!.id, read: false }),
  ]);
  ok(res, items, { ...pageMeta(page, limit, total), unread: unreadCount });
}));
router.get('/notifications/unread-count', authenticate, asyncH(async (req, res) => ok(res, { count: await Notification.countDocuments({ user: req.user!.id, read: false }) })));
router.post('/notifications/read-all', authenticate, asyncH(async (req, res) => {
  const r = await Notification.updateMany({ user: req.user!.id, read: false }, { read: true });
  ok(res, { updated: r.modifiedCount });
}));
router.post('/notifications/:id/read', authenticate, asyncH(async (req, res) => {
  if (!isOid(req.params.id)) throw notFound();
  const n = await Notification.findOneAndUpdate({ _id: req.params.id, user: req.user!.id }, { read: true }, { new: true }); // scoped to owner
  if (!n) throw notFound();
  ok(res, n);
}));
router.delete('/notifications/:id', authenticate, asyncH(async (req, res) => {
  if (!isOid(req.params.id)) throw notFound();
  const r = await Notification.deleteOne({ _id: req.params.id, user: req.user!.id });
  if (!r.deletedCount) throw notFound();
  ok(res, { id: req.params.id });
}));
