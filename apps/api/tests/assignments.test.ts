import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PDF, client, iso, resetDb, startDb, stopDb, world } from './helpers';
import { Assignment, Submission } from '../src/models';

beforeAll(startDb); afterAll(stopDb); beforeEach(resetDb);

async function setup(overrides: Record<string, unknown> = {}) {
  const w = await world();
  const fac = await client(w.fac);
  const created = await fac.post('/assignments', { subject: w.subject._id, title: 'Assignment One', dueDate: iso(3), maxMarks: 10, status: 'published', ...overrides });
  expect(created.status).toBe(201);
  return { w, fac, id: created.body.data._id as string };
}
const submitFile = async (c: Awaited<ReturnType<typeof client>>, subject: string) => (await c.upload('submission', 'work.pdf', PDF, subject)).body.data.id as string;

describe('assignments & submissions', () => {
  it('lets enrolled students see and submit; others cannot see it', async () => {
    const { w, id } = await setup();
    const s1 = await client(w.s1);
    expect((await s1.get('/assignments')).body.data).toHaveLength(1);
    expect((await (await client(w.s3)).get('/assignments')).body.data).toHaveLength(0);
    expect((await (await client(w.s3)).get(`/assignments/${id}`)).status).toBe(404);
    const file = await submitFile(s1, String(w.subject._id));
    const res = await s1.post(`/assignments/${id}/submit`, { file, comment: 'done' });
    expect(res.status).toBe(201);
    expect(res.body.data.isLate).toBe(false);
  });
  it('notifies enrolled students when an assignment is published', async () => {
    const { w } = await setup();
    const n = await (await client(w.s1)).get('/notifications');
    expect(n.body.data.some((x: any) => x.type === 'assignment')).toBe(true);
    expect((await (await client(w.s3)).get('/notifications')).body.data).toHaveLength(0);
  });
  it('rejects late submissions unless allowed, and marks allowed ones as late', async () => {
    const { w, id } = await setup();
    await Assignment.updateOne({ _id: id }, { dueDate: new Date(Date.now() - 3600_000) });
    const s1 = await client(w.s1);
    const file = await submitFile(s1, String(w.subject._id));
    expect((await s1.post(`/assignments/${id}/submit`, { file })).status).toBe(403);
    await Assignment.updateOne({ _id: id }, { allowLate: true });
    const ok = await s1.post(`/assignments/${id}/submit`, { file });
    expect(ok.status).toBe(201); expect(ok.body.data.isLate).toBe(true);
  });
  it('enforces resubmission rules and blocks changes after grading', async () => {
    const { w, fac, id } = await setup({ allowResubmission: false });
    const s1 = await client(w.s1);
    const f1 = await submitFile(s1, String(w.subject._id));
    expect((await s1.post(`/assignments/${id}/submit`, { file: f1 })).status).toBe(201);
    const f2 = await submitFile(s1, String(w.subject._id));
    expect((await s1.post(`/assignments/${id}/submit`, { file: f2 })).status).toBe(409);
    await Assignment.updateOne({ _id: id }, { allowResubmission: true });
    expect((await s1.post(`/assignments/${id}/submit`, { file: f2 })).status).toBe(200);
    const sub: any = await Submission.findOne({ student: w.s1._id });
    expect(sub.attempts).toBe(2);
    expect((await fac.patch(`/assignments/${id}/submissions/${sub._id}/grade`, { marks: 11 })).status).toBe(400);
    expect((await fac.patch(`/assignments/${id}/submissions/${sub._id}/grade`, { marks: 8, feedback: 'ok' })).status).toBe(200);
    const f3 = await submitFile(s1, String(w.subject._id));
    expect((await s1.post(`/assignments/${id}/submit`, { file: f3 })).status).toBe(409);
  });
  it('stops other faculty from managing or grading someone else’s assignment', async () => {
    const { w, id } = await setup();
    const other = await client(w.fac2);
    expect((await other.patch(`/assignments/${id}`, { title: 'Hijack' })).status).toBe(403);
    expect((await other.get(`/assignments/${id}/submissions`)).status).toBe(403);
    expect((await (await client(w.s1)).post('/assignments', { subject: w.subject._id, title: 'Nope', dueDate: iso(2) })).status).toBe(403);
  });
});

describe('file access control', () => {
  it('only the owner, the subject teacher and admins can download a submission', async () => {
    const { w, id } = await setup();
    const s1 = await client(w.s1);
    const file = await submitFile(s1, String(w.subject._id));
    await s1.post(`/assignments/${id}/submit`, { file });
    const url = `/files/${file}/download`;
    expect((await s1.get(url)).status).toBe(200);
    expect((await (await client(w.fac)).get(url)).status).toBe(200);
    expect((await (await client(w.admin)).get(url)).status).toBe(200);
    expect((await (await client(w.s2)).get(url)).status).toBe(404);
    expect((await (await client(w.fac2)).get(url)).status).toBe(404);
    expect((await (await client(w.placement)).get(url)).status).toBe(404);
  });
  it('limits materials to enrolled students and assigned faculty', async () => {
    const { w, fac } = await setup();
    const up = await fac.upload('material', 'notes.pdf', PDF, String(w.subject._id));
    expect(up.status).toBe(201);
    const m = await fac.post('/materials', { subject: w.subject._id, title: 'Notes', file: up.body.data.id });
    expect(m.status).toBe(201);
    expect((await (await client(w.s1)).get(`/files/${up.body.data.id}/download`)).status).toBe(200);
    expect((await (await client(w.s3)).get(`/files/${up.body.data.id}/download`)).status).toBe(404);
    expect((await (await client(w.s1)).get('/materials')).body.data).toHaveLength(1);
    expect((await (await client(w.s3)).get('/materials')).body.data).toHaveLength(0);
  });
  it('validates file type, content and upload permissions', async () => {
    const { w, fac } = await setup();
    const s1 = await client(w.s1);
    expect((await s1.upload('submission', 'virus.exe', Buffer.from('MZ'), String(w.subject._id))).status).toBe(400);
    expect((await s1.upload('submission', 'fake.pdf', Buffer.from('not a pdf at all'), String(w.subject._id))).status).toBe(400);
    expect((await s1.upload('submission', 'a.pdf', PDF, String(w.subject2._id))).status).toBe(403); // not enrolled
    expect((await s1.upload('material', 'a.pdf', PDF, String(w.subject._id))).status).toBe(403);
    expect((await fac.upload('submission', 'a.pdf', PDF, String(w.subject._id))).status).toBe(403);
  });
  it('rejects attaching a file that belongs to someone else', async () => {
    const { w, id } = await setup();
    const file = await submitFile(await client(w.s2), String(w.subject._id));
    expect((await (await client(w.s1)).post(`/assignments/${id}/submit`, { file })).status).toBe(403);
  });
});
