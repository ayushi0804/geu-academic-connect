import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PDF, client, iso, resetDb, startDb, stopDb, world } from './helpers';
import { Company, Opportunity } from '../src/models';

beforeAll(startDb); afterAll(stopDb); beforeEach(resetDb);

async function setup() {
  const w = await world();
  const company: any = await Company.create({ name: 'Acme Demo Co' });
  const mk = (extra: any) => Opportunity.create({ company: company._id, title: 'Role', kind: 'job', status: 'open', deadline: new Date(Date.now() + 5 * 86400000), createdBy: w.placement._id, ...extra });
  return { w, company, mk };
}
const resume = async (c: any) => (await c.upload('resume', 'cv.pdf', PDF)).body.data.id as string;

describe('placement applications', () => {
  it('enforces minimum CGPA on the server', async () => {
    const { w, mk } = await setup();
    const o: any = await mk({ minCgpa: 9 });
    const s1 = await client(w.s1);
    const res = await s1.post(`/opportunities/${o._id}/apply`, { resume: await resume(s1) });
    expect(res.status).toBe(403); expect(res.body.error.message).toMatch(/CGPA/);
  });
  it('enforces department and semester eligibility', async () => {
    const { w, mk } = await setup();
    const dep: any = await mk({ eligibleDepartments: [w.dept2._id] });
    const sem: any = await mk({ minSemester: 7 });
    const s1 = await client(w.s1);
    expect((await s1.post(`/opportunities/${dep._id}/apply`, { resume: await resume(s1) })).status).toBe(403);
    expect((await s1.post(`/opportunities/${sem._id}/apply`, { resume: await resume(s1) })).status).toBe(403);
    const list = await s1.get('/opportunities');
    expect(list.body.data.every((x: any) => x.eligible === false)).toBe(true);
  });
  it('accepts eligible applications and prevents duplicates', async () => {
    const { w, mk } = await setup();
    const o: any = await mk({});
    const s1 = await client(w.s1);
    const r = await resume(s1);
    expect((await s1.post(`/opportunities/${o._id}/apply`, { resume: r, coverNote: 'hi' })).status).toBe(201);
    const dup = await s1.post(`/opportunities/${o._id}/apply`, { resume: await resume(s1) });
    expect(dup.status).toBe(409);
  });
  it('rejects applications after the deadline or to non-open opportunities', async () => {
    const { w, mk } = await setup();
    const past: any = await mk({ deadline: new Date(Date.now() - 1000) });
    const draft: any = await mk({ status: 'draft' });
    const s1 = await client(w.s1);
    expect((await s1.post(`/opportunities/${past._id}/apply`, { resume: await resume(s1) })).status).toBe(400);
    expect((await s1.post(`/opportunities/${draft._id}/apply`, { resume: await resume(s1) })).status).toBe(404);
  });
  it('validates status transitions, restricts who can change them and records history', async () => {
    const { w, mk } = await setup();
    const o: any = await mk({});
    const s1 = await client(w.s1);
    const app = (await s1.post(`/opportunities/${o._id}/apply`, { resume: await resume(s1) })).body.data;
    expect((await s1.patch(`/applications/${app._id}/status`, { status: 'selected' })).status).toBe(403);
    const po = await client(w.placement);
    expect((await po.patch(`/applications/${app._id}/status`, { status: 'selected' })).status).toBe(409); // cannot skip stages
    const ok = await po.patch(`/applications/${app._id}/status`, { status: 'shortlisted', note: 'good profile' });
    expect(ok.status).toBe(200); expect(ok.body.data.history.map((h: any) => h.status)).toEqual(['applied', 'shortlisted']);
    expect((await po.post('/interviews', { application: app._id, scheduledAt: iso(2), mode: 'online' })).status).toBe(201);
    const offer = await po.post('/offers', { application: app._id, roleTitle: 'Engineer', packageLpa: 8 });
    expect(offer.status).toBe(201);
    expect((await po.post('/offers', { application: app._id, roleTitle: 'Engineer' })).status).toBe(409);
    expect((await s1.patch(`/offers/${offer.body.data._id}/respond`, { status: 'accepted' })).status).toBe(200);
    const notes = await s1.get('/notifications');
    expect(notes.body.data.filter((n: any) => n.type === 'placement').length).toBeGreaterThanOrEqual(3);
  });
  it('isolates applications and resumes between students', async () => {
    const { w, mk } = await setup();
    const o: any = await mk({});
    const s1 = await client(w.s1); const s2 = await client(w.s2);
    const r = await resume(s1);
    await s1.post(`/opportunities/${o._id}/apply`, { resume: r });
    expect((await s2.get('/applications')).body.data).toHaveLength(0);
    expect((await s1.get('/applications')).body.data).toHaveLength(1);
    expect((await s2.get(`/files/${r}/download`)).status).toBe(404);
    expect((await (await client(w.fac)).get(`/files/${r}/download`)).status).toBe(404);
    expect((await (await client(w.placement)).get(`/files/${r}/download`)).status).toBe(200);
  });
  it('reports placement analytics from real records', async () => {
    const { w, mk } = await setup();
    const o: any = await mk({});
    const s1 = await client(w.s1);
    await s1.post(`/opportunities/${o._id}/apply`, { resume: await resume(s1) });
    const a = await (await client(w.placement)).get('/analytics/placement');
    expect(a.status).toBe(200);
    expect(a.body.data.totalApplications).toBe(1);
    expect(a.body.data.funnel[0]).toEqual({ stage: 'Applied', count: 1 });
    expect((await s1.get('/analytics/placement')).status).toBe(403);
  });
});
