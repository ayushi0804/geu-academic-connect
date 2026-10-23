import { AppSettings, AcademicYear } from '../models';

export async function getSettings() {
  return AppSettings.findOneAndUpdate({ key: 'app' }, { $setOnInsert: { key: 'app' } }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
}

export async function currentYearId(): Promise<string | null> {
  const s: any = await getSettings();
  if (s?.currentAcademicYear) return String(s.currentAcademicYear);
  const y: any = await AcademicYear.findOne({ isCurrent: true }).lean();
  if (y) return String(y._id);
  const latest: any = await AcademicYear.findOne().sort({ startDate: -1 }).lean();
  return latest ? String(latest._id) : null;
}
