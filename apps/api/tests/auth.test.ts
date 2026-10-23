import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PASSWORD, client, mkUser, raw, resetDb, startDb, stopDb } from './helpers';
import { PasswordResetToken } from '../src/models';

beforeAll(startDb); afterAll(stopDb); beforeEach(resetDb);
const H = { 'X-Requested-With': 'XMLHttpRequest' };
const login = (email: string, password: string) => raw().post('/api/v1/auth/login').set(H).send({ email, password });

describe('authentication', () => {
  it('logs in with valid credentials, sets an HTTP-only cookie and never returns the hash', async () => {
    const u = await mkUser('student');
    const res = await login(u.email, PASSWORD);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(u.email);
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(String(res.headers['set-cookie'])).toMatch(/gac_token=.*HttpOnly/i);
  });
  it('rejects wrong password and unknown email with the same generic message', async () => {
    const u = await mkUser('student');
    const a = await login(u.email, 'wrong-password-1A');
    const b = await login('nobody@test.example', 'wrong-password-1A');
    expect(a.status).toBe(401); expect(b.status).toBe(401);
    expect(a.body.error.message).toBe(b.body.error.message);
  });
  it('blocks inactive and not-yet-activated accounts', async () => {
    const inactive = await mkUser('student', { status: 'inactive' });
    const invited = await mkUser('student', { status: 'invited', passwordHash: undefined });
    expect((await login(inactive.email, PASSWORD)).status).toBe(403);
    expect((await login(invited.email, PASSWORD)).status).toBe(401);
  });
  it('locks the account after repeated failures', async () => {
    const u = await mkUser('student');
    for (let i = 0; i < 5; i++) await login(u.email, 'bad-password-1A');
    expect((await login(u.email, PASSWORD)).status).toBe(429);
  });
  it('requires authentication for /auth/me and honours logout', async () => {
    expect((await raw().get('/api/v1/auth/me')).status).toBe(401);
    const c = await client(await mkUser('faculty'));
    expect((await c.get('/auth/me')).status).toBe(200);
    expect((await c.post('/auth/logout')).status).toBe(200);
    expect((await c.get('/auth/me')).status).toBe(401);
  });
  it('rejects state-changing requests without the CSRF header', async () => {
    const res = await raw().post('/api/v1/auth/login').send({ email: 'a@b.co', password: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_REJECTED');
  });
  it('supports expiring, single-use password reset tokens', async () => {
    const u = await mkUser('student');
    const f = await raw().post('/api/v1/auth/forgot-password').set(H).send({ email: u.email });
    const token = f.body.data.devToken;
    expect(token).toHaveLength(64);
    const weak = await raw().post('/api/v1/auth/set-password').set(H).send({ token, password: 'short' });
    expect(weak.status).toBe(400);
    const ok1 = await raw().post('/api/v1/auth/set-password').set(H).send({ token, password: 'Brand-New-Pass-9' });
    expect(ok1.status).toBe(200);
    const reuse = await raw().post('/api/v1/auth/set-password').set(H).send({ token, password: 'Another-Pass-9x' });
    expect(reuse.status).toBe(400);
    expect((await login(u.email, 'Brand-New-Pass-9')).status).toBe(200);
  });
  it('rejects expired reset tokens and does not reveal whether an email exists', async () => {
    const u = await mkUser('student');
    const f = await raw().post('/api/v1/auth/forgot-password').set(H).send({ email: u.email });
    await PasswordResetToken.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
    expect((await raw().post('/api/v1/auth/set-password').set(H).send({ token: f.body.data.devToken, password: 'Brand-New-Pass-9' })).status).toBe(400);
    const unknown = await raw().post('/api/v1/auth/forgot-password').set(H).send({ email: 'ghost@test.example' });
    expect(unknown.status).toBe(200);
    expect(unknown.body.data.devToken).toBeUndefined();
  });
  it('invalidates older sessions after a password change', async () => {
    const u = await mkUser('student');
    const a = await client(u); const b = await client(u);
    expect((await a.post('/auth/change-password', { currentPassword: PASSWORD, newPassword: 'Changed-Pass-77' })).status).toBe(200);
    expect((await a.get('/auth/me')).status).toBe(200); // reissued session
    expect((await b.get('/auth/me')).status).toBe(401); // revoked session
  });
  it('activates an invited account via invitation token', async () => {
    const admin = await client(await mkUser('admin'));
    const created = await admin.post('/users', { name: 'New Faculty', email: 'newfac@test.example', role: 'faculty', department: (await (await import('../src/models')).Department.create({ name: 'X', code: 'X1' }))._id });
    expect(created.status).toBe(201);
    const token = new URL(created.body.data.inviteLink).searchParams.get('token')!;
    expect((await raw().post('/api/v1/auth/set-password').set(H).send({ token, password: 'Welcome-Pass-12' })).status).toBe(200);
    expect((await login('newfac@test.example', 'Welcome-Pass-12')).status).toBe(200);
  });
});
