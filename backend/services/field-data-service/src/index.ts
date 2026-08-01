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

const config = loadConfig(
  baseServiceSchema.extend({
    SERVICE_NAME: z.string().default('field-data-service'),
    PORT: z.coerce.number().default(3005),
  }),
);

const pool = createPool(config.DATABASE_URL);
const { app, log } = createApp({ serviceName: config.SERVICE_NAME });

const createFormSchema = z.object({
  code: z.string().min(2).max(40),
  title: z.string().min(2).max(200),
  fields: z
    .array(
      z.object({
        field_key: z.string().min(1).max(80),
        label: z.string().min(1).max(200),
        field_type: z.string().default('text'),
        required: z.boolean().default(false),
      }),
    )
    .default([]),
});

const batchSchema = z.object({
  submissions: z
    .array(
      z.object({
        client_uuid: z.string().uuid(),
        form_version_id: z.string().uuid(),
        captured_at: z.string().datetime({ offset: true }).or(z.string().min(10)),
        device_id: z.string().max(80).optional(),
        beneficiary_id: z.string().uuid().optional().nullable(),
        payload: z.record(z.unknown()).default({}),
      }),
    )
    .min(1)
    .max(100),
});

const resolveSchema = z.object({
  resolution: z.enum(['accept', 'reject', 'dismiss_duplicate']),
  note: z.string().max(500).optional(),
});

