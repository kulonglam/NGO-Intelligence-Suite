import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { writeAuditEvent } from '@ngois/audit';
import { baseServiceSchema, loadConfig } from '@ngois/config';
import { createPool } from '@ngois/db';
import { AppError, notFound, validationError } from '@ngois/errors';
import {
  createApp,
  errorHandler,
  listen,
  ok,
  requirePermission,
  validateBody,
} from '@ngois/service-kit';
import { requireTenantId, withTenant } from '@ngois/tenant-context';
import { ensureInitialBudget, registerFinanceRoutes } from './finance.js';
import { registerCoaExpenseRoutes } from './coa-expenses.js';
import { registerReportRoutes } from './reports.js';

const config = loadConfig(
  baseServiceSchema.extend({
    SERVICE_NAME: z.string().default('grant-service'),
    PORT: z.coerce.number().default(3002),
  }),
);

const pool = createPool(config.DATABASE_URL);
const { app, log } = createApp({ serviceName: config.SERVICE_NAME });

registerFinanceRoutes(app, pool, config);
registerCoaExpenseRoutes(app, pool, config);
registerReportRoutes(app, pool);

const createGrantSchema = z.object({
  grant_number: z.string().min(3).max(64),
  title: z.string().min(3).max(300),
  donor_name: z.string().min(2).max(200),
  currency: z.string().length(3),
  total_budget: z.string().regex(/^\d+(\.\d{1,2})?$/, 'total_budget must be a decimal string'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(['draft', 'submitted', 'active']).default('draft'),
});

app.get('/v1/grant/grants', requirePermission('grant:award:list'), async (req, res, next) => {
  try {
    const tenantId = requireTenantId(req.ctx.tenantId);
    const rows = await withTenant(pool, tenantId, async (client) => {
      const r = await client.query(
        `SELECT id, grant_number, title, donor_name, currency, total_budget::text,
                status, start_date, end_date, created_at, updated_at, version
         FROM grants
         WHERE deleted_at IS NULL
         ORDER BY start_date DESC`,
      );
      return r.rows;
    });
    ok(res, req, rows, 200, {
      pagination: { limit: rows.length, has_more: false, next_cursor: null, prev_cursor: null },
    });
  } catch (err) {
    next(err);
  }
});

app.get('/v1/grant/grants/:id', requirePermission('grant:award:read'), async (req, res, next) => {
  try {
    const tenantId = requireTenantId(req.ctx.tenantId);
    const row = await withTenant(pool, tenantId, async (client) => {
      const r = await client.query(
        `SELECT id, grant_number, title, donor_name, currency, total_budget::text,
                status, start_date, end_date, created_at, updated_at, version
         FROM grants
         WHERE id = $1 AND deleted_at IS NULL`,
        [req.params.id],
      );
      return r.rows[0];
    });
    if (!row) throw notFound('grant', req.params.id);
    ok(res, req, row);
  } catch (err) {
    next(err);
  }
});

app.post(
  '/v1/grant/grants',
  requirePermission('grant:award:create'),
  validateBody(createGrantSchema),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const body = req.body as z.infer<typeof createGrantSchema>;
      if (body.end_date < body.start_date) {
        throw validationError('end_date must be on or after start_date.', 'end_date');
      }

      const row = await withTenant(pool, tenantId, async (client) => {
        const id = randomUUID();
        const correlationId = req.ctx.correlationId;
        const r = await client.query(
          `INSERT INTO grants (
             id, tenant_id, grant_number, title, donor_name, currency, total_budget,
             status, start_date, end_date
           ) VALUES ($1,$2,$3,$4,$5,$6,$7::numeric,$8,$9,$10)
           RETURNING id, grant_number, title, donor_name, currency, total_budget::text,
                     status, start_date, end_date, created_at, updated_at, version`,
          [
            id,
            tenantId,
            body.grant_number,
            body.title,
            body.donor_name,
            body.currency.toUpperCase(),
            body.total_budget,
            body.status,
            body.start_date,
            body.end_date,
          ],
        );

        await client.query(
          `INSERT INTO outbox (
             tenant_id, aggregate_type, aggregate_id, event_type, schema_version,
             payload, correlation_id, actor_user_id
           ) VALUES ($1, 'grant', $2, 'grant.created', 1, $3::jsonb, $4, $5)`,
          [
            tenantId,
            id,
            JSON.stringify({
              grant_id: id,
              grant_number: body.grant_number,
              status: body.status,
              currency: body.currency.toUpperCase(),
              total_budget: body.total_budget,
            }),
            correlationId,
            req.ctx.userId ?? null,
          ],
        );

        await writeAuditEvent(client, {
          tenantId,
          serviceName: config.SERVICE_NAME,
          action: 'grant.created',
          resourceType: 'grant',
          resourceId: id,
          resourceLabel: body.grant_number,
          actorUserId: req.ctx.userId,
          actorRole: req.ctx.role,
          afterState: {
            grant_number: body.grant_number,
            status: body.status,
            currency: body.currency.toUpperCase(),
            total_budget: body.total_budget,
          },
          correlationId,
        });

        await ensureInitialBudget(
          client,
          tenantId,
          id,
          body.total_budget,
          body.currency,
        );

        return r.rows[0];
      });

      ok(res, req, row, 201);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
        next(
          new AppError({
            code: 'NGOIS-GRANT-0002',
            message: 'A grant with that number already exists for this tenant.',
            statusCode: 409,
          }),
        );
        return;
      }
      next(err);
    }
  },
);

app.use(errorHandler(log));

await listen(app, config.PORT, log);
