/** Institution time zone offset (IST = UTC+05:30). Used for "today" in attendance/timetable. */
export const INSTITUTION_UTC_OFFSET_MIN = 330;
const shifted = (d = new Date()) => new Date(d.getTime() + INSTITUTION_UTC_OFFSET_MIN * 60_000);
export const todayStr = (d = new Date()) => shifted(d).toISOString().slice(0, 10);
export const addDaysStr = (s: string, n: number) => new Date(Date.parse(`${s}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
/** 1 = Monday … 7 = Sunday */
export const dayOfWeek = (d = new Date()) => ((shifted(d).getUTCDay() + 6) % 7) + 1;
export const hhmm = (d = new Date()) => shifted(d).toISOString().slice(11, 16);
