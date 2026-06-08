/**
 * Lightweight congratulation-text suggestions (Could Have: "AI congratulations").
 * Template-based, personalized by name — no external API required.
 * The list is deterministic, so a chosen index always maps to the same text.
 */
export function generateSuggestions(name: string): string[] {
  const n = name.trim() || 'друг';
  return [
    `С днём рождения, ${n}! 🎉 Желаю крепкого здоровья, счастья и чтобы все мечты сбывались. ` +
      `Пусть этот год принесёт только радость и тёплые моменты!`,
    `${n}, поздравляю с днём рождения! 🥳 Пусть рядом всегда будут близкие люди, ` +
      `а в делах сопутствует удача. Всего самого светлого!`,
    `Дорогой(ая) ${n}, с праздником! 🎂 Пусть каждый день дарит улыбки, новые возможности ` +
      `и поводы для гордости. Обнимаю!`,
  ];
}
