import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { writeAuditEvent } from '@ngois/audit';
import { baseServiceSchema, loadConfig } from '@ngois/config';
import { createPool } from '@ngois/db';
import { conflict, validationError } from '@ngois/errors';
import {
  createApp,
  errorHandler,
  listen,
  ok,
  requirePermission,
  validateBody,
} from '@ngois/service-kit';
import { requireTenantId, withTenant } from '@ngois/tenant-context';
import {
  AfricasTalkingAdapter,
  LocalEmailAdapter,
  LocalSmsAdapter,
  SendGridAdapter,
  type ChannelAdapter,
} from './adapters.js';

const config = loadConfig(
  baseServiceSchema.extend({
    SERVICE_NAME: z.string().default('notification-service'),
    PORT: z.coerce.number().default(3007),
    NOTIFY_PROVIDER: z.enum(['local', 'sendgrid', 'africas_talking']).default('local'),
  }),
);

const pool = createPool(config.DATABASE_URL);
const { app, log } = createApp({ serviceName: config.SERVICE_NAME });

const evidenceDir = join(process.cwd(), 'ops', 'drills', 'evidence', 'notifications');

function emailAdapter(): ChannelAdapter {
  if (config.NOTIFY_PROVIDER === 'sendgrid') return new SendGridAdapter();
  return new LocalEmailAdapter();
}

function smsAdapter(): ChannelAdapter {
  if (config.NOTIFY_PROVIDER === 'africas_talking') return new AfricasTalkingAdapter();
  return new LocalSmsAdapter();
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
}

const templateSchema = z.object({
  code: z.string().min(2).max(80),
  channel: z.enum(['email', 'sms', 'in_app', 'webhook']),
  locale: z.string().default('en-GB'),
  subject: z.string().max(300).optional().nullable(),
  body_template: z.string().min(1),
  category: z.string().min(1).max(40),
  is_critical: z.boolean().default(false),
  allows_pii: z.boolean().default(false),
});

const sendSchema = z.object({
  template_code: z.string().min(2),
  channel: z.enum(['email', 'sms']).default('email'),
  recipient_address: z.string().min(3).max(255),
  recipient_user_id: z.string().uuid().optional(),
  vars: z.record(z.string()).default({}),
  dedupe_key: z.string().max(120).optional(),
  force_fail_email: z.boolean().default(false),
  triggered_by_event: z.string().max(100).optional(),
});

