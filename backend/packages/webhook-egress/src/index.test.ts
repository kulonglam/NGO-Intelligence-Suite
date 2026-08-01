import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWebhookEnvelope,
  signBody,
  stripPii,
  validateWebhookUrl,
  verifySignature,
} from './index.js';

describe('webhook-egress', () => {
  it('strips PII keys from payload', () => {
    const cleaned = stripPii({
      grant_id: 'g1',
      email: 'x@y.z',
      nested: { phone: '+211', status: 'ok' },
    }) as Record<string, unknown>;
    assert.equal(cleaned.grant_id, 'g1');
    assert.equal(cleaned.email, undefined);
    assert.deepEqual(cleaned.nested, { status: 'ok' });
  });

  it('builds envelope without PII', () => {
    const env = buildWebhookEnvelope({
      id: 'e1',
      tenant_id: 't1',
      event_type: 'grant.updated',
      payload: { grant_id: 'g1', full_name: 'Secret' },
    });
    const data = env.data as Record<string, unknown>;
    assert.equal(data.grant_id, 'g1');
    assert.equal(data.full_name, undefined);
  });

  it('HMAC round-trip', () => {
    const body = '{"a":1}';
    const secret = 'test-secret';
    const hdr = signBody(secret, body, 1_700_000_000);
    assert.ok(verifySignature(secret, body, hdr, 10 ** 9));
  });

  it('SSRF blocks private IP when not allowPrivate', async () => {
    const r = await validateWebhookUrl('https://127.0.0.1/hook');
    assert.equal(r.ok, false);
  });

  it('allows private with allowPrivate for smoke', async () => {
    const r = await validateWebhookUrl('http://127.0.0.1:9/hook', { allowPrivate: true });
    assert.equal(r.ok, true);
  });
});
