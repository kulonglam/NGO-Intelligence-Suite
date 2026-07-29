import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computePayroll, serialiseResult } from './compute.js';
import type { PayrollComputeInput, TaxBand } from './types.js';

export const SS_BANDS: TaxBand[] = [
  { band_order: 1, lower_bound: '0', upper_bound: '3000', rate_percent: '0', fixed_amount: '0' },
  { band_order: 2, lower_bound: '3000', upper_bound: '5000', rate_percent: '10', fixed_amount: '0' },
  { band_order: 3, lower_bound: '5000', upper_bound: '10000', rate_percent: '15', fixed_amount: '0' },
  { band_order: 4, lower_bound: '10000', upper_bound: null, rate_percent: '20', fixed_amount: '0' },
];

export const UG_BANDS: TaxBand[] = [
  { band_order: 1, lower_bound: '0', upper_bound: '235000', rate_percent: '0', fixed_amount: '0' },
  { band_order: 2, lower_bound: '235000', upper_bound: '335000', rate_percent: '10', fixed_amount: '0' },
  { band_order: 3, lower_bound: '335000', upper_bound: '410000', rate_percent: '20', fixed_amount: '10000' },
  { band_order: 4, lower_bound: '410000', upper_bound: '10000000', rate_percent: '30', fixed_amount: '25000' },
  { band_order: 5, lower_bound: '10000000', upper_bound: null, rate_percent: '40', fixed_amount: '25000' },
];

export const SS_STATUTORY = {
  scheme_code: 'NSIF',
  employee_rate_percent: '8',
  employer_rate_percent: '17',
  contribution_base: 'pensionable' as const,
  deductible_before_tax: true,
};

export const UG_STATUTORY = {
  scheme_code: 'NSSF',
  employee_rate_percent: '5',
  employer_rate_percent: '10',
  contribution_base: 'gross' as const,
  deductible_before_tax: false,
};

function ssInput(overrides: Partial<PayrollComputeInput> = {}): PayrollComputeInput {
  return {
    country_code: 'SS',
    basic_salary: '40000.00',
    allowances: [],
    days_in_month: 30,
    days_worked: 30,
    tax_bands: SS_BANDS,
    statutory: SS_STATUTORY,
    ...overrides,
  };
}

describe('Appendix I worked examples', () => {
  it('South Sudan — full month (I.6.3)', () => {
    const r = computePayroll(
      ssInput({
        allowances: [
          { code: 'HOUSING', amount: '8000.00', taxable: true, pensionable: true },
          { code: 'TRANSPORT', amount: '3000.00', taxable: false, pensionable: false },
        ],
      }),
    );
    assert.equal(r.gross, '51000.00');
    assert.equal(r.net, '39378.00');
    assert.equal(r.employer_cost, '59160.00');
    assert.equal(r.lines.find((l) => l.component_code === 'NSIF_EE')?.amount, '3840.00');
    assert.equal(r.lines.find((l) => l.component_code === 'PAYE')?.amount, '7782.00');
  });

  it('Uganda — full month with LST (I.6.5)', () => {
    const r = computePayroll({
      country_code: 'UG',
      basic_salary: '1200000',
      allowances: [],
      days_in_month: 30,
      days_worked: 30,
      tax_bands: UG_BANDS,
      statutory: UG_STATUTORY,
      lst_annual: '100000',
      lst_deduction_months: 4,
    });
    assert.equal(r.gross, '1200000.00');
    assert.equal(r.net, '853000.00');
    assert.equal(r.employer_cost, '1320000.00');
    assert.equal(r.lines.find((l) => l.component_code === 'NSSF_EE')?.amount, '60000.00');
    assert.equal(r.lines.find((l) => l.component_code === 'PAYE')?.amount, '262000.00');
    assert.equal(r.lines.find((l) => l.component_code === 'LST')?.amount, '25000.00');
  });
});

