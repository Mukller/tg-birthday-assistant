'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { pluralDays, dayLabel } = require('../dist/common/labels');

test('pluralDays: Russian plural forms', () => {
  assert.strictEqual(pluralDays(1), '1 день');
  assert.strictEqual(pluralDays(2), '2 дня');
  assert.strictEqual(pluralDays(4), '4 дня');
  assert.strictEqual(pluralDays(5), '5 дней');
  assert.strictEqual(pluralDays(7), '7 дней');
  assert.strictEqual(pluralDays(11), '11 дней');
  assert.strictEqual(pluralDays(21), '21 день');
  assert.strictEqual(pluralDays(22), '22 дня');
});

test('dayLabel: relative day buckets', () => {
  assert.strictEqual(dayLabel(0), 'Сегодня');
  assert.strictEqual(dayLabel(1), 'Завтра');
  assert.strictEqual(dayLabel(2), 'Послезавтра');
  assert.strictEqual(dayLabel(7), 'Через 7 дней');
});
