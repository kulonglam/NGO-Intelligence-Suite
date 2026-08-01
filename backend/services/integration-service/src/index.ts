import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { writeAuditEvent } from '@ngois/audit';
import { baseServiceSchema, loadConfig } from '@ngois/config';
import { createPool } from '@ngois/db';
import { notFound, validationError } from '@ngois/errors';
import { KOCH_FIXTURE } from '@ngois/k-anonymity';
import {
  createApp,
  errorHandler,
  listen,
  ok,
  requirePermission,
  validateBody,
} from '@ngois/service-kit';
import { requireTenantId, withTenant } from '@ngois/tenant-context';
import { buildIatiActivity, validateIatiDocument } from './iati.js';

const config = loadConfig(
  baseServiceSchema.extend({
    SERVICE_NAME: z.string().default('integration-service'),
    PORT: z.coerce.number().default(3011),
    /** local = artifact only; remote = POST to IATI Registry when token set */
    IATI_REGISTRY_MODE: z.enum(['local', 'remote']).default('local'),
    IATI_REGISTRY_URL: z
      .string()
      .default('https://iatiregistry.org/api/3/action/package_create'),
    IATI_REGISTRY_TOKEN: z.string().optional(),
  }),
);

const pool = createPool(config.DATABASE_URL);
const { app, log } = createApp({ serviceName: config.SERVICE_NAME });
const evidenceDir = join(process.cwd(), 'ops', 'drills', 'evidence', 'iati');

const publishSchema = z.object({
  grant_id: z.string().uuid().optional(),
  grant_number: z.string().optional(),
  include_pii_seed: z.boolean().default(false),
  use_koch_indicators: z.boolean().default(true),
});

async function loadGrant(
  client: import('pg').PoolClient,
  opts: { grant_id?: string; grant_number?: string },
) {
  if (opts.grant_id) {
    const r = await client.query(`SELECT * FROM grants WHERE id = $1 AND deleted_at IS NULL`, [
      opts.grant_id,
    ]);
    return r.rows[0];
  }
  if (opts.grant_number) {
    const r = await client.query(
      `SELECT * FROM grants WHERE grant_number = $1 AND deleted_at IS NULL`,
      [opts.grant_number],
    );
    return r.rows[0];
  }
  const r = await client.query(
    `SELECT * FROM grants WHERE iati_eligible AND deleted_at IS NULL ORDER BY grant_number LIMIT 1`,
  );
  return r.rows[0];
}

app.post(
  '/v1/integrations/iati/preview',
  requirePermission('grant:iati:publish', 'grant:iati:configure'),
  validateBody(publishSchema),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const body = req.body as z.infer<typeof publishSchema>;
      const payload = await withTenant(pool, tenantId, async (client) => {
        const grant = await loadGrant(client, body);
        if (!grant) throw notFound('iati-eligible grant');
        const doc = buildIatiActivity({
          grant: {
            id: grant.id,
            grant_number: grant.grant_number,
            title: grant.title,
            donor_name: grant.donor_name,
            currency: grant.currency,
            total_budget: grant.total_budget,
            start_date: grant.start_date,
            end_date: grant.end_date,
            admin_area_l2: grant.admin_area_l2,
          },
          raw_indicators: body.use_koch_indicators ? KOCH_FIXTURE : [],
          forbidden: body.include_pii_seed
            ? {
                beneficiary_names: ['Nyandeng Deng'],
                precise_coordinates: ['9.2334, 29.8001'],
                staff_names: ['Field Officer X'],
              }
            : undefined,
        });
        const validation = validateIatiDocument(doc);
        if (!validation.ok) {
          throw validationError(validation.errors.join('; '), 'iati');
        }
        return { document: doc, validation };
      });
      ok(res, req, payload);
    } catch (err) {
      next(err);
    }
  },
);

