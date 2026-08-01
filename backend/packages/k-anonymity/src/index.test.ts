import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { KOCH_FIXTURE, suppressAggregate } from './index.js';

describe('I.8 k-anonymity', () => {
  it('Koch fixture suppresses Female + complementary Male + row total', () => {
    const r = suppressAggregate(KOCH_FIXTURE);
    const kochF = r.cells.find((c) => c.row === 'Koch' && c.col === 'Female');
    const kochM = r.cells.find((c) => c.row === 'Koch' && c.col === 'Male');
    assert.ok(kochF?.suppressed);
    assert.ok(kochM?.suppressed);
    assert.equal(r.row_totals.Koch, null);
    assert.equal(r.col_totals.Female, 552);
    assert.equal(r.col_totals.Male, 531);
    assert.equal(r.grand_total, 1083);
  });

  it('cohorts of 5+ remain visible', () => {
    const r = suppressAggregate([
      { row: 'A', col: 'X', count: 5 },
      { row: 'A', col: 'Y', count: 10 },
    ]);
    assert.equal(r.cells.every((c) => !c.suppressed), true);
    assert.equal(r.grand_total, 15);
  });
});
