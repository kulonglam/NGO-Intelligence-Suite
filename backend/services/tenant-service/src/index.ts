import { z } from 'zod';
import { writeAuditEvent } from '@ngois/audit';
import { baseServiceSchema, loadConfig } from '@ngois/config';
import { createPool } from '@ngois/db';
import { AppError, notFound, conflict } from '@ngois/errors';
import {
  createApp,
  errorHandler,
  listen,
  ok,
  requirePermission,
  validateBody,
} from '@ngois/service-kit';
import { requireTenantId, withTenant } from '@ngois/tenant-context';

const config = loadConfig(
  baseServiceSchema.extend({
    SERVICE_NAME: z.string().default('tenant-service'),
    PORT: z.coerce.number().default(3014),
  }),
);

const pool = createPool(config.DATABASE_URL);
const { app, log } = createApp({ serviceName: config.SERVICE_NAME });

const createSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase alphanumeric with hyphens'),
  name: z.string().min(2).max(200),
  primary_country: z.string().length(2),
});

const erasureSchema = z.object({
  subject_type: z.enum(['employee', 'user', 'beneficiary']),
  subject_id: z.string().uuid(),
  verification_method: z.string().min(2).max(80).optional(),
  reason: z.string().max(2000).optional(),
});

const dsarSchema = z.object({
  subject_type: z.enum(['employee', 'user', 'beneficiary']),
  subject_id: z.string().uuid(),
});

app.get('/v1/tenant/tenants', requirePermission('tenant:settings:read'), async (req, res, next) => {
  try {
    const tenantId = req.ctx.tenantId;
    const result = tenantId
      ? await pool.query(
          `SELECT id, slug, name, status, primary_country, created_at, updated_at
           FROM tenants WHERE id = $1 AND deleted_at IS NULL`,
          [tenantId],
        )
      : await pool.query(
          `SELECT id, slug, name, status, primary_country, created_at, updated_at
           FROM tenants WHERE deleted_at IS NULL ORDER BY name`,
        );
    ok(res, req, result.rows);
  } catch (err) {
    next(err);
  }
});

app.get('/v1/tenant/tenants/:id', requirePermission('tenant:settings:read'), async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, slug, name, status, primary_country, created_at, updated_at
       FROM tenants WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id],
    );
    const row = result.rows[0];
    if (!row) throw notFound('tenant', req.params.id);
    if (req.ctx.role !== 'super_admin' && req.ctx.tenantId !== row.id) {
      throw notFound('tenant', req.params.id);
    }
    ok(res, req, row);
  } catch (err) {
    next(err);
  }
});

app.post(
  '/v1/tenant/tenants',
  requirePermission('tenant:provision'),
  validateBody(createSchema),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof createSchema>;
      try {
        const result = await pool.query(
          `INSERT INTO tenants (slug, name, status, primary_country)
           VALUES ($1, $2, 'provisioning', $3)
           RETURNING id, slug, name, status, primary_country, created_at, updated_at`,
          [body.slug, body.name, body.primary_country.toUpperCase()],
        );
        const tenant = result.rows[0];
        await pool.query(`INSERT INTO tenant_quotas (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING`, [
          tenant.id,
        ]);
        ok(res, req, tenant, 201);
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
          throw conflict('A tenant with that slug already exists.', 'NGOIS-TEN-0002');
        }
        throw err;
      }
    } catch (err) {
      next(err);
    }
  },
);

app.get('/v1/tenant/quotas', requirePermission('tenant:quota:read'), async (req, res, next) => {
  try {
    const tenantId = requireTenantId(req.ctx.tenantId);
    const row = await withTenant(pool, tenantId, async (client) => {
      await client.query(
        `INSERT INTO tenant_quotas (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING`,
        [tenantId],
      );
      const r = await client.query(
        `SELECT tenant_id, api_rpm, api_rpm_per_user, concurrent_reports,
                report_minutes_per_day, bulk_export_rows_day, object_storage_gb, updated_at
         FROM tenant_quotas WHERE tenant_id = $1`,
        [tenantId],
      );
      return r.rows[0];
    });
    ok(res, req, row);
  } catch (err) {
    next(err);
  }
});

app.post(
  '/v1/tenant/erasure-requests',
  requirePermission('beneficiary:erasure:request', 'hr:employee:terminate'),
  validateBody(erasureSchema),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const body = req.body as z.infer<typeof erasureSchema>;
      const row = await withTenant(pool, tenantId, async (client) => {
        const r = await client.query(
          `INSERT INTO erasure_requests (
             tenant_id, subject_type, subject_id, verification_method, recorded_by, reason
           ) VALUES ($1,$2,$3,$4,$5,$6)
           RETURNING id, subject_type, subject_id, status, created_at`,
          [
            tenantId,
            body.subject_type,
            body.subject_id,
            body.verification_method ?? 'staff_attestation',
            req.ctx.userId ?? null,
            body.reason ?? null,
          ],
        );
        return r.rows[0];
      });
      ok(res, req, row, 201);
    } catch (err) {
      next(err);
    }
  },
);

