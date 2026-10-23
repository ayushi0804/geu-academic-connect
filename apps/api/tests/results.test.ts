import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { client, resetDb, startDb, stopDb, world } from './helpers';
import { calcGpa, gradeFor, weightedPercentage } from '../src/services/academics';
import { AuditLog } from '../src/models';

beforeAll(startDb); afterAll(stopDb); beforeEach(resetDb);

describe('grading maths (pure)', () => {
  const policy = [{ min: 80, grade: 'A+', points: 9 }, { min: 40, grade: 'C', points: 5 }, { min: 0, grade: 'F', points: 0 }];
  it('maps percentages to bands', () => {
    expect(gradeFor(85, policy).grade).toBe('A+'); expect(gradeFor(40, policy).grade).toBe('C'); expect(gradeFor(12, policy).grade).toBe('F');
  });
  it('computes credit-weighted GPA and weighted percentages', () => {
    expect(calcGpa([{ points: 9, credits: 4 }, { points: 6, credits: 2 }])).toBe(8);
    expect(calcGpa([])).toBeNull();
    expect(weightedPercentage([{ marks: 15, max: 20, weightage: 30 }, { marks: 8, max: 10, weightage: 10 }])).toBe(76.3);
  });
});

describe('marks & results API', () => {
  async function setup() {
    const w = await world(); const fac = await client(w.fac);
    const a = await fac.post('/assessments', { subject: w.subject._id, name: 'Internal 1', type: 'internal', maxMarks: 20, weightage: 30 });
    expect(a.status).toBe(201);
    return { w, fac, id: a.body.data._id as string };
  }
  it('validates marks and weightage', async () => {
    const { w, fac, id } = await setup();
    expect((await fac.put(`/assessments/${id}/marks`, { records: [{ student: w.s1._id, marks: 25 }] })).status).toBe(400);
    expect((await fac.put(`/assessments/${id}/marks`, { records: [{ student: w.s1._id, marks: -1 }] })).status).toBe(400);
    expect((await fac.put(`/assessments/${id}/marks`, { records: [{ student: w.s3._id, marks: 5 }] })).status).toBe(400); // not enrolled
    expect((await fac.post('/assessments', { subject: w.subject._id, name: 'Too much', type: 'exam', maxMarks: 100, weightage: 80 })).status).toBe(400);
  });
  it('blocks students and unassigned faculty from editing marks', async () => {
    const { w, id } = await setup();
    const body = { records: [{ student: w.s1._id, marks: 10 }] };
    expect((await (await client(w.s1)).put(`/assessments/${id}/marks`, body)).status).toBe(403);
    expect((await (await client(w.fac2)).put(`/assessments/${id}/marks`, body)).status).toBe(403);
    expect((await (await client(w.fac2)).post(`/assessments/${id}/publish`)).status).toBe(403);
  });
  it('hides draft results from students and shows them (with CGPA) once published', async () => {
    const { w, fac, id } = await setup();
    await fac.put(`/assessments/${id}/marks`, { records: [{ student: w.s1._id, marks: 15 }, { student: w.s2._id, marks: 10 }] });
    const s1 = await client(w.s1);
    let t = await s1.get('/results/transcript');
    expect(t.body.data.subjects[0].percentage).toBeNull(); expect(t.body.data.cgpa).toBeNull();
    expect((await fac.post(`/assessments/${id}/publish`)).status).toBe(200);
    t = await s1.get('/results/transcript');
    expect(t.body.data.subjects[0]).toMatchObject({ percentage: 75, grade: 'A', points: 8 });
    expect(t.body.data.cgpa).toBe(8);
    const notes = await s1.get('/notifications');
    expect(notes.body.data.some((n: any) => n.type === 'marks')).toBe(true);
    expect(await AuditLog.countDocuments({ action: 'results.publish' })).toBe(1);
    expect((await fac.post(`/assessments/${id}/publish`)).status).toBe(409);
  });
  it('requires marks before publishing and keeps an edit history', async () => {
    const { w, fac, id } = await setup();
    expect((await fac.post(`/assessments/${id}/publish`)).status).toBe(400);
    await fac.put(`/assessments/${id}/marks`, { records: [{ student: w.s1._id, marks: 10 }] });
    await fac.put(`/assessments/${id}/marks`, { records: [{ student: w.s1._id, marks: 12 }] });
    const { Result } = await import('../src/models');
    const r: any = await Result.findOne({ student: w.s1._id });
    expect(r.history).toHaveLength(1); expect(r.history[0]).toMatchObject({ from: 10, to: 12 });
    expect(await AuditLog.countDocuments({ action: 'marks.update' })).toBe(2);
  });
});
