'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { CONGRATS_TEMPLATES, renderCongrat, congratPage } = require('../dist/bot/suggestions');

test('CONGRATS_TEMPLATES: large library, every entry has a {name} placeholder', () => {
  assert.ok(CONGRATS_TEMPLATES.length >= 150, `expected >=150, got ${CONGRATS_TEMPLATES.length}`);
  const missing = CONGRATS_TEMPLATES.filter((t) => !t.includes('{name}'));
  assert.deepStrictEqual(missing, [], `templates without {name}: ${JSON.stringify(missing)}`);
});

test('renderCongrat: substitutes the name and removes the placeholder', () => {
  const t = renderCongrat(0, 'Анна');
  assert.ok(!t.includes('{name}'));
  assert.ok(t.includes('Анна'));
});

test('renderCongrat: empty name falls back gracefully', () => {
  const t = renderCongrat(0, '');
  assert.ok(!t.includes('{name}'));
  assert.ok(t.length > 0);
});

test('congratPage: paginates by 5 and wraps around', () => {
  const p0 = congratPage('Иван', 0, 5);
  assert.strictEqual(p0.page, 0);
  assert.strictEqual(p0.items.length, 5);
  assert.ok(p0.totalPages > 1);
  assert.ok(p0.items.every((it) => it.text.includes('Иван') && !it.text.includes('{name}')));
  // page index equal to totalPages wraps back to 0
  const wrapped = congratPage('Иван', p0.totalPages, 5);
  assert.strictEqual(wrapped.page, 0);
});
