/**
 * Webhook dispatcher — Redis Streams consumer + outbox fallback + retry poller.
 * SDD §34.2.2
 */
import { randomUUID } from 'node:crypto';
import { createClient, type RedisClientType } from 'redis';
import { z } from 'zod';
import { baseServiceSchema, loadConfig } from '@ngois/config';
import { createPool } from '@ngois/db';
import { createLogger } from '@ngois/logging';
import {
  HOURLY_DELIVERY_QUOTA,
  RETRY_DELAYS_MS,
  buildWebhookEnvelope,
  nextRetryAt,
  signBody,
} from '@ngois/webhook-egress';

const config = loadConfig(
  baseServiceSchema
    .omit({ PORT: true })
    .extend({
      SERVICE_NAME: z.string().default('webhook-dispatcher'),
      PORT: z.coerce.number().default(3098),
      REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
      WEBHOOK_POLL_MS: z.coerce.number().default(1000),
      WEBHOOK_STREAMS: z.string().default('grant.events,platform.events,hr.events'),
    }),
);

const log = createLogger(config.SERVICE_NAME);
const pool = createPool(config.DATABASE_URL);
const GROUP = 'webhook-dispatcher';

type Sub = {
  id: string;
  tenant_id: string;
  endpoint_url: string;
  secret_enc: string;
  event_types: string[];
  status: string;
};

async function connectRedis(): Promise<RedisClientType | null> {
  const client = createClient({ url: config.REDIS_URL });
  client.on('error', (err) => log.error('redis error', { err: String(err) }));
  try {
    await client.connect();
    return client as RedisClientType;
  } catch (err) {
    log.warn('redis unavailable; outbox/retry poll only', { err: String(err) });
    return null;
  }
}

function matches(types: string[], eventType: string): boolean {
  return types.includes('*') || types.includes(eventType);
}

async function hourlyCount(tenantId: string): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    const r = await client.query(
      `SELECT count(*)::int AS n FROM webhook_deliveries
       WHERE created_at > now() - interval '1 hour'`,
    );
    await client.query('COMMIT');
    return Number(r.rows[0]?.n ?? 0);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

