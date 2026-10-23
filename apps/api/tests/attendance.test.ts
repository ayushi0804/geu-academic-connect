import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { client, resetDb, startDb, stopDb, world } from './helpers';
import { Attendance, AuditLog } from '../src/models';
import { calcAttendancePct } from '../src/services/academics';
import { addDaysStr, todayStr } from '../src/utils/dates';

beforeAll(startDb); afterAll(stopDb); beforeEach(resetDb);
const day = (n: number) => addDaysStr(todayStr(), -n);

describe('attendance calculation (pure)', () => {
  it('excludes approved leave and weights late arrivals', () => {
    expect(calcAttendancePct({ present: 2, absent: 1, late: 1, leave: 1 }, 0.5)).toBe(62.5);
    expect(calcAttendancePct({ present: 0, absent: 0, late: 0, leave: 3 }, 0.5)).toBeNull();
    expect(calcAttendancePct({ present: 10, absent: 0, late: 0, leave: 0 }, 0.5)).toBe(100);
  });
});

describe('attendance API', () => {
  it('lets the assigned faculty mark attendance and prevents duplicates', async () => {
    const w = await world(); const c = await client(w.fac);
    const body = (status: string) => ({ subject: w.subject._id, section: 'A', date: day(1), records: [{ student: w.s1._id, status }, { student: w.s2._id, status: 'present' }] });
    const a = await c.put('/attendance/sheet', body('present'));
    expect(a.status).toBe(200); expect(a.body.data.created).toBe(2);
    const b = await c.put('/attendance/sheet', body('absent'));
    expect(b.body.data).toMatchObject({ created: 0, updated: 1, unchanged: 1 });
    expect(await Attendance.countDocuments({ subject: w.subject._id, date: day(1) })).toBe(2);
    const rec: any = await Attendance.findOne({ student: w.s1._id });
    expect(rec.history).toHaveLength(1);
    expect(await AuditLog.countDocuments({ action: 'attendance.edit' })).toBe(1);
  });
  it('rejects faculty who are not assigned, students, future dates and unenrolled students', async () => {
    const w = await world();
    const rec = [{ student: w.s1._id, status: 'present' }];
    const base = { subject: w.subject._id, section: 'A', date: day(1), records: rec };
    expect((await (await client(w.fac2)).put('/attendance/sheet', base)).status).toBe(403);
    expect((await (await client(w.s1)).put('/attendance/sheet', base)).status).toBe(403);
    const c = await client(w.fac);
    expect((await c.put('/attendance/sheet', { ...base, date: addDaysStr(todayStr(), 3) })).status).toBe(400);
    expect((await c.put('/attendance/sheet', { ...base, records: [{ student: w.s3._id, status: 'present' }] })).status).toBe(400);
    expect((await c.put('/attendance/sheet', { ...base, records: [{ student: w.s1._id, status: 'bogus' }] })).status).toBe(400);
  });
  it('enforces the edit window for faculty but not admins', async () => {
    const w = await world();
    const body = { subject: w.subject._id, section: 'A', date: day(40), records: [{ student: w.s1._id, status: 'present' }] };
    expect((await (await client(w.fac)).put('/attendance/sheet', body)).status).toBe(403);
    expect((await (await client(w.admin)).put('/attendance/sheet', body)).status).toBe(200);
  });
  it('computes the student summary, flags low attendance and notifies the student', async () => {
    const w = await world(); const f = await client(w.fac);
    const statuses = ['present', 'present', 'absent', 'late', 'leave'];
    for (let i = 0; i < statuses.length; i++) await f.put('/attendance/sheet', { subject: w.subject._id, section: 'A', date: day(i + 1), records: [{ student: w.s1._id, status: statuses[i] }] });
    const s = await (await client(w.s1)).get('/attendance/summary');
    expect(s.status).toBe(200);
    const row = s.body.data.subjects[0];
    expect(row).toMatchObject({ present: 2, absent: 1, late: 1, leave: 1, percentage: 62.5, belowThreshold: true });
    expect(s.body.data.overall).toBe(62.5);
    const notifs = await (await client(w.s1)).get('/notifications?unread=true');
    expect(notifs.body.data.some((n: any) => n.type === 'attendance')).toBe(true);
  });
  it('exports a class report as CSV for the assigned faculty only', async () => {
    const w = await world();
    const ok = await (await client(w.fac)).get(`/attendance/report?subject=${w.subject._id}&section=A&format=csv`);
    expect(ok.status).toBe(200); expect(ok.headers['content-type']).toMatch(/text\/csv/);
    expect((await (await client(w.fac2)).get(`/attendance/report?subject=${w.subject._id}&section=A`)).status).toBe(403);
  });
});
