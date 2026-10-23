import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { client, raw, resetDb, startDb, stopDb, world } from './helpers';
import { Subject, Timetable } from '../src/models';

beforeAll(startDb); afterAll(stopDb); beforeEach(resetDb);
const H = { 'X-Requested-With': 'XMLHttpRequest' };

describe('input validation & hardening', () => {
  it('reports health without secrets', async () => {
    const res = await raw().get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'ok', database: 'connected' });
    expect(JSON.stringify(res.body)).not.toMatch(/secret|mongodb:\/\//i);
  });
  it('rejects NoSQL operator injection and malformed JSON', async () => {
    const inj = await raw().post('/api/v1/auth/login').set(H).send({ email: { $ne: null }, password: { $ne: null } });
    expect(inj.status).toBe(400);
    const bad = await raw().post('/api/v1/auth/login').set(H).set('Content-Type', 'application/json').send('{"email":');
    expect(bad.status).toBe(400); expect(bad.body.error.code).toBe('BAD_JSON');
  });
  it('returns structured validation errors', async () => {
    const res = await raw().post('/api/v1/auth/login').set(H).send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });
  it('ignores mass-assigned fields such as role', async () => {
    const w = await world(); const c = await client(w.s1);
    const res = await c.patch('/auth/me', { name: 'Renamed Student', role: 'admin', status: 'active' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('student'); expect(res.body.data.user.name).toBe('Renamed Student');
  });
  it('handles invalid ids and unknown routes gracefully', async () => {
    const w = await world(); const c = await client(w.admin);
    expect((await c.get('/subjects/not-an-id')).status).toBe(404);
    expect((await c.get('/subjects?department=oops')).status).toBe(400);
    expect((await raw().get('/api/v1/nope')).status).toBe(404);
  });
  it('supports CRUD with duplicate and in-use protection', async () => {
    const w = await world(); const c = await client(w.admin);
    const dup = await c.post('/departments', { name: 'Another', code: 'cse' });
    expect(dup.status).toBe(409);
    expect((await c.del(`/departments/${w.dept._id}`)).status).toBe(409);
    expect((await c.del(`/subjects/${w.subject._id}`)).status).toBe(409);
    const s = await c.post('/subjects', { code: 'cs999', name: 'New', credits: 3, department: w.dept._id, semester: 5 });
    expect(s.status).toBe(201); expect(s.body.data.code).toBe('CS999');
    expect((await c.del(`/subjects/${s.body.data._id}`)).status).toBe(200);
    expect(await Subject.countDocuments({ code: 'CS999' })).toBe(0);
    const dupAlloc = await c.post('/faculty-assignments', { subject: w.subject._id, faculty: w.fac._id, section: 'A' });
    expect(dupAlloc.status).toBe(409);
  });
  it('detects timetable conflicts for room, faculty and section', async () => {
    const w = await world(); const c = await client(w.admin);
    const base = { subject: w.subject._id, faculty: w.fac._id, section: 'A', room: 'R1', dayOfWeek: 1, startTime: '09:00', endTime: '10:00' };
    expect((await c.post('/timetable', base)).status).toBe(201);
    const clash = await c.post('/timetable', { ...base, startTime: '09:30', endTime: '10:30' });
    expect(clash.status).toBe(409); expect(clash.body.error.details.map((d: any) => d.type).sort()).toEqual(['faculty', 'room', 'section']);
    expect((await c.post('/timetable', { ...base, startTime: '10:00', endTime: '11:00' })).status).toBe(201); // back-to-back is fine
    expect((await c.post('/timetable', { ...base, startTime: '12:00', endTime: '11:00' })).status).toBe(400);
    expect(await Timetable.countDocuments()).toBe(2);
    const mine = await (await client(w.s1)).get('/timetable');
    expect(mine.body.data).toHaveLength(2);
    expect((await (await client(w.s3)).get('/timetable')).body.data).toHaveLength(0);
  });
  it('searches only within what the user may see', async () => {
    const w = await world();
    const s1 = await (await client(w.s1)).get('/search?q=Algorithms');
    expect(s1.body.data.subjects).toHaveLength(1);
    const s3 = await (await client(w.s3)).get('/search?q=Algorithms');
    expect(s3.body.data.subjects).toHaveLength(0);
    expect((await (await client(w.s1)).get('/search?q=a')).status).toBe(400);
  });
});
