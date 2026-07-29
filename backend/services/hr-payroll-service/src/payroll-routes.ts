import type { Express } from 'express';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { writeAuditEvent } from '@ngois/audit';
import { AppError, notFound } from '@ngois/errors';
import { computePayroll, type Allowance, type StatutoryRate, type TaxBand } from '@ngois/payroll-engine';
import { ok, requirePermission, validateBody } from '@ngois/service-kit';
import { requireTenantId, withTenant } from '@ngois/tenant-context';
import { resolvePayrollSchema, withPayrollSchema } from './payroll-schema.js';

type ServiceConfig = { SERVICE_NAME: string };

const createRunSchema = z.object({
  period_year: z.number().int().min(2020).max(2100),
  period_month: z.number().int().min(1).max(12),
});

const FX_MAX_AGE_DAYS = 7;

async function loadFxRates(client: pg.PoolClient): Promise<{ rates: Record<string, string>; stale: boolean }> {
  const r = await client.query<{
    base_currency: string;
    quote_currency: string;
    rate: string;
    rate_date: Date;
  }>(
    `SELECT base_currency, quote_currency, rate::text, rate_date
     FROM fx_rates WHERE is_official
     ORDER BY rate_date DESC`,
  );
  const rates: Record<string, string> = {};
  let stale = false;
  const today = new Date();
  for (const row of r.rows) {
    const key = `${row.base_currency}_${row.quote_currency}`;
    if (!rates[key]) {
      rates[key] = row.rate;
      const ageMs = today.getTime() - new Date(row.rate_date).getTime();
      if (ageMs > FX_MAX_AGE_DAYS * 86400000) stale = true;
    }
  }
  return { rates, stale };
}

async function loadTaxBands(client: pg.PoolClient, country: string): Promise<TaxBand[]> {
  const r = await client.query<{
    band_order: number;
    lower_bound: string;
    upper_bound: string | null;
    rate_percent: string;
    fixed_amount: string;
  }>(
    `SELECT band_order, lower_bound::text, upper_bound::text, rate_percent::text, fixed_amount::text
     FROM tax_bands
     WHERE country_code = $1 AND tax_type = 'PAYE'
       AND effective_from <= CURRENT_DATE
       AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
     ORDER BY band_order`,
    [country],
  );
  if (!r.rowCount) {
    throw new AppError({
      code: 'NGOIS-PAY-0031',
      message: `No tax bands for ${country} and current period.`,
      statusCode: 422,
    });
  }
  return r.rows;
}

