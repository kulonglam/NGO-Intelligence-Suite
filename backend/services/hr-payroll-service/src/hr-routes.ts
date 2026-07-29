import type { Express } from 'express';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { writeAuditEvent } from '@ngois/audit';
import { encryptUtf8, ensureTenantDek, blindIndex, deriveIndexKey } from '@ngois/crypto';
import { AppError, notFound } from '@ngois/errors';
import { ok, requirePermission, validateBody } from '@ngois/service-kit';
import { requireTenantId, withTenant } from '@ngois/tenant-context';

type ServiceConfig = { SERVICE_NAME: string };

const createDeptSchema = z.object({
  code: z.string().min(2).max(30),
  name: z.string().min(2).max(200),
  cost_centre: z.string().max(50).optional(),
});

const createEmployeeSchema = z.object({
  employee_number: z.string().min(3).max(30),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  payroll_country: z.enum(['SS', 'UG']),
  department_id: z.string().uuid(),
  position_id: z.string().uuid().optional(),
  hire_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const allowanceSchema = z.object({
  code: z.string().min(1).max(40),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  taxable: z.boolean(),
  pensionable: z.boolean(),
});

const createContractSchema = z.object({
  employee_id: z.string().uuid(),
  contract_number: z.string().min(3).max(50),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  gross_salary: z.string().regex(/^\d+(\.\d{1,2})?$/),
  salary_currency: z.string().length(3),
  allowances: z.array(allowanceSchema).default([]),
  status: z.enum(['draft', 'active']).default('active'),
});

const fxRefreshSchema = z.object({
  rates: z
    .array(
      z.object({
        base_currency: z.string().length(3),
        quote_currency: z.string().length(3),
        rate: z.string().regex(/^\d+(\.\d{1,8})?$/),
      }),
    )
    .min(1)
    .max(20),
  rate_source: z.string().min(2).max(80).default('manual_refresh'),
  rate_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export function registerHrRoutes(app: Express, pool: pg.Pool, config: ServiceConfig): void {
  app.get('/v1/hr/departments', requirePermission('hr:employee:list'), async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const rows = await withTenant(pool, tenantId, async (client) => {
        const r = await client.query(
          `SELECT id, code, name, cost_centre, created_at FROM departments
           WHERE NOT is_deleted ORDER BY code`,
        );
        return r.rows;
      });
      ok(res, req, rows);
    } catch (err) {
      next(err);
    }
  });

  app.post(
    '/v1/hr/departments',
    requirePermission('hr:department:admin'),
    validateBody(createDeptSchema),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const body = req.body as z.infer<typeof createDeptSchema>;
        const row = await withTenant(pool, tenantId, async (client) => {
          const r = await client.query(
            `INSERT INTO departments (tenant_id, code, name, cost_centre)
             VALUES ($1, $2, $3, $4)
             RETURNING id, code, name, cost_centre, created_at`,
            [tenantId, body.code, body.name, body.cost_centre ?? null],
          );
          return r.rows[0];
        });
        ok(res, req, row, 201);
      } catch (err) {
        next(err);
      }
    },
  );

  app.get('/v1/hr/employees', requirePermission('hr:employee:list'), async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const rows = await withTenant(pool, tenantId, async (client) => {
        const r = await client.query(
          `SELECT e.id, e.employee_number, e.display_name, e.payroll_country,
                  e.status, e.hire_date, e.department_id, d.name AS department_name
           FROM employees e
           JOIN departments d ON d.id = e.department_id
           WHERE NOT e.is_deleted
           ORDER BY e.employee_number`,
        );
        return r.rows;
      });
      ok(res, req, rows);
    } catch (err) {
      next(err);
    }
  });

  app.post(
    '/v1/hr/employees',
    requirePermission('hr:employee:create'),
    validateBody(createEmployeeSchema),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const body = req.body as z.infer<typeof createEmployeeSchema>;
        const row = await withTenant(pool, tenantId, async (client) => {
          const { keyVersion, dek } = await ensureTenantDek(client, tenantId);
          const firstEnc = encryptUtf8(dek, body.first_name, keyVersion);
          const lastEnc = encryptUtf8(dek, body.last_name, keyVersion);
          const indexKey = deriveIndexKey(dek);
          const nameIndex = blindIndex(indexKey, `${body.first_name} ${body.last_name}`);
          const display = `${body.first_name} ${body.last_name}`;
          const id = randomUUID();
          const r = await client.query(
            `INSERT INTO employees (
               id, tenant_id, employee_number, first_name_encrypted, last_name_encrypted,
               display_name, name_blind_index, payroll_country, status, hire_date,
               department_id, position_id
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9,$10,$11)
             RETURNING id, employee_number, display_name, payroll_country, status, hire_date, department_id`,
            [
              id,
              tenantId,
              body.employee_number,
              Buffer.from(firstEnc.ciphertext, 'utf8'),
              Buffer.from(lastEnc.ciphertext, 'utf8'),
              display,
              nameIndex,
              body.payroll_country,
              body.hire_date,
              body.department_id,
              body.position_id ?? null,
            ],
          );
          await writeAuditEvent(client, {
            tenantId,
            serviceName: config.SERVICE_NAME,
            action: 'hr.employee.created',
            resourceType: 'employee',
            resourceId: id,
            actorUserId: req.ctx.userId,
            actorRole: req.ctx.role,
            afterState: {
              employee_number: body.employee_number,
              payroll_country: body.payroll_country,
            },
            correlationId: req.ctx.correlationId,
          });
          return r.rows[0];
        });
        ok(res, req, row, 201);
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
          next(
            new AppError({
              code: 'NGOIS-HR-0002',
              message: 'Employee number already exists for this tenant.',
              statusCode: 409,
            }),
          );
          return;
        }
        next(err);
      }
    },
  );

  app.get(
    '/v1/hr/employees/:id/contracts',
    requirePermission('hr:contract:read_salary'),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const employeeId = req.params.id!;
        const rows = await withTenant(pool, tenantId, async (client) => {
          const r = await client.query(
            `SELECT id, contract_number, contract_type, start_date, end_date,
                    gross_salary::text, salary_currency, payment_frequency, allowances, status
             FROM contracts
             WHERE employee_id = $1 AND NOT is_deleted
             ORDER BY start_date DESC`,
            [employeeId],
          );
          return r.rows;
        });
        ok(res, req, rows);
      } catch (err) {
        next(err);
      }
    },
  );

  app.post(
    '/v1/hr/contracts',
    requirePermission('hr:contract:create'),
    validateBody(createContractSchema),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const body = req.body as z.infer<typeof createContractSchema>;
        const row = await withTenant(pool, tenantId, async (client) => {
          const emp = await client.query(
            `SELECT id FROM employees WHERE id = $1 AND NOT is_deleted`,
            [body.employee_id],
          );
          if (!emp.rows[0]) throw notFound('employee', body.employee_id);

          if (body.status === 'active') {
            await client.query(
              `UPDATE contracts SET status = 'terminated', updated_at = now()
               WHERE employee_id = $1 AND status = 'active' AND NOT is_deleted`,
              [body.employee_id],
            );
          }

          const id = randomUUID();
          const r = await client.query(
            `INSERT INTO contracts (
               id, tenant_id, employee_id, contract_number, start_date, end_date,
               gross_salary, salary_currency, allowances, status
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
             RETURNING id, employee_id, contract_number, start_date, end_date,
                       gross_salary::text, salary_currency, allowances, status`,
            [
              id,
              tenantId,
              body.employee_id,
              body.contract_number,
              body.start_date,
              body.end_date ?? null,
              body.gross_salary,
              body.salary_currency.toUpperCase(),
              JSON.stringify(body.allowances),
              body.status,
            ],
          );
          await writeAuditEvent(client, {
            tenantId,
            serviceName: config.SERVICE_NAME,
            action: 'hr.contract.created',
            resourceType: 'contract',
            resourceId: id,
            actorUserId: req.ctx.userId,
            actorRole: req.ctx.role,
            afterState: {
              employee_id: body.employee_id,
              contract_number: body.contract_number,
              status: body.status,
            },
            correlationId: req.ctx.correlationId,
          });
          return r.rows[0];
        });
        ok(res, req, row, 201);
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
          next(
            new AppError({
              code: 'NGOIS-HR-0003',
              message: 'Contract number already exists or employee already has an active contract.',
              statusCode: 409,
            }),
          );
          return;
        }
        next(err);
      }
    },
  );

  app.get('/v1/hr/fx-rates', requirePermission('finance:fx_rate:read'), async (req, res, next) => {
    try {
      const client = await pool.connect();
      try {
        const r = await client.query(
          `SELECT DISTINCT ON (base_currency, quote_currency)
                  id, base_currency, quote_currency, rate::text, rate_source, rate_date, is_official, fetched_at
           FROM fx_rates
           WHERE is_official
           ORDER BY base_currency, quote_currency, rate_date DESC`,
        );
        ok(res, req, r.rows);
      } finally {
        client.release();
      }
    } catch (err) {
      next(err);
    }
  });

  app.post(
    '/v1/hr/fx-rates/refresh',
    requirePermission('finance:fx_rate:override'),
    validateBody(fxRefreshSchema),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const body = req.body as z.infer<typeof fxRefreshSchema>;
        const rateDate = body.rate_date ?? new Date().toISOString().slice(0, 10);
        const rows = await withTenant(pool, tenantId, async (client) => {
          const inserted = [];
          for (const rate of body.rates) {
            const r = await client.query(
              `INSERT INTO fx_rates (base_currency, quote_currency, rate, rate_source, rate_date, is_official)
               VALUES ($1, $2, $3, $4, $5, true)
               ON CONFLICT (base_currency, quote_currency, rate_date, rate_source)
               DO UPDATE SET rate = EXCLUDED.rate, fetched_at = now(), is_official = true
               RETURNING id, base_currency, quote_currency, rate::text, rate_source, rate_date`,
              [
                rate.base_currency.toUpperCase(),
                rate.quote_currency.toUpperCase(),
                rate.rate,
                body.rate_source,
                rateDate,
              ],
            );
            inserted.push(r.rows[0]);
          }
          await writeAuditEvent(client, {
            tenantId,
            serviceName: config.SERVICE_NAME,
            action: 'finance.fx.refreshed',
            resourceType: 'fx_rate',
            resourceId: inserted[0]?.id ?? null,
            actorUserId: req.ctx.userId,
            actorRole: req.ctx.role,
            afterState: { rate_date: rateDate, count: inserted.length },
            correlationId: req.ctx.correlationId,
          });
          return inserted;
        });
        ok(res, req, { rate_date: rateDate, rates: rows }, 201);
      } catch (err) {
        next(err);
      }
    },
  );

  app.get(
    '/v1/hr/tax-bands',
    requirePermission('payroll:statutory_rules:read'),
    async (req, res, next) => {
      try {
        const country = typeof req.query.country === 'string' ? req.query.country : 'SS';
        const client = await pool.connect();
        try {
          const r = await client.query(
            `SELECT country_code, tax_type, band_order, lower_bound::text, upper_bound::text,
                    rate_percent::text, fixed_amount::text, currency, effective_from, legal_reference
             FROM tax_bands
             WHERE country_code = $1 AND tax_type = 'PAYE'
               AND effective_from <= CURRENT_DATE
               AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
             ORDER BY band_order`,
            [country],
          );
          ok(res, req, r.rows);
        } finally {
          client.release();
        }
      } catch (err) {
        next(err);
      }
    },
  );
}
