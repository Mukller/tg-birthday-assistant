'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { esc } = require('../dist/common/html.util');

test('esc: escapes HTML-special characters', () => {
  assert.strictEqual(esc('<b>Tom & Jerry</b>'), '&lt;b&gt;Tom &amp; Jerry&lt;/b&gt;');
});

test('esc: null/undefined become empty string', () => {
  assert.strictEqual(esc(null), '');
  assert.strictEqual(esc(undefined), '');
});
