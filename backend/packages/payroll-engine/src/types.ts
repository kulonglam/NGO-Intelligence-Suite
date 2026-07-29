import { createHash } from 'node:crypto';

export type Allowance = {
  code: string;
  amount: string;
  taxable: boolean;
  pensionable: boolean;
};

export type TaxBand = {
  band_order: number;
  lower_bound: string;
  upper_bound: string | null;
  rate_percent: string;
  fixed_amount: string;
};

export type StatutoryRate = {
  scheme_code: string;
  employee_rate_percent: string;
  employer_rate_percent: string;
  contribution_base: 'gross' | 'pensionable' | 'taxable';
  deductible_before_tax: boolean;
};

export type PayrollLine = {
  component_code: string;
  basis_amount: string;
  rate_applied: string | null;
  amount: string;
  source_reference: string;
  line_order: number;
};

export type PayrollComputeInput = {
  country_code: 'SS' | 'UG';
  basic_salary: string;
  allowances: Allowance[];
  days_in_month: number;
  days_worked: number;
  tax_bands: TaxBand[];
  statutory: StatutoryRate;
  lst_annual?: string;
  lst_deduction_months?: number;
};

export type PayrollComputeResult = {
  gross: string;
  pensionable: string;
  taxable_gross: string;
  total_deductions: string;
  net: string;
  employer_cost: string;
  lines: PayrollLine[];
  ruleset_hash: string;
};

export function rulesetHash(parts: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}
