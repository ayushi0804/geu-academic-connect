import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { Assignment, LearningMaterial, Notice, Opportunity, Subject, User } from '../models';
import { enrolledSubjectIds, teachingSubjectIds } from '../services/access';
import { visibleNoticeFilter } from '../services/notices';
import { apiRouter, asyncH, escapeRegex, ok } from '../utils/http';
import { assignmentScope } from './learning';

export const router = apiRouter('Search');

/** Global search; every category re-applies the same visibility rules as its own list endpoint. */
router.get('/search', authenticate, validate({ query: z.object({ q: z.string().trim().min(2).max(80), types: z.string().optional() }) }), asyncH(async (req, res) => {
  const u = req.user!;
  const { q, types } = req.query as any;
  const want = new Set((types ? String(types).split(',') : ['notices', 'subjects', 'materials', 'assignments', 'faculty', 'opportunities']));
  const r = new RegExp(escapeRegex(q), 'i');
  const out: Record<string, any[]> = {};
  const tasks: Promise<void>[] = [];
  const add = (k: string, p: Promise<any[]>) => want.has(k) && tasks.push(p.then((v) => { out[k] = v; }));

  add('notices', Notice.find({ $and: [visibleNoticeFilter(u), { $or: [{ title: r }, { body: r }] }] }).select('title priority publishAt').sort({ publishAt: -1 }).limit(5).lean().then((x: any) => x.map((n: any) => ({ id: n._id, title: n.title, subtitle: n.priority, link: '/notices' }))));

  const subjectScope = u.role === 'student' ? await enrolledSubjectIds(u.id) : u.role === 'faculty' ? await teachingSubjectIds(u.id) : u.role === 'admin' ? null : [];
  const sq: any = { $or: [{ name: r }, { code: r }] };
  if (subjectScope) sq._id = { $in: subjectScope };
  add('subjects', Subject.find(sq).select('code name').limit(5).lean().then((x: any) => x.map((s: any) => ({ id: s._id, title: `${s.code} — ${s.name}`, link: '/materials' }))));

  if (u.role !== 'placement') {
    const mq: any = { title: r };
    if (subjectScope) mq.subject = { $in: subjectScope };
    add('materials', LearningMaterial.find(mq).populate('subject', 'code').limit(5).lean().then((x: any) => x.map((m: any) => ({ id: m._id, title: m.title, subtitle: m.subject?.code, link: '/materials' }))));
    add('assignments', Assignment.find({ ...(await assignmentScope(u)), title: r }).populate('subject', 'code').limit(5).lean().then((x: any) => x.map((a: any) => ({ id: a._id, title: a.title, subtitle: a.subject?.code, link: '/assignments' }))));
  }
  add('faculty', User.find({ role: 'faculty', status: 'active', $or: [{ name: r }, { designation: r }] }).select('name designation').limit(5).lean().then((x: any) => x.map((f: any) => ({ id: f._id, title: f.name, subtitle: f.designation, link: '/directory' }))));
  if (u.role !== 'faculty') {
    const oq: any = { $or: [{ title: r }, { skills: r }] };
    if (u.role === 'student') oq.status = 'open';
    add('opportunities', Opportunity.find(oq).populate('company', 'name').limit(5).lean().then((x: any) => x.map((o: any) => ({ id: o._id, title: o.title, subtitle: o.company?.name, link: '/placements' }))));
  }
  await Promise.all(tasks);
  ok(res, out);
}));
