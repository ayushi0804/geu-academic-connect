import { CookieOptions, NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { cookieSecure, env } from '../config/env';
import { User } from '../models';
import { AppError, forbidden, unauthorized } from '../utils/errors';
import { asyncH } from '../utils/http';
import type { Role } from '../types';

export const COOKIE_NAME = 'gac_token';

const cookieOpts = (): CookieOptions => ({
  httpOnly: true,
  secure: cookieSecure,
  sameSite: 'lax',
  path: '/',
});

export function issueSession(res: Response, user: any, tokenVersion: number) {
  const token = jwt.sign({ sub: String(user._id), tv: tokenVersion }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as any,
  });
  const decoded = jwt.decode(token) as { exp: number };
  res.cookie(COOKIE_NAME, token, { ...cookieOpts(), maxAge: decoded.exp * 1000 - Date.now() });
}
export const clearSession = (res: Response) => res.clearCookie(COOKIE_NAME, cookieOpts());

export const authenticate = asyncH(async (req, _res, next) => {
  let token: string | undefined = req.cookies?.[COOKIE_NAME];
  const h = req.headers.authorization;
  if (!token && h?.startsWith('Bearer ')) token = h.slice(7);
  if (!token) throw unauthorized();
  let payload: any;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw unauthorized('Session expired. Please sign in again.');
  }
  const user: any = await User.findById(payload.sub).select('+tokenVersion').lean();
  if (!user || user.status !== 'active' || (user.tokenVersion ?? 0) !== payload.tv) {
    throw unauthorized('Session is no longer valid. Please sign in again.');
  }
  req.user = {
    id: String(user._id),
    role: user.role,
    email: user.email,
    name: user.name,
    department: user.department ? String(user.department) : undefined,
    semester: user.semester,
    section: user.section,
  };
  next();
});

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };

/**
 * CSRF mitigation for cookie auth: state-changing requests must carry a custom header.
 * Browsers cannot add it cross-origin without a CORS preflight, which our CORS policy rejects.
 */
export function csrfGuard(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.headers.authorization?.startsWith('Bearer ')) return next();
  if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
    return next(new AppError(403, 'CSRF_REJECTED', 'Missing required request header'));
  }
  next();
}
