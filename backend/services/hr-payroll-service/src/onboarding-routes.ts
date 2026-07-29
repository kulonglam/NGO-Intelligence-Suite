import type { Express } from 'express';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { writeAuditEvent } from '@ngois/audit';
import { AppError, notFound } from '@ngois/errors';
import { ok, requirePermission, validateBody } from '@ngois/service-kit';
import { requireTenantId, withTenant } from '@ngois/tenant-context';

type ServiceConfig = { SERVICE_NAME: string };

const createPositionSchema = z.object({
  department_id: z.string().uuid(),
  title: z.string().min(2).max(200),
  grade: z.string().max(20).optional(),
  is_supervisory: z.boolean().default(false),
  headcount_budgeted: z.number().int().positive().optional(),
});

const startOnboardingSchema = z.object({
  employee_id: z.string().uuid(),
  template_code: z.string().min(2).max(40).default('DEFAULT'),
});

const completeTaskSchema = z.object({
  status: z.enum(['done', 'skipped']).default('done'),
});

export function registerOnboardingRoutes(
  app: Express,
  pool: pg.Pool,
  config: ServiceConfig,
): void {
  app.get('/v1/hr/positions', requirePermission('hr:employee:list'), async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const rows = await withTenant(pool, tenantId, async (client) => {
        const r = await client.query(
          `SELECT p.id, p.title, p.grade, p.is_supervisory, p.headcount_budgeted,
                  p.department_id, d.name AS department_name, p.created_at
           FROM positions p
           JOIN departments d ON d.id = p.department_id
           WHERE NOT p.is_deleted
           ORDER BY p.title`,
        );
        return r.rows;
      });
      ok(res, req, rows);
    } catch (err) {
      next(err);
    }
  });

  app.post(
    '/v1/hr/positions',
    requirePermission('hr:position:admin'),
    validateBody(createPositionSchema),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const body = req.body as z.infer<typeof createPositionSchema>;
        const row = await withTenant(pool, tenantId, async (client) => {
          const r = await client.query(
            `INSERT INTO positions (
               tenant_id, department_id, title, grade, is_supervisory, headcount_budgeted
             ) VALUES ($1,$2,$3,$4,$5,$6)
             RETURNING id, department_id, title, grade, is_supervisory, headcount_budgeted`,
            [
              tenantId,
              body.department_id,
              body.title,
              body.grade ?? null,
              body.is_supervisory,
              body.headcount_budgeted ?? null,
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

  app.get(
    '/v1/hr/employees/:id/documents',
    requirePermission('hr:employee:read'),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const employeeId = req.params.id!;
        const rows = await withTenant(pool, tenantId, async (client) => {
          const r = await client.query(
            `SELECT id, original_filename, content_type, size_bytes, purpose, created_at, checksum_sha256
             FROM file_objects
             WHERE NOT is_deleted
               AND owner_resource_type IN ('employee','contract')
               AND (
                 owner_resource_id = $1
                 OR owner_resource_id IN (
                   SELECT id FROM contracts WHERE employee_id = $1 AND NOT is_deleted
                 )
               )
             ORDER BY created_at DESC`,
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
    '/v1/hr/onboarding/start',
    requirePermission('hr:employee:update'),
    validateBody(startOnboardingSchema),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const body = req.body as z.infer<typeof startOnboardingSchema>;
        const row = await withTenant(pool, tenantId, async (client) => {
          const emp = await client.query(
            `SELECT id, status FROM employees WHERE id = $1 AND NOT is_deleted`,
            [body.employee_id],
          );
          if (!emp.rows[0]) throw notFound('employee', body.employee_id);

          let template = await client.query(
            `SELECT id, task_defs FROM onboarding_templates WHERE code = $1`,
            [body.template_code],
          );
          if (!template.rows[0]) {
            const defs = [
              { code: 'CONTRACT', title: 'Signed contract on file' },
              { code: 'ID', title: 'Identity document verified' },
              { code: 'BANK', title: 'Bank details collected' },
              { code: 'ORIENT', title: 'Orientation completed' },
            ];
            template = await client.query(
              `INSERT INTO onboarding_templates (tenant_id, code, name, task_defs)
               VALUES ($1,'DEFAULT','Default onboarding',$2::jsonb)
               ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name
               RETURNING id, task_defs`,
              [tenantId, JSON.stringify(defs)],
            );
          }

          const checklistId = randomUUID();
          await client.query(
            `INSERT INTO onboarding_checklists (id, tenant_id, employee_id, template_id, status)
             VALUES ($1,$2,$3,$4,'in_progress')
             ON CONFLICT (tenant_id, employee_id) DO NOTHING`,
            [checklistId, tenantId, body.employee_id, template.rows[0].id],
          );
          const existing = await client.query(
            `SELECT id FROM onboarding_checklists WHERE employee_id = $1`,
            [body.employee_id],
          );
          const cid = existing.rows[0].id as string;

          const taskCount = await client.query(
            `SELECT count(*)::int AS n FROM onboarding_tasks WHERE checklist_id = $1`,
            [cid],
          );
          if (taskCount.rows[0].n === 0) {
            const defs = (template.rows[0].task_defs ?? []) as Array<{
              code: string;
              title: string;
            }>;
            let order = 0;
            for (const t of defs) {
              await client.query(
                `INSERT INTO onboarding_tasks (
                   tenant_id, checklist_id, task_code, title, sort_order
                 ) VALUES ($1,$2,$3,$4,$5)`,
                [tenantId, cid, t.code, t.title, order++],
              );
            }
          }

          if (emp.rows[0].status === 'pending') {
            await client.query(
              `UPDATE employees SET status = 'pending', updated_at = now() WHERE id = $1`,
              [body.employee_id],
            );
          }

          await writeAuditEvent(client, {
            tenantId,
            serviceName: config.SERVICE_NAME,
            action: 'hr.onboarding.started',
            resourceType: 'onboarding_checklist',
            resourceId: cid,
            actorUserId: req.ctx.userId,
            actorRole: req.ctx.role,
            afterState: { employee_id: body.employee_id },
            correlationId: req.ctx.correlationId,
          });

          const tasks = await client.query(
            `SELECT id, task_code, title, status, sort_order FROM onboarding_tasks
             WHERE checklist_id = $1 ORDER BY sort_order`,
            [cid],
          );
          return { checklist_id: cid, status: 'in_progress', tasks: tasks.rows };
        });
        ok(res, req, row, 201);
      } catch (err) {
        next(err);
      }
    },
  );

  app.get(
    '/v1/hr/onboarding/:employeeId',
    requirePermission('hr:employee:read'),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const employeeId = req.params.employeeId!;
        const payload = await withTenant(pool, tenantId, async (client) => {
          const cl = await client.query(
            `SELECT id, status, completed_at, created_at FROM onboarding_checklists
             WHERE employee_id = $1`,
            [employeeId],
          );
          if (!cl.rows[0]) return null;
          const tasks = await client.query(
            `SELECT id, task_code, title, status, completed_at, sort_order
             FROM onboarding_tasks WHERE checklist_id = $1 ORDER BY sort_order`,
            [cl.rows[0].id],
          );
          return { ...cl.rows[0], tasks: tasks.rows };
        });
        if (!payload) throw notFound('onboarding', employeeId);
        ok(res, req, payload);
      } catch (err) {
        next(err);
      }
    },
  );

  app.post(
    '/v1/hr/onboarding/tasks/:taskId/complete',
    requirePermission('hr:employee:update'),
    validateBody(completeTaskSchema),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const taskId = req.params.taskId!;
        const body = req.body as z.infer<typeof completeTaskSchema>;
        const row = await withTenant(pool, tenantId, async (client) => {
          const task = await client.query(
            `UPDATE onboarding_tasks
             SET status = $2, completed_at = now(), completed_by = $3
             WHERE id = $1 AND status = 'pending'
             RETURNING id, checklist_id, task_code, status`,
            [taskId, body.status, req.ctx.userId ?? null],
          );
          if (!task.rows[0]) {
            throw new AppError({
              code: 'NGOIS-HR-0120',
              message: 'Onboarding task not pending.',
              statusCode: 409,
            });
          }
          const checklistId = task.rows[0].checklist_id as string;
          const pending = await client.query(
            `SELECT count(*)::int AS n FROM onboarding_tasks
             WHERE checklist_id = $1 AND status = 'pending'`,
            [checklistId],
          );
          if (pending.rows[0].n === 0) {
            const cl = await client.query(
              `UPDATE onboarding_checklists
               SET status = 'completed', completed_at = now(), updated_at = now()
               WHERE id = $1
               RETURNING employee_id`,
              [checklistId],
            );
            await client.query(
              `UPDATE employees SET status = 'active', updated_at = now()
               WHERE id = $1 AND status = 'pending'`,
              [cl.rows[0].employee_id],
            );
          }
          return task.rows[0];
        });
        ok(res, req, row);
      } catch (err) {
        next(err);
      }
    },
  );
}
