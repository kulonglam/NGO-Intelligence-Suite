import { z } from 'zod';
import { writeAuditEvent } from '@ngois/audit';
import { baseServiceSchema, loadConfig } from '@ngois/config';
import { createPool } from '@ngois/db';
import { KOCH_FIXTURE, suppressAggregate, type AggregateCell } from '@ngois/k-anonymity';
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
    SERVICE_NAME: z.string().default('analytics-service'),
    PORT: z.coerce.number().default(3012),
  }),
);

const pool = createPool(config.DATABASE_URL);
const { app, log } = createApp({ serviceName: config.SERVICE_NAME });

const aggregateSchema = z.object({
  cells: z
    .array(z.object({ row: z.string(), col: z.string(), count: z.number().int().min(0) }))
    .optional(),
  use_fixture: z.boolean().default(false),
});

app.get(
  '/v1/analytics/dashboard',
  requirePermission('reporting:dashboard:read'),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const payload = await withTenant(pool, tenantId, async (client) => {
        const cfg = await client.query(
          `SELECT code, title, panels FROM dashboard_configs ORDER BY code LIMIT 5`,
        );
        const snaps = await client.query(
          `SELECT DISTINCT ON (kpi_code) kpi_code, value_numeric, as_of, meta
           FROM kpi_snapshots ORDER BY kpi_code, as_of DESC`,
        );
        const asOf =
          snaps.rows[0]?.as_of ??
          cfg.rows[0]?.panels ??
          new Date().toISOString();
        return {
          as_of: typeof asOf === 'string' ? asOf : new Date(asOf).toISOString(),
          dashboards: cfg.rows,
          kpis: snaps.rows,
          note: 'Aggregates enforce k-anonymity (k=5) before donor export.',
        };
      });
      ok(res, req, payload);
    } catch (err) {
      next(err);
    }
  },
);

app.get(
  '/v1/analytics/kpis',
  requirePermission('reporting:dashboard:read'),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const rows = await withTenant(pool, tenantId, async (client) => {
        const r = await client.query(
          `SELECT kpi_code, value_numeric, as_of, meta FROM kpi_snapshots
           ORDER BY as_of DESC LIMIT 100`,
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
  '/v1/analytics/kpis/refresh',
  requirePermission('reporting:dashboard:read', 'reporting:report:generate'),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const result = await withTenant(pool, tenantId, async (client) => {
        const grants = await client.query(
          `SELECT count(*)::int AS n FROM grants WHERE deleted_at IS NULL AND status = 'active'`,
        );
        const bens = await client.query(
          `SELECT count(*)::int AS n FROM beneficiaries WHERE NOT is_deleted`,
        );
        const subs = await client.query(
          `SELECT count(*)::int AS n FROM submissions WHERE status IN ('accepted','flagged')`,
        );
        const asOf = new Date().toISOString();
        const values = [
          ['grants_active', grants.rows[0]?.n ?? 0],
          ['beneficiaries_registered', bens.rows[0]?.n ?? 0],
          ['field_submissions', subs.rows[0]?.n ?? 0],
        ] as const;
        for (const [code, value] of values) {
          await client.query(
            `INSERT INTO kpi_snapshots (tenant_id, kpi_code, value_numeric, as_of, meta)
             VALUES ($1,$2,$3,$4,'{"source":"refresh"}'::jsonb)`,
            [tenantId, code, value, asOf],
          );
        }
        await writeAuditEvent(client, {
          tenantId,
          serviceName: config.SERVICE_NAME,
          action: 'analytics.kpis.refresh',
          resourceType: 'kpi_snapshot',
          resourceId: tenantId,
          actorUserId: req.ctx.userId,
          actorRole: req.ctx.role,
          correlationId: req.ctx.correlationId,
        });
        return { as_of: asOf, refreshed: values.map(([code, value]) => ({ code, value })) };
      });
      ok(res, req, result);
    } catch (err) {
      next(err);
    }
  },
);

app.get(
  '/v1/analytics/indicators',
  requirePermission('reporting:dashboard:read'),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const rows = await withTenant(pool, tenantId, async (client) => {
        const r = await client.query(
          `SELECT indicator_code, period, value_numeric, disaggregation, as_of
           FROM indicator_values ORDER BY as_of DESC LIMIT 100`,
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
  '/v1/analytics/aggregates/preview',
  requirePermission('reporting:dashboard:read', 'beneficiary:record:export'),
  validateBody(aggregateSchema),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof aggregateSchema>;
      const cells: AggregateCell[] =
        body.use_fixture || !body.cells?.length ? KOCH_FIXTURE : body.cells;
      ok(res, req, suppressAggregate(cells));
    } catch (err) {
      next(err);
    }
  },
);

app.get(
  '/v1/analytics/compliance-score',
  requirePermission('reporting:dashboard:read'),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const score = await withTenant(pool, tenantId, async (client) => {
        const grants = await client.query(
          `SELECT count(*) FILTER (WHERE status = 'active')::int AS active,
                  count(*)::int AS total
           FROM grants WHERE deleted_at IS NULL`,
        );
        const lms = await client.query(
          `SELECT count(*) FILTER (WHERE is_mandatory AND status = 'completed')::int AS done,
                  count(*) FILTER (WHERE is_mandatory)::int AS total
           FROM lms_enrollments WHERE NOT is_deleted`,
        );
        const active = Number(grants.rows[0]?.active ?? 0);
        const gTotal = Number(grants.rows[0]?.total ?? 0) || 1;
        const lmsDone = Number(lms.rows[0]?.done ?? 0);
        const lmsTotal = Number(lms.rows[0]?.total ?? 0) || 1;
        const grantScore = Math.round((active / gTotal) * 40);
        const lmsScore = Math.round((lmsDone / lmsTotal) * 40);
        const syncScore = 20; // stub healthy sync
        const total = Math.min(100, grantScore + lmsScore + syncScore);
        return {
          score: total,
          components: {
            grants_on_track: grantScore,
            lms_mandatory: lmsScore,
            field_sync_health: syncScore,
          },
          as_of: new Date().toISOString(),
        };
      });
      ok(res, req, score);
    } catch (err) {
      next(err);
    }
  },
);

