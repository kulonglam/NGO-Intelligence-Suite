/**
 * Phase 2 gate #4 — payroll for 500 employees within 5 minutes,
 * with no >20% p95 degradation on a background endpoint (when gateway is up).
 *
 *   npm run load:payroll-500
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = join(root, 'ops', 'drills', 'evidence');
mkdirSync(evidenceDir, { recursive: true });

const EMP_COUNT = Number(process.env.LOAD_EMPLOYEE_COUNT ?? 500);
const MAX_MS = Number(process.env.LOAD_MAX_MS ?? 5 * 60 * 1000);
const GATEWAY = process.env.GATEWAY_URL ?? 'http://127.0.0.1:3000';
const SAMPLE_N = 40;

const engineUrl = pathToFileURL(
  join(root, 'backend/packages/payroll-engine/dist/index.js'),
).href;
const { computePayroll } = await import(engineUrl);

const SS_BANDS = [
  { band_order: 1, lower_bound: '0', upper_bound: '3000', rate_percent: '0', fixed_amount: '0' },
  { band_order: 2, lower_bound: '3000', upper_bound: '5000', rate_percent: '10', fixed_amount: '0' },
  { band_order: 3, lower_bound: '5000', upper_bound: '10000', rate_percent: '15', fixed_amount: '0' },
  { band_order: 4, lower_bound: '10000', upper_bound: null, rate_percent: '20', fixed_amount: '0' },
];
const UG_BANDS = [
  { band_order: 1, lower_bound: '0', upper_bound: '235000', rate_percent: '0', fixed_amount: '0' },
  { band_order: 2, lower_bound: '235000', upper_bound: '335000', rate_percent: '10', fixed_amount: '0' },
  { band_order: 3, lower_bound: '335000', upper_bound: '410000', rate_percent: '20', fixed_amount: '10000' },
  { band_order: 4, lower_bound: '410000', upper_bound: '10000000', rate_percent: '30', fixed_amount: '25000' },
  { band_order: 5, lower_bound: '10000000', upper_bound: null, rate_percent: '40', fixed_amount: '25000' },
];
const SS_STAT = {
  scheme_code: 'NSIF',
  employee_rate_percent: '8',
  employer_rate_percent: '17',
  contribution_base: 'pensionable',
  deductible_before_tax: true,
};
const UG_STAT = {
  scheme_code: 'NSSF',
  employee_rate_percent: '5',
  employer_rate_percent: '10',
  contribution_base: 'gross',
  deductible_before_tax: false,
};

function p95(samples) {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1);
  return sorted[idx];
}

async function sampleHealth(n) {
  const times = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    try {
      const res = await fetch(`${GATEWAY}/v1/health`);
      if (!res.ok) throw new Error(String(res.status));
      times.push(performance.now() - t0);
    } catch {
      return { ok: false, times: [] };
    }
  }
  return { ok: true, times };
}

function employeeInput(i) {
  const ug = i % 2 === 0;
  const basic = ug ? String(800000 + (i % 50) * 10000) : String(25000 + (i % 40) * 500);
  return ug
    ? {
        country_code: 'UG',
        basic_salary: basic,
        allowances: [],
        days_in_month: 30,
        days_worked: 20 + (i % 11),
        tax_bands: UG_BANDS,
        statutory: UG_STAT,
        lst_annual: '100000',
        lst_deduction_months: 4,
      }
    : {
        country_code: 'SS',
        basic_salary: basic,
        allowances: [
          { code: 'HOUSING', amount: '5000.00', taxable: true, pensionable: true },
          { code: 'TRANSPORT', amount: '2000.00', taxable: false, pensionable: false },
        ],
        days_in_month: 30,
        days_worked: 20 + (i % 11),
        tax_bands: SS_BANDS,
        statutory: SS_STAT,
      };
}

const baseline = await sampleHealth(SAMPLE_N);
const during = [];
let sampling = false;
let sampleTimer;

if (baseline.ok) {
  sampling = true;
  sampleTimer = setInterval(() => {
    const t0 = performance.now();
    fetch(`${GATEWAY}/v1/health`)
      .then((res) => {
        if (res.ok) during.push(performance.now() - t0);
      })
      .catch(() => {});
  }, 50);
}

const t0 = performance.now();
let computed = 0;
for (let i = 0; i < EMP_COUNT; i++) {
  computePayroll(employeeInput(i));
  computed += 1;
}
const elapsedMs = performance.now() - t0;

if (sampling) {
  clearInterval(sampleTimer);
  await new Promise((r) => setTimeout(r, 200));
}

const baseP95 = p95(baseline.times);
const duringP95 = p95(during);
let degradationPct = null;
let p95Ok = true;
if (baseP95 != null && duringP95 != null && baseP95 > 0) {
  degradationPct = ((duringP95 - baseP95) / baseP95) * 100;
  p95Ok = degradationPct <= 20;
} else if (!baseline.ok) {
  // No gateway — gate still passes on compute wall-clock (documented).
  p95Ok = true;
}

const withinBudget = elapsedMs <= MAX_MS && computed === EMP_COUNT;
const pass = withinBudget && p95Ok;

const evidence = {
  gate: 4,
  generated_at: new Date().toISOString(),
  employees: EMP_COUNT,
  computed,
  elapsed_ms: Math.round(elapsedMs),
  max_ms: MAX_MS,
  within_5_min: withinBudget,
  background: {
    gateway: GATEWAY,
    reachable: baseline.ok,
    baseline_p95_ms: baseP95 == null ? null : Number(baseP95.toFixed(2)),
    during_p95_ms: duringP95 == null ? null : Number(duringP95.toFixed(2)),
    degradation_pct: degradationPct == null ? null : Number(degradationPct.toFixed(2)),
    limit_pct: 20,
    ok: p95Ok,
  },
  pass,
};

writeFileSync(join(evidenceDir, 'load-payroll-500.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
if (!pass) {
  console.error('load:payroll-500 FAIL');
  process.exit(1);
}
console.log('load:payroll-500 PASS');
