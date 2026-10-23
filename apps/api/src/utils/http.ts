import { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';

export const asyncH =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export const ok = (res: Response, data: unknown, meta?: unknown, status = 200) =>
  res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });

export const oid = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
export const isOid = (v: unknown): v is string => typeof v === 'string' && /^[a-f\d]{24}$/i.test(v);
export const toId = (v: string) => new Types.ObjectId(v);
export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm');

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  sort: z.string().max(40).optional(),
});

export function pageMeta(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Parse "-createdAt" style sort against an allow-list. */
export function parseSort(sort: string | undefined, allowed: string[], fallback: Record<string, 1 | -1>) {
  if (!sort) return fallback;
  const dir = sort.startsWith('-') ? -1 : 1;
  const field = sort.replace(/^-/, '');
  return allowed.includes(field) ? ({ [field]: dir } as Record<string, 1 | -1>) : fallback;
}

// ---- route registry used to build the OpenAPI document ----
export interface RouteDoc {
  tag: string;
  method: string;
  path: string;
}
export const routeRegistry: RouteDoc[] = [];
export function apiRouter(tag: string): Router {
  const r = Router();
  for (const m of ['get', 'post', 'put', 'patch', 'delete'] as const) {
    const orig = (r as any)[m].bind(r);
    (r as any)[m] = (path: any, ...handlers: any[]) => {
      if (typeof path === 'string') routeRegistry.push({ tag, method: m, path });
      return orig(path, ...handlers);
    };
  }
  return r;
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]) {
  const cols = columns ?? Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const esc = (v: unknown) => {
    let s = v instanceof Date ? v.toISOString() : v == null ? '' : String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`; // neutralise spreadsheet formula injection
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

export function sendCsv(res: Response, filename: string, rows: Record<string, unknown>[], columns?: string[]) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"`);
  res.send(toCsv(rows, columns));
}