/** Drop person-count cells below k=5 (omit rather than publish). */
function sanitizeAggregateCounts(value: unknown): unknown {
  if (typeof value === 'number') {
    if (value > 0 && value < 5) return null;
    return value;
  }
  if (Array.isArray(value)) return value.map(sanitizeAggregateCounts);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const next = sanitizeAggregateCounts(v);
      if (next === null && /count|total|reached|registered|n_/i.test(k)) continue;
      out[k] = next;
    }
    return out;
  }
  return value;
}

/** Internal-ish aggregate context for AI (aggregates only). */
app.get(
  '/v1/analytics/context/for-ai',
  requirePermission('ai:insight:request', 'reporting:dashboard:read'),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const ctx = await withTenant(pool, tenantId, async (client) => {
        const grants = await client.query(
          `SELECT grant_number, title, donor_name, total_budget::float8 AS total_budget,
                  currency, status, admin_area_l2
           FROM grants WHERE deleted_at IS NULL AND status = 'active'
           ORDER BY grant_number LIMIT 20`,
        );
        const snaps = await client.query(
          `SELECT DISTINCT ON (kpi_code) kpi_code, value_numeric::float8 AS value
           FROM kpi_snapshots ORDER BY kpi_code, as_of DESC`,
        );
        const indicator = await client.query(
          `SELECT value_numeric::float8 AS value FROM indicator_values
           WHERE indicator_code = 'HH_REACHED' ORDER BY period DESC LIMIT 1`,
        );
        const fromKpi = Number(
          snaps.rows.find((s) => s.kpi_code === 'beneficiaries_registered')?.value ?? 0,
        );
        const fromIndicator = Number(indicator.rows[0]?.value ?? 0);
        const households =
          fromKpi >= 5 ? fromKpi : fromIndicator >= 5 ? fromIndicator : 0;
        const raw = {
          source_view: 'analytics_aggregates',
          classification_max: 'internal',
          grants: grants.rows.map((g) => ({
            grant_number: g.grant_number,
            title: g.title,
            donor_name: g.donor_name,
            total_budget: g.total_budget,
            currency: g.currency,
            admin2: g.admin_area_l2 ?? 'Unity',
          })),
          kpis: Object.fromEntries(snaps.rows.map((s) => [s.kpi_code, s.value])),
          households_reached: households,
        };
        return sanitizeAggregateCounts(raw) as typeof raw;
      });
      ok(res, req, ctx);
    } catch (err) {
      next(err);
    }
  },
);

app.use(errorHandler(log));
await listen(app, config.PORT, log);
