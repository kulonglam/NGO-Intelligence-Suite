import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isTenantRedisKey, tenantRedisKey } from './redis-key.js';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '44444444-4444-4444-8444-444444444444';

describe('tenantRedisKey', () => {
  it('prefixes with ngois:{tenantId}', () => {
    assert.equal(tenantRedisKey(TENANT_A, 'cache', 'grant', 'x'), `ngois:${TENANT_A}:cache:grant:x`);
  });

  it('rejects non-uuid tenants', () => {
    assert.throws(() => tenantRedisKey('not-a-uuid', 'x'));
  });

  it('rejects unsafe parts', () => {
    assert.throws(() => tenantRedisKey(TENANT_A, 'a:b'));
    assert.throws(() => tenantRedisKey(TENANT_A, '*'));
  });
});

describe('isTenantRedisKey', () => {
  it('accepts own prefix only', () => {
    const key = tenantRedisKey(TENANT_A, 'session', '1');
    assert.equal(isTenantRedisKey(TENANT_A, key), true);
    assert.equal(isTenantRedisKey(TENANT_B, key), false);
    assert.equal(isTenantRedisKey(TENANT_A, 'session:1'), false);
  });
});
