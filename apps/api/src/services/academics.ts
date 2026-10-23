import { Types } from 'mongoose';
import { Assessment, Attendance, Enrollment, Result } from '../models';
import { getSettings } from './settings';

export interface Counts { present: number; absent: number; late: number; leave: number }

/**
 * Attendance % = (present + late * lateWeight) / (present + absent + late) * 100.
 * Approved leave is excluded from the denominator. Returns null when there is nothing to count.
 */
export function calcAttendancePct(c: Counts, lateWeight: number): number | null {
  const denom = c.present + c.absent + c.late;
  if (denom === 0) return null;
  return Math.round(((c.present + c.late * lateWeight) / denom) * 1000) / 10;
}

export async function attendanceBySubject(studentId: string, opts: { from?: string; to?: string; subjects?: string[] } = {}) {
  const s: any = await getSettings();
  const match: any = { student: new Types.ObjectId(studentId) };
  if (opts.subjects) match.subject = { $in: opts.subjects.map((x) => new Types.ObjectId(x)) };
  if (opts.from || opts.to) match.date = { ...(opts.from ? { $gte: opts.from } : {}), ...(opts.to ? { $lte: opts.to } : {}) };
  const rows = await Attendance.aggregate([
    { $match: match },
    { $group: { _id: { subject: '$subject', status: '$status' }, n: { $sum: 1 } } },
  ]);
  const by = new Map<string, Counts>();
  for (const r of rows) {
    const k = String(r._id.subject);
    const c = by.get(k) ?? { present: 0, absent: 0, late: 0, leave: 0 };
    c[r._id.status as keyof Counts] = r.n;
    by.set(k, c);
  }
  return Array.from(by.entries()).map(([subject, c]) => {
    const percentage = calcAttendancePct(c, s.lateWeight);
    return { subject, ...c, total: c.present + c.absent + c.late + c.leave, percentage, belowThreshold: percentage !== null && percentage < s.attendanceThreshold };
  });
}

export function overallAttendance(rows: { present: number; absent: number; late: number; leave: number }[], lateWeight: number) {
  const t = rows.reduce((a, r) => ({ present: a.present + r.present, absent: a.absent + r.absent, late: a.late + r.late, leave: a.leave + r.leave }), { present: 0, absent: 0, late: 0, leave: 0 });
  return calcAttendancePct(t, lateWeight);
}

export interface GradeBand { min: number; grade: string; points: number }
export function gradeFor(pct: number, policy: GradeBand[]) {
  const sorted = [...policy].sort((a, b) => b.min - a.min);
  return sorted.find((b) => pct >= b.min) ?? sorted[sorted.length - 1];
}
/** GPA = Σ(points × credits) / Σ(credits) */
export function calcGpa(entries: { points: number; credits: number }[]): number | null {
  const credits = entries.reduce((a, e) => a + e.credits, 0);
  if (!credits) return null;
  return Math.round((entries.reduce((a, e) => a + e.points * e.credits, 0) / credits) * 100) / 100;
}

/** Weighted subject % over PUBLISHED assessments the student has a result for. */
export function weightedPercentage(items: { marks: number; max: number; weightage: number }[]): number | null {
  const w = items.reduce((a, i) => a + i.weightage, 0);
  if (!w) return null;
  const score = items.reduce((a, i) => a + (i.marks / i.max) * i.weightage, 0);
  return Math.round((score / w) * 1000) / 10;
}

export async function transcript(studentId: string, subjectFilter?: string[]) {
  const s: any = await getSettings();
  const enrQ: any = { student: studentId };
  if (subjectFilter) enrQ.subject = { $in: subjectFilter };
  const enrolls: any[] = await Enrollment.find(enrQ).populate('subject', 'code name credits semester').lean();
  const subjectIds = enrolls.map((e) => e.subject?._id).filter(Boolean);
  const assessments: any[] = await Assessment.find({ subject: { $in: subjectIds }, status: 'published' }).lean();
  const results: any[] = await Result.find({ student: studentId, assessment: { $in: assessments.map((a) => a._id) } }).lean();
  const resByAssessment = new Map(results.map((r) => [String(r.assessment), r]));

  const subjects = enrolls.filter((e) => e.subject).map((e) => {
    const items = assessments
      .filter((a) => String(a.subject) === String(e.subject._id) && String(a.academicYear) === String(e.academicYear) && resByAssessment.has(String(a._id)))
      .map((a) => ({ id: String(a._id), name: a.name, type: a.type, max: a.maxMarks, weightage: a.weightage, marks: resByAssessment.get(String(a._id)).marks, remarks: resByAssessment.get(String(a._id)).remarks }));
    const percentage = weightedPercentage(items);
    const band = percentage === null ? null : gradeFor(percentage, s.gradingPolicy);
    return { subject: e.subject, academicYear: e.academicYear, assessments: items, percentage, grade: band?.grade ?? null, points: band?.points ?? null, credits: e.subject.credits, semester: e.subject.semester };
  });

  const graded = subjects.filter((x) => x.points !== null) as any[];
  const sems = Array.from(new Set(graded.map((g) => g.semester))).sort((a: number, b: number) => a - b);
  const semesters = sems.map((n) => {
    const rows = graded.filter((g) => g.semester === n);
    return { semester: n, sgpa: calcGpa(rows), credits: rows.reduce((a, r) => a + r.credits, 0) };
  });
  return { subjects, semesters, cgpa: calcGpa(graded) };
}
