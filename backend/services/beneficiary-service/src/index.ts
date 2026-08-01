import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { writeAuditEvent } from '@ngois/audit';
import { buildIndexes, scoreDuplicate } from '@ngois/beneficiary-dedup';
import { baseServiceSchema, loadConfig } from '@ngois/config';
import { encryptUtf8, ensureTenantDek, deriveIndexKey } from '@ngois/crypto';
import { createPool } from '@ngois/db';
import { AppError, notFound, validationError } from '@ngois/errors';
import { KOCH_FIXTURE, suppressAggregate, type AggregateCell } from '@ngois/k-anonymity';
import {
  createApp,
  errorHandler,
  listen,
  ok,
  requirePermission,
  validateBody,
} from '@ngois/service-kit';
import { requireTenantId, withTenant } from '@ngois/tenant-context';
import { scoreVulnerability, type VulnerabilityInput } from '@ngois/vulnerability-score';

const config = loadConfig(
  baseServiceSchema.extend({
    SERVICE_NAME: z.string().default('beneficiary-service'),
    PORT: z.coerce.number().default(3004),
  }),
);

const pool = createPool(config.DATABASE_URL);
const { app, log } = createApp({ serviceName: config.SERVICE_NAME });

const createBeneficiarySchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  household_id: z.string().uuid().optional().nullable(),
  sex: z.enum(['F', 'M', 'X', 'U']).optional(),
  birth_year: z.number().int().min(1900).max(2100).optional(),
  admin_area: z.string().max(120).optional(),
  phone_e164: z.string().max(20).optional().nullable(),
  national_id: z.string().max(80).optional().nullable(),
});

const householdSchema = z.object({
  household_code: z.string().min(2).max(40),
  settlement: z.string().max(200).optional(),
  admin_area: z.string().max(120).optional(),
  shelter_type: z.string().max(40).optional(),
});

const assessSchema = z.object({
  dependents: z.number().int().min(0),
  working_age: z.number().int().min(0),
  monthly_income: z.number().min(0),
  members: z.number().int().positive(),
  need_threshold_per_member: z.number().positive(),
  shelter: z.enum(['none', 'emergency', 'temporary', 'semi_permanent', 'permanent']),
  rcsi: z.number().nullable(),
  displacement: z
    .enum(['displaced_lt_12m', 'displaced_gt_12m', 'returnee', 'host'])
    .nullable(),
  disability_count: z.number().int().min(0),
  chronic_illness_count: z.number().int().min(0),
  under5_malnutrition_count: z.number().int().min(0),
  headship: z.enum(['child', 'elderly_with_deps', 'female_with_deps', 'none']),
  household_id: z.string().uuid().optional().nullable(),
});

const enrollSchema = z.object({
  beneficiary_id: z.string().uuid(),
});

const searchDupSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  phone_e164: z.string().optional().nullable(),
  national_id: z.string().optional().nullable(),
  birth_year: z.number().int().optional(),
  sex: z.enum(['F', 'M', 'X', 'U']).optional(),
  admin_area: z.string().optional(),
  household_id: z.string().uuid().optional().nullable(),
});