app.post(
  '/v1/notifications/templates',
  requirePermission('notification:template:admin'),
  validateBody(templateSchema),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const body = req.body as z.infer<typeof templateSchema>;
      if (body.channel === 'sms' && body.allows_pii) {
        throw validationError('SMS templates must not allow PII', 'allows_pii');
      }
      const row = await withTenant(pool, tenantId, async (client) => {
        const id = randomUUID();
        await client.query(
          `INSERT INTO notification_templates (
             id, tenant_id, code, channel, locale, subject, body_template,
             category, is_critical, allows_pii
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (tenant_id, code, channel, locale) DO UPDATE SET
             subject = EXCLUDED.subject,
             body_template = EXCLUDED.body_template,
             category = EXCLUDED.category,
             is_critical = EXCLUDED.is_critical,
             allows_pii = EXCLUDED.allows_pii,
             updated_at = now(),
             version = notification_templates.version + 1
           RETURNING id`,
          [
            id,
            tenantId,
            body.code,
            body.channel,
            body.locale,
            body.subject ?? null,
            body.body_template,
            body.category,
            body.is_critical,
            body.allows_pii,
          ],
        );
        const r = await client.query(
          `SELECT id, code, channel FROM notification_templates
           WHERE tenant_id = $1 AND code = $2 AND channel = $3 AND locale = $4`,
          [tenantId, body.code, body.channel, body.locale],
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
  '/v1/notifications/send',
  requirePermission('notification:send'),
  validateBody(sendSchema),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const body = req.body as z.infer<typeof sendSchema>;
      const result = await withTenant(pool, tenantId, async (client) => {
        const suppressed = await client.query(
          `SELECT id FROM notification_suppressions
           WHERE tenant_id = $1 AND address = $2 AND channel = $3`,
          [tenantId, body.recipient_address, body.channel],
        );
        if (suppressed.rows[0]) {
          return { status: 'suppressed', reason: 'address_suppressed' };
        }

        let channel = body.channel;
        let tmpl = await client.query(
          `SELECT * FROM notification_templates
           WHERE tenant_id = $1 AND code = $2 AND channel = $3`,
          [tenantId, body.template_code, channel],
        );
        if (!tmpl.rows[0]) {
          throw validationError('template not found', 'template_code');
        }
        if (channel === 'sms' && tmpl.rows[0].allows_pii) {
          throw validationError('SMS template illegally allows PII', 'allows_pii');
        }

        // Forbidden PII keys in SMS vars
        if (channel === 'sms') {
          for (const key of Object.keys(body.vars)) {
            if (/name|amount|salary|national|phone|address/i.test(key)) {
              throw validationError(`SMS vars must not include PII field: ${key}`, 'vars');
            }
          }
        }

        const dedupe = body.dedupe_key ?? `${body.template_code}:${body.recipient_address}:${channel}`;
        const existing = await client.query(
          `SELECT id, status FROM notification_deliveries
           WHERE tenant_id = $1 AND dedupe_key = $2`,
          [tenantId, dedupe],
        );
        if (existing.rows[0]) {
          return {
            status: 'deduped',
            delivery_id: existing.rows[0].id,
            prior_status: existing.rows[0].status,
          };
        }

        const subject = tmpl.rows[0].subject
          ? renderTemplate(tmpl.rows[0].subject, body.vars)
          : null;
        const rendered = renderTemplate(tmpl.rows[0].body_template, body.vars);
        const deliveryId = randomUUID();

        let sendResult;
        if (channel === 'email' && body.force_fail_email) {
          sendResult = {
            ok: false,
            provider_message_id: '',
            provider_response: { error: 'forced_email_failure', status: 500 },
          };
        } else if (channel === 'email') {
          sendResult = await emailAdapter().send({
            to: body.recipient_address,
            subject,
            body: rendered,
            evidenceDir,
          });
        } else {
          sendResult = await smsAdapter().send({
            to: body.recipient_address,
            body: rendered,
            evidenceDir,
          });
        }

        // Critical email failure → SMS fallback
        let fallback = null;
        if (!sendResult.ok && channel === 'email' && tmpl.rows[0].is_critical) {
          const smsTmpl = await client.query(
            `SELECT * FROM notification_templates
             WHERE tenant_id = $1 AND code = $2 AND channel = 'sms'`,
            [tenantId, body.template_code],
          );
          if (smsTmpl.rows[0]) {
            const smsBody = renderTemplate(smsTmpl.rows[0].body_template, body.vars);
            const smsResult = await smsAdapter().send({
              to: body.recipient_address,
              body: smsBody,
              evidenceDir,
            });
            const smsId = randomUUID();
            await client.query(
              `INSERT INTO notification_deliveries (
                 id, tenant_id, template_code, channel, recipient_user_id, recipient_address,
                 dedupe_key, subject, body_rendered, status, attempts, provider_message_id,
                 provider_response, triggered_by_event, correlation_id, sent_at, delivered_at
               ) VALUES ($1,$2,$3,'sms',$4,$5,$6,null,$7,$8,1,$9,$10::jsonb,$11,$12,now(),now())`,
              [
                smsId,
                tenantId,
                body.template_code,
                body.recipient_user_id ?? null,
                body.recipient_address,
                `${dedupe}:sms-fallback`,
                smsBody,
                smsResult.ok ? 'sent' : 'failed',
                smsResult.provider_message_id,
                JSON.stringify(smsResult.provider_response),
                body.triggered_by_event ?? 'fallback',
                req.ctx.correlationId,
              ],
            );
            fallback = { delivery_id: smsId, status: smsResult.ok ? 'sent' : 'failed' };
            channel = 'sms';
            sendResult = smsResult;
          }
        }

        const status = sendResult.ok ? 'sent' : 'failed';
        await client.query(
          `INSERT INTO notification_deliveries (
             id, tenant_id, template_code, channel, recipient_user_id, recipient_address,
             dedupe_key, subject, body_rendered, status, attempts, provider_message_id,
             provider_response, triggered_by_event, correlation_id,
             sent_at, failed_at, failure_reason
           ) VALUES ($1,$2,$3,$4::notification_channel,$5,$6,$7,$8,$9,$10::delivery_status,1,$11,$12::jsonb,$13,$14,$15,$16,$17)`,
          [
            deliveryId,
            tenantId,
            body.template_code,
            body.channel,
            body.recipient_user_id ?? null,
            body.recipient_address,
            dedupe,
            subject,
            rendered,
            status,
            sendResult.provider_message_id || null,
            JSON.stringify(sendResult.provider_response),
            body.triggered_by_event ?? null,
            req.ctx.correlationId,
            sendResult.ok ? new Date().toISOString() : null,
            sendResult.ok ? null : new Date().toISOString(),
            sendResult.ok ? null : JSON.stringify(sendResult.provider_response),
          ],
        );

        if (!sendResult.ok && sendResult.permanent_failure) {
          await client.query(
            `INSERT INTO notification_suppressions (tenant_id, address, channel, reason)
             VALUES ($1,$2,$3,'permanent_provider_4xx')
             ON CONFLICT DO NOTHING`,
            [tenantId, body.recipient_address, body.channel],
          );
        }

        await writeAuditEvent(client, {
          tenantId,
          serviceName: config.SERVICE_NAME,
          action: 'notification.sent',
          resourceType: 'notification_delivery',
          resourceId: deliveryId,
          actorUserId: req.ctx.userId,
          actorRole: req.ctx.role,
          afterState: { status, channel: body.channel, fallback },
          correlationId: req.ctx.correlationId,
        });

        return {
          delivery_id: deliveryId,
          status,
          channel: body.channel,
          fallback,
          circuit_open: body.force_fail_email && !sendResult.ok,
        };
      });
      ok(res, req, result, 201);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        next(conflict('duplicate notification dedupe_key'));
        return;
      }
      next(err);
    }
  },
);

app.get(
  '/v1/notifications/deliveries',
  requirePermission('notification:delivery:read'),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const rows = await withTenant(pool, tenantId, async (client) => {
        const r = await client.query(
          `SELECT id, template_code, channel, recipient_address, status, dedupe_key,
                  queued_at, sent_at, failed_at, provider_message_id
           FROM notification_deliveries
           ORDER BY queued_at DESC LIMIT 100`,
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
