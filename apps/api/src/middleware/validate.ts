import { NextFunction, Request, Response } from 'express';
import { ZodTypeAny } from 'zod';
import { badRequest } from '../utils/errors';

export const validate =
  (schemas: { body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny }) =>
  (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) (req as any).query = schemas.query.parse(req.query);
      if (schemas.body) req.body = schemas.body.parse(req.body ?? {}); // unknown keys are stripped (no mass assignment)
      next();
    } catch (e) {
      next(e);
    }
  };

/** Reject Mongo operator injection: keys beginning with "$" or containing ".". */
export function sanitize(req: Request, _res: Response, next: NextFunction) {
  const bad = (v: unknown, depth = 0): boolean => {
    if (depth > 8 || v === null || typeof v !== 'object') return false;
    return Object.entries(v as Record<string, unknown>).some(
      ([k, val]) => k.startsWith('$') || k.includes('.') || bad(val, depth + 1),
    );
  };
  if (bad(req.body) || bad(req.query) || bad(req.params)) {
    return next(badRequest('Request contains disallowed characters in field names'));
  }
  next();
}
