import mongoose from 'mongoose';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AcademicYear, AppSettings, AuditLog } from '../models';
import { audit } from '../services/audit';
import { emailEnabled } from '../services/mailer';
import { getSettings } from '../services/settings';
import { badRequest } from '../utils/errors';
import { apiRouter, asyncH, escapeRegex, oid, ok, pageMeta, pageQuery } from '../utils/http';

export const router = apiRouter('System');

router.get('/health', asyncH(async (_req, res) => {
  const state = ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] ?? 'unknown';
  res.status(state === 'connected' ? 200 : 503).json({ success: state === 'connected', data: { status: state === 'connected' ? 'ok' : 'degraded', database: state, uptimeSeconds: Math.round(process.uptime()), emailConfigured: emailEnabled } });
}));

router.get('/settings', authenticate, asyncH(async (_req, res) => {
  const s: any = await getSettings();
  ok(res, { attendanceThreshold: s.attendanceThreshold, lateWeight: s.lateWeight, attendanceEditWindowDays: s.attendanceEditWindowDays, gradingPolicy: s.gradingPolicy, currentAcademicYear: s.currentAcademicYear, emailConfigured: emailEnabled });
}));
router.put('/settings', authenticate, requireRole('admin'), validate({
  body: z.object({
    attendanceThreshold: z.coerce.number().min(0).max(100), lateWeight: z.coerce.number().min(0).max(1), attendanceEditWindowDays: z.coerce.number().int().min(0).max(365),
    gradingPolicy: z.array(z.object({ min: z.coerce.number().min(0).max(100), grade: z.string().trim().min(1).max(4), points: z.coerce.number().min(0).max(10) })).min(2).max(15),
    currentAcademicYear: oid.optional(),
  }).partial(),
}), asyncH(async (req, res) => {
  const b = req.body;
  if (b.gradingPolicy && !b.gradingPolicy.some((g: any) => g.min === 0)) throw badRequest('Grading policy needs a band starting at 0');
  if (b.currentAcademicYear) {
    if (!(await AcademicYear.exists({ _id: b.currentAcademicYear }))) throw badRequest('Academic year does not exist');
    await AcademicYear.updateMany({}, { isCurrent: false });
    await AcademicYear.updateOne({ _id: b.currentAcademicYear }, { isCurrent: true });
  }
  await getSettings();
  const s = await AppSettings.findOneAndUpdate({ key: 'app' }, { $set: b }, { new: true }).lean();
  await audit(req, 'settings.update', 'settings', 'app', b);
  ok(res, s);
}));

router.get('/audit-logs', authenticate, requireRole('admin'), validate({ query: pageQuery.extend({ action: z.string().max(60).optional(), resourceType: z.string().max(40).optional(), actor: oid.optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() }) }), asyncH(async (req, res) => {
  const { page, limit, q, action, resourceType, actor, from, to } = req.query as any;
  const f: any = {};
  if (action) f.action = new RegExp(`^${escapeRegex(action)}`);
  if (resourceType) f.resourceType = resourceType;
  if (actor) f.actor = actor;
  if (from || to) f.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  if (q) f.$or = [{ actorEmail: new RegExp(escapeRegex(q), 'i') }, { action: new RegExp(escapeRegex(q), 'i') }];
  const [items, total] = await Promise.all([
    AuditLog.find(f).populate('actor', 'name role').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments(f),
  ]);
  ok(res, items, pageMeta(page, limit, total));
}));