describe('edge cases (I.6.6) — full corpus', () => {
  it('mid-month joiner prorates earnings not bands', () => {
    const r = computePayroll(ssInput({ days_worked: 15 }));
    assert.equal(r.gross, '20000.00');
    const paye = r.lines.find((l) => l.component_code === 'PAYE')?.amount;
    assert.ok(paye);
    assert.notEqual(paye, '7782.00');
  });

  it('mid-month leaver prorates to days worked', () => {
    const r = computePayroll(ssInput({ days_worked: 10 }));
    assert.equal(r.gross, '13333.33');
    assert.ok(parseFloat(r.net) > 0);
  });

  it('exactly at PAYE band boundary (44160.00 taxable base path)', () => {
    const r = computePayroll(
      ssInput({
        basic_salary: '40000.00',
        allowances: [{ code: 'HOUSING', amount: '8000.00', taxable: true, pensionable: true }],
      }),
    );
    const paye = r.lines.find((l) => l.component_code === 'PAYE');
    assert.equal(paye?.basis_amount, '44160.00');
    assert.equal(paye?.amount, '7782.00');
    const rEdge = computePayroll(
      ssInput({
        basic_salary: '39999.99',
        allowances: [{ code: 'HOUSING', amount: '8000.00', taxable: true, pensionable: true }],
      }),
    );
    const payeEdge = rEdge.lines.find((l) => l.component_code === 'PAYE');
    assert.ok(parseFloat(payeEdge!.amount) <= parseFloat(paye!.amount));
  });

  it('rounding — component deductions sum to total_deductions exactly', () => {
    const r = computePayroll(
      ssInput({
        allowances: [{ code: 'HOUSING', amount: '8000.00', taxable: true, pensionable: true }],
      }),
    );
    const dedLines = r.lines.filter((l) =>
      ['NSIF_EE', 'PAYE', 'NSSF_EE', 'LST'].includes(l.component_code),
    );
    let sum = 0;
    for (const l of dedLines) sum += parseFloat(l.amount);
    assert.equal(sum.toFixed(2), parseFloat(r.total_deductions).toFixed(2));
  });

  it('negative net pay is blocked (NGOIS-PAY-0052)', () => {
    assert.throws(() =>
      computePayroll({
        country_code: 'UG',
        basic_salary: '1000.00',
        allowances: [],
        days_in_month: 30,
        days_worked: 30,
        tax_bands: UG_BANDS,
        statutory: UG_STATUTORY,
        lst_annual: '4000',
        lst_deduction_months: 4,
      }),
    );
  });

  it('zero gross produces zero record (unpaid leave)', () => {
    const r = computePayroll(ssInput({ basic_salary: '0', days_worked: 0 }));
    assert.equal(r.net, '0.00');
    assert.equal(r.gross, '0.00');
  });

  it('multi-currency — each contract computed in its own currency amounts', () => {
    const ss = computePayroll(ssInput({ basic_salary: '40000.00' }));
    const ug = computePayroll({
      country_code: 'UG',
      basic_salary: '1200000',
      allowances: [],
      days_in_month: 30,
      days_worked: 30,
      tax_bands: UG_BANDS,
      statutory: UG_STATUTORY,
    });
    assert.notEqual(ss.gross, ug.gross);
    assert.ok(parseFloat(ss.gross) < 100000);
    assert.ok(parseFloat(ug.gross) > 100000);
  });

  it('missing tax band blocked (NGOIS-PAY-0031)', () => {
    assert.throws(
      () => computePayroll(ssInput({ tax_bands: [] })),
      /NGOIS-PAY-0031/,
    );
  });

  it('recomputation with same ruleset is byte-identical (FS-02)', () => {
    const input = ssInput({
      allowances: [{ code: 'HOUSING', amount: '8000.00', taxable: true, pensionable: true }],
    });
    assert.equal(serialiseResult(computePayroll(input)), serialiseResult(computePayroll(input)));
  });

  it('retrospective statutory change does not alter pinned hash output', () => {
    const input = ssInput({ basic_salary: '30000.00' });
    const original = computePayroll(input);
    const changedBands: TaxBand[] = [
      ...SS_BANDS.slice(0, 3),
      { band_order: 4, lower_bound: '10000', upper_bound: null, rate_percent: '25', fixed_amount: '0' },
    ];
    const changed = computePayroll({ ...input, tax_bands: changedBands });
    assert.notEqual(original.ruleset_hash, changed.ruleset_hash);
    assert.notEqual(
      original.lines.find((l) => l.component_code === 'PAYE')?.amount,
      changed.lines.find((l) => l.component_code === 'PAYE')?.amount,
    );
    assert.equal(serialiseResult(original), serialiseResult(computePayroll(input)));
  });
});
