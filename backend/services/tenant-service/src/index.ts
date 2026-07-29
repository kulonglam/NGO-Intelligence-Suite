import { z } from 'zod';
import { baseServiceSchema, loadConfig } from '@ngois/config';
import { createPool } from '@ngois/db';
import { notFound, conflict } from '@ngois/errors';
import {
  createApp,
  errorHandler,
  listen,
  ok,
  requirePermission,
  validateBody,
} from '@ngois/service-kit';

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

app.get('/v1/tenant/tenants', requirePermission('tenant:settings:read'), async (req, res, next) => {
  try {
    // Tenant-scoped list: callers see their own tenant. Platform-wide listing needs break-glass.
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
      // tenant:provision is break-glass only in Appendix C; standing JWT will not include it.
      const body = req.body as z.infer<typeof createSchema>;
      try {
        const result = await pool.query(
          `INSERT INTO tenants (slug, name, status, primary_country)
           VALUES ($1, $2, 'provisioning', $3)
           RETURNING id, slug, name, status, primary_country, created_at, updated_at`,
          [body.slug, body.name, body.primary_country.toUpperCase()],
        );
        ok(res, req, result.rows[0], 201);
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

app.use(errorHandler(log));

await listen(app, config.PORT, log);