app.get(
  '/v1/field-data/forms/assigned',
  requirePermission('field:form:read', 'field:submission:create'),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const rows = await withTenant(pool, tenantId, async (client) => {
        const r = await client.query(
          `SELECT t.id AS form_id, t.code, t.title, v.id AS form_version_id, v.version_number,
                  v.definition, v.published_at,
                  COALESCE(
                    (SELECT json_agg(json_build_object(
                       'field_key', f.field_key, 'label', f.label,
                       'field_type', f.field_type, 'required', f.required
                     ) ORDER BY f.sort_order)
                     FROM form_fields f WHERE f.form_version_id = v.id),
                    '[]'::json
                  ) AS fields
           FROM form_templates t
           JOIN form_template_versions v ON v.form_template_id = t.id AND v.is_current
           WHERE t.status = 'published'
           ORDER BY t.code`,
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
  '/v1/field-data/forms',
  requirePermission('field:form:create'),
  validateBody(createFormSchema),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const body = req.body as z.infer<typeof createFormSchema>;
      const row = await withTenant(pool, tenantId, async (client) => {
        const t = await client.query(
          `INSERT INTO form_templates (tenant_id, code, title, status)
           VALUES ($1,$2,$3,'draft')
           RETURNING id, code, title, status`,
          [tenantId, body.code, body.title],
        );
        const formId = t.rows[0].id as string;
        const v = await client.query(
          `INSERT INTO form_template_versions (
             tenant_id, form_template_id, version_number, definition, is_current
           ) VALUES ($1,$2,1,$3::jsonb,false)
           RETURNING id, version_number`,
          [tenantId, formId, JSON.stringify({ title: body.title })],
        );
        const versionId = v.rows[0].id as string;
        let order = 0;
        for (const field of body.fields) {
          await client.query(
            `INSERT INTO form_fields (
               tenant_id, form_version_id, field_key, label, field_type, required, sort_order
             ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [
              tenantId,
              versionId,
              field.field_key,
              field.label,
              field.field_type,
              field.required,
              order++,
            ],
          );
        }
        return { ...t.rows[0], draft_version_id: versionId, version_number: 1 };
      });
      ok(res, req, row, 201);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
        next(
          new AppError({
            code: 'NGOIS-FLD-0001',
            message: 'Form code already exists.',
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
  '/v1/field-data/forms/:id/publish',
  requirePermission('field:form:publish'),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const formId = req.params.id!;
      const row = await withTenant(pool, tenantId, async (client) => {
        const form = await client.query(
          `SELECT id FROM form_templates WHERE id = $1`,
          [formId],
        );
        if (!form.rows[0]) throw notFound('form', formId);
        await client.query(
          `UPDATE form_template_versions SET is_current = false WHERE form_template_id = $1`,
          [formId],
        );
        const ver = await client.query(
          `UPDATE form_template_versions
           SET is_current = true, published_at = now()
           WHERE id = (
             SELECT id FROM form_template_versions
             WHERE form_template_id = $1
             ORDER BY version_number DESC LIMIT 1
           )
           RETURNING id, version_number, published_at`,
          [formId],
        );
        await client.query(
          `UPDATE form_templates SET status = 'published', updated_at = now() WHERE id = $1`,
          [formId],
        );
        // Assign to all tenant users for offline cache (thin tranche)
        await client.query(
          `INSERT INTO form_assignments (tenant_id, form_template_id)
           SELECT $1, $2
           WHERE NOT EXISTS (
             SELECT 1 FROM form_assignments WHERE tenant_id = $1 AND form_template_id = $2 AND user_id IS NULL
           )`,
          [tenantId, formId],
        );
        return { form_id: formId, ...ver.rows[0], status: 'published' };
      });
      ok(res, req, row);
    } catch (err) {
      next(err);
    }
  },
);

app.post(
  '/v1/field-data/submissions/batch',
  requirePermission('field:submission:create'),
  validateBody(batchSchema),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const body = req.body as z.infer<typeof batchSchema>;
      const results = await withTenant(pool, tenantId, async (client) => {
        const out: Array<Record<string, unknown>> = [];
        for (const item of body.submissions) {
          const existing = await client.query(
            `SELECT id, status, client_uuid FROM submissions
             WHERE tenant_id = $1 AND client_uuid = $2`,
            [tenantId, item.client_uuid],
          );
          if (existing.rows[0]) {
            out.push({
              client_uuid: item.client_uuid,
              status: 'idempotent_replay',
              submission_id: existing.rows[0].id,
              result: existing.rows[0].status,
            });
            continue;
          }
          const ver = await client.query(
            `SELECT id FROM form_template_versions WHERE id = $1`,
            [item.form_version_id],
          );
          if (!ver.rows[0]) {
            out.push({
              client_uuid: item.client_uuid,
              status: 'rejected',
              error: 'unknown_form_version',
            });
            continue;
          }
          const id = randomUUID();
          const captured = new Date(item.captured_at);
          const received = new Date();
          const skewMs = Math.abs(received.getTime() - captured.getTime());
          const skewFlagged = Number.isFinite(skewMs) && skewMs > 24 * 60 * 60 * 1000;
          const status = skewFlagged ? 'flagged' : 'accepted';
          await client.query(
            `INSERT INTO submissions (
               id, tenant_id, client_uuid, form_version_id, beneficiary_id,
               captured_at, received_at, device_id, status, payload, created_by,
               provenance, clock_skew_flagged
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,'digital',$12)`,
            [
              id,
              tenantId,
              item.client_uuid,
              item.form_version_id,
              item.beneficiary_id ?? null,
              item.captured_at,
              received.toISOString(),
              item.device_id ?? null,
              status,
              JSON.stringify(item.payload),
              req.ctx.userId ?? null,
              skewFlagged,
            ],
          );
          for (const [key, value] of Object.entries(item.payload)) {
            await client.query(
              `INSERT INTO submission_values (tenant_id, submission_id, field_key, value_text)
               VALUES ($1,$2,$3,$4)`,
              [tenantId, id, key, value == null ? null : String(value)],
            );
          }
          if (skewFlagged) {
            await client.query(
              `INSERT INTO submission_review_queue (tenant_id, submission_id, reason)
               VALUES ($1,$2,'clock_skew')`,
              [tenantId, id],
            );
          }
          out.push({
            client_uuid: item.client_uuid,
            status: skewFlagged ? 'flagged' : 'accepted',
            submission_id: id,
            clock_skew_flagged: skewFlagged,
          });
        }
        await writeAuditEvent(client, {
          tenantId,
          serviceName: config.SERVICE_NAME,
          action: 'field.submissions.batch',
          resourceType: 'submission_batch',
          resourceId: randomUUID(),
          actorUserId: req.ctx.userId,
          actorRole: req.ctx.role,
          afterState: { count: body.submissions.length },
          correlationId: req.ctx.correlationId,
        });
        return out;
      });
      ok(res, req, { results }, 206);
    } catch (err) {
      next(err);
    }
  },
);

app.get(
  '/v1/field-data/sync/manifest',
  requirePermission('field:submission:create', 'field:form:read'),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const since =
        typeof req.query.since === 'string' && req.query.since
          ? new Date(req.query.since)
          : new Date(0);
      if (Number.isNaN(since.getTime())) {
        throw validationError('invalid cursor timestamp', 'since');
      }
      const payload = await withTenant(pool, tenantId, async (client) => {
        const forms = await client.query(
          `SELECT t.id AS form_id, t.code, t.title, v.id AS form_version_id, v.version_number,
                  v.published_at, v.definition
           FROM form_templates t
           JOIN form_template_versions v ON v.form_template_id = t.id AND v.is_current
           WHERE t.status = 'published'
             AND COALESCE(v.published_at, t.updated_at) > $1
           ORDER BY t.code`,
          [since.toISOString()],
        );
        const assignments = await client.query(
          `SELECT id, form_template_id, user_id, programme_id, valid_until, created_at
           FROM form_assignments WHERE created_at > $1`,
          [since.toISOString()],
        );
        const cursor = new Date().toISOString();
        const session = await client.query(
          `INSERT INTO sync_sessions (tenant_id, user_id, cursor_token, status)
           VALUES ($1,$2,$3,'open') RETURNING id`,
          [tenantId, req.ctx.userId ?? null, cursor],
        );
        return {
          session_id: session.rows[0].id,
          cursor,
          forms: forms.rows,
          assignments: assignments.rows,
          revocations: [],
        };
      });
      ok(res, req, payload);
    } catch (err) {
      next(err);
    }
  },
);

app.post(
  '/v1/field-data/sync/complete',
  requirePermission('field:submission:create'),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const sessionId =
        typeof req.body?.session_id === 'string' ? req.body.session_id : null;
      const cursor =
        typeof req.body?.cursor === 'string' ? req.body.cursor : new Date().toISOString();
      await withTenant(pool, tenantId, async (client) => {
        if (sessionId) {
          await client.query(
            `UPDATE sync_sessions
             SET status = 'completed', completed_at = now(), cursor_token = $2
             WHERE id = $1`,
            [sessionId, cursor],
          );
        }
      });
      ok(res, req, { completed: true, cursor });
    } catch (err) {
      next(err);
    }
  },
);

app.get(
  '/v1/field-data/review-queue',
  requirePermission('field:submission:review', 'beneficiary:duplicate:review'),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const rows = await withTenant(pool, tenantId, async (client) => {
        const r = await client.query(
          `SELECT id, submission_id, duplicate_flag_id, reason, status, created_at
           FROM submission_review_queue WHERE status = 'open'
           ORDER BY created_at ASC LIMIT 100`,
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
  '/v1/field-data/review-queue/:id/resolve',
  requirePermission('field:submission:review', 'beneficiary:duplicate:review'),
  validateBody(resolveSchema),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const id = req.params.id!;
      const body = req.body as z.infer<typeof resolveSchema>;
      const row = await withTenant(pool, tenantId, async (client) => {
        const r = await client.query(
          `UPDATE submission_review_queue
           SET status = 'resolved', resolution = $2, resolved_by = $3, resolved_at = now()
           WHERE id = $1 AND status = 'open'
           RETURNING id, status, resolution, duplicate_flag_id, submission_id`,
          [id, body.resolution, req.ctx.userId ?? null],
        );
        if (!r.rows[0]) {
          throw new AppError({
            code: 'NGOIS-FLD-0002',
            message: 'Review item not open.',
            statusCode: 409,
          });
        }
        if (r.rows[0].duplicate_flag_id && body.resolution === 'dismiss_duplicate') {
          await client.query(
            `UPDATE beneficiary_duplicate_flags SET status = 'dismissed', resolved_at = now()
             WHERE id = $1`,
            [r.rows[0].duplicate_flag_id],
          );
        }
        // Never auto-merge even if resolution were 'merge' — not offered.
        return r.rows[0];
      });
      ok(res, req, row);
    } catch (err) {
      next(err);
    }
  },
);

const registerDeviceSchema = z.object({
  device_id: z.string().min(8).max(80),
  label: z.string().max(120).optional(),
});

const paperBatchSchema = z.object({
  form_version_id: z.string().uuid(),
  label: z.string().min(2).max(200),
});

const paperRowsSchema = z.object({
  rows: z
    .array(
      z.object({
        paper_serial: z.string().min(2).max(80),
        payload: z.record(z.unknown()).default({}),
        beneficiary_id: z.string().uuid().optional().nullable(),
      }),
    )
    .min(1)
    .max(500),
});

app.post(
  '/v1/field-data/devices/register',
  requirePermission('field:device:register'),
  validateBody(registerDeviceSchema),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const body = req.body as z.infer<typeof registerDeviceSchema>;
      const row = await withTenant(pool, tenantId, async (client) => {
        const id = randomUUID();
        await client.query(
          `INSERT INTO field_devices (id, tenant_id, device_id, user_id, label, status, last_seen_at)
           VALUES ($1,$2,$3,$4,$5,'active',now())
           ON CONFLICT (tenant_id, device_id) DO UPDATE SET
             user_id = EXCLUDED.user_id,
             label = COALESCE(EXCLUDED.label, field_devices.label),
             last_seen_at = now(),
             status = CASE WHEN field_devices.status = 'wiped' THEN 'active' ELSE field_devices.status END
           RETURNING id`,
          [id, tenantId, body.device_id, req.ctx.userId ?? null, body.label ?? null],
        );
        const r = await client.query(
          `SELECT id, device_id, status, last_seen_at FROM field_devices
           WHERE tenant_id = $1 AND device_id = $2`,
          [tenantId, body.device_id],
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
  '/v1/field-data/devices/:id/wipe',
  requirePermission('field:device:wipe'),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const deviceKey = req.params.id!;
      const row = await withTenant(pool, tenantId, async (client) => {
        const r = await client.query(
          `UPDATE field_devices
           SET status = 'wipe_pending', wipe_requested_at = now()
           WHERE tenant_id = $1 AND (id::text = $2 OR device_id = $2)
           RETURNING id, device_id, status, wipe_requested_at`,
          [tenantId, deviceKey],
        );
        if (!r.rows[0]) throw notFound('device');
        return r.rows[0];
      });
      ok(res, req, row);
    } catch (err) {
      next(err);
    }
  },
);

app.get(
  '/v1/field-data/devices/me',
  requirePermission('field:device:read', 'field:device:register'),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const deviceId =
        typeof req.query.device_id === 'string' ? req.query.device_id : null;
      if (!deviceId) throw validationError('device_id query required', 'device_id');
      const row = await withTenant(pool, tenantId, async (client) => {
        await client.query(
          `UPDATE field_devices SET last_seen_at = now()
           WHERE tenant_id = $1 AND device_id = $2`,
          [tenantId, deviceId],
        );
        const r = await client.query(
          `SELECT id, device_id, status, wipe_requested_at, wiped_at, last_seen_at
           FROM field_devices WHERE tenant_id = $1 AND device_id = $2`,
          [tenantId, deviceId],
        );
        const device = r.rows[0];
        if (!device) return { registered: false, wipe: false };
        return {
          registered: true,
          ...device,
          wipe: device.status === 'wipe_pending',
        };
      });
      ok(res, req, row);
    } catch (err) {
      next(err);
    }
  },
);

app.post(
  '/v1/field-data/devices/me/wipe-ack',
  requirePermission('field:device:register', 'field:device:read'),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const deviceId =
        typeof req.body?.device_id === 'string' ? req.body.device_id : null;
      if (!deviceId) throw validationError('device_id required', 'device_id');
      const row = await withTenant(pool, tenantId, async (client) => {
        const r = await client.query(
          `UPDATE field_devices
           SET status = 'wiped', wiped_at = now()
           WHERE tenant_id = $1 AND device_id = $2 AND status = 'wipe_pending'
           RETURNING id, device_id, status, wiped_at`,
          [tenantId, deviceId],
        );
        return r.rows[0] ?? { acknowledged: false };
      });
      ok(res, req, row);
    } catch (err) {
      next(err);
    }
  },
);

app.post(
  '/v1/field-data/paper/batches',
  requirePermission('field:submission:create'),
  validateBody(paperBatchSchema),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const body = req.body as z.infer<typeof paperBatchSchema>;
      const row = await withTenant(pool, tenantId, async (client) => {
        const id = randomUUID();
        await client.query(
          `INSERT INTO paper_bulk_batches (id, tenant_id, form_version_id, label, created_by)
           VALUES ($1,$2,$3,$4,$5)`,
          [id, tenantId, body.form_version_id, body.label, req.ctx.userId ?? null],
        );
        return { id, status: 'open' };
      });
      ok(res, req, row, 201);
    } catch (err) {
      next(err);
    }
  },
);

app.post(
  '/v1/field-data/paper/batches/:id/rows',
  requirePermission('field:submission:create'),
  validateBody(paperRowsSchema),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const batchId = req.params.id!;
      const body = req.body as z.infer<typeof paperRowsSchema>;
      const result = await withTenant(pool, tenantId, async (client) => {
        const batch = await client.query(
          `SELECT id, status FROM paper_bulk_batches WHERE id = $1`,
          [batchId],
        );
        if (!batch.rows[0]) throw notFound('paper batch');
        if (batch.rows[0].status !== 'open') {
          throw validationError('batch not open', 'batch_id');
        }
        let inserted = 0;
        for (const row of body.rows) {
          await client.query(
            `INSERT INTO paper_bulk_rows (tenant_id, batch_id, paper_serial, payload, beneficiary_id)
             VALUES ($1,$2,$3,$4::jsonb,$5)
             ON CONFLICT (tenant_id, paper_serial) DO NOTHING`,
            [
              tenantId,
              batchId,
              row.paper_serial,
              JSON.stringify(row.payload),
              row.beneficiary_id ?? null,
            ],
          );
          inserted += 1;
        }
        return { inserted };
      });
      ok(res, req, result, 201);
    } catch (err) {
      next(err);
    }
  },
);

app.post(
  '/v1/field-data/paper/batches/:id/commit',
  requirePermission('field:submission:create'),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const batchId = req.params.id!;
      const result = await withTenant(pool, tenantId, async (client) => {
        const batch = await client.query(
          `SELECT * FROM paper_bulk_batches WHERE id = $1`,
          [batchId],
        );
        if (!batch.rows[0]) throw notFound('paper batch');
        if (batch.rows[0].status !== 'open') {
          throw validationError('batch already committed', 'batch_id');
        }
        const rows = await client.query(
          `SELECT * FROM paper_bulk_rows WHERE batch_id = $1 AND submission_id IS NULL`,
          [batchId],
        );
        const submissionIds: string[] = [];
        for (const row of rows.rows) {
          const submissionId = randomUUID();
          const clientUuid = randomUUID();
          await client.query(
            `INSERT INTO submissions (
               id, tenant_id, client_uuid, form_version_id, beneficiary_id,
               captured_at, device_id, status, payload, created_by, provenance
             ) VALUES ($1,$2,$3,$4,$5,now(),null,'accepted',$6::jsonb,$7,'paper')`,
            [
              submissionId,
              tenantId,
              clientUuid,
              batch.rows[0].form_version_id,
              row.beneficiary_id,
              JSON.stringify(row.payload),
              req.ctx.userId ?? null,
            ],
          );
          await client.query(
            `UPDATE paper_bulk_rows SET submission_id = $2 WHERE id = $1`,
            [row.id, submissionId],
          );
          submissionIds.push(submissionId);
        }
        await client.query(
          `UPDATE paper_bulk_batches
           SET status = 'committed', committed_at = now() WHERE id = $1`,
          [batchId],
        );
        return {
          batch_id: batchId,
          submissions_created: submissionIds.length,
          submission_ids: submissionIds,
          provenance: 'paper',
        };
      });
      ok(res, req, result);
    } catch (err) {
      next(err);
    }
  },
);

app.get(
  '/v1/field-data/submissions',
  requirePermission('field:submission:read', 'field:submission:create'),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const provenance =
        typeof req.query.provenance === 'string' ? req.query.provenance : null;
      const rows = await withTenant(pool, tenantId, async (client) => {
        const r = await client.query(
          `SELECT id, client_uuid, form_version_id, status, provenance, clock_skew_flagged, captured_at, received_at
           FROM submissions
           WHERE ($1::text IS NULL OR provenance = $1)
           ORDER BY received_at DESC LIMIT 100`,
          [provenance],
        );
        return r.rows;
      });
      ok(res, req, rows);
    } catch (err) {
      next(err);
    }
  },
);

app.use(errorHandler(log));
await listen(app, config.PORT, log);
