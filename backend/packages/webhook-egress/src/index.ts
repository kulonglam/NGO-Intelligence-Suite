/** SDD §34.2.2 / §10.13 — webhook egress helpers (SSRF, strip, HMAC, retry). */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const PII_KEYS = new Set([
  'full_name',
  'given_name',
  'family_name',
  'email',
  'phone',
  'national_id',
  'date_of_birth',
  'dob',
  'iban',
  'account_number',
  'address',
  'gps',
  'coordinates',
  'beneficiary_name',
  'ssn',
  'tin',
]);

export type UrlValidation =
  | { ok: true; href: string; host: string }
  | { ok: false; reason: string };

function isPrivateIp(ip: string): boolean {
  if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') return true;
  if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) return true;
  const v4 = ip.includes('.') ? ip : null;
  if (!v4) return false;
  const parts = v4.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const a = parts[0]!;
  const b = parts[1]!;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

/**
 * Validate webhook destination. HTTPS required.
 * Private/link-local rejected unless `allowPrivate` (dev/smoke only).
 */
export async function validateWebhookUrl(
  raw: string,
  opts: { allowPrivate?: boolean } = {},
): Promise<UrlValidation> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'invalid URL' };
  }
  if (url.protocol !== 'https:' && !(opts.allowPrivate && url.protocol === 'http:')) {
    return { ok: false, reason: 'HTTPS required' };
  }
  if (url.username || url.password) {
    return { ok: false, reason: 'credentials in URL not allowed' };
  }
  const host = url.hostname;
  if (!host || host === 'localhost' || host.endsWith('.local')) {
    if (!opts.allowPrivate) return { ok: false, reason: 'private/local host blocked' };
  }

  const ips: string[] = [];
  if (isIP(host)) {
    ips.push(host);
  } else {
    try {
      const records = await lookup(host, { all: true });
      for (const r of records) ips.push(r.address);
    } catch {
      return { ok: false, reason: 'DNS lookup failed' };
    }
  }
  if (!ips.length) return { ok: false, reason: 'no resolved addresses' };
  if (!opts.allowPrivate && ips.some(isPrivateIp)) {
    return { ok: false, reason: 'private or link-local address blocked (SSRF)' };
  }
  return { ok: true, href: url.href, host };
}

/** Strip known PII keys recursively; keep ids/metadata. */
export function stripPii(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripPii);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (PII_KEYS.has(k) || /(_name|email|phone|national_id|iban)$/i.test(k)) continue;
      out[k] = stripPii(v);
    }
    return out;
  }
  return value;
}

export function buildWebhookEnvelope(event: {
  id: string;
  tenant_id: string;
  event_type: string;
  schema_version?: number;
  aggregate_type?: string;
  aggregate_id?: string;
  payload?: unknown;
  correlation_id?: string;
  created_at?: string;
}): Record<string, unknown> {
  return {
    event_id: event.id,
    tenant_id: event.tenant_id,
    event_type: event.event_type,
    schema_version: event.schema_version ?? 1,
    aggregate_type: event.aggregate_type ?? null,
    aggregate_id: event.aggregate_id ?? null,
    correlation_id: event.correlation_id ?? null,
    created_at: event.created_at ?? new Date().toISOString(),
    data: stripPii(event.payload ?? {}),
  };
}

export function signBody(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const mac = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${mac}`;
}

export function verifySignature(secret: string, body: string, header: string, skewSec = 300): boolean {
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const [k, v] = p.split('=');
      return [k?.trim(), v?.trim()];
    }),
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!t || !v1) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - t) > skewSec) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
  } catch {
    return false;
  }
}

export function newWebhookSecret(): string {
  return randomBytes(32).toString('base64url');
}

/** Retry delays in ms — 5 attempts, exponential toward ~1h. */
export const RETRY_DELAYS_MS = [0, 30_000, 120_000, 600_000, 3_600_000];

export function nextRetryAt(attempt: number, from = Date.now()): Date | null {
  if (attempt >= RETRY_DELAYS_MS.length) return null;
  return new Date(from + (RETRY_DELAYS_MS[attempt] ?? 0));
}

export const HOURLY_DELIVERY_QUOTA = 1000;
