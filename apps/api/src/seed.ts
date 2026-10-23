/* Seed script.  `npm run seed`      -> ensure settings + initial admin (from env), never overwrites an existing account.
 *               `npm run seed:demo` -> additionally create FICTIONAL demo data (idempotent: guarded by a marker). */
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import { env } from './config/env';
import * as M from './models';
import { storage } from './services/files';
import { transcript } from './services/academics';
import { getSettings } from './services/settings';
import { addDaysStr, todayStr } from './utils/dates';

const DEMO_DOMAIN = 'demo.geu-academic-connect.example';
const SEED_VERSION = 1;

function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(20260101);
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
const log = (m: string) => console.log(`  • ${m}`); // eslint-disable-line no-console

async function ensureAdmin() {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    if (await M.User.exists({ role: 'admin' })) return log('Admin already exists (ADMIN_EMAIL/ADMIN_PASSWORD not set; nothing to do)');
    throw new Error('No administrator exists. Set ADMIN_EMAIL and ADMIN_PASSWORD in .env and run `npm run seed` again.');
  }
  const existing = await M.User.findOne({ email: env.ADMIN_EMAIL.toLowerCase() });
  if (existing) return log(`Admin ${env.ADMIN_EMAIL} already exists — password left unchanged`);
  await M.User.create({ name: env.ADMIN_NAME, email: env.ADMIN_EMAIL, role: 'admin', status: 'active', passwordHash: await bcrypt.hash(env.ADMIN_PASSWORD, 12) });
  log(`Created initial administrator ${env.ADMIN_EMAIL}`);
}

async function upsert(model: any, key: Record<string, unknown>, data: Record<string, unknown>) {
  return model.findOneAndUpdate(key, { $setOnInsert: { ...key, ...data } }, { upsert: true, new: true });
}
async function demoFile(owner: any, purpose: string, subject: any, label: string, ext = '.txt') {
  const storedName = `${randomUUID()}${ext}`;
  const text = ext === '.pdf' ? `%PDF-1.4\n% ${label} (fictional demo document)\n%%EOF\n` : `${label}\n(Fictional demo content — GEU Academic Connect seed data)\n`;
  await storage.save(storedName, Buffer.from(text));
  return M.UploadedFile.create({ originalName: `${label.replace(/[^\w ]/g, '')}${ext}`, storedName, mimeType: ext === '.pdf' ? 'application/pdf' : 'text/plain', size: text.length, owner, purpose, subject, attached: true });
}

