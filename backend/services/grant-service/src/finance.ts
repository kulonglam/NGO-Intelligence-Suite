import type { Express } from 'express';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { writeAuditEvent } from '@ngois/audit';
import { AppError, notFound, validationError } from '@ngois/errors';
import { ok, requirePermission, validateBody } from '@ngois/service-kit';
import { requireTenantId, withTenant } from '@ngois/tenant-context';

type ServiceConfig = { SERVICE_NAME: string };

const money = z.string().regex(/^\d+(\.\d{1,2})?$/, 'must be a decimal string');

const createBudgetSchema = z.object({
  total_budgeted: money,
  currency: z.string().length(3),
  lines: z
    .array(
      z.object({
        line_code: z.string().min(1).max(50),
        category: z.string().min(1).max(100),
        description: z.string().min(1).max(500),
        budgeted_amount: money,
        is_staff_cost: z.boolean().optional(),
      }),
    )
    .default([]),
});

const createDisbursementSchema = z.object({
  amount: money,
  currency: z.string().length(3),
  received_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payment_method: z.enum(['bank_transfer', 'mobile_money', 'cheque', 'cash']).optional(),
  bank_reference: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  tranche_number: z.number().int().positive().optional(),
});

async function grantCeiling(
  client: pg.PoolClient,
  grantId: string,
): Promise<{ ceiling: string; currency: string; status: string }> {
  const grant = await client.query<{
    total_budget: string;
    currency: string;
    status: string;
  }>(
    `SELECT total_budget::text, currency, status FROM grants WHERE id = $1 AND deleted_at IS NULL`,
    [grantId],
  );
  const g = grant.rows[0];
  if (!g) throw notFound('grant', grantId);

  const budget = await client.query<{ total_budgeted: string; currency: string }>(
    `SELECT total_budgeted::text, currency FROM grant_budgets
     WHERE grant_id = $1 AND is_current AND NOT is_deleted
     LIMIT 1`,
    [grantId],
  );
  return {
    ceiling: budget.rows[0]?.total_budgeted ?? g.total_budget,
    currency: budget.rows[0]?.currency ?? g.currency,
    status: g.status,
  };
}

async function disbursedTotal(client: pg.PoolClient, grantId: string): Promise<string> {
  const r = await client.query<{ total: string }>(
    `SELECT COALESCE(SUM(amount), 0)::text AS total
     FROM disbursements
     WHERE grant_id = $1 AND NOT is_deleted
       AND status IN ('recorded','pending_approval','approved','reconciled')`,
    [grantId],
  );
  return r.rows[0]?.total ?? '0';
}

async function assertWithinCeiling(
  client: pg.PoolClient,
  grantId: string,
  additionalAmount: string,
): Promise<{ ceiling: string; committed: string; remaining: string }> {
  const { ceiling, status } = await grantCeiling(client, grantId);
  if (status === 'closed' || status === 'cancelled') {
    throw new AppError({
      code: 'NGOIS-GRANT-0044',
      message: 'Closed or cancelled grants cannot accept disbursements.',
      statusCode: 409,
    });
  }
  const committed = await disbursedTotal(client, grantId);
  const check = await client.query<{ ok: boolean; remaining: string }>(
    `SELECT ($1::numeric + $2::numeric) <= $3::numeric AS ok,
            ($3::numeric - $1::numeric)::text AS remaining`,
    [committed, additionalAmount, ceiling],
  );
  const row = check.rows[0]!;
  if (!row.ok) {
    throw new AppError({
      code: 'NGOIS-GRANT-0021',
      message: 'Disbursement would exceed the grant budget ceiling.',
      statusCode: 422,
      detail: JSON.stringify({
        ceiling,
        committed,
        additional: additionalAmount,
        remaining: row.remaining,
      }),
    });
  }
  return { ceiling, committed, remaining: row.remaining };
}

