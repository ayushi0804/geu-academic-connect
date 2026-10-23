import { User } from '../models';
import type { AuthUser } from '../types';

/** Mongo filter selecting users that match a notice audience (empty list => no restriction). */
export function audienceUserFilter(a: any) {
  const q: any = { status: 'active' };
  if (a?.roles?.length) q.role = { $in: a.roles };
  if (a?.departments?.length) q.department = { $in: a.departments };
  const studentOnly: any[] = [];
  if (a?.semesters?.length) studentOnly.push({ semester: { $in: a.semesters } });
  if (a?.sections?.length) studentOnly.push({ section: { $in: a.sections } });
  if (studentOnly.length) q.$and = studentOnly.map((c) => c); // semester/section only exist on students
  return q;
}
export async function audienceUserIds(a: any): Promise<string[]> {
  return (await User.find(audienceUserFilter(a)).distinct('_id')).map(String);
}

/** Notices this user is allowed to see right now. */
export function visibleNoticeFilter(user: AuthUser, now = new Date()) {
  const or = (field: string, val: any, extra: any = {}) => ({
    $or: [{ [field]: { $exists: false } }, { [field]: { $size: 0 } }, { [field]: val, ...extra }],
  });
  const and: any[] = [
    { status: 'published', publishAt: { $lte: now } },
    { $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: now } }] },
    or('audience.roles', user.role),
  ];
  if (user.department) and.push(or('audience.departments', user.department as any));
  else and.push({ $or: [{ 'audience.departments': { $exists: false } }, { 'audience.departments': { $size: 0 } }] });
  if (user.role === 'student') {
    and.push(or('audience.semesters', user.semester ?? -1));
    and.push(or('audience.sections', user.section ?? '__none__'));
  }
  return { $and: and };
}
