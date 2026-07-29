import {
  add,
  formatMoney,
  isNegative,
  isZero,
  mulRate,
  parseMoney,
  roundHalfUp,
  sub,
} from './decimal.js';
import type {
  Allowance,
  PayrollComputeInput,
  PayrollComputeResult,
  PayrollLine,
  StatutoryRate,
  TaxBand,
} from './types.js';
import { rulesetHash } from './types.js';

export type { Allowance, PayrollComputeInput, PayrollComputeResult, PayrollLine, TaxBand, StatutoryRate };
export { rulesetHash } from './types.js';

export function prorate(amount: string, daysWorked: number, daysInMonth: number): string {
  if (daysWorked >= daysInMonth) return amount;
  if (daysWorked <= 0) return '0.00';
  const cents = parseMoney(amount);
  const prorated = roundHalfUp((cents * BigInt(daysWorked) * 100n) / BigInt(daysInMonth));
  return formatMoney(prorated);
}

function sumAllowances(allowances: Allowance[], filter: (a: Allowance) => boolean): string {
  let total = 0n;
  for (const a of allowances.filter(filter)) {
    total += parseMoney(a.amount);
  }
  return formatMoney(total);
}

function marginalPayeSs(taxableBase: string, bands: TaxBand[]): string {
  let remaining = parseMoney(taxableBase);
  let total = 0n;
  const sorted = [...bands].sort((a, b) => a.band_order - b.band_order);
  for (const band of sorted) {
    if (remaining <= 0n) break;
    const lower = parseMoney(band.lower_bound);
    const upper = band.upper_bound ? parseMoney(band.upper_bound) : null;
    const bandWidth =
      upper === null ? remaining : min(remaining, max(0n, upper - lower));
    if (bandWidth <= 0n) continue;
    const tax = mulRate(bandWidth, band.rate_percent);
    total += tax;
    remaining -= bandWidth;
  }
  return formatMoney(total);
}

function cumulativePayeUg(taxableBase: string, bands: TaxBand[]): string {
  const income = parseMoney(taxableBase);
  const sorted = [...bands].sort((a, b) => a.band_order - b.band_order);
  let applicable = sorted[0];
  for (const band of sorted) {
    const lower = parseMoney(band.lower_bound);
    const upper = band.upper_bound ? parseMoney(band.upper_bound) : null;
    if (income >= lower && (upper === null || income <= upper)) {
      applicable = band;
      break;
    }
    if (upper !== null && income > upper) {
      applicable = band;
    }
  }
  if (!applicable) return '0.00';
  const lower = parseMoney(applicable.lower_bound);
  const excess = income - lower;
  if (excess <= 0n) return '0.00';
  const fixed = parseMoney(applicable.fixed_amount);
  const variable = mulRate(excess, applicable.rate_percent);
  return formatMoney(fixed + variable);
}

