import { Enrollment, FacultyAssignment, User } from '../models';
import { forbidden } from '../utils/errors';
import type { AuthUser } from '../types';

export async function teachingSubjectIds(facultyId: string): Promise<string[]> {
  return (await FacultyAssignment.find({ faculty: facultyId }).distinct('subject')).map(String);
}
export async function teachingSections(facultyId: string, subjectId: string): Promise<string[]> {
  return (await FacultyAssignment.find({ faculty: facultyId, subject: subjectId }).distinct('section')).map(String);
}
export async function enrolledSubjectIds(studentId: string): Promise<string[]> {
  return (await Enrollment.find({ student: studentId, status: { $in: ['active', 'completed'] } }).distinct('subject')).map(String);
}

/** Admin: always. Faculty: must be assigned to the subject (and section, if given). */
export async function assertTeaches(user: AuthUser, subjectId: string, section?: string) {
  if (user.role === 'admin') return;
  if (user.role !== 'faculty') throw forbidden();
  const q: any = { faculty: user.id, subject: subjectId };
  if (section) q.section = section;
  if (!(await FacultyAssignment.exists(q))) throw forbidden('You are not assigned to this subject/section');
}

export async function canAccessSubject(user: AuthUser, subjectId: string): Promise<boolean> {
  if (user.role === 'admin') return true;
  if (user.role === 'faculty') return !!(await FacultyAssignment.exists({ faculty: user.id, subject: subjectId }));
  if (user.role === 'student') return !!(await Enrollment.exists({ student: user.id, subject: subjectId, status: { $in: ['active', 'completed'] } }));
  return false;
}

export async function studentsOfSubject(subjectId: string, section?: string) {
  const ids = await Enrollment.find({ subject: subjectId, status: 'active' }).distinct('student');
  const q: any = { _id: { $in: ids }, role: 'student', status: 'active' };
  if (section) q.section = section;
  return User.find(q).select('name email idNumber section semester department').sort({ idNumber: 1, name: 1 }).lean();
}

/** Can this user view a given student's academic data? */
export async function canViewStudent(user: AuthUser, studentId: string): Promise<boolean> {
  if (user.role === 'admin') return true;
  if (user.role === 'student') return user.id === studentId;
  if (user.role === 'faculty') {
    const subs = await teachingSubjectIds(user.id);
    return !!(await Enrollment.exists({ student: studentId, subject: { $in: subs } }));
  }
  return false;
}