export function registerFinanceRoutes(
  app: Express,
  pool: pg.Pool,
  config: ServiceConfig,
): void {
  app.get(
    '/v1/grant/grants/:id/summary',
    requirePermission('grant:award:read', 'grant:budget:read', 'grant:disbursement:read'),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const grantId = req.params.id!;
        const summary = await withTenant(pool, tenantId, async (client) => {
          const grant = await client.query(
            `SELECT id, grant_number, title, donor_name, currency, total_budget::text,
                    status, start_date, end_date
             FROM grants WHERE id = $1 AND deleted_at IS NULL`,
            [grantId],
          );
          if (!grant.rows[0]) throw notFound('grant', grantId);
          const ceiling = await grantCeiling(client, grantId);
          const committed = await disbursedTotal(client, grantId);
          const remaining = await client.query<{ remaining: string }>(
            `SELECT ($1::numeric - $2::numeric)::text AS remaining`,
            [ceiling.ceiling, committed],
          );
          const byStatus = await client.query<{ status: string; total: string; count: string }>(
            `SELECT status::text, COALESCE(SUM(amount),0)::text AS total, COUNT(*)::text AS count
             FROM disbursements WHERE grant_id = $1 AND NOT is_deleted
             GROUP BY status`,
            [grantId],
          );
          const budget = await client.query(
            `SELECT id, version_number, total_budgeted::text, currency, is_current, approved_at
             FROM grant_budgets WHERE grant_id = $1 AND NOT is_deleted ORDER BY version_number DESC`,
            [grantId],
          );
          return {
            grant: grant.rows[0],
            ceiling: ceiling.ceiling,
            currency: ceiling.currency,
            committed,
            remaining: remaining.rows[0]?.remaining ?? '0',
            disbursements_by_status: byStatus.rows,
            budgets: budget.rows,
          };
        });
        ok(res, req, summary);
      } catch (err) {
        next(err);
      }
    },
  );

  app.get(
    '/v1/grant/grants/:id/budgets',
    requirePermission('grant:budget:read'),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const rows = await withTenant(pool, tenantId, async (client) => {
          const budgets = await client.query(
            `SELECT id, grant_id, version_number, is_current, total_budgeted::text, currency,
                    approved_at, approved_by, created_at, version
             FROM grant_budgets
             WHERE grant_id = $1 AND NOT is_deleted
             ORDER BY version_number DESC`,
            [req.params.id],
          );
          return budgets.rows;
        });
        ok(res, req, rows);
      } catch (err) {
        next(err);
      }
    },
  );

  app.post(
    '/v1/grant/grants/:id/budgets',
    requirePermission('grant:budget:create'),
    validateBody(createBudgetSchema),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const grantId = req.params.id!;
        const body = req.body as z.infer<typeof createBudgetSchema>;
        const row = await withTenant(pool, tenantId, async (client) => {
          const exists = await client.query(`SELECT id FROM grants WHERE id = $1 AND deleted_at IS NULL`, [
            grantId,
          ]);
          if (!exists.rows[0]) throw notFound('grant', grantId);

          await client.query(
            `UPDATE grant_budgets SET is_current = false, updated_at = now()
             WHERE grant_id = $1 AND is_current AND NOT is_deleted`,
            [grantId],
          );
          const version = await client.query<{ v: string }>(
            `SELECT COALESCE(MAX(version_number), 0) + 1 AS v FROM grant_budgets WHERE grant_id = $1`,
            [grantId],
          );
          const budgetId = randomUUID();
          const inserted = await client.query(
            `INSERT INTO grant_budgets (
               id, tenant_id, grant_id, version_number, is_current, total_budgeted, currency
             ) VALUES ($1,$2,$3,$4,true,$5::numeric,$6)
             RETURNING id, grant_id, version_number, is_current, total_budgeted::text, currency, created_at`,
            [
              budgetId,
              tenantId,
              grantId,
              Number(version.rows[0]?.v ?? 1),
              body.total_budgeted,
              body.currency.toUpperCase(),
            ],
          );

          let order = 0;
          for (const line of body.lines) {
            await client.query(
              `INSERT INTO budget_lines (
                 tenant_id, grant_budget_id, line_code, category, description,
                 budgeted_amount, currency, is_staff_cost, display_order
               ) VALUES ($1,$2,$3,$4,$5,$6::numeric,$7,$8,$9)`,
              [
                tenantId,
                budgetId,
                line.line_code,
                line.category,
                line.description,
                line.budgeted_amount,
                body.currency.toUpperCase(),
                line.is_staff_cost ?? false,
                order++,
              ],
            );
          }

          await writeAuditEvent(client, {
            tenantId,
            serviceName: config.SERVICE_NAME,
            action: 'grant.budget.revised',
            resourceType: 'grant_budget',
            resourceId: budgetId,
            actorUserId: req.ctx.userId,
            actorRole: req.ctx.role,
            afterState: { grant_id: grantId, total_budgeted: body.total_budgeted },
            correlationId: req.ctx.correlationId,
          });

          return inserted.rows[0];
        });
        ok(res, req, row, 201);
      } catch (err) {
        next(err);
      }
    },
  );

  app.get(
    '/v1/grant/grants/:id/disbursements',
    requirePermission('grant:disbursement:read'),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const rows = await withTenant(pool, tenantId, async (client) => {
          const r = await client.query(
            `SELECT id, grant_id, tranche_number, amount::text, currency, received_date,
                    payment_method, bank_reference, status, notes,
                    created_by, approved_by, approved_at, created_at, updated_at, version
             FROM disbursements
             WHERE grant_id = $1 AND NOT is_deleted
             ORDER BY received_date DESC, created_at DESC`,
            [req.params.id],
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
    '/v1/grant/grants/:id/disbursements',
    requirePermission('grant:disbursement:create'),
    validateBody(createDisbursementSchema),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const grantId = req.params.id!;
        const body = req.body as z.infer<typeof createDisbursementSchema>;
        if (!req.ctx.userId) {
          throw new AppError({
            code: 'NGOIS-AUTH-0001',
            message: 'Authentication required.',
            statusCode: 401,
          });
        }

        const row = await withTenant(pool, tenantId, async (client) => {
          await assertWithinCeiling(client, grantId, body.amount);
          const id = randomUUID();
          const inserted = await client.query(
            `INSERT INTO disbursements (
               id, tenant_id, grant_id, tranche_number, amount, currency,
               received_date, payment_method, bank_reference, notes, status, created_by, updated_by
             ) VALUES (
               $1,$2,$3,$4,$5::numeric,$6,$7,$8,$9,$10,'recorded',$11,$11
             ) RETURNING id, grant_id, amount::text, currency, received_date, status,
                         created_by, approved_by, created_at, version`,
            [
              id,
              tenantId,
              grantId,
              body.tranche_number ?? null,
              body.amount,
              body.currency.toUpperCase(),
              body.received_date,
              body.payment_method ?? null,
              body.bank_reference ?? null,
              body.notes ?? null,
              req.ctx.userId,
            ],
          );

          await client.query(
            `INSERT INTO outbox (
               tenant_id, aggregate_type, aggregate_id, event_type, schema_version,
               payload, correlation_id, actor_user_id
             ) VALUES ($1,'disbursement',$2,'grant.disbursement.recorded',1,$3::jsonb,$4,$5)`,
            [
              tenantId,
              id,
              JSON.stringify({
                disbursement_id: id,
                grant_id: grantId,
                amount: body.amount,
                currency: body.currency.toUpperCase(),
                prepared_by: req.ctx.userId,
              }),
              req.ctx.correlationId,
              req.ctx.userId,
            ],
          );

          await writeAuditEvent(client, {
            tenantId,
            serviceName: config.SERVICE_NAME,
            action: 'grant.disbursement.recorded',
            resourceType: 'disbursement',
            resourceId: id,
            actorUserId: req.ctx.userId,
            actorRole: req.ctx.role,
            afterState: inserted.rows[0],
            correlationId: req.ctx.correlationId,
          });

          return inserted.rows[0];
        });
        ok(res, req, row, 201);
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
          next(
            new AppError({
              code: 'NGOIS-GRANT-0022',
              message: 'A disbursement with that bank reference already exists.',
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
    '/v1/grant/grants/:id/disbursements/:did/submit',
    requirePermission('grant:disbursement:submit'),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const row = await withTenant(pool, tenantId, async (client) => {
          const updated = await client.query(
            `UPDATE disbursements
             SET status = 'pending_approval', updated_at = now(), updated_by = $3, version = version + 1
             WHERE id = $1 AND grant_id = $2 AND NOT is_deleted AND status = 'recorded'
             RETURNING id, grant_id, amount::text, currency, status, created_by, approved_by, version`,
            [req.params.did, req.params.id, req.ctx.userId ?? null],
          );
          if (!updated.rows[0]) {
            throw new AppError({
              code: 'NGOIS-GRANT-0052',
              message: 'Disbursement cannot be submitted from its current status.',
              statusCode: 409,
            });
          }
          return updated.rows[0];
        });
        ok(res, req, row);
      } catch (err) {
        next(err);
      }
    },
  );

  app.post(
    '/v1/grant/grants/:id/disbursements/:did/approve',
    requirePermission('grant:disbursement:approve'),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const grantId = req.params.id!;
        const did = req.params.did!;
        if (!req.ctx.userId) {
          throw new AppError({
            code: 'NGOIS-AUTH-0001',
            message: 'Authentication required.',
            statusCode: 401,
          });
        }

        const row = await withTenant(pool, tenantId, async (client) => {
          const current = await client.query<{
            id: string;
            amount: string;
            created_by: string | null;
            status: string;
          }>(
            `SELECT id, amount::text, created_by::text, status::text
             FROM disbursements
             WHERE id = $1 AND grant_id = $2 AND NOT is_deleted`,
            [did, grantId],
          );
          const d = current.rows[0];
          if (!d) throw notFound('disbursement', did);
          if (d.status !== 'pending_approval' && d.status !== 'recorded') {
            throw new AppError({
              code: 'NGOIS-GRANT-0052',
              message: 'Disbursement cannot be approved from its current status.',
              statusCode: 409,
            });
          }
          if (d.created_by && d.created_by === req.ctx.userId) {
            throw new AppError({
              code: 'NGOIS-GRANT-0051',
              message: 'Maker-checker: the preparer cannot approve this disbursement.',
              statusCode: 403,
            });
          }

          // Ceiling already includes this row's amount while status is recorded/pending.
          await assertWithinCeiling(client, grantId, '0');

          const updated = await client.query(
            `UPDATE disbursements
             SET status = 'approved', approved_by = $3, approved_at = now(),
                 updated_at = now(), updated_by = $3, version = version + 1
             WHERE id = $1 AND grant_id = $2 AND NOT is_deleted
             RETURNING id, grant_id, amount::text, currency, status, created_by, approved_by, approved_at, version`,
            [did, grantId, req.ctx.userId],
          );

          await client.query(
            `INSERT INTO outbox (
               tenant_id, aggregate_type, aggregate_id, event_type, schema_version,
               payload, correlation_id, actor_user_id
             ) VALUES ($1,'disbursement',$2,'grant.disbursement.approved',1,$3::jsonb,$4,$5)`,
            [
              tenantId,
              did,
              JSON.stringify({
                disbursement_id: did,
                grant_id: grantId,
                amount: d.amount,
                approved_by: req.ctx.userId,
                prepared_by: d.created_by,
              }),
              req.ctx.correlationId,
              req.ctx.userId,
            ],
          );

          await writeAuditEvent(client, {
            tenantId,
            serviceName: config.SERVICE_NAME,
            action: 'grant.disbursement.approved',
            resourceType: 'disbursement',
            resourceId: did,
            actorUserId: req.ctx.userId,
            actorRole: req.ctx.role,
            afterState: updated.rows[0],
            correlationId: req.ctx.correlationId,
          });

          return updated.rows[0];
        });
        ok(res, req, row);
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'code' in err && err.code === '23514') {
          next(
            new AppError({
              code: 'NGOIS-GRANT-0051',
              message: 'Maker-checker: the preparer cannot approve this disbursement.',
              statusCode: 403,
            }),
          );
          return;
        }
        next(err);
      }
    },
  );
}

/** Ensure a current budget row exists matching the award total (used on grant create). */
export async function ensureInitialBudget(
  client: pg.PoolClient,
  tenantId: string,
  grantId: string,
  totalBudget: string,
  currency: string,
): Promise<void> {
  const existing = await client.query(
    `SELECT id FROM grant_budgets WHERE grant_id = $1 AND is_current AND NOT is_deleted`,
    [grantId],
  );
  if (existing.rows[0]) return;
  await client.query(
    `INSERT INTO grant_budgets (
       tenant_id, grant_id, version_number, is_current, total_budgeted, currency
     ) VALUES ($1,$2,1,true,$3::numeric,$4)`,
    [tenantId, grantId, totalBudget, currency.toUpperCase()],
  );
}
