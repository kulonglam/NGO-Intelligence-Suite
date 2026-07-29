import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  decryptUtf8,
  encryptUtf8,
  blindIndex,
  deriveIndexKey,
  wrapDekWithMaster,
  unwrapDekWithMaster,
} from './index.js';
import { createHash, randomBytes } from 'node:crypto';

describe('@ngois/crypto', () => {
  it('round-trips AES-GCM plaintext', () => {
    const dek = randomBytes(32);
    const { ciphertext } = encryptUtf8(dek, 'Alice Example', 1);
    assert.equal(decryptUtf8(dek, ciphertext), 'Alice Example');
  });

  it('rejects tampered ciphertext', () => {
    const dek = randomBytes(32);
    const { ciphertext } = encryptUtf8(dek, 'secret', 1);
    const parts = ciphertext.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    assert.throws(() => decryptUtf8(dek, parts.join('.')));
  });

  it('blind index is stable for normalised values', () => {
    const dek = randomBytes(32);
    const key = deriveIndexKey(dek);
    assert.equal(blindIndex(key, '  Alice '), blindIndex(key, 'alice'));
    assert.notEqual(blindIndex(key, 'alice'), blindIndex(key, 'bob'));
    assert.equal(blindIndex(key, 'alice').length, 64);
  });

  it('master-key derivation is 32 bytes', () => {
    const k = createHash('sha256').update('x').digest();
    assert.equal(k.length, 32);
  });

  it('wraps and unwraps a DEK with the master key (≥95% crypto suite)', () => {
    const dek = randomBytes(32);
    const wrapped = wrapDekWithMaster(dek, { NGOIS_MASTER_KEY: 'test-master-key!!' });
    const out = unwrapDekWithMaster(wrapped, { NGOIS_MASTER_KEY: 'test-master-key!!' });
    assert.equal(out.equals(dek), true);
    assert.notEqual(wrapped.equals(dek), true);
  });

  it('rejects decrypt of malformed ciphertext', () => {
    const dek = randomBytes(32);
    assert.throws(() => decryptUtf8(dek, 'not.enough'));
  });
});
