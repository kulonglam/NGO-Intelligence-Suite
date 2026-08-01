import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import { z } from 'zod';
import { writeAuditEvent } from '@ngois/audit';
import type pg from 'pg';
import { AppError, notFound, validationError } from '@ngois/errors';
import { ok, requirePermission, validateBody } from '@ngois/service-kit';
import { requireTenantId, withTenant } from '@ngois/tenant-context';
import {
  buildWebhookEnvelope,
  newWebhookSecret,
  signBody,
  validateWebhookUrl,
} from '@ngois/webhook-egress';

const createSchema = z.object({
  endpoint_url: z.string().url().max(2000),
  event_types: z.array(z.string().min(1).max(120)).min(1).max(50).default(['*']),
});

const patchSchema = z.object({
  status: z.enum(['active', 'suspended', 'disabled']).optional(),
  endpoint_url: z.string().url().max(2000).optional(),
  event_types: z.array(z.string().min(1).max(120)).min(1).max(50).optional(),
});

function allowPrivateEgress(): boolean {
  return (
    process.env.ALLOW_PRIVATE_WEBHOOK_EGRESS === '1' ||
    process.env.NODE_ENV === 'development' ||
    process.env.NODE_ENV === 'test'
  );
}

async function deliverOnce(
  endpoint: string,
  secret: string,
  envelope: Record<string, unknown>,
): Promise<{ http_status: number; latency_ms: number; excerpt: string }> {
  const body = JSON.stringify(envelope);
  const sig = signBody(secret, body);
  const t0 = Date.now();
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-NGOIS-Signature': sig,
      'User-Agent': 'ngois-webhook/1.0',
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text().catch(() => '');
  return {
    http_status: res.status,
    latency_ms: Date.now() - t0,
    excerpt: text.slice(0, 200),
  };
}

