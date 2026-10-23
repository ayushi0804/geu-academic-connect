import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { uploadRoot } from '../config/env';
import { UploadedFile } from '../models';
import { badRequest, forbidden } from '../utils/errors';

/** Storage abstraction: swap LocalStorage for an S3/GCS implementation without touching routes. */
export interface StorageProvider {
  save(name: string, data: Buffer): Promise<void>;
  stream(name: string): fs.ReadStream;
  remove(name: string): Promise<void>;
}
class LocalStorage implements StorageProvider {
  private resolve(name: string) {
    const p = path.join(uploadRoot, path.basename(name)); // basename blocks path traversal
    return p;
  }
  async save(name: string, data: Buffer) {
    await fsp.mkdir(uploadRoot, { recursive: true });
    await fsp.writeFile(this.resolve(name), data, { flag: 'wx' });
  }
  stream(name: string) {
    return fs.createReadStream(this.resolve(name));
  }
  async remove(name: string) {
    await fsp.rm(this.resolve(name), { force: true });
  }
}
export const storage: StorageProvider = new LocalStorage();

const DOCS = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt'];
const IMAGES = ['.png', '.jpg', '.jpeg'];
export const ALLOWED_EXT: Record<string, string[]> = {
  avatar: IMAGES,
  resume: ['.pdf', '.doc', '.docx'],
  submission: [...DOCS, ...IMAGES, '.zip'],
  assignment: [...DOCS, ...IMAGES, '.zip'],
  material: [...DOCS, ...IMAGES, '.zip'],
  notice: [...DOCS, ...IMAGES],
};
const MIME: Record<string, string> = {
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.txt': 'text/plain', '.zip': 'application/zip',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** Check that file contents match the claimed extension (magic bytes). */
export function sniffMatches(ext: string, b: Buffer): boolean {
  const starts = (...sig: number[]) => sig.every((x, i) => b[i] === x);
  switch (ext) {
    case '.pdf': return starts(0x25, 0x50, 0x44, 0x46);
    case '.png': return starts(0x89, 0x50, 0x4e, 0x47);
    case '.jpg': case '.jpeg': return starts(0xff, 0xd8, 0xff);
    case '.zip': case '.docx': case '.pptx': case '.xlsx': return starts(0x50, 0x4b);
    case '.doc': case '.ppt': case '.xls': return starts(0xd0, 0xcf, 0x11, 0xe0);
    case '.txt': return !b.subarray(0, 4096).includes(0);
    default: return false;
  }
}

export async function saveUpload(file: Express.Multer.File, owner: string, purpose: string, subject?: string) {
  const exts = ALLOWED_EXT[purpose];
  if (!exts) throw badRequest('Unknown upload purpose');
  const ext = path.extname(file.originalname).toLowerCase();
  if (!exts.includes(ext)) throw badRequest(`File type ${ext || '(none)'} is not allowed for ${purpose}. Allowed: ${exts.join(', ')}`);
  if (!sniffMatches(ext, file.buffer)) throw badRequest('File contents do not match its extension');
  const storedName = `${randomUUID()}${ext}`;
  await storage.save(storedName, file.buffer);
  return UploadedFile.create({
    originalName: path.basename(file.originalname).replace(/[^\w.\- ()]/g, '_').slice(0, 120),
    storedName,
    mimeType: MIME[ext],
    size: file.size,
    owner,
    purpose,
    subject,
  });
}

/** Validate that referenced file ids exist, are owned by `owner`, match purpose/subject; then mark attached. */
export async function claimFiles(ids: string[] | undefined, o: { owner: string; purposes: string[]; subject?: string; admin?: boolean }) {
  if (!ids?.length) return [];
  const files: any[] = await UploadedFile.find({ _id: { $in: ids } }).lean();
  if (files.length !== new Set(ids).size) throw badRequest('One or more attachments do not exist');
  for (const f of files) {
    if (!o.admin && String(f.owner) !== o.owner) throw forbidden('You can only attach files you uploaded');
    if (!o.purposes.includes(f.purpose)) throw badRequest('Attachment has the wrong type for this field');
    if (o.subject && String(f.subject) !== String(o.subject)) throw badRequest('Attachment belongs to a different subject');
  }
  await UploadedFile.updateMany({ _id: { $in: ids } }, { attached: true });
  return ids;
}

export async function deleteFile(id: unknown) {
  const f: any = await UploadedFile.findByIdAndDelete(id).lean();
  if (f) await storage.remove(f.storedName);
}
