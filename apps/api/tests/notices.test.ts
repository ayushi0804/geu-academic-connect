import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { client, iso, resetDb, startDb, stopDb, world } from './helpers';

beforeAll(startDb); afterAll(stopDb); beforeEach(resetDb);

describe('notice audiences', () => {
  it('limits what faculty and placement officers may target', async () => {
    const w = await world(); const fac = await client(w.fac);
    const mk = (audience: any) => ({ title: 'Hello class', body: 'Body', status: 'published', audience });
    expect((await fac.post('/notices', mk({ roles: ['faculty'] }))).status).toBe(403);
    expect((await fac.post('/notices', mk({ roles: ['student'] }))).status).toBe(403); // must name own department
    expect((await fac.post('/notices', mk({ roles: ['student'], departments: [String(w.dept2._id)] }))).status).toBe(403);
    expect((await fac.post('/notices', mk({ roles: ['student'], departments: [String(w.dept._id)] }))).status).toBe(201);
    expect((await (await client(w.s1)).post('/notices', mk({}))).status).toBe(403);
    expect((await (await client(w.placement)).post('/notices', mk({ roles: ['faculty'] }))).status).toBe(403);
    expect((await (await client(w.placement)).post('/notices', mk({ roles: ['student'] }))).status).toBe(201);
  });
  it('shows notices only to the targeted audience and keeps drafts private', async () => {
    const w = await world(); const admin = await client(w.admin);
    const pub = await admin.post('/notices', { title: 'Sem 5 CSE only', body: 'x', status: 'published', audience: { roles: ['student'], departments: [String(w.dept._id)], semesters: [5] } });
    await admin.post('/notices', { title: 'Draft', body: 'x', status: 'draft' });
    await admin.post('/notices', { title: 'Expired', body: 'x', status: 'published', publishAt: iso(-5), expiresAt: iso(-1) });
    const titles = async (u: any) => (await (await client(u)).get('/notices')).body.data.map((n: any) => n.title);
    expect(await titles(w.s1)).toEqual(['Sem 5 CSE only']);
    expect(await titles(w.s4)).toEqual([]); // semester 3
    expect(await titles(w.s3)).toEqual([]); // other department
    expect(await titles(w.fac)).toEqual([]); // role not targeted
    expect((await (await client(w.s1)).get('/notices?scope=manage')).status).toBe(403);
    const archived = await (await client(w.s3)).get('/notices?archive=true');
    expect(archived.status).toBe(200);
    expect((await (await client(w.s4)).post(`/notices/${pub.body.data._id}/read`)).status).toBe(404);
  });
  it('creates notifications only for the audience, tracks read state and pins first', async () => {
    const w = await world(); const admin = await client(w.admin);
    await admin.post('/notices', { title: 'Normal', body: 'x', status: 'published', audience: { roles: ['student'], semesters: [5] } });
    
    const pinned = await admin.post('/notices', { title: 'Pinned', body: 'x', status: 'published', pinned: true, audience: { roles: ['student'], semesters: [5] } });
    const s1 = await client(w.s1);
    expect((await s1.get('/notifications')).body.meta.unread).toBe(2);
    expect((await (await client(w.s4)).get('/notifications')).body.data).toHaveLength(0);
    const list = await s1.get('/notices');
    expect(list.body.data[0].title).toBe('Pinned'); expect(list.body.data[0].read).toBe(false);
    await s1.post(`/notices/${pinned.body.data._id}/read`);
    expect((await s1.get('/notices')).body.data[0].read).toBe(true);
  });
});

describe('notifications', () => {
  it('are private, markable as read, and countable', async () => {
    const w = await world(); const admin = await client(w.admin);
    await admin.post('/notices', { title: 'Notice N', body: 'x', status: 'published', audience: { roles: ['student'] } });
    const s1 = await client(w.s1); const s2 = await client(w.s2);
    const mine = (await s1.get('/notifications')).body.data;
    expect(mine).toHaveLength(1);
    expect((await s2.post(`/notifications/${mine[0]._id}/read`)).status).toBe(404);
    expect((await s2.del(`/notifications/${mine[0]._id}`)).status).toBe(404);
    expect((await s1.get('/notifications/unread-count')).body.data.count).toBe(1);
    expect((await s1.post(`/notifications/${mine[0]._id}/read`)).status).toBe(200);
    expect((await s1.get('/notifications/unread-count')).body.data.count).toBe(0);
    const n2 = await admin.post('/notices', { title: 'Notice N2', body: 'x', status: 'published', audience: { roles: ['student'] } });

    expect((await s1.post('/notifications/read-all')).body.data.updated).toBe(1);
  });
  it('respects per-type notification preferences', async () => {
    const w = await world();
    const s1 = await client(w.s1);
    expect((await s1.patch('/auth/me', { notificationPrefs: { notice: false } })).status).toBe(200);
    await (await client(w.admin)).post('/notices', { title: 'Muted', body: 'x', status: 'published', audience: { roles: ['student'] } });
    expect((await s1.get('/notifications')).body.data).toHaveLength(0);
  });
});
