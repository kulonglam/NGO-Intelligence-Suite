import { createHash } from 'node:crypto';

export type PayslipRecord = {
  employee_number: string;
  display_name: string;
  gross: string;
  total_deductions: string;
  net: string;
  employer_cost: string;
  currency: string;
  lines: Array<{
    component_code: string;
    basis_amount: string;
    rate_applied: string | null;
    amount: string;
  }>;
};

export type RunMeta = {
  period_year: number;
  period_month: number;
  status: string;
};

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function buildPayslipCsv(run: RunMeta, records: PayslipRecord[]): string {
  const header = [
    'period',
    'employee_number',
    'display_name',
    'currency',
    'component_code',
    'basis_amount',
    'rate_applied',
    'amount',
    'gross',
    'total_deductions',
    'net',
    'employer_cost',
  ];
  const period = `${run.period_year}-${String(run.period_month).padStart(2, '0')}`;
  const rows: string[] = [header.join(',')];
  for (const rec of records) {
    for (const line of rec.lines) {
      rows.push(
        [
          period,
          rec.employee_number,
          rec.display_name,
          rec.currency,
          line.component_code,
          line.basis_amount,
          line.rate_applied ?? '',
          line.amount,
          rec.gross,
          rec.total_deductions,
          rec.net,
          rec.employer_cost,
        ]
          .map(csvEscape)
          .join(','),
      );
    }
    if (!rec.lines.length) {
      rows.push(
        [
          period,
          rec.employee_number,
          rec.display_name,
          rec.currency,
          '',
          '',
          '',
          '',
          rec.gross,
          rec.total_deductions,
          rec.net,
          rec.employer_cost,
        ]
          .map(csvEscape)
          .join(','),
      );
    }
  }
  return rows.join('\n');
}

export function buildPayslipHtml(run: RunMeta, records: PayslipRecord[]): string {
  const period = `${run.period_year}-${String(run.period_month).padStart(2, '0')}`;
  const sections = records
    .map((rec) => {
      const lineRows = rec.lines
        .map(
          (l) =>
            `<tr><td>${escapeHtml(l.component_code)}</td><td>${escapeHtml(l.basis_amount)}</td><td>${escapeHtml(l.rate_applied ?? '—')}</td><td>${escapeHtml(l.amount)}</td></tr>`,
        )
        .join('');
      return `<section class="payslip">
  <h2>${escapeHtml(rec.display_name)} (${escapeHtml(rec.employee_number)})</h2>
  <p>Period: ${escapeHtml(period)} · Currency: ${escapeHtml(rec.currency)}</p>
  <table><thead><tr><th>Component</th><th>Basis</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${lineRows}</tbody></table>
  <p><strong>Gross:</strong> ${escapeHtml(rec.gross)} · <strong>Deductions:</strong> ${escapeHtml(rec.total_deductions)} · <strong>Net:</strong> ${escapeHtml(rec.net)} · <strong>Employer cost:</strong> ${escapeHtml(rec.employer_cost)}</p>
</section>`;
    })
    .join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Payslips ${escapeHtml(period)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; color: #14262b; }
    h1 { font-size: 1.25rem; }
    .payslip { page-break-after: always; margin-bottom: 2rem; border: 1px solid #b7c7c2; padding: 1rem; border-radius: 8px; }
    table { width: 100%; border-collapse: collapse; margin: 0.75rem 0; }
    th, td { text-align: left; padding: 0.35rem 0.5rem; border-bottom: 1px solid #e7eeea; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>Payroll payslips — ${escapeHtml(period)}</h1>
  ${sections}
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function sha256Hex(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}
