import { DateTime } from 'luxon';

export interface BirthdayInfo {
  next: DateTime;
  daysUntil: number;
  turning: number | null; // age they will turn, if birth year is known
}

/** Read a @db.Date value (stored at UTC midnight) without timezone drift. */
function birthParts(birthDate: Date): { day: number; month: number; year: number } {
  const dt = DateTime.fromJSDate(birthDate, { zone: 'utc' });
  return { day: dt.day, month: dt.month, year: dt.year };
}

export function nextBirthdayInfo(
  birthDate: Date,
  tz: string,
  now: DateTime = DateTime.now(),
): BirthdayInfo {
  const { day, month, year } = birthParts(birthDate);
  const today = now.setZone(tz).startOf('day');

  let next = DateTime.fromObject({ year: today.year, month, day }, { zone: tz }).startOf('day');
  if (!next.isValid) {
    // Feb 29 in a non-leap year → celebrate on Feb 28
    next = DateTime.fromObject({ year: today.year, month, day: 28 }, { zone: tz }).startOf('day');
  }
  if (next < today) next = next.plus({ years: 1 });

  const daysUntil = Math.round(next.diff(today, 'days').days);
  const turning = year > 1900 ? next.year - year : null;
  return { next, daysUntil, turning };
}

export function formatBirthDate(birthDate: Date): string {
  const { day, month, year } = birthParts(birthDate);
  const dd = String(day).padStart(2, '0');
  const mm = String(month).padStart(2, '0');
  return year > 1900 ? `${dd}.${mm}.${year}` : `${dd}.${mm}`;
}

/** Build a @db.Date value (UTC midnight) from calendar parts. */
export function toBirthDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}