app.post(
  '/v1/tenant/erasure-requests/:id/approve',
  requirePermission('beneficiary:erasure:approve', 'tenant:settings:update'),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const id = req.params.id!;
      const row = await withTenant(pool, tenantId, async (client) => {
        const r = await client.query(
          `UPDATE erasure_requests
           SET status = 'approved', approved_by = $2, assessed_by = $2, updated_at = now()
           WHERE id = $1 AND status = 'pending_assessment'
           RETURNING id, status, recorded_by, approved_by`,
          [id, req.ctx.userId ?? null],
        );
        if (!r.rows[0]) {
          throw new AppError({
            code: 'NGOIS-PRIV-0001',
            message: 'Erasure request not pending or approver equals recorder.',
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
  '/v1/tenant/erasure-requests/:id/execute',
  requirePermission('beneficiary:erasure:approve', 'tenant:settings:update'),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const id = req.params.id!;
      const row = await withTenant(pool, tenantId, async (client) => {
        const reqRow = await client.query(
          `SELECT * FROM erasure_requests WHERE id = $1 AND status = 'approved'`,
          [id],
        );
        const erasure = reqRow.rows[0];
        if (!erasure) {
          throw new AppError({
            code: 'NGOIS-PRIV-0002',
            message: 'Erasure must be approved before execute.',
            statusCode: 409,
          });
        }

        if (erasure.subject_type === 'employee') {
          await client.query(
            `UPDATE employees SET
               display_name = 'REDACTED',
               name_blind_index = 'erased',
               first_name_encrypted = decode('00','hex'),
               last_name_encrypted = decode('00','hex'),
               is_deleted = true,
               status = 'terminated',
               updated_at = now()
             WHERE id = $1`,
            [erasure.subject_id],
          );
          await client.query(
            `INSERT INTO erasure_log (tenant_id, erasure_request_id, resource_type, resource_id, action, detail)
             VALUES ($1,$2,'employee',$3,'tombstone','{"fields":["display_name","names"]}'::jsonb)`,
            [tenantId, id, erasure.subject_id],
          );
        }

        await client.query(
          `UPDATE erasure_requests
           SET status = 'executed', executed_by = $2, executed_at = now(), updated_at = now()
           WHERE id = $1`,
          [id, req.ctx.userId ?? null],
        );
        await writeAuditEvent(client, {
          tenantId,
          serviceName: config.SERVICE_NAME,
          action: 'compliance.erasure.executed',
          resourceType: 'erasure_request',
          resourceId: id,
          actorUserId: req.ctx.userId,
          actorRole: req.ctx.role,
          afterState: {
            subject_type: erasure.subject_type,
            subject_id: erasure.subject_id,
          },
          correlationId: req.ctx.correlationId,
        });
        return { id, status: 'executed', subject_id: erasure.subject_id };
      });
      ok(res, req, row);
    } catch (err) {
      next(err);
    }
  },
);

app.post(
  '/v1/tenant/dsar-requests',
  requirePermission('hr:employee:export', 'tenant:settings:read'),
  validateBody(dsarSchema),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const body = req.body as z.infer<typeof dsarSchema>;
      const row = await withTenant(pool, tenantId, async (client) => {
        let packageData: Record<string, unknown> = { subject_type: body.subject_type };
        if (body.subject_type === 'employee') {
          const emp = await client.query(
            `SELECT id, employee_number, display_name, payroll_country, status, hire_date
             FROM employees WHERE id = $1`,
            [body.subject_id],
          );
          const leave = await client.query(
            `SELECT start_date, end_date, days_requested::text, status
             FROM leave_requests WHERE employee_id = $1`,
            [body.subject_id],
          );
          packageData = {
            ...packageData,
            employee: emp.rows[0] ?? null,
            leave_requests: leave.rows,
          };
        }
        const r = await client.query(
          `INSERT INTO dsar_requests (
             tenant_id, subject_type, subject_id, status, package_path, requested_by, completed_at
           ) VALUES ($1,$2,$3,'ready',$4,$5,now())
           RETURNING id, status, completed_at`,
          [
            tenantId,
            body.subject_type,
            body.subject_id,
            JSON.stringify(packageData),
            req.ctx.userId ?? null,
          ],
        );
        return { ...r.rows[0], package: packageData };
      });
      ok(res, req, row, 201);
    } catch (err) {
      next(err);
    }
  },
);

app.use(errorHandler(log));

await listen(app, config.PORT, log);
