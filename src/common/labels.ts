/** Russian plural for "день/дня/дней". */
export function pluralDays(n: number): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return `${n} дней`;
  if (last === 1) return `${n} день`;
  if (last >= 2 && last <= 4) return `${n} дня`;
  return `${n} дней`;
}

/** Group header for an upcoming-birthday bucket. */
export function dayLabel(daysUntil: number): string {
  if (daysUntil === 0) return 'Сегодня';
  if (daysUntil === 1) return 'Завтра';
  if (daysUntil === 2) return 'Послезавтра';
  return `Через ${pluralDays(daysUntil)}`;
}
