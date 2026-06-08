'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { CryptoService } = require('../dist/common/crypto/crypto.service');

// 32-byte key as hex (64 chars)
const stubConfig = { get: () => 'a'.repeat(64) };
const crypto = new CryptoService(stubConfig);

test('crypto: AES-256-GCM encrypt/decrypt round-trip', () => {
  const plaintext = 'super-secret-mtproto-session-string-12345';
  const payload = crypto.encrypt(plaintext);
  assert.ok(payload.encrypted && payload.iv && payload.authTag);
  assert.notStrictEqual(payload.encrypted, plaintext);
  assert.strictEqual(crypto.decrypt(payload), plaintext);
});

test('crypto: each encryption uses a fresh IV', () => {
  const a = crypto.encrypt('same');
  const b = crypto.encrypt('same');
  assert.notStrictEqual(a.iv, b.iv);
  assert.notStrictEqual(a.encrypted, b.encrypted);
});

test('crypto: tampered auth tag is rejected', () => {
  const payload = crypto.encrypt('integrity-check');
  const tampered = { ...payload, authTag: Buffer.from('00'.repeat(16), 'hex').toString('base64') };
  assert.throws(() => crypto.decrypt(tampered));
});
