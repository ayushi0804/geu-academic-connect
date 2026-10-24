import multer from 'multer';
import { z } from 'zod';
import { env } from '../config/env';
import { authenticate } from '../middleware/auth';
import { UploadedFile } from '../models';
import { audit } from '../services/audit';
import { assertTeaches, canAccessSubject } from '../services/access';
import { deleteFile, saveUpload } from '../services/files';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors';
import { apiRouter, asyncH, isOid, oid, ok } from '../utils/http';
import type { AuthUser } from '../types';

export const router = apiRouter('Files');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.MAX_FILE_MB * 1024 * 1024, files: 1 } });

export async function canAccessFile(u: AuthUser, f: any): Promise<boolean> {
  if (u.role === 'admin' || String(f.owner) === u.id) return true;
  switch (f.purpose) {
    case 'avatar':
    case 'notice':
      return true;
    case 'assignment':
    case 'material':
      return f.subject ? canAccessSubject(u, String(f.subject)) : false;
    case 'submission': // only the teacher of that subject (plus the owner/admin handled above)
      return u.role === 'faculty' && !!f.subject && canAccessSubject(u, String(f.subject));
    case 'resume':
      return u.role === 'placement';
    default:
      return false;
  }
}

router.post('/files', authenticate, upload.single('file'), asyncH(async (req, res) => {
  const body = z.object({ purpose: z.enum(['avatar', 'assignment', 'submission', 'material', 'notice', 'resume']), subject: oid.optional() }).parse(req.body);
  if (!req.file) throw badRequest('No file received (field name must be "file")');
  const u = req.user!;
  const { purpose, subject } = body;
  if (['assignment', 'material', 'submission'].includes(purpose) && !subject) throw badRequest('subject is required for this upload');
  if (purpose === 'assignment' || purpose === 'material') { if (u.role !== 'faculty' && u.role !== 'admin') throw forbidden(); await assertTeaches(u, subject!); }
  if (purpose === 'submission') { if (u.role !== 'student' || !(await canAccessSubject(u, subject!))) throw forbidden('Only enrolled students can upload submissions'); }
  if (purpose === 'resume' && u.role !== 'student') throw forbidden('Only students upload resumes');
  if (purpose === 'notice' && u.role === 'student') throw forbidden();
  const f: any = await saveUpload(req.file, u.id, purpose, subject);
  ok(res, { id: String(f._id), originalName: f.originalName, size: f.size, mimeType: f.mimeType, purpose: f.purpose }, undefined, 201);
}));

router.get('/files/:id/download', authenticate, asyncH(async (req, res) => {
  if (!isOid(req.params.id)) throw notFound();
  const f: any = await UploadedFile.findById(req.params.id).lean();
  if (!f || !(await canAccessFile(req.user!, f))) throw notFound('File not found'); // 404 avoids confirming existence
  const { storage } = await import('../services/files.js');
  const inline = f.purpose === 'avatar';
  res.setHeader('Content-Type', f.mimeType);
  res.setHeader('Content-Length', String(f.size));
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.originalName)}`);
  res.setHeader('Cache-Control', 'private, max-age=0');
  const stream = storage.stream(f.storedName);
  stream.on('error', () => (res.headersSent ? res.end() : res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'File missing from storage' } })));
  stream.pipe(res);
}));

router.delete('/files/:id', authenticate, asyncH(async (req, res) => {
  if (!isOid(req.params.id)) throw notFound();
  const f: any = await UploadedFile.findById(req.params.id).lean();
  if (!f || (String(f.owner) !== req.user!.id && req.user!.role !== 'admin')) throw notFound();
  if (f.attached) throw conflict('This file is attached to a record. Remove it from that record instead.');
  await deleteFile(f._id);
  await audit(req, 'file.delete', 'file', f._id);
  ok(res, { id: String(f._id) });
}));
