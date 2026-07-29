import type { Express } from 'express';
import type pg from 'pg';
import { ok, requirePermission } from '@ngois/service-kit';
import { requireTenantId, withTenant } from '@ngois/tenant-context';

const COMMITTED_STATUSES = `('recorded','pending_approval','approved','reconciled')`;

export function registerReportRoutes(app: Express, pool: pg.Pool): void {
  app.get(
    '/v1/grant/reports/portfolio',
    requirePermission('grant:report:read', 'grant:award:read'),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const data = await withTenant(pool, tenantId, async (client) => {
          const awards = await client.query<{
            id: string;
            grant_number: string;
            title: string;
            currency: string;
            status: string;
            ceiling: string;
            committed: string;
            remaining: string;
          }>(
            `SELECT g.id, g.grant_number, g.title, g.currency, g.status::text AS status,
                    COALESCE(b.total_budgeted, g.total_budget)::text AS ceiling,
                    COALESCE(d.committed, 0)::text AS committed,
                    (COALESCE(b.total_budgeted, g.total_budget) - COALESCE(d.committed, 0))::text AS remaining
             FROM grants g
             LEFT JOIN grant_budgets b
               ON b.grant_id = g.id AND b.is_current AND NOT b.is_deleted
             LEFT JOIN LATERAL (
               SELECT SUM(amount) AS committed
               FROM disbursements x
               WHERE x.grant_id = g.id AND NOT x.is_deleted
                 AND x.status IN ${COMMITTED_STATUSES}
             ) d ON true
             WHERE g.deleted_at IS NULL
             ORDER BY g.start_date DESC`,
          );

          const totals = await client.query<{
            award_count: string;
            ceiling: string;
            committed: string;
            remaining: string;
          }>(
            `SELECT COUNT(*)::text AS award_count,
                    COALESCE(SUM(ceiling), 0)::text AS ceiling,
                    COALESCE(SUM(committed), 0)::text AS committed,
                    COALESCE(SUM(remaining), 0)::text AS remaining
             FROM (
               SELECT COALESCE(b.total_budgeted, g.total_budget) AS ceiling,
                      COALESCE(d.committed, 0) AS committed,
                      (COALESCE(b.total_budgeted, g.total_budget) - COALESCE(d.committed, 0)) AS remaining
               FROM grants g
               LEFT JOIN grant_budgets b
                 ON b.grant_id = g.id AND b.is_current AND NOT b.is_deleted
               LEFT JOIN LATERAL (
                 SELECT SUM(amount) AS committed
                 FROM disbursements x
                 WHERE x.grant_id = g.id AND NOT x.is_deleted
                   AND x.status IN ${COMMITTED_STATUSES}
               ) d ON true
               WHERE g.deleted_at IS NULL
             ) s`,
          );

          return {
            award_count: Number(totals.rows[0]?.award_count ?? 0),
            ceiling: totals.rows[0]?.ceiling ?? '0',
            committed: totals.rows[0]?.committed ?? '0',
            remaining: totals.rows[0]?.remaining ?? '0',
            awards: awards.rows,
          };
        });
        ok(res, req, data);
      } catch (err) {
        next(err);
      }
    },
  );

  app.get(
    '/v1/grant/reports/disbursements',
    requirePermission('grant:report:read', 'grant:disbursement:read'),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const from = typeof req.query.from === 'string' ? req.query.from : '1970-01-01';
        const to = typeof req.query.to === 'string' ? req.query.to : '9999-12-31';
        const data = await withTenant(pool, tenantId, async (client) => {
          const byStatus = await client.query<{
            status: string;
            count: string;
            total: string;
          }>(
            `SELECT status::text AS status,
                    COUNT(*)::text AS count,
                    COALESCE(SUM(amount), 0)::text AS total
             FROM disbursements
             WHERE NOT is_deleted
               AND received_date >= $1::date
               AND received_date <= $2::date
             GROUP BY status
             ORDER BY status`,
            [from, to],
          );
          const grand = await client.query<{ count: string; total: string }>(
            `SELECT COUNT(*)::text AS count, COALESCE(SUM(amount), 0)::text AS total
             FROM disbursements
             WHERE NOT is_deleted
               AND received_date >= $1::date
               AND received_date <= $2::date`,
            [from, to],
          );
          return {
            from,
            to,
            count: Number(grand.rows[0]?.count ?? 0),
            total: grand.rows[0]?.total ?? '0',
            by_status: byStatus.rows,
          };
        });
        ok(res, req, data);
      } catch (err) {
        next(err);
      }
    },
  );
}