app.post(
  '/v1/integrations/iati/publish',
  requirePermission('grant:iati:publish'),
  validateBody(publishSchema),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const body = req.body as z.infer<typeof publishSchema>;
      const result = await withTenant(pool, tenantId, async (client) => {
        const grant = await loadGrant(client, body);
        if (!grant) throw notFound('iati-eligible grant');
        const doc = buildIatiActivity({
          grant: {
            id: grant.id,
            grant_number: grant.grant_number,
            title: grant.title,
            donor_name: grant.donor_name,
            currency: grant.currency,
            total_budget: grant.total_budget,
            start_date: grant.start_date,
            end_date: grant.end_date,
            admin_area_l2: grant.admin_area_l2,
          },
          raw_indicators: body.use_koch_indicators ? KOCH_FIXTURE : [],
          forbidden: body.include_pii_seed
            ? {
                beneficiary_names: ['Nyandeng Deng'],
                precise_coordinates: ['9.2334, 29.8001'],
                staff_names: ['Field Officer X'],
              }
            : undefined,
        });
        const validation = validateIatiDocument(doc);
        if (!validation.ok) {
          throw validationError(validation.errors.join('; '), 'iati');
        }
        mkdirSync(evidenceDir, { recursive: true });
        const file = `iati-${grant.grant_number}-${Date.now()}.json`;
        const artifactPath = join(evidenceDir, file);
        writeFileSync(artifactPath, JSON.stringify(doc, null, 2));
        const id = randomUUID();
        await client.query(
          `INSERT INTO iati_publications (
             id, tenant_id, grant_id, status, checksum, artifact_path, exclusions_applied, created_by
           ) VALUES ($1,$2,$3,'published_local',$4,$5,$6::jsonb,$7)`,
          [
            id,
            tenantId,
            grant.id,
            doc.checksum,
            artifactPath,
            JSON.stringify(doc.exclusions_applied),
            req.ctx.userId ?? null,
          ],
        );
        let registry: Record<string, unknown> | null = null;
        let status = 'published_local';
        const token = config.IATI_REGISTRY_TOKEN ?? process.env.IATI_REGISTRY_TOKEN ?? '';
        if (config.IATI_REGISTRY_MODE === 'remote' && token) {
          try {
            const resReg = await fetch(config.IATI_REGISTRY_URL, {
              method: 'POST',
              headers: {
                Authorization: token,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                name: `ngois-${grant.grant_number}`.toLowerCase().replace(/[^a-z0-9-_]/g, '-'),
                title: grant.title,
                notes: `NGOIS checksum ${doc.checksum}`,
              }),
              signal: AbortSignal.timeout(30_000),
            });
            const bodyText = await resReg.text();
            registry = {
              ok: resReg.ok,
              status: resReg.status,
              body: bodyText.slice(0, 500),
            };
            status = resReg.ok ? 'published_registry' : 'published_local_registry_failed';
          } catch (err) {
            registry = {
              ok: false,
              error: String(err instanceof Error ? err.message : err),
            };
            status = 'published_local_registry_failed';
          }
          await client.query(`UPDATE iati_publications SET status = $2 WHERE id = $1`, [
            id,
            status,
          ]);
        }
        await writeAuditEvent(client, {
          tenantId,
          serviceName: config.SERVICE_NAME,
          action:
            status === 'published_registry' ? 'iati.published_registry' : 'iati.published_local',
          resourceType: 'iati_publication',
          resourceId: id,
          actorUserId: req.ctx.userId,
          actorRole: req.ctx.role,
          correlationId: req.ctx.correlationId,
        });
        return {
          id,
          status,
          checksum: doc.checksum,
          artifact_path: artifactPath,
          exclusions_applied: doc.exclusions_applied,
          registry,
          note:
            status === 'published_registry'
              ? 'Uploaded to IATI Registry API'
              : 'Local registry artifact — set IATI_REGISTRY_MODE=remote + IATI_REGISTRY_TOKEN to upload',
        };
      });
      ok(res, req, result, 201);
    } catch (err) {
      next(err);
    }
  },
);

app.get(
  '/v1/integrations/iati/publications',
  requirePermission('grant:iati:publish', 'grant:iati:configure'),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const rows = await withTenant(pool, tenantId, async (client) => {
        const r = await client.query(
          `SELECT id, grant_id, status, checksum, artifact_path, exclusions_applied, published_at
           FROM iati_publications ORDER BY published_at DESC LIMIT 50`,
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
