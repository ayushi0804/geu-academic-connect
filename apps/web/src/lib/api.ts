import { toast } from 'sonner';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: any[]) {
    super(message);
  }
}
const BASE = `${import.meta.env.VITE_API_URL}/api/v1`;
type Opts = { method?: string; body?: unknown; query?: Record<string, unknown>; form?: FormData };

const qs = (q?: Record<string, unknown>) => {
  const p = new URLSearchParams();
  Object.entries(q ?? {}).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && p.append(k, String(v)));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export async function api<T = any>(path: string, o: Opts = {}): Promise<{ data: T; meta?: any }> {
  const headers: Record<string, string> = { 'X-Requested-With': 'XMLHttpRequest' };
  if (o.body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(BASE + path + qs(o.query), { method: o.method ?? (o.body || o.form ? 'POST' : 'GET'), credentials: 'include', headers, body: o.form ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined) });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.');
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('gac:unauthorized'));
    throw new ApiError(res.status, json?.error?.code ?? 'ERROR', json?.error?.message ?? `Request failed (${res.status})`, json?.error?.details);
  }
  return { data: json.data as T, meta: json.meta };
}

export const errMsg = (e: unknown) => {
  if (e instanceof ApiError) return e.details?.length ? `${e.message}: ${e.details.map((d: any) => (d.path ? `${d.path} – ` : '') + (d.message ?? `${d.type} clash with ${d.with}`)).join('; ')}` : e.message;
  return e instanceof Error ? e.message : 'Something went wrong';
};
export const toastError = (e: unknown) => toast.error(errMsg(e));

/** Download a file/CSV through an authenticated request (cookies are sent). */
export async function download(path: string, fallbackName: string, query?: Record<string, unknown>) {
  const res = await fetch(BASE + path + qs(query), { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    throw new ApiError(res.status, j?.error?.code ?? 'ERROR', j?.error?.message ?? 'Download failed');
  }
  const cd = res.headers.get('Content-Disposition') ?? '';
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: m ? decodeURIComponent(m[1]) : fallbackName });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Upload with progress (XHR so we can report upload progress). */
export function uploadFile(file: File, purpose: string, subject?: string, onProgress?: (pct: number) => void): Promise<{ id: string; originalName: string; size: number }> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('purpose', purpose);
    if (subject) fd.append('subject', subject);
    fd.append('file', file);
    const x = new XMLHttpRequest();
    x.open('POST', `${BASE}/files`);
    x.withCredentials = true;
    x.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    x.onerror = () => reject(new ApiError(0, 'NETWORK', 'Upload failed. Check your connection.'));
    x.onload = () => {
      let j: any = null;
      try { j = JSON.parse(x.responseText); } catch { /* ignore */ }
      if (x.status >= 200 && x.status < 300 && j?.success) resolve(j.data);
      else reject(new ApiError(x.status, j?.error?.code ?? 'ERROR', j?.error?.message ?? 'Upload failed', j?.error?.details));
    };
    x.send(fd);
  });
}
