import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../src/app';
import * as M from '../src/models';
import { getSettings } from '../src/services/settings';

export const PASSWORD = 'Passw0rd!test1';
let mongod: MongoMemoryServer;
let app: ReturnType<typeof createApp>;

export async function startDb() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  app = createApp();
}
export async function stopDb() {
  await mongoose.disconnect();
  await mongod.stop();
}
export async function resetDb() {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
}
export const raw = () => request(app);

let counter = 0;
export async function mkUser(role: string, extra: Record<string, unknown> = {}) {
  counter++;
  return M.User.create({ name: `${role} ${counter}`, email: `${role}${counter}@test.example`, role, status: 'active', passwordHash: await bcrypt.hash(PASSWORD, 4), ...extra });
}

/** Logged-in client: cookie persisted, CSRF header added automatically. */
export async function client(user: any) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').set('X-Requested-With', 'XMLHttpRequest').send({ email: user.email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login failed for ${user.email}: ${res.status} ${JSON.stringify(res.body)}`);
  const h = (r: request.Test) => r.set('X-Requested-With', 'XMLHttpRequest');
  return {
    get: (u: string) => agent.get(`/api/v1${u}`),
    post: (u: string, b?: any) => h(agent.post(`/api/v1${u}`)).send(b),
    put: (u: string, b?: any) => h(agent.put(`/api/v1${u}`)).send(b),
    patch: (u: string, b?: any) => h(agent.patch(`/api/v1${u}`)).send(b),
    del: (u: string) => h(agent.delete(`/api/v1${u}`)),
    upload: (purpose: string, name: string, data: Buffer, subject?: string) => {
      let r = h(agent.post('/api/v1/files')).field('purpose', purpose);
      if (subject) r = r.field('subject', subject);
      return r.attach('file', data, name);
    },
  };
}

export const PDF = Buffer.from('%PDF-1.4\n% test pdf\n%%EOF\n');

/** A small coherent world: 2 departments, 2 subjects, 2 faculty, 4 students, admin, placement officer. */
export async function world() {
  await getSettings();
  const year: any = await M.AcademicYear.create({ label: '2026-27', startDate: new Date('2026-07-01'), endDate: new Date('2027-06-30'), isCurrent: true });
  await M.AppSettings.updateOne({ key: 'app' }, { currentAcademicYear: year._id });
  const dept: any = await M.Department.create({ name: 'Computer Science', code: 'CSE' });
  const dept2: any = await M.Department.create({ name: 'Mechanical', code: 'ME' });
  const subject: any = await M.Subject.create({ code: 'CS501', name: 'Algorithms', credits: 4, department: dept._id, semester: 5 });
  const subject2: any = await M.Subject.create({ code: 'ME301', name: 'Thermodynamics', credits: 4, department: dept2._id, semester: 3 });
  const admin: any = await mkUser('admin');
  const placement: any = await mkUser('placement');
  const fac: any = await mkUser('faculty', { department: dept._id });
  const fac2: any = await mkUser('faculty', { department: dept2._id });
  const mkStudent = (extra: any = {}) => mkUser('student', { department: dept._id, semester: 5, section: 'A', ...extra });
  const s1: any = await mkStudent(); const s2: any = await mkStudent();
  const s3: any = await mkUser('student', { department: dept2._id, semester: 3, section: 'A' });
  const s4: any = await mkStudent({ semester: 3 });
  await M.FacultyAssignment.create({ subject: subject._id, faculty: fac._id, section: 'A', academicYear: year._id });
  await M.FacultyAssignment.create({ subject: subject2._id, faculty: fac2._id, section: 'A', academicYear: year._id });
  for (const s of [s1, s2]) await M.Enrollment.create({ student: s._id, subject: subject._id, academicYear: year._id });
  await M.Enrollment.create({ student: s3._id, subject: subject2._id, academicYear: year._id });
  return { year, dept, dept2, subject, subject2, admin, placement, fac, fac2, s1, s2, s3, s4 };
}
export const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86400000).toISOString();
