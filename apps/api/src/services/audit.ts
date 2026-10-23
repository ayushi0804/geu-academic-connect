import { Request } from 'express';
import { AuditLog } from '../models';
import { logger } from '../config/logger';

const SENSITIVE = /pass|token|secret|hash|cookie/i;
function clean(v: any, depth = 0): any {
  if (v == null || depth > 3) return v == null ? v : '[truncated]';
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => clean(x, depth + 1));
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if (typeof v.toHexString === 'function') return String(v);
    return Object.fromEntries(Object.entries(v).filter(([k]) => !SENSITIVE.test(k)).map(([k, x]) => [k, clean(x, depth + 1)]));
  }
  return typeof v === 'string' && v.length > 300 ? v.slice(0, 300) + '…' : v;
}

export async function audit(
  req: Request | null,
  action: string,
  resourceType: string,
  resourceId?: unknown,
  metadata?: Record<string, unknown>,
  actor?: { id: string; email: string },
) {
  try {
    const a = actor ?? (req?.user ? { id: req.user.id, email: req.user.email } : undefined);
    await AuditLog.create({
      actor: a?.id,
      actorEmail: a?.email,
      action,
      resourceType,
      resourceId: resourceId ? String(resourceId) : undefined,
      metadata: metadata ? clean(metadata) : undefined,
      ip: req?.ip,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to write audit log');
  }
}
