import { Notification, User } from '../models';
import { sendMail } from './mailer';
import { logger } from '../config/logger';

export type NType = 'assignment' | 'notice' | 'marks' | 'attendance' | 'timetable' | 'placement' | 'system';

export async function notify(
  userIds: unknown[],
  n: { type: NType; title: string; message?: string; link?: string; dedupeKey?: string },
) {
  const ids = Array.from(new Set(userIds.filter(Boolean).map(String)));
  if (!ids.length) return 0;
  const users = await User.find({ _id: { $in: ids }, status: 'active' }).select('email notificationPrefs').lean();
  const targets = users.filter((u: any) => n.type === 'system' || u.notificationPrefs?.[n.type] !== false);
  if (!targets.length) return 0;
  try {
    await Notification.insertMany(
      targets.map((u: any) => ({ user: u._id, ...n })),
      { ordered: false },
    );
  } catch (err: any) {
    const onlyDupes = (err?.writeErrors ?? []).every((w: any) => w.err?.code === 11000) || err?.code === 11000;
    if (!onlyDupes) logger.error({ err }, 'notify failed');
  }
  // Optional email channel: only when SMTP is configured AND the user opted in.
  for (const u of targets as any[]) {
    if (u.notificationPrefs?.email) void sendMail(u.email, n.title, n.message ?? n.title);
  }
  return targets.length;
}