export function mountWebhookRoutes(
  app: Express,
  pool: pg.Pool,
  serviceName: string,
): void {
  app.get(
    '/v1/tenant/webhooks',
    requirePermission('webhook:subscription:manage', 'webhook:delivery:read'),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const rows = await withTenant(pool, tenantId, async (client) => {
          const r = await client.query(
            `SELECT id, endpoint_url, event_types, status, created_at, updated_at, suspended_at, last_error
             FROM webhook_subscriptions ORDER BY created_at DESC`,
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
    '/v1/tenant/webhooks',
    requirePermission('webhook:subscription:manage'),
    validateBody(createSchema),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const body = req.body as z.infer<typeof createSchema>;
        const urlCheck = await validateWebhookUrl(body.endpoint_url, {
          allowPrivate: allowPrivateEgress(),
        });
        if (!urlCheck.ok) {
          throw validationError(`Webhook URL rejected: ${urlCheck.reason}`);
        }
        const secret = newWebhookSecret();
        const row = await withTenant(pool, tenantId, async (client) => {
          const id = randomUUID();
          await client.query(
            `INSERT INTO webhook_subscriptions (
               id, tenant_id, endpoint_url, secret_enc, event_types, status, created_by
             ) VALUES ($1,$2,$3,$4,$5,'active',$6)`,
            [id, tenantId, urlCheck.href, secret, body.event_types, req.ctx.userId ?? null],
          );
          await writeAuditEvent(client, {
            tenantId,
            serviceName,
            action: 'webhook.subscription.created',
            resourceType: 'webhook_subscription',
            resourceId: id,
            actorUserId: req.ctx.userId,
            actorRole: req.ctx.role,
            afterState: { endpoint_url: urlCheck.href, event_types: body.event_types },
            correlationId: req.ctx.correlationId,
          });
          return {
            id,
            endpoint_url: urlCheck.href,
            event_types: body.event_types,
            status: 'active',
            secret, // shown once
          };
        });
        ok(res, req, row, 201);
      } catch (err) {
        next(err);
      }
    },
  );

  app.patch(
    '/v1/tenant/webhooks/:id',
    requirePermission('webhook:subscription:manage'),
    validateBody(patchSchema),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const id = req.params.id;
        const body = req.body as z.infer<typeof patchSchema>;
        if (body.endpoint_url) {
          const urlCheck = await validateWebhookUrl(body.endpoint_url, {
            allowPrivate: allowPrivateEgress(),
          });
          if (!urlCheck.ok) {
            throw validationError(`Webhook URL rejected: ${urlCheck.reason}`);
          }
          body.endpoint_url = urlCheck.href;
        }
        const row = await withTenant(pool, tenantId, async (client) => {
          const cur = await client.query(
            `SELECT id FROM webhook_subscriptions WHERE id = $1`,
            [id],
          );
          if (!cur.rowCount) throw notFound('Webhook subscription');
          const r = await client.query(
            `UPDATE webhook_subscriptions SET
               status = COALESCE($2, status),
               endpoint_url = COALESCE($3, endpoint_url),
               event_types = COALESCE($4, event_types),
               updated_at = now(),
               suspended_at = CASE WHEN $2 = 'suspended' THEN now() ELSE suspended_at END,
               last_error = CASE WHEN $2 = 'active' THEN NULL ELSE last_error END
             WHERE id = $1
             RETURNING id, endpoint_url, event_types, status, updated_at, suspended_at`,
            [id, body.status ?? null, body.endpoint_url ?? null, body.event_types ?? null],
          );
          await writeAuditEvent(client, {
            tenantId,
            serviceName,
            action: 'webhook.subscription.updated',
            resourceType: 'webhook_subscription',
            resourceId: id,
            actorUserId: req.ctx.userId,
            actorRole: req.ctx.role,
            afterState: body,
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

  app.get(
    '/v1/tenant/webhooks/:id/deliveries',
    requirePermission('webhook:delivery:read', 'webhook:subscription:manage'),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const id = req.params.id;
        const rows = await withTenant(pool, tenantId, async (client) => {
          const r = await client.query(
            `SELECT id, event_id, event_type, attempt, status, http_status, latency_ms,
                    response_excerpt, created_at, completed_at
             FROM webhook_deliveries
             WHERE subscription_id = $1
             ORDER BY created_at DESC LIMIT 100`,
            [id],
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
    '/v1/tenant/webhooks/:id/test',
    requirePermission('webhook:subscription:manage'),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const id = req.params.id;
        const result = await withTenant(pool, tenantId, async (client) => {
          const sub = await client.query(
            `SELECT id, endpoint_url, secret_enc, status FROM webhook_subscriptions WHERE id = $1`,
            [id],
          );
          if (!sub.rowCount) throw notFound('Webhook subscription');
          const s = sub.rows[0];
          if (s.status !== 'active') {
            throw new AppError({
              code: 'NGOIS-WH-0001',
              message: 'Subscription is not active',
              statusCode: 409,
            });
          }
          const eventId = randomUUID();
          const envelope = buildWebhookEnvelope({
            id: eventId,
            tenant_id: tenantId,
            event_type: 'webhook.test',
            aggregate_type: 'webhook_subscription',
            aggregate_id: id,
            payload: { ok: true, grant_id: randomUUID(), email: 'should-strip@example.com' },
            correlation_id: req.ctx.correlationId,
          });
          let delivery;
          try {
            delivery = await deliverOnce(s.endpoint_url, s.secret_enc, envelope);
          } catch (err) {
            delivery = {
              http_status: 0,
              latency_ms: 0,
              excerpt: String(err instanceof Error ? err.message : err).slice(0, 200),
            };
          }
          const success = delivery.http_status >= 200 && delivery.http_status < 300;
          const delId = randomUUID();
          await client.query(
            `INSERT INTO webhook_deliveries (
               id, tenant_id, subscription_id, event_id, event_type, attempt, status,
               http_status, latency_ms, response_excerpt, completed_at
             ) VALUES ($1,$2,$3,$4,'webhook.test',1,$5,$6,$7,$8,now())`,
            [
              delId,
              tenantId,
              id,
              eventId,
              success ? 'success' : 'failed',
              delivery.http_status || null,
              delivery.latency_ms,
              delivery.excerpt,
            ],
          );
          return {
            delivery_id: delId,
            event_id: eventId,
            success,
            http_status: delivery.http_status,
            latency_ms: delivery.latency_ms,
            envelope,
          };
        });
        ok(res, req, result);
      } catch (err) {
        next(err);
      }
    },
  );
}
