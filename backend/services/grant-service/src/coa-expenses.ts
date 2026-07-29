import type { Express } from 'express';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { writeAuditEvent } from '@ngois/audit';
import { AppError, notFound } from '@ngois/errors';
import { ok, requirePermission, validateBody } from '@ngois/service-kit';
import { requireTenantId, withTenant } from '@ngois/tenant-context';

type ServiceConfig = { SERVICE_NAME: string };

const coaSchema = z.object({
  account_code: z.string().min(2).max(30),
  name: z.string().min(2).max(200),
  account_type: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
  parent_id: z.string().uuid().optional().nullable(),
});

const expenseSchema = z.object({
  grant_id: z.string().uuid().optional().nullable(),
  account_id: z.string().uuid(),
  expense_number: z.string().min(3).max(40),
  description: z.string().min(3).max(500),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency: z.string().length(3),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export function registerCoaExpenseRoutes(
  app: Express,
  pool: pg.Pool,
  config: ServiceConfig,
): void {
  app.get('/v1/grant/coa', requirePermission('grant:budget:read'), async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const rows = await withTenant(pool, tenantId, async (client) => {
        const r = await client.query(
          `SELECT id, account_code, name, account_type, parent_id, is_active, created_at
           FROM chart_of_accounts WHERE is_active ORDER BY account_code`,
        );
        return r.rows;
      });
      ok(res, req, rows);
    } catch (err) {
      next(err);
    }
  });

  app.post(
    '/v1/grant/coa',
    requirePermission('grant:budget:create'),
    validateBody(coaSchema),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const body = req.body as z.infer<typeof coaSchema>;
        const row = await withTenant(pool, tenantId, async (client) => {
          const r = await client.query(
            `INSERT INTO chart_of_accounts (tenant_id, account_code, name, account_type, parent_id)
             VALUES ($1,$2,$3,$4,$5)
             RETURNING id, account_code, name, account_type, parent_id, is_active`,
            [tenantId, body.account_code, body.name, body.account_type, body.parent_id ?? null],
          );
          await writeAuditEvent(client, {
            tenantId,
            serviceName: config.SERVICE_NAME,
            action: 'finance.coa.created',
            resourceType: 'chart_of_accounts',
            resourceId: r.rows[0].id,
            actorUserId: req.ctx.userId,
            actorRole: req.ctx.role,
            afterState: body,
            correlationId: req.ctx.correlationId,
          });
          return r.rows[0];
        });
        ok(res, req, row, 201);
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
          next(
            new AppError({
              code: 'NGOIS-FIN-0001',
              message: 'Account code already exists.',
              statusCode: 409,
            }),
          );
          return;
        }
        next(err);
      }
    },
  );

  app.get('/v1/grant/expenses', requirePermission('grant:disbursement:read'), async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const rows = await withTenant(pool, tenantId, async (client) => {
        const r = await client.query(
          `SELECT e.id, e.expense_number, e.description, e.amount::text, e.currency,
                  e.expense_date, e.status, e.grant_id, e.account_id,
                  c.account_code, c.name AS account_name, e.created_at
           FROM expenses e
           JOIN chart_of_accounts c ON c.id = e.account_id
           ORDER BY e.expense_date DESC
           LIMIT 100`,
        );
        return r.rows;
      });
      ok(res, req, rows);
    } catch (err) {
      next(err);
    }
  });

  app.post(
    '/v1/grant/expenses',
    requirePermission('grant:disbursement:create'),
    validateBody(expenseSchema),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const body = req.body as z.infer<typeof expenseSchema>;
        const row = await withTenant(pool, tenantId, async (client) => {
          const acct = await client.query(`SELECT id FROM chart_of_accounts WHERE id = $1`, [
            body.account_id,
          ]);
          if (!acct.rows[0]) throw notFound('account', body.account_id);
          const r = await client.query(
            `INSERT INTO expenses (
               tenant_id, grant_id, account_id, expense_number, description,
               amount, currency, expense_date, status
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft')
             RETURNING id, expense_number, amount::text, currency, status, expense_date`,
            [
              tenantId,
              body.grant_id ?? null,
              body.account_id,
              body.expense_number,
              body.description,
              body.amount,
              body.currency.toUpperCase(),
              body.expense_date,
            ],
          );
          return r.rows[0];
        });
        ok(res, req, row, 201);
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
          next(
            new AppError({
              code: 'NGOIS-FIN-0002',
              message: 'Expense number already exists.',
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
    '/v1/grant/expenses/:id/submit',
    requirePermission('grant:disbursement:submit'),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const id = req.params.id!;
        const row = await withTenant(pool, tenantId, async (client) => {
          const r = await client.query(
            `UPDATE expenses SET status = 'submitted', submitted_by = $2, updated_at = now()
             WHERE id = $1 AND status = 'draft'
             RETURNING id, status, submitted_by`,
            [id, req.ctx.userId ?? null],
          );
          if (!r.rows[0]) {
            throw new AppError({
              code: 'NGOIS-FIN-0003',
              message: 'Expense must be draft to submit.',
              statusCode: 409,
            });
          }
          return r.rows[0];
        });
        ok(res, req, row);
      } catch (err) {
        next(err);
      }
    },
  );

  app.post(
    '/v1/grant/expenses/:id/approve',
    requirePermission('grant:disbursement:approve'),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const id = req.params.id!;
        const row = await withTenant(pool, tenantId, async (client) => {
          const r = await client.query(
            `UPDATE expenses SET status = 'approved', approved_by = $2, approved_at = now(), updated_at = now()
             WHERE id = $1 AND status = 'submitted'
             RETURNING id, status, submitted_by, approved_by, amount::text, currency, account_id, description`,
            [id, req.ctx.userId ?? null],
          );
          if (!r.rows[0]) {
            throw new AppError({
              code: 'NGOIS-FIN-0004',
              message: 'Expense not pending approval or approver equals submitter.',
              statusCode: 409,
            });
          }
          const exp = r.rows[0];
          const jeId = randomUUID();
          await client.query(
            `INSERT INTO journal_entries (id, tenant_id, entry_number, entry_date, memo, source_type, source_id)
             VALUES ($1,$2,$3,CURRENT_DATE,$4,'expense',$5)`,
            [jeId, tenantId, `JE-${exp.id.slice(0, 8)}`, exp.description, id],
          );
          await client.query(
            `INSERT INTO journal_lines (tenant_id, journal_entry_id, account_id, debit, credit, line_order)
             VALUES ($1,$2,$3,$4,0,1)`,
            [tenantId, jeId, exp.account_id, exp.amount],
          );
          await writeAuditEvent(client, {
            tenantId,
            serviceName: config.SERVICE_NAME,
            action: 'finance.expense.approved',
            resourceType: 'expense',
            resourceId: id,
            actorUserId: req.ctx.userId,
            actorRole: req.ctx.role,
            afterState: { status: 'approved', journal_entry_id: jeId },
            correlationId: req.ctx.correlationId,
          });
          return { ...exp, journal_entry_id: jeId };
        });
        ok(res, req, row);
      } catch (err) {
        next(err);
      }
    },
  );

  app.get(
    '/v1/grant/reports/budget-vs-actual',
    requirePermission('grant:budget:read'),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const grantId = typeof req.query.grant_id === 'string' ? req.query.grant_id : null;
        const payload = await withTenant(pool, tenantId, async (client) => {
          const fx = await client.query(
            `SELECT max(rate_date) AS latest FROM fx_rates WHERE is_official`,
          );
          const latest = fx.rows[0]?.latest ? new Date(fx.rows[0].latest) : null;
          const ageDays = latest
            ? (Date.now() - latest.getTime()) / 86400000
            : Number.POSITIVE_INFINITY;
          const fx_stale = ageDays > 7;

          const grants = await client.query(
            `SELECT g.id, g.grant_number, g.title, g.currency, g.total_budget::text,
                    COALESCE((
                      SELECT sum(d.amount) FROM disbursements d
                      WHERE d.grant_id = g.id AND d.status IN ('approved','reconciled') AND NOT d.is_deleted
                    ),0)::text AS disbursed,
                    COALESCE((
                      SELECT sum(e.amount) FROM expenses e
                      WHERE e.grant_id = g.id AND e.status = 'approved'
                    ),0)::text AS expenses_approved
             FROM grants g
             WHERE g.deleted_at IS NULL
               AND ($1::uuid IS NULL OR g.id = $1)
             ORDER BY g.grant_number`,
            [grantId],
          );

          return {
            fx_stale,
            fx_latest_date: latest?.toISOString().slice(0, 10) ?? null,
            grants: grants.rows.map((g) => {
              const budget = Number(g.total_budget);
              const disbursed = Number(g.disbursed);
              const expenses = Number(g.expenses_approved);
              const actual = disbursed + expenses;
              return {
                ...g,
                actual: actual.toFixed(2),
                variance: (budget - actual).toFixed(2),
                utilisation_pct: budget > 0 ? ((actual / budget) * 100).toFixed(1) : '0.0',
              };
            }),
          };
        });
        ok(res, req, payload);
      } catch (err) {
        next(err);
      }
    },
  );
}
