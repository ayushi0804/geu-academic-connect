import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { client, raw, resetDb, startDb, stopDb, world } from './helpers';
import { AuditLog, User } from '../src/models';

beforeAll(startDb); afterAll(stopDb); beforeEach(resetDb);

describe('role-based access control', () => {
  it('requires authentication on protected routes', async () => {
    for (const p of ['/users', '/notices', '/attendance/summary', '/audit-logs', '/settings']) expect((await raw().get(`/api/v1${p}`)).status).toBe(401);
  });
  it('blocks non-admins from administrative operations', async () => {
    const w = await world();
    for (const u of [w.s1, w.fac, w.placement]) {
      const c = await client(u);
      expect((await c.get('/users')).status).toBe(403);
      expect((await c.post('/departments', { name: 'Hack', code: 'HK' })).status).toBe(403);
      expect((await c.get('/audit-logs')).status).toBe(403);
      expect((await c.put('/settings', { attendanceThreshold: 10 })).status).toBe(403);
      expect((await c.post('/faculty-assignments', { subject: w.subject._id, faculty: w.fac._id, section: 'B' })).status).toBe(403);
    }
  });
  it('keeps private placement data away from students and faculty', async () => {
    const w = await world();
    expect((await (await client(w.s1)).get('/companies')).status).toBe(403);
    expect((await (await client(w.fac)).get('/applications')).status).toBe(403);
    expect((await (await client(w.placement)).get('/users')).status).toBe(403);
    expect((await (await client(w.placement)).get('/companies')).status).toBe(200);
  });
  it('isolates student data: one student cannot read another’s records', async () => {
    const w = await world();
    const c = await client(w.s1);
    expect((await c.get(`/attendance/summary?student=${w.s2._id}`)).status).toBe(403);
    expect((await c.get(`/results/transcript?student=${w.s2._id}`)).status).toBe(403);
    expect((await c.get(`/users/${w.s2._id}`)).status).toBe(403);
    expect((await c.get('/users/directory?role=student')).status).toBe(403);
  });
  it('lets faculty see only their own students', async () => {
    const w = await world();
    const c = await client(w.fac);
    expect((await c.get(`/users/${w.s1._id}`)).status).toBe(200);
    expect((await c.get(`/users/${w.s3._id}`)).status).toBe(403);
    const dir = await c.get('/users/directory?role=student');
    expect(dir.body.data.map((x: any) => String(x._id)).sort()).toEqual([String(w.s1._id), String(w.s2._id)].sort());
  });
  it('lets admins manage users, audits role changes and protects the last admin', async () => {
    const w = await world();
    const c = await client(w.admin);
    expect((await c.patch(`/users/${w.s1._id}`, { role: 'faculty', department: w.dept._id })).status).toBe(200);
    expect(await AuditLog.countDocuments({ action: 'user.role_change' })).toBe(1);
    expect((await c.patch(`/users/${w.admin._id}`, { status: 'inactive' })).status).toBe(400); // cannot deactivate self
    const other: any = await User.create({ name: 'Admin 2', email: 'a2@test.example', role: 'admin', status: 'active' });
    const c2 = await client(await User.findById(other._id)).catch(() => null);
    expect(c2).toBeNull(); // no password => cannot log in; admin protections still hold:
    expect((await c.patch(`/users/${other._id}`, { status: 'inactive' })).status).toBe(200);
    const res = await c.patch(`/users/${w.admin._id}`, { role: 'faculty' });
    expect([400, 409]).toContain(res.status);
  });
  it('revokes sessions of deactivated users', async () => {
    const w = await world();
    const stu = await client(w.s1);
    expect((await stu.get('/auth/me')).status).toBe(200);
    await (await client(w.admin)).patch(`/users/${w.s1._id}`, { status: 'inactive' });
    expect((await stu.get('/auth/me')).status).toBe(401);
  });
});
