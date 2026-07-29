/**
 * Transactional outbox relay (ADR-0011).
 * Polls unpublished rows, publishes to Redis Streams (or log sink), marks published.
 */
import { createClient, type RedisClientType } from 'redis';
import { z } from 'zod';
import { baseServiceSchema, loadConfig } from '@ngois/config';
import { createPool } from '@ngois/db';
import { createLogger } from '@ngois/logging';

const config = loadConfig(
  baseServiceSchema
    .omit({ PORT: true })
    .extend({
      SERVICE_NAME: z.string().default('outbox-relay'),
      PORT: z.coerce.number().default(3099),
      OUTBOX_POLL_MS: z.coerce.number().default(500),
      OUTBOX_BATCH_SIZE: z.coerce.number().default(100),
      REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
      OUTBOX_SINK: z.enum(['redis', 'log']).default('log'),
    }),
);

const log = createLogger(config.SERVICE_NAME);
const pool = createPool(config.DATABASE_URL);

type OutboxRow = {
  id: string;
  tenant_id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  schema_version: number;
  payload: unknown;
  correlation_id: string;
  causation_id: string | null;
  created_at: Date;
};

async function connectRedis(): Promise<RedisClientType | null> {
  if (config.OUTBOX_SINK !== 'redis') return null;
  const client = createClient({ url: config.REDIS_URL });
  client.on('error', (err) => log.error('redis error', { err: String(err) }));
  try {
    await client.connect();
    log.info('redis connected', { url: config.REDIS_URL });
    return client as RedisClientType;
  } catch (err) {
    log.warn('redis unavailable; falling back to log sink', { err: String(err) });
    return null;
  }
}

function streamFor(eventType: string): string {
  const root = eventType.split('.')[0] ?? 'platform';
  return `${root}.events`;
}

async function publish(
  redis: RedisClientType | null,
  row: OutboxRow,
): Promise<void> {
  const body = {
    id: row.id,
    tenant_id: row.tenant_id,
    event_type: row.event_type,
    schema_version: row.schema_version,
    aggregate_type: row.aggregate_type,
    aggregate_id: row.aggregate_id,
    payload: row.payload,
    correlation_id: row.correlation_id,
    causation_id: row.causation_id,
    created_at: row.created_at.toISOString(),
  };

  if (redis) {
    const stream = streamFor(row.event_type);
    await redis.xAdd(stream, '*', {
      event_id: row.id,
      tenant_id: row.tenant_id,
      event_type: row.event_type,
      body: JSON.stringify(body),
    });
    return;
  }

  log.info('outbox.publish', {
    stream: streamFor(row.event_type),
    event_id: row.id,
    event_type: row.event_type,
    tenant_id: row.tenant_id,
  });
}

async function drainBatch(redis: RedisClientType | null): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.relay_mode', 'on', true)`);
    const pending = await client.query<OutboxRow>(
      `SELECT id, tenant_id, aggregate_type, aggregate_id, event_type, schema_version,
              payload, correlation_id, causation_id, created_at
       FROM outbox
       WHERE published_at IS NULL
       ORDER BY created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [config.OUTBOX_BATCH_SIZE],
    );

    for (const row of pending.rows) {
      try {
        await publish(redis, row);
        await client.query(
          `UPDATE outbox
           SET published_at = now(), publish_attempts = publish_attempts + 1, last_error = NULL
           WHERE id = $1`,
          [row.id],
        );
      } catch (err) {
        await client.query(
          `UPDATE outbox
           SET publish_attempts = publish_attempts + 1, last_error = $2
           WHERE id = $1`,
          [row.id, err instanceof Error ? err.message : String(err)],
        );
        log.error('outbox publish failed', {
          event_id: row.id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await client.query('COMMIT');
    return pending.rows.length;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const redis = await connectRedis();
log.info('outbox relay started', {
  poll_ms: config.OUTBOX_POLL_MS,
  sink: redis ? 'redis' : 'log',
});

let stopping = false;
const shutdown = () => {
  stopping = true;
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

while (!stopping) {
  try {
    const n = await drainBatch(redis);
    if (n === 0) {
      await new Promise((r) => setTimeout(r, config.OUTBOX_POLL_MS));
    }
  } catch (err) {
    log.error('relay loop error', { err: err instanceof Error ? err.message : String(err) });
    await new Promise((r) => setTimeout(r, config.OUTBOX_POLL_MS));
  }
}

if (redis) await redis.quit();
await pool.end();
log.info('outbox relay stopped');
