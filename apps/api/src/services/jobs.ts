import { Assignment, Enrollment, Notice, Notification, Submission, UploadedFile, User } from '../models';
import { notify } from './notify';
import { audienceUserIds } from './notices';
import { deleteFile } from './files';
import { logger } from '../config/logger';

export async function dispatchDueNotices() {
  const due: any[] = await Notice.find({ status: 'published', notifiedAt: { $exists: false }, publishAt: { $lte: new Date() } }).limit(50).lean();
  for (const n of due) {
    const ids = (await audienceUserIds(n.audience)).filter((id) => id !== String(n.createdBy));
    await notify(ids, { type: 'notice', title: `New notice: ${n.title}`, message: n.body.slice(0, 140), link: '/notices', dedupeKey: `notice:${n._id}` });
    await Notice.updateOne({ _id: n._id }, { notifiedAt: new Date() });
  }
  return due.length;
}

/** Remind enrolled students about published assignments due within 24h that they have not submitted. */
export async function sendDeadlineReminders() {
  const now = new Date();
  const soon = new Date(now.getTime() + 24 * 3600 * 1000);
  const list: any[] = await Assignment.find({ status: 'published', dueDate: { $gt: now, $lte: soon } }).lean();
  for (const a of list) {
    const students = (await Enrollment.find({ subject: a.subject, status: 'active' }).distinct('student')).map(String);
    const done = (await Submission.find({ assignment: a._id }).distinct('student')).map(String);
    let pending = students.filter((s) => !done.includes(s));
    if (a.section) pending = (await User.find({ _id: { $in: pending }, section: a.section }).distinct('_id')).map(String);
    await notify(pending, { type: 'assignment', title: `Deadline soon: ${a.title}`, message: `Due ${a.dueDate.toISOString()}`, link: '/assignments', dedupeKey: `due24:${a._id}` });
  }
  return list.length;
}

export async function cleanupOrphanFiles() {
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000);
  const orphans: any[] = await UploadedFile.find({ attached: false, createdAt: { $lt: cutoff } }).select('_id').limit(200).lean();
  for (const f of orphans) await deleteFile(f._id);
  await Notification.deleteMany({ read: true, createdAt: { $lt: new Date(Date.now() - 90 * 86400 * 1000) } });
  return orphans.length;
}

export function startJobs() {
  const safe = (name: string, fn: () => Promise<unknown>) => () => fn().catch((err) => logger.error({ err }, `job ${name} failed`));
  const timers = [
    setInterval(safe('notices', dispatchDueNotices), 60_000),
    setInterval(safe('reminders', sendDeadlineReminders), 3600_000),
    setInterval(safe('cleanup', cleanupOrphanFiles), 6 * 3600_000),
  ];
  timers.forEach((t) => t.unref());
  return () => timers.forEach(clearInterval);
}
