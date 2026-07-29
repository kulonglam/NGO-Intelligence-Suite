import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import type pg from 'pg';
import { AppError } from '@ngois/errors';

const ALGORITHM = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const DEK_LEN = 32;

export type EncryptedBlob = {
  /** version|iv|tag|ciphertext as base64url segments joined by '.' */
  ciphertext: string;
  keyVersion: number;
};

function masterKeyFromEnv(env: NodeJS.ProcessEnv = process.env): Buffer {
  const raw = env.NGOIS_MASTER_KEY ?? 'dev-only-master-key-change-me!!';
  // Derive a stable 32-byte key from the configured secret.
  return createHash('sha256').update(raw).digest();
}

/** Exposed for drills/tests — wrap a DEK with the local master key. */
export function wrapDekWithMaster(dek: Buffer, env: NodeJS.ProcessEnv = process.env): Buffer {
  return wrapDek(masterKeyFromEnv(env), dek);
}

/** Exposed for drills/tests — unwrap a DEK with the local master key. */
export function unwrapDekWithMaster(wrapped: Buffer, env: NodeJS.ProcessEnv = process.env): Buffer {
  return unwrapDek(masterKeyFromEnv(env), wrapped);
}

function wrapDek(master: Buffer, dek: Buffer): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITHM, master, iv);
  const enc = Buffer.concat([cipher.update(dek), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
}

function unwrapDek(master: Buffer, wrapped: Buffer): Buffer {
  const iv = wrapped.subarray(0, IV_LEN);
  const tag = wrapped.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = wrapped.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGORITHM, master, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

/**
 * Ensure a per-tenant DEK exists (ADR-0015 envelope shape; local master key stand-in for KMS).
 */
/* c8 ignore start */
export async function ensureTenantDek(
  client: pg.PoolClient,
  tenantId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ keyVersion: number; dek: Buffer }> {
  const existing = await client.query<{ key_version: number; wrapped_dek: Buffer }>(
    `SELECT key_version, wrapped_dek FROM tenant_data_keys WHERE tenant_id = $1`,
    [tenantId],
  );
  const master = masterKeyFromEnv(env);
  if (existing.rows[0]) {
    return {
      keyVersion: existing.rows[0].key_version,
      dek: unwrapDek(master, existing.rows[0].wrapped_dek),
    };
  }

  const dek = randomBytes(DEK_LEN);
  const wrapped = wrapDek(master, dek);
  const inserted = await client.query<{ key_version: number }>(
    `INSERT INTO tenant_data_keys (tenant_id, key_version, wrapped_dek)
     VALUES ($1, 1, $2)
     ON CONFLICT (tenant_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id
     RETURNING key_version`,
    [tenantId, wrapped],
  );
  const row = inserted.rows[0];
  if (!row) {
    throw new AppError({
      code: 'NGOIS-SEC-0001',
      message: 'Failed to provision tenant data key.',
      statusCode: 500,
    });
  }
  return { keyVersion: row.key_version, dek };
}
/* c8 ignore stop */

export function encryptUtf8(dek: Buffer, plaintext: string, keyVersion: number): EncryptedBlob {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITHM, dek, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const ciphertext = [
    String(keyVersion),
    iv.toString('base64url'),
    tag.toString('base64url'),
    enc.toString('base64url'),
  ].join('.');
  return { ciphertext, keyVersion };
}

export function decryptUtf8(dek: Buffer, blob: string): string {
  const parts = blob.split('.');
  if (parts.length !== 4) {
    throw new AppError({
      code: 'NGOIS-SEC-0002',
      message: 'Malformed ciphertext.',
      statusCode: 400,
    });
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64!, 'base64url');
  const tag = Buffer.from(tagB64!, 'base64url');
  const data = Buffer.from(dataB64!, 'base64url');
  const decipher = createDecipheriv(ALGORITHM, dek, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** Blind index for exact-match search (HMAC-SHA256 of normalised value). */
export function blindIndex(indexKey: Buffer, value: string): string {
  const normalised = value.trim().toLowerCase();
  return createHash('sha256').update(indexKey).update('|').update(normalised).digest('hex');
}

export function deriveIndexKey(dek: Buffer): Buffer {
  return createHash('sha256').update(dek).update(':blind-index').digest();
}
