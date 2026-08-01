import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildIndexes, scoreDuplicate } from './index.js';

const secret = 'test-index-secret';

describe('I.7 beneficiary dedup', () => {
  it('same national id + name → probable (≥70), never auto-merge', () => {
    const a = buildIndexes(secret, { full_name: 'Nyandeng A. Deng', national_id: 'SS-1' });
    const b = buildIndexes(secret, { full_name: 'deng nyandeng a', national_id: 'SS-1' });
    const r = scoreDuplicate(
      { id: '1', ...a, birth_year: 1990, sex: 'F' },
      { id: '2', ...b, birth_year: 1990, sex: 'F' },
    );
    assert.ok(r.score >= 70);
    assert.equal(r.priority, 'probable');
    assert.equal(r.auto_merge, false);
  });

  it('name normalisation is order-insensitive', () => {
    const a = buildIndexes(secret, { full_name: 'Ada Bee' });
    const b = buildIndexes(secret, { full_name: 'Bee Ada' });
    assert.equal(a.name_index, b.name_index);
  });

  it('low overlap → none', () => {
    const a = buildIndexes(secret, { full_name: 'Alice One' });
    const b = buildIndexes(secret, { full_name: 'Bob Two' });
    const r = scoreDuplicate({ id: '1', ...a }, { id: '2', ...b });
    assert.equal(r.priority, 'none');
    assert.equal(r.auto_merge, false);
  });
});
