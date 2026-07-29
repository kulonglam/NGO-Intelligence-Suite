import { createHash } from 'node:crypto';
import type pg from 'pg';

export type AuditActorType = 'user' | 'service' | 'system' | 'anonymous';
export type AuditOutcome = 'success' | 'failure' | 'denied';

export type WriteAuditInput = {
  tenantId: string;
  serviceName: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  resourceLabel?: string | null;
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  actorType?: AuditActorType;
  beforeState?: unknown;
  afterState?: unknown;
  changedFields?: string[];
  purpose?: string | null;
  outcome?: AuditOutcome;
  ipAddress?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
  occurredAt?: Date;
};

export type AuditHashInput = {
  previousHash: string | null;
  tenantId: string;
  sequence: number;
  occurredAt: string;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  beforeState: unknown;
  afterState: unknown;
  outcome: string;
  correlationId: string | null;
  serviceName: string;
};

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export function computeRecordHash(input: AuditHashInput): string {
  const payload = [
    input.previousHash ?? '',
    input.tenantId,
    String(input.sequence),
    input.occurredAt,
    input.actorUserId ?? '',
    input.action,
    input.resourceType,
    input.resourceId ?? '',
    stableStringify(input.beforeState ?? null),
    stableStringify(input.afterState ?? null),
    input.outcome,
    input.correlationId ?? '',
    input.serviceName,
  ].join('\u001f');
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * Append an audit row inside an open tenant-scoped transaction.
 * Uses a transaction-scoped advisory lock so writers serialize without needing
 * UPDATE privilege on immutable audit_events (SELECT ... FOR UPDATE would).
 */
/* c8 ignore start */
export async function writeAuditEvent(
  client: pg.PoolClient,
  input: WriteAuditInput,
): Promise<{ id: string; sequence: number; recordHash: string }> {
  await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`, [
    input.tenantId,
  ]);

  // MAX(sequence) + tip hash under the same lock — avoids stale ORDER BY/LIMIT plans.
  const tip = await client.query<{ next_sequence: string; previous_hash: string | null }>(
    `SELECT
       (COALESCE((SELECT MAX(sequence) FROM audit_events WHERE tenant_id = $1), 0) + 1)::text
         AS next_sequence,
       (SELECT record_hash FROM audit_events
        WHERE tenant_id = $1 ORDER BY sequence DESC LIMIT 1) AS previous_hash`,
    [input.tenantId],
  );

  const previousHash = tip.rows[0]?.previous_hash ?? null;
  const sequence = Number(tip.rows[0]!.next_sequence);
  const occurredAt = input.occurredAt ?? new Date();
  const occurredIso = occurredAt.toISOString();
  const outcome = input.outcome ?? 'success';
  const actorType = input.actorType ?? 'user';
  // Canonicalise via JSON so Date fields match jsonb round-trips.
  const beforeState = JSON.parse(JSON.stringify(input.beforeState ?? null)) as unknown;
  const afterState = JSON.parse(JSON.stringify(input.afterState ?? null)) as unknown;

  const recordHash = computeRecordHash({
    previousHash,
    tenantId: input.tenantId,
    sequence,
    occurredAt: occurredIso,
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    beforeState,
    afterState,
    outcome,
    correlationId: input.correlationId ?? null,
    serviceName: input.serviceName,
  });

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO audit_events (
       tenant_id, sequence, occurred_at,
       actor_user_id, actor_email, actor_role, actor_type,
       action, resource_type, resource_id, resource_label,
       before_state, after_state, changed_fields, purpose, outcome,
       ip_address, user_agent, correlation_id, service_name,
       previous_hash, record_hash
     ) VALUES (
       $1, $2, $3::timestamptz,
       $4, $5, $6, $7,
       $8, $9, $10, $11,
       $12::jsonb, $13::jsonb, $14, $15, $16,
       $17::inet, $18, $19, $20,
       $21, $22
     ) RETURNING id`,
    [
      input.tenantId,
      sequence,
      occurredIso,
      input.actorUserId ?? null,
      input.actorEmail ?? null,
      input.actorRole ?? null,
      actorType,
      input.action,
      input.resourceType,
      input.resourceId ?? null,
      input.resourceLabel ?? null,
      JSON.stringify(beforeState),
      JSON.stringify(afterState),
      input.changedFields ?? null,
      input.purpose ?? null,
      outcome,
      input.ipAddress ?? null,
      input.userAgent ?? null,
      input.correlationId ?? null,
      input.serviceName,
      previousHash,
      recordHash,
    ],
  );

  return {
    id: inserted.rows[0]!.id,
    sequence,
    recordHash,
  };
}
/* c8 ignore stop */

export type ChainBreak = {
  tenantId: string;
  sequence: number;
  expected: string;
  actual: string;
};

/* c8 ignore start */
export async function verifyTenantChain(
  client: pg.PoolClient | pg.Pool,
  tenantId: string,
): Promise<{ ok: boolean; checked: number; breaks: ChainBreak[] }> {
  const rows = await client.query<{
    sequence: string;
    occurred_at: Date;
    actor_user_id: string | null;
    action: string;
    resource_type: string;
    resource_id: string | null;
    before_state: unknown;
    after_state: unknown;
    outcome: string;
    correlation_id: string | null;
    service_name: string;
    previous_hash: string | null;
    record_hash: string;
  }>(
    `SELECT sequence::text, occurred_at, actor_user_id, action, resource_type, resource_id,
            before_state, after_state, outcome, correlation_id, service_name,
            previous_hash, record_hash
     FROM audit_events
     WHERE tenant_id = $1
     ORDER BY sequence ASC`,
    [tenantId],
  );

  const breaks: ChainBreak[] = [];
  let prev: string | null = null;
  for (const row of rows.rows) {
    const sequence = Number(row.sequence);
    const expectedPrev = prev;
    if ((row.previous_hash ?? null) !== expectedPrev) {
      breaks.push({
        tenantId,
        sequence,
        expected: `previous_hash=${expectedPrev}`,
        actual: `previous_hash=${row.previous_hash}`,
      });
    }
    const expectedHash = computeRecordHash({
      previousHash: row.previous_hash,
      tenantId,
      sequence,
      occurredAt: new Date(row.occurred_at).toISOString(),
      actorUserId: row.actor_user_id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      beforeState: row.before_state,
      afterState: row.after_state,
      outcome: row.outcome,
      correlationId: row.correlation_id,
      serviceName: row.service_name,
    });
    if (expectedHash !== row.record_hash) {
      breaks.push({
        tenantId,
        sequence,
        expected: expectedHash,
        actual: row.record_hash,
      });
    }
    prev = row.record_hash;
  }

  return { ok: breaks.length === 0, checked: rows.rows.length, breaks };
}
/* c8 ignore stop */
