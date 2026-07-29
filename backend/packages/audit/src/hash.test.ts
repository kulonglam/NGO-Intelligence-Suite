import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeRecordHash, stableStringify } from './index.js';

describe('audit hash chain', () => {
  it('is deterministic for identical inputs', () => {
    const input = {
      previousHash: null,
      tenantId: '11111111-1111-4111-8111-111111111111',
      sequence: 1,
      occurredAt: '2026-07-28T00:00:00.000Z',
      actorUserId: '22222222-2222-4222-8222-222222222222',
      action: 'grant.created',
      resourceType: 'grant',
      resourceId: '33333333-3333-4333-8333-333333333333',
      beforeState: null,
      afterState: { status: 'draft' },
      outcome: 'success',
      correlationId: 'abc',
      serviceName: 'grant-service',
    };
    assert.equal(computeRecordHash(input), computeRecordHash(input));
    assert.equal(computeRecordHash(input).length, 64);
  });

  it('changes when previous hash changes', () => {
    const base = {
      previousHash: null as string | null,
      tenantId: 't',
      sequence: 2,
      occurredAt: '2026-07-28T00:00:00.000Z',
      actorUserId: null,
      action: 'x',
      resourceType: 'y',
      resourceId: null,
      beforeState: null,
      afterState: null,
      outcome: 'success',
      correlationId: null,
      serviceName: 'svc',
    };
    const a = computeRecordHash(base);
    const b = computeRecordHash({ ...base, previousHash: a });
    assert.notEqual(a, b);
  });

  it('stableStringify canonicalises Date like JSON.stringify', () => {
    const d = new Date('2026-07-28T00:00:00.000Z');
    assert.equal(stableStringify({ at: d }), stableStringify({ at: d.toISOString() }));
  });
});
