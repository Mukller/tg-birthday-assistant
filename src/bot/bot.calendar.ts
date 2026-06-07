import { Markup } from 'telegraf';

const MONTHS_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];
const WEEKDAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const IGNORE = 'cal:ignore';

/**
 * Inline date picker for a contact's birthday.
 * Callback formats:
 *   cal:nav:{contactId}:{year}:{month}     month/year navigation
 *   cal:pick:{contactId}:{year}:{month}:{day}
 */
export function buildCalendar(contactId: number, year: number, month: number) {
  const rows: any[][] = [];

  // Header: year navigation
  rows.push([
    Markup.button.callback('«', `cal:nav:${contactId}:${year - 1}:${month}`),
    Markup.button.callback(`${year}`, IGNORE),
    Markup.button.callback('»', `cal:nav:${contactId}:${year + 1}:${month}`),
  ]);

  // Header: month navigation
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  rows.push([
    Markup.button.callback('‹', `cal:nav:${contactId}:${prevYear}:${prevMonth}`),
    Markup.button.callback(MONTHS_RU[month - 1], IGNORE),
    Markup.button.callback('›', `cal:nav:${contactId}:${nextYear}:${nextMonth}`),
  ]);

  // Weekday labels
  rows.push(WEEKDAYS_RU.map((w) => Markup.button.callback(w, IGNORE)));

  // Day grid (Monday-first)
  const firstDow = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let week: any[] = [];
  for (let i = 0; i < firstDow; i++) week.push(Markup.button.callback(' ', IGNORE));
  for (let day = 1; day <= daysInMonth; day++) {
    week.push(Markup.button.callback(String(day), `cal:pick:${contactId}:${year}:${month}:${day}`));
    if (week.length === 7) {
      rows.push(week);
      week = [];
    }
  }
  if (week.length) {
    while (week.length < 7) week.push(Markup.button.callback(' ', IGNORE));
    rows.push(week);
  }

  rows.push([Markup.button.callback('« Отмена', `c:view:${contactId}`)]);
  return Markup.inlineKeyboard(rows);
}
