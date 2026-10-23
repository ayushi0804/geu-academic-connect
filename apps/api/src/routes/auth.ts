import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env, isProd, isTest } from '../config/env';
import { logger } from '../config/logger';
import { authenticate, clearSession, issueSession } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { PasswordResetToken, User } from '../models';
import { audit } from '../services/audit';
import { claimFiles } from '../services/files';
import { emailEnabled, sendMail } from '../services/mailer';
import { apiRouter, asyncH, oid, ok } from '../utils/http';
import { AppError, badRequest, forbidden, unauthorized } from '../utils/errors';

export const router = apiRouter('Auth');

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128)
  .regex(/[a-z]/, 'Include a lowercase letter')
  .regex(/[A-Z]/, 'Include an uppercase letter')
  .regex(/\d/, 'Include a number');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a few minutes and try again.' } },
});

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);
const MAX_FAILS = 5;
const LOCK_MIN = 15;

export async function createToken(userId: unknown, purpose: 'reset' | 'invite', hours: number) {
  await PasswordResetToken.deleteMany({ user: userId, purpose, usedAt: null });
  const raw = randomBytes(32).toString('hex');
  await PasswordResetToken.create({ user: userId, tokenHash: sha(raw), purpose, expiresAt: new Date(Date.now() + hours * 3600_000) });
  return raw;
}
export const tokenLink = (raw: string, type: 'reset' | 'invite') => `${env.CLIENT_ORIGIN}/set-password?type=${type}&token=${raw}`;

export async function publicUser(id: string) {
  const u: any = await User.findById(id).populate('department', 'name code').populate('program', 'name code').populate('academicYear', 'label').lean();
  if (!u) return null;
  const fields = u.role === 'student' ? [u.phone, u.photo, u.department, u.program, u.semester, u.section, u.idNumber] : [u.phone, u.photo, u.department, u.designation, u.idNumber];
  const filled = fields.filter((x) => x !== undefined && x !== null && x !== '').length;
  return { ...u, profileCompletion: Math.round((filled / fields.length) * 100) };
}

router.post('/auth/login', limiter, validate({ body: z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) }) }), asyncH(async (req, res) => {
  const email = req.body.email.toLowerCase();
  const u: any = await User.findOne({ email }).select('+passwordHash +tokenVersion +failedLogins +lockUntil');
  if (u?.lockUntil && u.lockUntil > new Date()) throw new AppError(429, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again in a few minutes.');
  const valid = await bcrypt.compare(req.body.password, u?.passwordHash ?? DUMMY_HASH);
  if (!u || !u.passwordHash || !valid) {
    if (u) {
      u.failedLogins = (u.failedLogins ?? 0) + 1;
      if (u.failedLogins >= MAX_FAILS) { u.lockUntil = new Date(Date.now() + LOCK_MIN * 60_000); u.failedLogins = 0; }
      await u.save();
    }
    await audit(req, 'auth.login_failed', 'user', u?._id, { email }, { id: u ? String(u._id) : '', email });
    throw unauthorized('Invalid email or password');
  }
  if (u.status === 'invited') throw forbidden('Your account is not activated yet. Please use the invitation link sent to you.');
  if (u.status !== 'active') throw forbidden('Your account has been deactivated. Contact an administrator.');
  u.failedLogins = 0; u.lockUntil = undefined; u.lastLoginAt = new Date();
  await u.save();
  issueSession(res, u, u.tokenVersion ?? 0);
  await audit(req, 'auth.login', 'user', u._id, undefined, { id: String(u._id), email: u.email });
  ok(res, { user: await publicUser(String(u._id)) });
}));

router.post('/auth/logout', asyncH(async (_req, res) => {
  clearSession(res);
  ok(res, { loggedOut: true });
}));

router.get('/auth/me', authenticate, asyncH(async (req, res) => ok(res, { user: await publicUser(req.user!.id) })));

router.patch('/auth/me', authenticate, validate({
  body: z.object({
    name: z.string().trim().min(2).max(120).optional(),
    phone: z.string().trim().max(20).optional(),
    photo: oid.optional(),
    notificationPrefs: z.object({ assignment: z.boolean(), notice: z.boolean(), marks: z.boolean(), attendance: z.boolean(), timetable: z.boolean(), placement: z.boolean(), email: z.boolean() }).partial().optional(),
  }),
}), asyncH(async (req, res) => {
  const { notificationPrefs, photo, ...rest } = req.body;
  const set: any = { ...rest };
  if (photo) { await claimFiles([photo], { owner: req.user!.id, purposes: ['avatar'] }); set.photo = photo; }
  if (notificationPrefs) for (const [k, v] of Object.entries(notificationPrefs)) set[`notificationPrefs.${k}`] = v;
  await User.updateOne({ _id: req.user!.id }, { $set: set });
  ok(res, { user: await publicUser(req.user!.id) });
}));

router.post('/auth/change-password', authenticate, limiter, validate({ body: z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }) }), asyncH(async (req, res) => {
  const u: any = await User.findById(req.user!.id).select('+passwordHash +tokenVersion');
  if (!(await bcrypt.compare(req.body.currentPassword, u.passwordHash))) throw badRequest('Current password is incorrect');
  u.passwordHash = await bcrypt.hash(req.body.newPassword, 12);
  u.tokenVersion = (u.tokenVersion ?? 0) + 1; // revokes every other session
  await u.save();
  issueSession(res, u, u.tokenVersion);
  await audit(req, 'auth.password_change', 'user', u._id);
  ok(res, { changed: true });
}));

router.post('/auth/forgot-password', limiter, validate({ body: z.object({ email: z.string().email() }) }), asyncH(async (req, res) => {
  const u: any = await User.findOne({ email: req.body.email.toLowerCase(), status: 'active' });
  const payload: any = { message: 'If that account exists, a reset link has been prepared.', emailConfigured: emailEnabled };
  if (u) {
    const raw = await createToken(u._id, 'reset', 1);
    const link = tokenLink(raw, 'reset');
    if (emailEnabled) await sendMail(u.email, 'Reset your GEU Academic Connect password', `Use this link within 1 hour: ${link}`);
    else if (!isProd) { logger.info({ link }, 'Password reset link (email not configured)'); payload.devResetLink = link; payload.devToken = raw; }
    await audit(req, 'auth.password_reset_requested', 'user', u._id, undefined, { id: String(u._id), email: u.email });
  }
  ok(res, payload); // identical response whether or not the account exists
}));

router.post('/auth/set-password', limiter, validate({ body: z.object({ token: z.string().length(64), password: passwordSchema }) }), asyncH(async (req, res) => {
  // Atomic single-use consumption: only one request can flip usedAt from null.
  const t: any = await PasswordResetToken.findOneAndUpdate({ tokenHash: sha(req.body.token), usedAt: null, expiresAt: { $gt: new Date() } }, { usedAt: new Date() });
  if (!t) throw badRequest('This link is invalid or has expired. Request a new one.');
  const u: any = await User.findById(t.user).select('+tokenVersion');
  if (!u || u.status === 'inactive') throw forbidden('This account cannot be activated');
  u.passwordHash = await bcrypt.hash(req.body.password, 12);
  u.status = 'active';
  u.tokenVersion = (u.tokenVersion ?? 0) + 1;
  u.failedLogins = 0; u.lockUntil = undefined;
  await u.save();
  await audit(req, t.purpose === 'invite' ? 'auth.account_activated' : 'auth.password_reset', 'user', u._id, undefined, { id: String(u._id), email: u.email });
  ok(res, { activated: true });
}));