async function loadStatutory(client: pg.PoolClient, country: string): Promise<StatutoryRate> {
  const r = await client.query<{
    scheme_code: string;
    employee_rate_percent: string;
    employer_rate_percent: string;
    contribution_base: string;
    deductible_before_tax: boolean;
  }>(
    `SELECT scheme_code, employee_rate_percent::text, employer_rate_percent::text,
            contribution_base, deductible_before_tax
     FROM statutory_contribution_rates
     WHERE country_code = $1
       AND effective_from <= CURRENT_DATE
       AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
     ORDER BY effective_from DESC LIMIT 1`,
    [country],
  );
  const row = r.rows[0];
  if (!row) {
    throw new AppError({
      code: 'NGOIS-PAY-0031',
      message: `No statutory rates for ${country}.`,
      statusCode: 422,
    });
  }
  return {
    scheme_code: row.scheme_code,
    employee_rate_percent: row.employee_rate_percent,
    employer_rate_percent: row.employer_rate_percent,
    contribution_base: row.contribution_base as StatutoryRate['contribution_base'],
    deductible_before_tax: row.deductible_before_tax,
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function daysWorkedInPeriod(
  hireDate: Date,
  termDate: Date | null,
  year: number,
  month: number,
): number {
  const dim = daysInMonth(year, month);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month - 1, dim);
  const from = hireDate > start ? hireDate : start;
  const to = termDate && termDate < end ? termDate : end;
  if (to < from) return 0;
  return Math.floor((to.getTime() - from.getTime()) / 86400000) + 1;
}

export function registerPayrollRoutes(
  app: Express,
  pool: pg.Pool,
  config: ServiceConfig,
): void {
  app.get('/v1/hr/payroll-runs', requirePermission('payroll:run:read'), async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const runs = await withTenant(pool, tenantId, async (client) => {
        const schema = await resolvePayrollSchema(client, tenantId);
        return withPayrollSchema(client, schema, async () => {
          const r = await client.query(
            `SELECT id, period_year, period_month, status, ruleset_hash,
                    total_gross::text, total_net::text, created_at, updated_at
             FROM payroll_runs ORDER BY period_year DESC, period_month DESC`,
          );
          return r.rows;
        });
      });
      ok(res, req, runs);
    } catch (err) {
      next(err);
    }
  });

  app.post(
    '/v1/hr/payroll-runs',
    requirePermission('payroll:run:create'),
    validateBody(createRunSchema),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const body = req.body as z.infer<typeof createRunSchema>;
        const { rates, stale } = await withTenant(pool, tenantId, async (client) => {
          const fx = await loadFxRates(client);
          if (fx.stale) {
            throw new AppError({
              code: 'NGOIS-PAY-0117',
              message: 'FX rate is stale (>7 days). Refresh rates or override with finance approval.',
              statusCode: 422,
            });
          }
          return fx;
        });

        const run = await withTenant(pool, tenantId, async (client) => {
          const schema = await resolvePayrollSchema(client, tenantId);
          const row = await withPayrollSchema(client, schema, async () => {
            const id = randomUUID();
            const r = await client.query(
              `INSERT INTO payroll_runs (
                 id, period_year, period_month, status, prepared_by, fx_rate_set
               ) VALUES ($1,$2,$3,'draft',$4,$5::jsonb)
               RETURNING id, period_year, period_month, status, fx_rate_set, created_at`,
              [id, body.period_year, body.period_month, req.ctx.userId ?? null, JSON.stringify(rates)],
            );
            return r.rows[0];
          });
          await writeAuditEvent(client, {
            tenantId,
            serviceName: config.SERVICE_NAME,
            action: 'payroll.run.created',
            resourceType: 'payroll_run',
            resourceId: row.id,
            actorUserId: req.ctx.userId,
            actorRole: req.ctx.role,
            afterState: { period_year: body.period_year, period_month: body.period_month },
            correlationId: req.ctx.correlationId,
          });
          return row;
        });
        ok(res, req, run, 201);
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
          next(
            new AppError({
              code: 'NGOIS-PAY-0042',
              message: 'A payroll run already exists for this period.',
              statusCode: 409,
            }),
          );
          return;
        }
        next(err);
      }
    },
  );

  app.post(
    '/v1/hr/payroll-runs/:id/calculate',
    requirePermission('payroll:run:calculate'),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const runId = req.params.id!;
        const result = await withTenant(pool, tenantId, async (client) => {
          const schema = await resolvePayrollSchema(client, tenantId);
          const runRow = await withPayrollSchema(client, schema, async () => {
            const r = await client.query<{
              id: string;
              period_year: number;
              period_month: number;
              status: string;
            }>(`SELECT id, period_year, period_month, status FROM payroll_runs WHERE id = $1`, [runId]);
            return r.rows[0];
          });
          if (!runRow) throw notFound('payroll_run', runId);
          if (!['draft', 'failed', 'computed'].includes(runRow.status)) {
            throw new AppError({
              code: 'NGOIS-PAY-0040',
              message: 'Run cannot be calculated in current status.',
              statusCode: 409,
            });
          }

          await withPayrollSchema(client, schema, async () => {
            await client.query(
              `UPDATE payroll_runs SET status = 'computing', updated_at = now() WHERE id = $1`,
              [runId],
            );
          });

          const employees = await client.query<{
            id: string;
            payroll_country: string;
            hire_date: Date;
            termination_date: Date | null;
            gross_salary: string;
            salary_currency: string;
            allowances: Allowance[];
          }>(
            `SELECT e.id, e.payroll_country, e.hire_date, e.termination_date,
                    c.gross_salary::text, c.salary_currency, c.allowances
             FROM employees e
             JOIN contracts c ON c.employee_id = e.id AND c.status = 'active' AND NOT c.is_deleted
             WHERE e.status IN ('active','on_leave') AND NOT e.is_deleted`,
          );

          let totalGross = 0;
          let totalDed = 0;
          let totalNet = 0;
          let totalEr = 0;
          let rulesetHash: string | null = null;

          await withPayrollSchema(client, schema, async () => {
            await client.query(`DELETE FROM payroll_record_lines WHERE payroll_record_id IN (
              SELECT id FROM payroll_records WHERE payroll_run_id = $1
            )`, [runId]);
            await client.query(`DELETE FROM payroll_records WHERE payroll_run_id = $1`, [runId]);

            for (const emp of employees.rows) {
              const country = emp.payroll_country as 'SS' | 'UG';
              const bands = await loadTaxBands(client, country);
              const statutory = await loadStatutory(client, country);
              const dim = daysInMonth(runRow.period_year, runRow.period_month);
              const worked = daysWorkedInPeriod(
                emp.hire_date,
                emp.termination_date,
                runRow.period_year,
                runRow.period_month,
              );
              const allowances = (emp.allowances ?? []) as Allowance[];
              const computed = computePayroll({
                country_code: country,
                basic_salary: emp.gross_salary,
                allowances,
                days_in_month: dim,
                days_worked: worked,
                tax_bands: bands,
                statutory,
                lst_annual: country === 'UG' ? '100000' : undefined,
                lst_deduction_months: country === 'UG' ? 4 : undefined,
              });
              rulesetHash = computed.ruleset_hash;
              const recId = randomUUID();
              await client.query(
                `INSERT INTO payroll_records (
                   id, payroll_run_id, employee_id, gross, total_deductions, net, employer_cost,
                   currency, compute_status
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'computed')`,
                [
                  recId,
                  runId,
                  emp.id,
                  computed.gross,
                  computed.total_deductions,
                  computed.net,
                  computed.employer_cost,
                  emp.salary_currency,
                ],
              );
              for (const line of computed.lines) {
                await client.query(
                  `INSERT INTO payroll_record_lines (
                     id, payroll_record_id, line_order, component_code, basis_amount,
                     rate_applied, amount, source_reference
                   ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                  [
                    randomUUID(),
                    recId,
                    line.line_order,
                    line.component_code,
                    line.basis_amount,
                    line.rate_applied,
                    line.amount,
                    line.source_reference,
                  ],
                );
              }
              totalGross += Number(computed.gross);
              totalDed += Number(computed.total_deductions);
              totalNet += Number(computed.net);
              totalEr += Number(computed.employer_cost);
            }

            await client.query(
              `UPDATE payroll_runs SET
                 status = 'computed', ruleset_hash = $2,
                 total_gross = $3, total_deductions = $4, total_net = $5, total_employer_cost = $6,
                 updated_at = now()
               WHERE id = $1`,
              [runId, rulesetHash, totalGross, totalDed, totalNet, totalEr],
            );
          });

          return { run_id: runId, employees: employees.rowCount, ruleset_hash: rulesetHash };
        });
        ok(res, req, result);
      } catch (err) {
        next(err);
      }
    },
  );

  app.post(
    '/v1/hr/payroll-runs/:id/submit',
    requirePermission('payroll:run:submit'),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const runId = req.params.id!;
        const row = await withTenant(pool, tenantId, async (client) => {
          const schema = await resolvePayrollSchema(client, tenantId);
          return withPayrollSchema(client, schema, async () => {
            const r = await client.query(
              `UPDATE payroll_runs SET status = 'pending_approval', submitted_by = $2, updated_at = now()
               WHERE id = $1 AND status = 'computed'
               RETURNING id, status, submitted_by`,
              [runId, req.ctx.userId ?? null],
            );
            return r.rows[0];
          });
        });
        if (!row) {
          throw new AppError({
            code: 'NGOIS-PAY-0041',
            message: 'Run must be computed before submit.',
            statusCode: 409,
          });
        }
        ok(res, req, row);
      } catch (err) {
        next(err);
      }
    },
  );

  app.post(
    '/v1/hr/payroll-runs/:id/approve',
    requirePermission('payroll:run:approve'),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const runId = req.params.id!;
        const row = await withTenant(pool, tenantId, async (client) => {
          const schema = await resolvePayrollSchema(client, tenantId);
          return withPayrollSchema(client, schema, async () => {
            const r = await client.query(
              `UPDATE payroll_runs SET status = 'approved', approved_by = $2, updated_at = now()
               WHERE id = $1 AND status = 'pending_approval'
               RETURNING id, status, submitted_by, approved_by`,
              [runId, req.ctx.userId ?? null],
            );
            return r.rows[0];
          });
        });
        if (!row) {
          throw new AppError({
            code: 'NGOIS-PAY-0051',
            message: 'Run not pending approval or approver equals submitter.',
            statusCode: 409,
          });
        }
        ok(res, req, row);
      } catch (err) {
        next(err);
      }
    },
  );

  app.get(
    '/v1/hr/payroll-runs/:id/records',
    requirePermission('payroll:run:read'),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const runId = req.params.id!;
        const rows = await withTenant(pool, tenantId, async (client) => {
          const schema = await resolvePayrollSchema(client, tenantId);
          return withPayrollSchema(client, schema, async () => {
            const r = await client.query(
              `SELECT pr.id, pr.employee_id, e.display_name, e.employee_number,
                      pr.gross::text, pr.total_deductions::text, pr.net::text,
                      pr.employer_cost::text, pr.currency
               FROM payroll_records pr
               JOIN employees e ON e.id = pr.employee_id
               WHERE pr.payroll_run_id = $1
               ORDER BY e.employee_number`,
              [runId],
            );
            return r.rows;
          });
        });
        ok(res, req, rows);
      } catch (err) {
        next(err);
      }
    },
  );
}
