import { AppError } from '@ngois/errors';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Build a Redis key that is always tenant-prefixed.
 * Shape: ngois:{tenantId}:{...parts}
 */
export function tenantRedisKey(tenantId: string, ...parts: string[]): string {
  if (!UUID_RE.test(tenantId)) {
    throw new AppError({
      code: 'NGOIS-TEN-0002',
      message: 'Redis keys require a valid tenant UUID prefix.',
      statusCode: 500,
    });
  }
  for (const part of parts) {
    if (!part || part.includes(':') || part.includes('*') || part.includes(' ')) {
      throw new AppError({
        code: 'NGOIS-TEN-0003',
        message: 'Redis key parts must be non-empty and free of : * and spaces.',
        statusCode: 500,
      });
    }
  }
  return ['ngois', tenantId, ...parts].join(':');
}

/** True when a key is scoped to the given tenant (fail-closed for empty keys). */
export function isTenantRedisKey(tenantId: string, key: string): boolean {
  if (!tenantId || !key) return false;
  return key.startsWith(`ngois:${tenantId}:`);
}