async function seedDemo() {
  if (!env.SEED_DEMO_PASSWORD) throw new Error('Set SEED_DEMO_PASSWORD in .env to create demo users.');
  const settings: any = await getSettings();
  const hash = await bcrypt.hash(env.SEED_DEMO_PASSWORD, 12);
  const now = new Date();
  const y = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const year: any = await upsert(M.AcademicYear, { label: `${y}-${String((y + 1) % 100).padStart(2, '0')}` }, { startDate: new Date(Date.UTC(y, 6, 1)), endDate: new Date(Date.UTC(y + 1, 5, 30)), isCurrent: true });
  await M.AppSettings.updateOne({ key: 'app' }, { currentAcademicYear: year._id });

  const depts: any = {};
  for (const [code, name] of [['CSE', 'Computer Science & Engineering'], ['ECE', 'Electronics & Communication Engineering'], ['ME', 'Mechanical Engineering']]) depts[code] = await upsert(M.Department, { code }, { name, description: 'Fictional demo department' });
  const programs: any = {};
  for (const [code, name, d] of [['BTCSE', 'B.Tech Computer Science', 'CSE'], ['BTECE', 'B.Tech Electronics & Communication', 'ECE'], ['BTME', 'B.Tech Mechanical', 'ME']]) programs[d] = await upsert(M.Program, { code }, { name, department: depts[d]._id, durationSemesters: 8 });
  const sem = (n: number) => upsert(M.Semester, { academicYear: year._id, number: n }, { name: `Semester ${n}`, startDate: year.startDate, endDate: year.endDate, isCurrent: true });
  await Promise.all([3, 5].map(sem));

  const subjDefs: [string, string, number, string, number, string][] = [
    ['CS501', 'Design & Analysis of Algorithms', 4, 'CSE', 5, 'theory'], ['CS502', 'Database Management Systems', 4, 'CSE', 5, 'theory'], ['CS503', 'Operating Systems', 4, 'CSE', 5, 'theory'],
    ['CS504', 'Computer Networks', 3, 'CSE', 5, 'theory'], ['CS505', 'Software Engineering Lab', 2, 'CSE', 5, 'lab'],
    ['EC301', 'Signals & Systems', 4, 'ECE', 3, 'theory'], ['EC302', 'Digital Electronics', 4, 'ECE', 3, 'theory'], ['EC303', 'Network Theory', 3, 'ECE', 3, 'theory'],
    ['ME301', 'Thermodynamics', 4, 'ME', 3, 'theory'], ['ME302', 'Strength of Materials', 4, 'ME', 3, 'theory'],
  ];
  const subjects: any[] = [];
  for (const [code, name, credits, d, semester, type] of subjDefs) subjects.push(await upsert(M.Subject, { code }, { name, credits, department: depts[d]._id, program: programs[d]._id, semester, type }));
  const subjOf = (dept: string) => subjects.filter((s) => String(s.department) === String(depts[dept]._id));
  log(`Academic structure ready (${subjects.length} subjects)`);

  const ensureUser = (email: string, data: any) => upsert(M.User, { email }, { ...data, passwordHash: hash, status: 'active' }); // never overwrites existing users
  const first = ['Aarav', 'Diya', 'Kabir', 'Meera', 'Rohan', 'Ananya', 'Vihaan', 'Ishita', 'Arjun', 'Saanvi', 'Reyansh', 'Kavya', 'Dev', 'Navya', 'Yash', 'Tara', 'Ayaan', 'Riya', 'Neel', 'Pooja', 'Samar', 'Myra', 'Karan', 'Zoya', 'Veer', 'Aditi'];
  const last = ['Rawat', 'Negi', 'Bisht', 'Joshi', 'Pant', 'Bhatt', 'Kandari', 'Rana', 'Chauhan', 'Semwal', 'Uniyal', 'Thakur', 'Dobhal', 'Nautiyal'];
  const facDefs = [['CSE', 'Professor'], ['CSE', 'Associate Professor'], ['CSE', 'Assistant Professor'], ['ECE', 'Professor'], ['ECE', 'Assistant Professor'], ['ME', 'Associate Professor']];
  const faculty: any[] = [];
  for (let i = 0; i < facDefs.length; i++) faculty.push(await ensureUser(`faculty${i + 1}@${DEMO_DOMAIN}`, { name: `Dr. ${first[i + 10]} ${last[i]}`, role: 'faculty', idNumber: `DEMO-F-${String(i + 1).padStart(3, '0')}`, department: depts[facDefs[i][0]]._id, designation: facDefs[i][1], phone: `+91-90000-0${1000 + i}` }));
  const officer: any = await ensureUser(`placement1@${DEMO_DOMAIN}`, { name: 'Neha Placement Officer', role: 'placement', idNumber: 'DEMO-P-001', designation: 'Training & Placement Officer' });

  const cohorts: [string, number, string, number][] = [['CSE', 5, 'A', 8], ['CSE', 5, 'B', 8], ['ECE', 3, 'A', 6], ['ME', 3, 'A', 4]];
  const students: any[] = []; let n = 0;
  for (const [d, semester, section, count] of cohorts) for (let i = 0; i < count; i++) {
    n++;
    students.push(await ensureUser(`student${String(n).padStart(2, '0')}@${DEMO_DOMAIN}`, { name: `${first[(n * 3) % first.length]} ${last[(n * 5) % last.length]}`, role: 'student', idNumber: `DEMO-S-${String(n).padStart(4, '0')}`, department: depts[d]._id, program: programs[d]._id, academicYear: year._id, semester, section, phone: `+91-98000-${10000 + n}` }));
  }
  log(`Users ready (${faculty.length} faculty, 1 placement officer, ${students.length} students) — demo domain @${DEMO_DOMAIN}`);

  if ((settings.seedVersion ?? 0) >= SEED_VERSION) return log('Demo activity data already seeded — skipping (delete the database to reseed from scratch)');

  // ---- allocations & enrollments
  const allocs: any[] = [];
  const secs = (d: string) => (d === 'CSE' ? ['A', 'B'] : ['A']);
  const facByDept = (d: string) => faculty.filter((_, i) => facDefs[i][0] === d);
  for (const d of ['CSE', 'ECE', 'ME']) subjOf(d).forEach((s, si) => secs(d).forEach((sec) => allocs.push({ subject: s, section: sec, faculty: facByDept(d)[si % facByDept(d).length] })));
  for (const a of allocs) await upsert(M.FacultyAssignment, { subject: a.subject._id, section: a.section, academicYear: year._id }, { faculty: a.faculty._id });
  const deptOf = (st: any) => Object.keys(depts).find((k) => String(depts[k]._id) === String(st.department))!;
  for (const st of students) for (const s of subjOf(deptOf(st))) await upsert(M.Enrollment, { student: st._id, subject: s._id, academicYear: year._id }, { status: 'active' });

  // ---- timetable (greedy, conflict-free)
  const slots = [['09:00', '10:00'], ['10:00', '11:00'], ['11:15', '12:15'], ['12:15', '13:15'], ['14:00', '15:00']];
  const busy = new Set<string>();
  const ttEntries: any[] = [];
  for (const a of allocs) {
    const dept = deptOf({ department: a.subject.department });
    let placed = 0;
    for (let day = 1; day <= 5 && placed < 2; day += placed === 0 ? 2 : 1) for (const [st, en] of slots) {
      const k = (t: string, v: string) => `${t}:${day}:${st}:${v}`;
      if (placed >= 2 || busy.has(k('f', a.faculty._id)) || busy.has(k('s', `${dept}${a.section}`))) continue;
      busy.add(k('f', a.faculty._id)); busy.add(k('s', `${dept}${a.section}`)); placed++;
      ttEntries.push({ subject: a.subject._id, faculty: a.faculty._id, section: a.section, room: `${dept}-${a.section}${100 + subjects.indexOf(a.subject)}`, dayOfWeek: day, startTime: st, endTime: en, semester: a.subject.semester, _dept: dept });
    }
  }
  await M.Timetable.insertMany(ttEntries.map(({ _dept, ...e }) => e));
  log(`Timetable: ${ttEntries.length} weekly classes`);

  // ---- attendance for the past 45 days
  const propensity = new Map(students.map((s, i) => [String(s._id), i % 7 === 0 ? 0.55 + rand() * 0.1 : 0.78 + rand() * 0.2]));
  const att: any[] = [];
  const today = todayStr();
  for (let back = 1; back <= 45; back++) {
    const date = addDaysStr(today, -back);
    const dow = ((new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7) + 1;
    for (const e of ttEntries.filter((x) => x.dayOfWeek === dow)) {
      for (const st of students.filter((s) => s.section === e.section && s.semester === e.semester && deptOf(s) === e._dept)) {
        const r = rand(); const p = propensity.get(String(st._id))!;
        const status = r < p ? 'present' : (() => { const q = rand(); return q < 0.65 ? 'absent' : q < 0.85 ? 'late' : 'leave'; })();
        att.push({ subject: e.subject, student: st._id, section: e.section, date, status, markedBy: e.faculty, history: [] });
      }
    }
  }
  const uniqueAttendance = new Map<string, any>();

for (const record of att) {
  const key = `${record.subject}:${record.student}:${record.date}`;

  if (!uniqueAttendance.has(key)) {
    uniqueAttendance.set(key, record);
  }
}

const attendanceRecords = [...uniqueAttendance.values()];

await M.Attendance.bulkWrite(
  attendanceRecords.map((record) => ({
    updateOne: {
      filter: {
        subject: record.subject,
        student: record.student,
        date: record.date,
      },
      update: {
        $setOnInsert: record,
      },
      upsert: true,
    },
  })),
  { ordered: false },
);

log(`Attendance: ${attendanceRecords.length} records checked`);

  // ---- assessments & results
  const ability = new Map(students.map((s) => [String(s._id), 0.45 + rand() * 0.5]));
  const facFor = (s: any) => allocs.find((a) => String(a.subject._id) === String(s._id)).faculty;
  let resultCount = 0;
  for (const s of subjects) {
    const specs: [string, string, number, number, boolean][] = [['Internal Test 1', 'internal', 30, 30, true], ['Quiz 1', 'quiz', 10, 10, true], ['End Semester Exam', 'exam', 100, 60, false]];
    for (const [name, type, max, weightage, published] of specs) {
      const a: any = await M.Assessment.create({ subject: s._id, academicYear: year._id, name, type, maxMarks: max, weightage, status: published ? 'published' : 'draft', publishedAt: published ? new Date() : undefined, createdBy: facFor(s)._id });
      if (!published) continue;
      const enrolled = students.filter((st) => String(st.department) === String(s.department) && st.semester === s.semester);
      await M.Result.insertMany(enrolled.map((st) => ({ assessment: a._id, subject: s._id, student: st._id, marks: Math.max(0, Math.min(max, Math.round(max * Math.min(1, Math.max(0.2, ability.get(String(st._id))! + (rand() - 0.5) * 0.2)) * 2) / 2)), enteredBy: facFor(s)._id, history: [] })));
      resultCount += enrolled.length;
    }
  }
  log(`Assessments & results: ${resultCount} published marks`);

  // ---- assignments, submissions, materials
  let subCount = 0;
  for (const s of subjects) {
    const f = facFor(s);
    const enrolled = students.filter((st) => String(st.department) === String(s.department) && st.semester === s.semester);
    const past: any = await M.Assignment.create({ subject: s._id, title: `${s.code} Assignment 1`, instructions: 'Solve all questions and upload a single PDF. (Fictional demo assignment)', dueDate: new Date(now.getTime() - 7 * 86400000), maxMarks: 20, status: 'published', allowLate: true, createdBy: f._id });
    const next: any = await M.Assignment.create({ subject: s._id, title: `${s.code} Assignment 2`, instructions: 'Detailed instructions will be discussed in class. (Fictional demo assignment)', dueDate: new Date(now.getTime() + (2 + Math.floor(rand() * 5)) * 86400000), maxMarks: 20, status: 'published', createdBy: f._id });
    for (const st of enrolled) {
      if (rand() < 0.85) {
        const late = rand() < 0.12;
        const file = await demoFile(st._id, 'submission', s._id, `${st.name} ${s.code} A1`);
        await M.Submission.create({ assignment: past._id, student: st._id, file: file._id, submittedAt: new Date(past.dueDate.getTime() + (late ? 86400000 : -3600000 * (1 + rand() * 40))), isLate: late, status: 'graded', marks: Math.round(20 * (0.5 + rand() * 0.5)), feedback: 'Good work. (demo feedback)', gradedBy: f._id, gradedAt: new Date() });
        subCount++;
      }
      if (rand() < 0.4) { const file = await demoFile(st._id, 'submission', s._id, `${st.name} ${s.code} A2`); await M.Submission.create({ assignment: next._id, student: st._id, file: file._id, submittedAt: new Date(), isLate: false }); subCount++; }
    }
    for (const [title, category] of [['Unit 1 Lecture Notes', 'notes'], ['Reference Reading List', 'reference']]) {
      const file = await demoFile(f._id, 'material', s._id, `${s.code} ${title}`);
      await M.LearningMaterial.create({ subject: s._id, title: `${s.code}: ${title}`, description: 'Fictional demo material', category, file: file._id, uploadedBy: f._id });
    }
  }
  log(`Assignments, ${subCount} submissions and learning materials`);

  // ---- events & notices
  const day = (n: number) => new Date(now.getTime() + n * 86400000);
  await M.AcademicEvent.insertMany([{ title: 'Mid-semester examinations begin', type: 'exam', startDate: day(25), endDate: day(32) }, { title: 'Campus holiday (demo)', type: 'holiday', startDate: day(10) }, { title: 'Annual tech showcase (demo)', type: 'event', startDate: day(18) }, { title: 'Last date: project proposal', type: 'deadline', startDate: day(6) }]);
  const admin: any = await M.User.findOne({ role: 'admin' });
  const notices: any[] = [
    { title: 'Welcome to GEU Academic Connect (demo)', body: 'This is a fictional demo notice for all users.', priority: 'normal', pinned: true, status: 'published', createdBy: admin._id, audience: {} },
    { title: 'Mid-semester examination guidelines', body: 'Please review the demo examination guidelines before the exam window.', priority: 'high', status: 'published', createdBy: admin._id, audience: { roles: ['student'], semesters: [3, 5] } },
    { title: 'Faculty meeting: curriculum review', body: 'Demo faculty meeting next week.', priority: 'normal', status: 'published', createdBy: admin._id, audience: { roles: ['faculty'] } },
    { title: 'Placement drive registrations open', body: 'Demo drive — check the Placements section to apply.', priority: 'urgent', status: 'published', createdBy: officer._id, audience: { roles: ['student'] } },
    { title: 'Lab safety reminder', body: 'Wear closed footwear in labs (demo).', priority: 'low', status: 'published', createdBy: faculty[0]._id, audience: { roles: ['student'], departments: [depts.CSE._id], semesters: [5] } },
    { title: 'Draft: next month schedule', body: 'This draft is not visible to students.', status: 'draft', createdBy: admin._id, audience: {} },
    { title: 'Expired: last month fee reminder (demo)', body: 'Archived notice example.', status: 'published', publishAt: day(-40), expiresAt: day(-5), createdBy: admin._id, audience: {} },
  ];
  await M.Notice.insertMany(notices.map((x) => ({ publishAt: now, notifiedAt: now, ...x })));

  // ---- placement
  const cos: any[] = [];
  for (const [name, industry, location] of [['Northwind Analytics (Demo)', 'Data & Analytics', 'Bengaluru'], ['Bluepeak Systems (Demo)', 'Cloud Software', 'Pune'], ['Lumen Robotics (Demo)', 'Robotics', 'Hyderabad'], ['Quillstone Labs (Demo)', 'Embedded Systems', 'Noida']]) {
    cos.push(await upsert(M.Company, { name }, { industry, location, website: 'https://example.com', description: 'Fictional company for demonstration.', recruiters: [{ name: 'Demo Recruiter', email: `recruiter@${DEMO_DOMAIN}`, phone: '+91-90000-00000' }] }));
  }
  const drive: any = await M.PlacementDrive.create({ title: 'Campus Drive (demo)', company: cos[0]._id, date: day(14), venue: 'Seminar Hall', status: 'upcoming' });
  const oppSpecs: any[] = [
    { c: 0, title: 'Software Engineer', kind: 'job', packageLpa: 9.5, minCgpa: 7, minSemester: 5, depts: ['CSE'], skills: ['Algorithms', 'SQL', 'Python'], mode: 'hybrid', drive: drive._id },
    { c: 1, title: 'Cloud Engineering Intern', kind: 'internship', stipendPerMonth: 25000, minCgpa: 6, minSemester: 5, depts: ['CSE'], skills: ['Linux', 'Networking'], mode: 'remote' },
    { c: 2, title: 'Robotics Software Intern', kind: 'internship', stipendPerMonth: 20000, minCgpa: 6.5, minSemester: 3, depts: ['CSE', 'ECE', 'ME'], skills: ['C++', 'Control Systems'], mode: 'onsite' },
    { c: 3, title: 'Embedded Systems Engineer', kind: 'job', packageLpa: 7.2, minCgpa: 6.5, minSemester: 3, depts: ['ECE'], skills: ['C', 'Microcontrollers'], mode: 'onsite' },
    { c: 1, title: 'Backend Developer', kind: 'job', packageLpa: 11, minCgpa: 8, minSemester: 5, depts: ['CSE'], skills: ['Node.js', 'MongoDB'], mode: 'hybrid' },
    { c: 0, title: 'Data Analyst Intern (closed)', kind: 'internship', stipendPerMonth: 15000, minCgpa: 0, minSemester: 3, depts: [], skills: ['Excel', 'SQL'], mode: 'remote', closed: true },
  ];
  const opps: any[] = [];
  for (const o of oppSpecs) opps.push(await M.Opportunity.create({ company: cos[o.c]._id, drive: o.drive, title: o.title, kind: o.kind, description: 'Fictional demo opportunity.', skills: o.skills, location: cos[o.c].location, workMode: o.mode, packageLpa: o.packageLpa, stipendPerMonth: o.stipendPerMonth, minCgpa: o.minCgpa, minSemester: o.minSemester, eligibleDepartments: o.depts.map((d: string) => depts[d]._id), deadline: o.closed ? day(-3) : day(12 + Math.floor(rand() * 10)), status: o.closed ? 'closed' : 'open', createdBy: officer._id }));
  const statuses = ['applied', 'applied', 'shortlisted', 'interview', 'selected', 'rejected'];
  let apps = 0;
  for (const st of students.filter((s) => deptOf(s) === 'CSE')) {
    const cgpa = (await transcript(String(st._id))).cgpa ?? 0;
    const elig = opps.filter((o) => o.status === 'open' && cgpa >= o.minCgpa && st.semester >= o.minSemester && (!o.eligibleDepartments.length || o.eligibleDepartments.some((d: any) => String(d) === String(st.department))));
    if (!elig.length || rand() < 0.35) continue;
    const o = pick(elig); const status = pick(statuses);
    const resume = await demoFile(st._id, 'resume', undefined, `${st.name} Resume`, '.pdf');
    const path = { applied: ['applied'], shortlisted: ['applied', 'shortlisted'], interview: ['applied', 'shortlisted', 'interview'], selected: ['applied', 'shortlisted', 'interview', 'selected'], rejected: ['applied', 'rejected'] }[status]!;
    const app: any = await M.Application.create({ opportunity: o._id, student: st._id, resume: resume._id, cgpaAtApply: cgpa, status, coverNote: 'Fictional demo cover note.', history: path.map((p, i) => ({ status: p, by: i ? officer._id : st._id, at: new Date(now.getTime() - (path.length - i) * 86400000) })) });
    apps++;
    if (status === 'interview') await M.Interview.create({ application: app._id, scheduledAt: day(3 + Math.floor(rand() * 6)), mode: 'online', locationOrLink: 'https://meet.example.com/demo', createdBy: officer._id });
    if (status === 'selected') await M.Offer.create({ application: app._id, roleTitle: o.title, packageLpa: o.packageLpa, stipendPerMonth: o.stipendPerMonth, joiningDate: day(120), status: pick(['offered', 'accepted']), createdBy: officer._id });
  }
  log(`Placement: ${cos.length} companies, ${opps.length} opportunities, ${apps} applications`);

  // ---- notifications & audit trail
  await M.Notification.insertMany(students.flatMap((st) => [
    { user: st._id, type: 'notice', title: 'New notice: Welcome to GEU Academic Connect (demo)', link: '/notices', read: rand() < 0.5 },
    { user: st._id, type: 'assignment', title: 'New assignment posted (demo)', link: '/assignments', read: false },
  ]));
  await M.AuditLog.create({ actor: admin._id, actorEmail: admin.email, action: 'seed.demo', resourceType: 'system', metadata: { note: 'Fictional demo data created by seed script' } });
  await M.AppSettings.updateOne({ key: 'app' }, { seedVersion: SEED_VERSION });
}

async function main() {
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  console.log('Seeding…'); // eslint-disable-line no-console
  await getSettings();
  await ensureAdmin();
  if (process.argv.includes('--demo')) await seedDemo();
  console.log('Done.'); // eslint-disable-line no-console
  await mongoose.disconnect();
}
main().catch(async (e) => { console.error(`\nSeed failed: ${e.message}\n`); await mongoose.disconnect().catch(() => undefined); process.exit(1); }); // eslint-disable-line no-console
