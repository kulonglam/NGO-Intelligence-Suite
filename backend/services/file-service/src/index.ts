/**
 * file-service — local disk stand-in for object storage (ADR-ready path shape).
 * Keys are always tenant-prefixed: {tenant_id}/{yyyy}/{mm}/{uuid}-{safeName}
 */
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { unlink, writeFile } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
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
} from '@ngois/service-kit';
import { requireTenantId, withTenant } from '@ngois/tenant-context';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../../');

const config = loadConfig(
  baseServiceSchema.extend({
    SERVICE_NAME: z.string().default('file-service'),
    PORT: z.coerce.number().default(3010),
    FILE_STORAGE_ROOT: z.string().default(join(root, '.data', 'files')),
    FILE_BUCKET: z.string().default('ngois-local'),
  }),
);

const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const MAX_BYTES = 25 * 1024 * 1024;

const pool = createPool(config.DATABASE_URL);
const { app, log } = createApp({ serviceName: config.SERVICE_NAME });

mkdirSync(config.FILE_STORAGE_ROOT, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
});

function safeFilename(name: string): string {
  return basename(name).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 180) || 'file';
}

function tenantKey(tenantId: string, originalName: string): string {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${tenantId}/${yyyy}/${mm}/${randomUUID()}-${safeFilename(originalName)}`;
}

app.post(
  '/v1/file/objects',
  requirePermission('file:object:upload'),
  upload.single('file'),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      if (!req.file) throw validationError('file is required', 'file');
      if (!ALLOWED_TYPES.has(req.file.mimetype)) {
        throw new AppError({
          code: 'NGOIS-FILE-0003',
          message: 'Content type is not allowed for this purpose.',
          statusCode: 415,
          detail: req.file.mimetype,
        });
      }

      const purpose = String(req.body.purpose ?? 'grant_document').slice(0, 50);
      const ownerResourceType = req.body.owner_resource_type
        ? String(req.body.owner_resource_type).slice(0, 60)
        : null;
      const ownerResourceId = req.body.owner_resource_id
        ? String(req.body.owner_resource_id)
        : null;
      const containsPii = String(req.body.contains_pii ?? 'false') === 'true';

      const storageKey = tenantKey(tenantId, req.file.originalname);
      if (!storageKey.startsWith(`${tenantId}/`)) {
        throw new AppError({
          code: 'NGOIS-FILE-0004',
          message: 'Storage key must be tenant-prefixed.',
          statusCode: 500,
        });
      }

      const absPath = join(config.FILE_STORAGE_ROOT, storageKey);
      mkdirSync(dirname(absPath), { recursive: true });
      await writeFile(absPath, req.file.buffer);
      const checksum = createHash('sha256').update(req.file.buffer).digest('hex');
      const id = randomUUID();

      const row = await withTenant(pool, tenantId, async (client) => {
        const inserted = await client.query(
          `INSERT INTO file_objects (
             id, tenant_id, storage_bucket, storage_key, original_filename, content_type,
             size_bytes, checksum_sha256, purpose, owner_resource_type, owner_resource_id,
             contains_pii, scan_status, uploaded_by, upload_completed_at
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'clean',$13,now()
           ) RETURNING id, storage_bucket, storage_key, original_filename, content_type,
                       size_bytes, checksum_sha256, purpose, owner_resource_type, owner_resource_id,
                       scan_status, created_at`,
          [
            id,
            tenantId,
            config.FILE_BUCKET,
            storageKey,
            req.file!.originalname.slice(0, 300),
            req.file!.mimetype,
            req.file!.size,
            checksum,
            purpose,
            ownerResourceType,
            ownerResourceId,
            containsPii,
            req.ctx.userId ?? null,
          ],
        );

        await writeAuditEvent(client, {
          tenantId,
          serviceName: config.SERVICE_NAME,
          action: 'file.object.uploaded',
          resourceType: 'file_object',
          resourceId: id,
          resourceLabel: req.file!.originalname,
          actorUserId: req.ctx.userId,
          actorRole: req.ctx.role,
          afterState: {
            storage_key: storageKey,
            size_bytes: req.file!.size,
            purpose,
          },
          correlationId: req.ctx.correlationId,
        });

        return inserted.rows[0];
      });

      ok(res, req, row, 201);
    } catch (err) {
      next(err);
    }
  },
);

app.get(
  '/v1/file/objects',
  requirePermission('file:object:read'),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const ownerType = typeof req.query.owner_resource_type === 'string' ? req.query.owner_resource_type : null;
      const ownerId = typeof req.query.owner_resource_id === 'string' ? req.query.owner_resource_id : null;
      const rows = await withTenant(pool, tenantId, async (client) => {
        if (ownerType && ownerId) {
          const r = await client.query(
            `SELECT id, original_filename, content_type, size_bytes, purpose, scan_status,
                    owner_resource_type, owner_resource_id, created_at, checksum_sha256
             FROM file_objects
             WHERE NOT is_deleted AND owner_resource_type = $1 AND owner_resource_id = $2
             ORDER BY created_at DESC`,
            [ownerType, ownerId],
          );
          return r.rows;
        }
        const r = await client.query(
          `SELECT id, original_filename, content_type, size_bytes, purpose, scan_status,
                  owner_resource_type, owner_resource_id, created_at, checksum_sha256
           FROM file_objects
           WHERE NOT is_deleted
           ORDER BY created_at DESC
           LIMIT 100`,
        );
        return r.rows;
      });
      ok(res, req, rows);
    } catch (err) {
      next(err);
    }
  },
);

app.get(
  '/v1/file/objects/:id',
  requirePermission('file:object:read'),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const row = await withTenant(pool, tenantId, async (client) => {
        const r = await client.query(
          `SELECT id, storage_bucket, storage_key, original_filename, content_type, size_bytes,
                  purpose, scan_status, owner_resource_type, owner_resource_id, created_at
           FROM file_objects WHERE id = $1 AND NOT is_deleted`,
          [req.params.id],
        );
        return r.rows[0];
      });
      if (!row) throw notFound('file', req.params.id);
      ok(res, req, row);
    } catch (err) {
      next(err);
    }
  },
);

app.get(
  '/v1/file/objects/:id/content',
  requirePermission('file:object:read'),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const meta = await withTenant(pool, tenantId, async (client) => {
        const r = await client.query<{
          storage_key: string;
          original_filename: string;
          content_type: string;
          scan_status: string;
        }>(
          `SELECT storage_key, original_filename, content_type, scan_status::text
           FROM file_objects WHERE id = $1 AND NOT is_deleted`,
          [req.params.id],
        );
        return r.rows[0];
      });
      if (!meta) throw notFound('file', req.params.id);
      if (meta.scan_status !== 'clean' && meta.scan_status !== 'skipped') {
        throw new AppError({
          code: 'NGOIS-FILE-0010',
          message: 'File is not available for download until scan completes.',
          statusCode: 409,
        });
      }
      if (!meta.storage_key.startsWith(`${tenantId}/`)) {
        throw new AppError({
          code: 'NGOIS-FILE-0004',
          message: 'Storage key failed tenant prefix check.',
          statusCode: 500,
        });
      }
      const absPath = join(config.FILE_STORAGE_ROOT, meta.storage_key);
      if (!existsSync(absPath)) throw notFound('file content', req.params.id);

      res.setHeader('Content-Type', meta.content_type);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeFilename(meta.original_filename)}"`,
      );
      createReadStream(absPath).pipe(res);
    } catch (err) {
      next(err);
    }
  },
);

app.delete(
  '/v1/file/objects/:id',
  requirePermission('file:object:delete'),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      await withTenant(pool, tenantId, async (client) => {
        const r = await client.query<{ storage_key: string }>(
          `UPDATE file_objects SET is_deleted = true, updated_at = now()
           WHERE id = $1 AND NOT is_deleted
           RETURNING storage_key`,
          [req.params.id],
        );
        if (!r.rows[0]) throw notFound('file', req.params.id);
        const absPath = join(config.FILE_STORAGE_ROOT, r.rows[0].storage_key);
        if (existsSync(absPath)) await unlink(absPath).catch(() => undefined);
        await writeAuditEvent(client, {
          tenantId,
          serviceName: config.SERVICE_NAME,
          action: 'file.object.deleted',
          resourceType: 'file_object',
          resourceId: req.params.id,
          actorUserId: req.ctx.userId,
          actorRole: req.ctx.role,
          correlationId: req.ctx.correlationId,
        });
      });
      ok(res, req, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

app.use(errorHandler(log));
await listen(app, config.PORT, log);
