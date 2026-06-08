'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { DateTime } = require('luxon');
const { nextBirthdayInfo, formatBirthDate, toBirthDate } = require('../dist/common/date.util');

const tz = 'Europe/Warsaw';
const now = DateTime.fromISO('2026-06-08T12:00:00', { zone: tz });

test('nextBirthdayInfo: upcoming birthday in 2 days', () => {
  const info = nextBirthdayInfo(toBirthDate(1990, 6, 10), tz, now);
  assert.strictEqual(info.daysUntil, 2);
  assert.strictEqual(info.turning, 36);
  assert.strictEqual(info.next.toFormat('dd.MM.yyyy'), '10.06.2026');
});

test('nextBirthdayInfo: birthday today is 0 days', () => {
  const info = nextBirthdayInfo(toBirthDate(1990, 6, 8), tz, now);
  assert.strictEqual(info.daysUntil, 0);
  assert.strictEqual(info.turning, 36);
});

test('nextBirthdayInfo: yesterday rolls over to next year', () => {
  const info = nextBirthdayInfo(toBirthDate(1990, 6, 7), tz, now);
  assert.strictEqual(info.next.year, 2027);
  assert.ok(info.daysUntil >= 363 && info.daysUntil <= 365);
  assert.strictEqual(info.turning, 37);
});

test('formatBirthDate: full date with year', () => {
  assert.strictEqual(formatBirthDate(toBirthDate(1998, 5, 12)), '12.05.1998');
});

test('formatBirthDate: no year (<=1900) prints dd.mm', () => {
  assert.strictEqual(formatBirthDate(toBirthDate(1900, 5, 12)), '12.05');
});