async function nextBeneficiaryNumber(client: import('pg').PoolClient, tenantId: string) {
  const year = new Date().getFullYear();
  const r = await client.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM beneficiaries WHERE tenant_id = $1`,
    [tenantId],
  );
  const seq = String(Number(r.rows[0]?.n ?? 0) + 1).padStart(5, '0');
  return `BEN-${year}-${seq}`;
}

app.post(
  '/v1/beneficiary/households',
  requirePermission('beneficiary:record:create'),
  validateBody(householdSchema),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const body = req.body as z.infer<typeof householdSchema>;
      const row = await withTenant(pool, tenantId, async (client) => {
        const r = await client.query(
          `INSERT INTO households (tenant_id, household_code, settlement, admin_area, shelter_type)
           VALUES ($1,$2,$3,$4,$5)
           RETURNING id, household_code, settlement, admin_area, shelter_type, created_at`,
          [
            tenantId,
            body.household_code,
            body.settlement ?? null,
            body.admin_area ?? null,
            body.shelter_type ?? null,
          ],
        );
        return r.rows[0];
      });
      ok(res, req, row, 201);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
        next(
          new AppError({
            code: 'NGOIS-BEN-0001',
            message: 'Household code already exists.',
            statusCode: 409,
          }),
        );
        return;
      }
      next(err);
    }
  },
);

app.get(
  '/v1/beneficiary/beneficiaries',
  requirePermission('beneficiary:record:list', 'beneficiary:record:read'),
  async (req, res, next) => {
    try {
      const purpose = typeof req.query.purpose === 'string' ? req.query.purpose.trim() : '';
      if (!purpose) {
        throw validationError('purpose query parameter is required', 'purpose');
      }
      const tenantId = requireTenantId(req.ctx.tenantId);
      const rows = await withTenant(pool, tenantId, async (client) => {
        const r = await client.query(
          `SELECT id, beneficiary_number, display_name, household_id, sex, birth_year,
                  admin_area, status, created_at
           FROM beneficiaries WHERE NOT is_deleted
           ORDER BY created_at DESC LIMIT 100`,
        );
        await writeAuditEvent(client, {
          tenantId,
          serviceName: config.SERVICE_NAME,
          action: 'beneficiary.list',
          resourceType: 'beneficiary',
          resourceId: tenantId,
          actorUserId: req.ctx.userId,
          actorRole: req.ctx.role,
          afterState: { purpose, count: r.rowCount },
          correlationId: req.ctx.correlationId,
        });
        return r.rows;
      });
      ok(res, req, rows);
    } catch (err) {
      next(err);
    }
  },
);

app.get(
  '/v1/beneficiary/beneficiaries/:id',
  requirePermission('beneficiary:record:read'),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const id = req.params.id!;
      const row = await withTenant(pool, tenantId, async (client) => {
        const r = await client.query(
          `SELECT id, beneficiary_number, display_name, household_id, sex, birth_year,
                  admin_area, status, created_at, updated_at
           FROM beneficiaries WHERE id = $1 AND NOT is_deleted`,
          [id],
        );
        return r.rows[0];
      });
      if (!row) throw notFound('beneficiary', id);
      ok(res, req, row);
    } catch (err) {
      next(err);
    }
  },
);

app.post(
  '/v1/beneficiary/beneficiaries',
  requirePermission('beneficiary:record:create'),
  validateBody(createBeneficiarySchema),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const body = req.body as z.infer<typeof createBeneficiarySchema>;
      const result = await withTenant(pool, tenantId, async (client) => {
        const { keyVersion, dek } = await ensureTenantDek(client, tenantId);
        const indexKey = deriveIndexKey(dek);
        const indexes = buildIndexes(indexKey, {
          full_name: `${body.first_name} ${body.last_name}`,
          phone_e164: body.phone_e164,
          national_id: body.national_id,
        });
        const firstEnc = encryptUtf8(dek, body.first_name, keyVersion);
        const lastEnc = encryptUtf8(dek, body.last_name, keyVersion);
        const number = await nextBeneficiaryNumber(client, tenantId);
        const id = randomUUID();
        const display = `${body.first_name} ${body.last_name}`;
        const r = await client.query(
          `INSERT INTO beneficiaries (
             id, tenant_id, beneficiary_number, household_id, display_name,
             first_name_encrypted, last_name_encrypted, name_index, name_phonetic_index,
             phone_index, national_id_index, sex, birth_year, admin_area, status
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'active')
           RETURNING id, beneficiary_number, display_name, household_id, sex, birth_year,
                     admin_area, status, created_at`,
          [
            id,
            tenantId,
            number,
            body.household_id ?? null,
            display,
            Buffer.from(firstEnc.ciphertext, 'utf8'),
            Buffer.from(lastEnc.ciphertext, 'utf8'),
            indexes.name_index,
            indexes.name_phonetic_index,
            indexes.phone_index,
            indexes.national_id_index,
            body.sex ?? null,
            body.birth_year ?? null,
            body.admin_area ?? null,
          ],
        );

        // Flag duplicates (never merge)
        const candidates = await client.query(
          `SELECT id, name_index, name_phonetic_index, phone_index, national_id_index,
                  birth_year, sex, admin_area, household_id, created_at AS registered_at
           FROM beneficiaries WHERE NOT is_deleted AND id <> $1 LIMIT 200`,
          [id],
        );
        const flags = [];
        for (const c of candidates.rows) {
          const scored = scoreDuplicate(
            {
              id,
              ...indexes,
              birth_year: body.birth_year,
              sex: body.sex,
              admin_area: body.admin_area,
              household_id: body.household_id,
              registered_at: new Date(),
            },
            c,
          );
          if (scored.priority === 'none') continue;
          const flagId = randomUUID();
          await client.query(
            `INSERT INTO beneficiary_duplicate_flags (
               id, tenant_id, subject_id, candidate_id, score, priority, signals, status
             ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'open')`,
            [
              flagId,
              tenantId,
              id,
              c.id,
              scored.score,
              scored.priority,
              JSON.stringify(scored.signals),
            ],
          );
          await client.query(
            `INSERT INTO submission_review_queue (
               tenant_id, duplicate_flag_id, reason, status
             ) VALUES ($1,$2,'probable_duplicate','open')`,
            [tenantId, flagId],
          );
          flags.push({ id: flagId, candidate_id: c.id, ...scored, auto_merge: false });
        }

        await writeAuditEvent(client, {
          tenantId,
          serviceName: config.SERVICE_NAME,
          action: 'beneficiary.registered',
          resourceType: 'beneficiary',
          resourceId: id,
          actorUserId: req.ctx.userId,
          actorRole: req.ctx.role,
          afterState: { beneficiary_number: number, duplicate_flags: flags.length },
          correlationId: req.ctx.correlationId,
        });
        return { ...r.rows[0], duplicate_flags: flags };
      });
      ok(res, req, result, 201);
    } catch (err) {
      next(err);
    }
  },
);

app.post(
  '/v1/beneficiary/beneficiaries/search-duplicates',
  requirePermission('beneficiary:record:create'),
  validateBody(searchDupSchema),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const body = req.body as z.infer<typeof searchDupSchema>;
      const matches = await withTenant(pool, tenantId, async (client) => {
        const { dek } = await ensureTenantDek(client, tenantId);
        const indexes = buildIndexes(deriveIndexKey(dek), {
          full_name: `${body.first_name} ${body.last_name}`,
          phone_e164: body.phone_e164,
          national_id: body.national_id,
        });
        const candidates = await client.query(
          `SELECT id, beneficiary_number, display_name, name_index, name_phonetic_index,
                  phone_index, national_id_index, birth_year, sex, admin_area, household_id,
                  created_at AS registered_at
           FROM beneficiaries WHERE NOT is_deleted LIMIT 200`,
        );
        return candidates.rows
          .map((c) => {
            const scored = scoreDuplicate(
              {
                id: 'subject',
                ...indexes,
                birth_year: body.birth_year,
                sex: body.sex,
                admin_area: body.admin_area,
                household_id: body.household_id,
              },
              c,
            );
            return {
              candidate_id: c.id,
              beneficiary_number: c.beneficiary_number,
              display_name: c.display_name,
              ...scored,
            };
          })
          .filter((m) => m.priority !== 'none')
          .sort((a, b) => b.score - a.score);
      });
      ok(res, req, { matches, auto_merge: false });
    } catch (err) {
      next(err);
    }
  },
);

app.post(
  '/v1/beneficiary/beneficiaries/:id/assessments',
  requirePermission('beneficiary:vulnerability:assess'),
  validateBody(assessSchema),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const id = req.params.id!;
      const body = req.body as z.infer<typeof assessSchema>;
      const scored = scoreVulnerability(body as VulnerabilityInput);
      const row = await withTenant(pool, tenantId, async (client) => {
        const exists = await client.query(`SELECT id FROM beneficiaries WHERE id = $1`, [id]);
        if (!exists.rows[0]) throw notFound('beneficiary', id);
        const r = await client.query(
          `INSERT INTO vulnerability_assessments (
             tenant_id, beneficiary_id, household_id, score, band,
             scoring_model_version, factors, factors_missing, assessed_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)
           RETURNING id, beneficiary_id, score, band, scoring_model_version, factors,
                     factors_missing, created_at`,
          [
            tenantId,
            id,
            body.household_id ?? null,
            scored.score,
            scored.band,
            scored.scoring_model_version,
            JSON.stringify(scored.factors),
            JSON.stringify(scored.factors_missing),
            req.ctx.userId ?? null,
          ],
        );
        return r.rows[0];
      });
      ok(res, req, row, 201);
    } catch (err) {
      next(err);
    }
  },
);

app.get('/v1/beneficiary/programmes', requirePermission('programme:record:read'), async (req, res, next) => {
  try {
    const tenantId = requireTenantId(req.ctx.tenantId);
    const rows = await withTenant(pool, tenantId, async (client) => {
      const r = await client.query(
        `SELECT id, code, name, status, created_at FROM programmes ORDER BY code`,
      );
      return r.rows;
    });
    ok(res, req, rows);
  } catch (err) {
    next(err);
  }
});

app.post(
  '/v1/beneficiary/programmes/:id/enrollments',
  requirePermission('programme:enrollment:create'),
  validateBody(enrollSchema),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const programmeId = req.params.id!;
      const body = req.body as z.infer<typeof enrollSchema>;
      const row = await withTenant(pool, tenantId, async (client) => {
        const prog = await client.query(`SELECT id FROM programmes WHERE id = $1`, [programmeId]);
        if (!prog.rows[0]) throw notFound('programme', programmeId);
        const r = await client.query(
          `INSERT INTO programme_enrollments (tenant_id, programme_id, beneficiary_id, status)
           VALUES ($1,$2,$3,'enrolled')
           ON CONFLICT (tenant_id, programme_id, beneficiary_id)
           DO UPDATE SET status = 'enrolled', exited_at = NULL
           RETURNING id, programme_id, beneficiary_id, status, enrolled_at`,
          [tenantId, programmeId, body.beneficiary_id],
        );
        return r.rows[0];
      });
      ok(res, req, row, 201);
    } catch (err) {
      next(err);
    }
  },
);

app.get('/v1/beneficiary/duplicate-flags', requirePermission('beneficiary:duplicate:review'), async (req, res, next) => {
  try {
    const tenantId = requireTenantId(req.ctx.tenantId);
    const rows = await withTenant(pool, tenantId, async (client) => {
      const r = await client.query(
        `SELECT id, subject_id, candidate_id, score, priority, signals, status, created_at
         FROM beneficiary_duplicate_flags WHERE status = 'open'
         ORDER BY score DESC LIMIT 100`,
      );
      return r.rows;
    });
    ok(res, req, rows);
  } catch (err) {
    next(err);
  }
});

const aggregateSchema = z.object({
  cells: z
    .array(
      z.object({
        row: z.string(),
        col: z.string(),
        count: z.number().int().min(0),
      }),
    )
    .optional(),
  use_fixture: z.boolean().default(false),
});

/** Donor-safe aggregate with I.8 k-anonymity (k=5). */
app.post(
  '/v1/beneficiary/aggregates/publish-preview',
  requirePermission('beneficiary:record:list', 'beneficiary:record:export'),
  validateBody(aggregateSchema),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof aggregateSchema>;
      const cells: AggregateCell[] =
        body.use_fixture || !body.cells?.length ? KOCH_FIXTURE : body.cells;
      ok(res, req, suppressAggregate(cells));
    } catch (err) {
      next(err);
    }
  },
);

app.use(errorHandler(log));
await listen(app, config.PORT, log);
