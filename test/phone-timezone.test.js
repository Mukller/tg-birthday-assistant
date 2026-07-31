'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { phoneToTimezone } = require('../dist/common/phone-timezone');

test('phoneToTimezone: maps common country calling codes', () => {
  assert.strictEqual(phoneToTimezone('+375291234567'), 'Europe/Minsk'); // BY
  assert.strictEqual(phoneToTimezone('+79991234567'), 'Europe/Moscow'); // RU
  assert.strictEqual(phoneToTimezone('+380971234567'), 'Europe/Kyiv'); // UA
  assert.strictEqual(phoneToTimezone('+48123456789'), 'Europe/Warsaw'); // PL
  assert.strictEqual(phoneToTimezone('+15551234567'), 'America/New_York'); // US
});

test('phoneToTimezone: works without a leading plus', () => {
  assert.strictEqual(phoneToTimezone('375291234567'), 'Europe/Minsk');
});

test('phoneToTimezone: unknown or empty returns null', () => {
  assert.strictEqual(phoneToTimezone(''), null);
  assert.strictEqual(phoneToTimezone(null), null);
  assert.strictEqual(phoneToTimezone(undefined), null);
  assert.strictEqual(phoneToTimezone('+9990001122'), null);
});
