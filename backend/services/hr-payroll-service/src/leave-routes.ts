import type { Express } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import { writeAuditEvent } from '@ngois/audit';
import { AppError, notFound } from '@ngois/errors';
import { ok, requirePermission, validateBody } from '@ngois/service-kit';
import { requireTenantId, withTenant } from '@ngois/tenant-context';

type ServiceConfig = { SERVICE_NAME: string };

const createLeaveSchema = z.object({
  employee_id: z.string().uuid(),
  leave_type_id: z.string().uuid(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days_requested: z.number().positive().max(366),
});

function calendarDaysInclusive(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00Z`);
  const b = new Date(`${end}T00:00:00Z`);
  return Math.floor((b.getTime() - a.getTime()) / 86400000) + 1;
}

export function registerLeaveRoutes(app: Express, pool: pg.Pool, config: ServiceConfig): void {
  app.get('/v1/hr/leave-types', requirePermission('hr:leave:read'), async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const rows = await withTenant(pool, tenantId, async (client) => {
        const r = await client.query(
          `SELECT id, code, name, accrual_days::text, is_paid, created_at
           FROM leave_types ORDER BY code`,
        );
        return r.rows;
      });
      ok(res, req, rows);
    } catch (err) {
      next(err);
    }
  });

  app.get('/v1/hr/leave-requests', requirePermission('hr:leave:read'), async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const rows = await withTenant(pool, tenantId, async (client) => {
        const r = await client.query(
          `SELECT lr.id, lr.employee_id, e.display_name, e.employee_number,
                  lr.leave_type_id, lt.code AS leave_type_code, lt.name AS leave_type_name,
                  lr.start_date, lr.end_date, lr.days_requested::text, lr.status,
                  lr.approver_id, lr.approved_at, lr.created_at
           FROM leave_requests lr
           JOIN employees e ON e.id = lr.employee_id
           JOIN leave_types lt ON lt.id = lr.leave_type_id
           ORDER BY lr.created_at DESC
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
    '/v1/hr/leave-requests',
    requirePermission('hr:leave:request', 'hr:leave:approve'),
    validateBody(createLeaveSchema),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const body = req.body as z.infer<typeof createLeaveSchema>;
        if (body.end_date < body.start_date) {
          throw new AppError({
            code: 'NGOIS-HR-0101',
            message: 'end_date must be on or after start_date.',
            statusCode: 422,
          });
        }
        const span = calendarDaysInclusive(body.start_date, body.end_date);
        if (body.days_requested > span) {
          throw new AppError({
            code: 'NGOIS-HR-0102',
            message: 'days_requested exceeds calendar span of the leave period.',
            statusCode: 422,
          });
        }

        const row = await withTenant(pool, tenantId, async (client) => {
          const emp = await client.query(
            `SELECT id FROM employees WHERE id = $1 AND NOT is_deleted`,
            [body.employee_id],
          );
          if (!emp.rows[0]) throw notFound('employee', body.employee_id);
          const lt = await client.query(`SELECT id FROM leave_types WHERE id = $1`, [
            body.leave_type_id,
          ]);
          if (!lt.rows[0]) throw notFound('leave_type', body.leave_type_id);

          const r = await client.query(
            `INSERT INTO leave_requests (
               tenant_id, employee_id, leave_type_id, start_date, end_date, days_requested, status
             ) VALUES ($1,$2,$3,$4,$5,$6,'pending')
             RETURNING id, employee_id, leave_type_id, start_date, end_date,
                       days_requested::text, status, created_at`,
            [
              tenantId,
              body.employee_id,
              body.leave_type_id,
              body.start_date,
              body.end_date,
              body.days_requested,
            ],
          );
          await writeAuditEvent(client, {
            tenantId,
            serviceName: config.SERVICE_NAME,
            action: 'hr.leave.requested',
            resourceType: 'leave_request',
            resourceId: r.rows[0].id,
            actorUserId: req.ctx.userId,
            actorRole: req.ctx.role,
            afterState: body,
            correlationId: req.ctx.correlationId,
          });
          return r.rows[0];
        });
        ok(res, req, row, 201);
      } catch (err) {
        next(err);
      }
    },
  );

  app.post(
    '/v1/hr/leave-requests/:id/approve',
    requirePermission('hr:leave:approve'),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const id = req.params.id!;
        const row = await withTenant(pool, tenantId, async (client) => {
          const updated = await client.query(
            `UPDATE leave_requests
             SET status = 'approved', approver_id = $2, approved_at = now()
             WHERE id = $1 AND status = 'pending'
             RETURNING id, employee_id, leave_type_id, days_requested, status, approver_id, approved_at`,
            [id, req.ctx.userId ?? null],
          );
          const leave = updated.rows[0];
          if (!leave) {
            throw new AppError({
              code: 'NGOIS-HR-0103',
              message: 'Leave request is not pending approval.',
              statusCode: 409,
            });
          }
          await client.query(
            `INSERT INTO leave_balances (tenant_id, employee_id, leave_type_id, accrued_days, taken_days)
             VALUES ($1, $2, $3, 0, $4)
             ON CONFLICT (tenant_id, employee_id, leave_type_id)
             DO UPDATE SET taken_days = leave_balances.taken_days + EXCLUDED.taken_days,
                           updated_at = now()`,
            [tenantId, leave.employee_id, leave.leave_type_id, leave.days_requested],
          );
          await writeAuditEvent(client, {
            tenantId,
            serviceName: config.SERVICE_NAME,
            action: 'hr.leave.approved',
            resourceType: 'leave_request',
            resourceId: id,
            actorUserId: req.ctx.userId,
            actorRole: req.ctx.role,
            afterState: { status: 'approved' },
            correlationId: req.ctx.correlationId,
          });
          return leave;
        });
        ok(res, req, row);
      } catch (err) {
        next(err);
      }
    },
  );

  app.post(
    '/v1/hr/leave-requests/:id/reject',
    requirePermission('hr:leave:approve'),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const id = req.params.id!;
        const row = await withTenant(pool, tenantId, async (client) => {
          const r = await client.query(
            `UPDATE leave_requests
             SET status = 'rejected', approver_id = $2, approved_at = now()
             WHERE id = $1 AND status = 'pending'
             RETURNING id, status, approver_id, approved_at`,
            [id, req.ctx.userId ?? null],
          );
          if (!r.rows[0]) {
            throw new AppError({
              code: 'NGOIS-HR-0103',
              message: 'Leave request is not pending approval.',
              statusCode: 409,
            });
          }
          await writeAuditEvent(client, {
            tenantId,
            serviceName: config.SERVICE_NAME,
            action: 'hr.leave.rejected',
            resourceType: 'leave_request',
            resourceId: id,
            actorUserId: req.ctx.userId,
            actorRole: req.ctx.role,
            afterState: { status: 'rejected' },
            correlationId: req.ctx.correlationId,
          });
          return r.rows[0];
        });
        ok(res, req, row);
      } catch (err) {
        next(err);
      }
    },
  );
}