function min(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

function max(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

function basisAmount(
  code: 'gross' | 'pensionable' | 'taxable',
  gross: string,
  pensionable: string,
  taxable: string,
): string {
  if (code === 'gross') return gross;
  if (code === 'pensionable') return pensionable;
  return taxable;
}

export function computePayroll(input: PayrollComputeInput): PayrollComputeResult {
  if (!input.tax_bands.length) {
    throw new Error('NGOIS-PAY-0031: No tax bands configured for this jurisdiction and period.');
  }
  const basic = prorate(input.basic_salary, input.days_worked, input.days_in_month);
  const allowances = input.allowances.map((a) => ({
    ...a,
    amount: prorate(a.amount, input.days_worked, input.days_in_month),
  }));

  const allowanceTotal = sumAllowances(allowances, () => true);
  const gross = add(basic, allowanceTotal);
  const pensionableAllow = sumAllowances(allowances, (a) => a.pensionable);
  const taxableAllow = sumAllowances(allowances, (a) => a.taxable);
  const pensionable = add(basic, pensionableAllow);
  const taxableGross = add(basic, taxableAllow);

  if (isZero(gross)) {
    return {
      gross: '0.00',
      pensionable: '0.00',
      taxable_gross: '0.00',
      total_deductions: '0.00',
      net: '0.00',
      employer_cost: '0.00',
      lines: [
        {
          component_code: 'GROSS',
          basis_amount: '0.00',
          rate_applied: null,
          amount: '0.00',
          source_reference: 'zero-gross',
          line_order: 1,
        },
      ],
      ruleset_hash: rulesetHash([input.country_code, input.tax_bands, input.statutory]),
    };
  }

  const lines: PayrollLine[] = [];
  let order = 1;
  lines.push({
    component_code: 'GROSS',
    basis_amount: gross,
    rate_applied: null,
    amount: gross,
    source_reference: 'earnings',
    line_order: order++,
  });

  const statBasis = basisAmount(
    input.statutory.contribution_base,
    gross,
    pensionable,
    taxableGross,
  );
  const eeStat = mulRate(parseMoney(statBasis), input.statutory.employee_rate_percent);
  const erStat = mulRate(parseMoney(statBasis), input.statutory.employer_rate_percent);
  const eeStatStr = formatMoney(eeStat);
  const erStatStr = formatMoney(erStat);

  lines.push({
    component_code: `${input.statutory.scheme_code}_EE`,
    basis_amount: statBasis,
    rate_applied: input.statutory.employee_rate_percent,
    amount: eeStatStr,
    source_reference: input.statutory.scheme_code,
    line_order: order++,
  });
  lines.push({
    component_code: `${input.statutory.scheme_code}_ER`,
    basis_amount: statBasis,
    rate_applied: input.statutory.employer_rate_percent,
    amount: erStatStr,
    source_reference: input.statutory.scheme_code,
    line_order: order++,
  });

  let payeBase = taxableGross;
  if (input.country_code === 'SS' && input.statutory.deductible_before_tax) {
    payeBase = sub(taxableGross, eeStatStr);
  }

  const paye =
    input.country_code === 'SS'
      ? marginalPayeSs(payeBase, input.tax_bands)
      : cumulativePayeUg(taxableGross, input.tax_bands);

  lines.push({
    component_code: 'PAYE',
    basis_amount: payeBase,
    rate_applied: null,
    amount: paye,
    source_reference: 'PAYE',
    line_order: order++,
  });

  let lst = '0.00';
  if (input.country_code === 'UG' && input.lst_annual && input.lst_deduction_months) {
    const lstCents = parseMoney(input.lst_annual);
    const monthly = roundHalfUp((lstCents * 100n) / BigInt(input.lst_deduction_months));
    lst = formatMoney(monthly);
    lines.push({
      component_code: 'LST',
      basis_amount: input.lst_annual,
      rate_applied: String(input.lst_deduction_months),
      amount: lst,
      source_reference: 'LST',
      line_order: order++,
    });
  }

  const totalDeductions = formatMoney(
    parseMoney(eeStatStr) + parseMoney(paye) + parseMoney(lst),
  );
  const net = sub(gross, totalDeductions);
  if (isNegative(net)) {
    throw new Error('NGOIS-PAY-0052: Net pay would be negative');
  }
  const employerCost = add(gross, erStatStr);

  return {
    gross,
    pensionable,
    taxable_gross: taxableGross,
    total_deductions: totalDeductions,
    net,
    employer_cost: employerCost,
    lines,
    ruleset_hash: rulesetHash([input.country_code, input.tax_bands, input.statutory]),
  };
}

/** Serialise result for byte-identical reproducibility checks. */
export function serialiseResult(r: PayrollComputeResult): string {
  return JSON.stringify({
    gross: r.gross,
    net: r.net,
    total_deductions: r.total_deductions,
    employer_cost: r.employer_cost,
    lines: r.lines.map((l) => ({
      component_code: l.component_code,
      amount: l.amount,
      basis_amount: l.basis_amount,
      rate_applied: l.rate_applied,
    })),
  });
}