async function loadSubs(tenantId: string): Promise<Sub[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    const r = await client.query<Sub>(
      `SELECT id, tenant_id, endpoint_url, secret_enc, event_types, status
       FROM webhook_subscriptions WHERE status = 'active'`,
    );
    await client.query('COMMIT');
    return r.rows;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

async function deliver(
  sub: Sub,
  event: {
    id: string;
    tenant_id: string;
    event_type: string;
    schema_version?: number;
    aggregate_type?: string;
    aggregate_id?: string;
    payload?: unknown;
    correlation_id?: string;
    created_at?: string;
  },
  attempt: number,
): Promise<void> {
  const used = await hourlyCount(sub.tenant_id);
  if (used >= HOURLY_DELIVERY_QUOTA) {
    log.warn('webhook quota exceeded', { tenant_id: sub.tenant_id, used });
    return;
  }

  const envelope = buildWebhookEnvelope(event);
  const body = JSON.stringify(envelope);
  const sig = signBody(sub.secret_enc, body);
  const delId = randomUUID();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [sub.tenant_id]);

    const exists = await client.query(
      `SELECT 1 FROM webhook_deliveries
       WHERE subscription_id = $1 AND event_id = $2 AND status = 'success' LIMIT 1`,
      [sub.id, event.id],
    );
    if (exists.rowCount) {
      await client.query('COMMIT');
      return;
    }

    let httpStatus = 0;
    let latency = 0;
    let excerpt = '';
    let success = false;
    const t0 = Date.now();
    try {
      const res = await fetch(sub.endpoint_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-NGOIS-Signature': sig,
          'User-Agent': 'ngois-webhook/1.0',
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      httpStatus = res.status;
      latency = Date.now() - t0;
      excerpt = (await res.text().catch(() => '')).slice(0, 200);
      success = res.status >= 200 && res.status < 300;
    } catch (err) {
      latency = Date.now() - t0;
      excerpt = String(err instanceof Error ? err.message : err).slice(0, 200);
    }

    if (success) {
      await client.query(
        `INSERT INTO webhook_deliveries (
           id, tenant_id, subscription_id, event_id, event_type, attempt, status,
           http_status, latency_ms, response_excerpt, completed_at
         ) VALUES ($1,$2,$3,$4,$5,$6,'success',$7,$8,$9,now())`,
        [
          delId,
          sub.tenant_id,
          sub.id,
          event.id,
          event.event_type,
          attempt,
          httpStatus,
          latency,
          excerpt,
        ],
      );
    } else if (attempt >= RETRY_DELAYS_MS.length) {
      await client.query(
        `INSERT INTO webhook_deliveries (
           id, tenant_id, subscription_id, event_id, event_type, attempt, status,
           http_status, latency_ms, response_excerpt, completed_at
         ) VALUES ($1,$2,$3,$4,$5,$6,'exhausted',$7,$8,$9,now())`,
        [
          delId,
          sub.tenant_id,
          sub.id,
          event.id,
          event.event_type,
          attempt,
          httpStatus || null,
          latency,
          excerpt,
        ],
      );
      await client.query(
        `UPDATE webhook_subscriptions
         SET status = 'suspended', suspended_at = now(), last_error = $2, updated_at = now()
         WHERE id = $1`,
        [sub.id, `exhausted after ${attempt} attempts: ${excerpt}`],
      );
      log.warn('subscription suspended', { subscription_id: sub.id });
    } else {
      const next = nextRetryAt(attempt);
      await client.query(
        `INSERT INTO webhook_deliveries (
           id, tenant_id, subscription_id, event_id, event_type, attempt, status,
           http_status, latency_ms, response_excerpt, next_attempt_at
         ) VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9,$10)`,
        [
          delId,
          sub.tenant_id,
          sub.id,
          event.id,
          event.event_type,
          attempt,
          httpStatus || null,
          latency,
          excerpt,
          next?.toISOString() ?? null,
        ],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

async function dispatchEvent(event: {
  id: string;
  tenant_id: string;
  event_type: string;
  schema_version?: number;
  aggregate_type?: string;
  aggregate_id?: string;
  payload?: unknown;
  correlation_id?: string;
  created_at?: string;
}): Promise<void> {
  const subs = await loadSubs(event.tenant_id);
  for (const sub of subs) {
    if (!matches(sub.event_types ?? ['*'], event.event_type)) continue;
    await deliver(sub, event, 1);
  }
}

async function ensureGroup(redis: RedisClientType, stream: string): Promise<void> {
  try {
    await redis.xGroupCreate(stream, GROUP, '0', { MKSTREAM: true });
  } catch (err) {
    const msg = String(err);
    if (!/BUSYGROUP/i.test(msg)) throw err;
  }
}

async function pollRedis(redis: RedisClientType): Promise<number> {
  const streams = config.WEBHOOK_STREAMS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  let n = 0;
  for (const stream of streams) {
    await ensureGroup(redis, stream);
    const res = await redis.xReadGroup(GROUP, 'worker-1', [{ key: stream, id: '>' }], {
      COUNT: 20,
      BLOCK: 200,
    });
    if (!res) continue;
    for (const s of res) {
      for (const msg of s.messages) {
        const bodyRaw = msg.message.body;
        if (!bodyRaw) continue;
        try {
          const body = JSON.parse(bodyRaw) as {
            id: string;
            tenant_id: string;
            event_type: string;
            schema_version?: number;
            aggregate_type?: string;
            aggregate_id?: string;
            payload?: unknown;
            correlation_id?: string;
            created_at?: string;
          };
          await dispatchEvent(body);
          await redis.xAck(stream, GROUP, msg.id);
          n += 1;
        } catch (err) {
          log.error('dispatch failed', { err: String(err), stream, id: msg.id });
        }
      }
    }
  }
  return n;
}

/** Fallback when Redis sink is log-only: pick up recently published outbox rows. */
async function pollOutbox(): Promise<number> {
  const client = await pool.connect();
  let n = 0;
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.relay_mode', 'on', true)`);
    const pending = await client.query(
      `SELECT id, tenant_id, aggregate_type, aggregate_id, event_type, schema_version,
              payload, correlation_id, created_at
       FROM outbox
       WHERE published_at IS NOT NULL
         AND published_at > now() - interval '15 minutes'
       ORDER BY published_at ASC
       LIMIT 50`,
    );
    await client.query('COMMIT');
    for (const row of pending.rows) {
      await dispatchEvent({
        id: row.id,
        tenant_id: row.tenant_id,
        event_type: row.event_type,
        schema_version: row.schema_version,
        aggregate_type: row.aggregate_type,
        aggregate_id: row.aggregate_id,
        payload: row.payload,
        correlation_id: row.correlation_id,
        created_at: new Date(row.created_at).toISOString(),
      });
      n += 1;
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    log.error('outbox poll failed', { err: String(err) });
  } finally {
    client.release();
  }
  return n;
}

async function pollRetries(): Promise<number> {
  const client = await pool.connect();
  let n = 0;
  try {
    // Bypass RLS for cross-tenant retry scheduler via relay_mode-like setting if available;
    // use security definer path: set each tenant.
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.relay_mode', 'on', true)`);
    const due = await client.query(
      `SELECT d.id, d.tenant_id, d.subscription_id, d.event_id, d.event_type, d.attempt,
              s.endpoint_url, s.secret_enc, s.event_types, s.status AS sub_status
       FROM webhook_deliveries d
       JOIN webhook_subscriptions s ON s.id = d.subscription_id
       WHERE d.status = 'pending'
         AND d.next_attempt_at IS NOT NULL
         AND d.next_attempt_at <= now()
         AND s.status = 'active'
       ORDER BY d.next_attempt_at ASC
       LIMIT 25
       FOR UPDATE OF d SKIP LOCKED`,
    );
    await client.query('COMMIT');

    for (const row of due.rows) {
      await deliver(
        {
          id: row.subscription_id,
          tenant_id: row.tenant_id,
          endpoint_url: row.endpoint_url,
          secret_enc: row.secret_enc,
          event_types: row.event_types,
          status: row.sub_status,
        },
        {
          id: row.event_id,
          tenant_id: row.tenant_id,
          event_type: row.event_type,
          payload: {},
        },
        Number(row.attempt) + 1,
      );
      // mark old pending row completed as superseded
      const c2 = await pool.connect();
      try {
        await c2.query('BEGIN');
        await c2.query(`SELECT set_config('app.tenant_id', $1, true)`, [row.tenant_id]);
        await c2.query(
          `UPDATE webhook_deliveries SET status = 'failed', completed_at = now()
           WHERE id = $1 AND status = 'pending'`,
          [row.id],
        );
        await c2.query('COMMIT');
      } catch {
        await c2.query('ROLLBACK').catch(() => undefined);
      } finally {
        c2.release();
      }
      n += 1;
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    log.error('retry poll failed', { err: String(err) });
  } finally {
    client.release();
  }
  return n;
}

const redis = await connectRedis();
log.info('webhook-dispatcher starting', {
  redis: !!redis,
  poll_ms: config.WEBHOOK_POLL_MS,
});

let stopping = false;
async function tick() {
  if (stopping) return;
  try {
    if (redis) await pollRedis(redis);
    else await pollOutbox();
    await pollRetries();
  } catch (err) {
    log.error('tick failed', { err: String(err) });
  }
}

const timer = setInterval(() => void tick(), config.WEBHOOK_POLL_MS);
void tick();

async function shutdown() {
  stopping = true;
  clearInterval(timer);
  if (redis) await redis.quit().catch(() => undefined);
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
