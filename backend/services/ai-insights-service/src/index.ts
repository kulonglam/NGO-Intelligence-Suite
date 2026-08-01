import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  assertNoFieldTextInPrompt,
  extractFigures,
  numericalGuardrail,
  runRedactionGate,
} from '@ngois/ai-redaction';
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
  validateBody,
} from '@ngois/service-kit';
import { requireTenantId, withTenant } from '@ngois/tenant-context';
import { createLlmAdapter } from './llm.js';

const config = loadConfig(
  baseServiceSchema.extend({
    SERVICE_NAME: z.string().default('ai-insights-service'),
    PORT: z.coerce.number().default(3013),
    ANALYTICS_SERVICE_URL: z.string().default('http://127.0.0.1:3012'),
  }),
);

const pool = createPool(config.DATABASE_URL);
const { app, log } = createApp({ serviceName: config.SERVICE_NAME });
const llm = createLlmAdapter();

const generateSchema = z.object({
  use_case: z.enum(['grant_narrative', 'compliance_summary']).default('grant_narrative'),
  /** Forbidden: callers must not send field free text into generation. */
  field_free_texts: z.array(z.string()).optional(),
});

const approveSchema = z.object({
  edited_text: z.string().min(1).optional(),
  attest_verbatim: z.boolean().default(false),
});

const settingsSchema = z.object({
  ai_enabled: z.boolean().optional(),
  monthly_token_budget: z.number().int().positive().optional(),
});

function periodKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function loadSettings(client: import('pg').PoolClient, tenantId: string) {
  const r = await client.query(
    `SELECT ai_enabled, monthly_token_budget FROM tenant_ai_settings WHERE tenant_id = $1`,
    [tenantId],
  );
  return (
    r.rows[0] ?? {
      ai_enabled: true,
      monthly_token_budget: 100000,
    }
  );
}

async function usageForPeriod(client: import('pg').PoolClient, tenantId: string, period: string) {
  const r = await client.query(
    `SELECT tokens_used FROM ai_token_usage WHERE tenant_id = $1 AND period_yyyymm = $2`,
    [tenantId, period],
  );
  return Number(r.rows[0]?.tokens_used ?? 0);
}

app.get(
  '/v1/ai/settings',
  requirePermission('ai:budget:read', 'ai:module:disable', 'ai:insight:read'),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const row = await withTenant(pool, tenantId, async (client) => {
        const s = await loadSettings(client, tenantId);
        const used = await usageForPeriod(client, tenantId, periodKey());
        return { ...s, tokens_used_this_month: used, period: periodKey() };
      });
      ok(res, req, row);
    } catch (err) {
      next(err);
    }
  },
);

app.post(
  '/v1/ai/settings',
  requirePermission('ai:module:disable'),
  validateBody(settingsSchema),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const body = req.body as z.infer<typeof settingsSchema>;
      const row = await withTenant(pool, tenantId, async (client) => {
        await client.query(
          `INSERT INTO tenant_ai_settings (tenant_id, ai_enabled, monthly_token_budget)
           VALUES ($1, COALESCE($2, true), COALESCE($3, 100000))
           ON CONFLICT (tenant_id) DO UPDATE SET
             ai_enabled = COALESCE($2, tenant_ai_settings.ai_enabled),
             monthly_token_budget = COALESCE($3, tenant_ai_settings.monthly_token_budget),
             updated_at = now()`,
          [tenantId, body.ai_enabled ?? null, body.monthly_token_budget ?? null],
        );
        return loadSettings(client, tenantId);
      });
      ok(res, req, row);
    } catch (err) {
      next(err);
    }
  },
);

app.get(
  '/v1/ai/usage',
  requirePermission('ai:budget:read'),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const row = await withTenant(pool, tenantId, async (client) => {
        const s = await loadSettings(client, tenantId);
        const used = await usageForPeriod(client, tenantId, periodKey());
        const budget = Number(s.monthly_token_budget);
        return {
          period: periodKey(),
          tokens_used: used,
          budget,
          remaining: Math.max(0, budget - used),
          degraded: used >= budget,
        };
      });
      ok(res, req, row);
    } catch (err) {
      next(err);
    }
  },
);

app.post(
  '/v1/ai/insights/generate',
  requirePermission('ai:insight:request'),
  validateBody(generateSchema),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const body = req.body as z.infer<typeof generateSchema>;
      if (body.field_free_texts?.length) {
        throw validationError('field free text must never enter AI prompts', 'field_free_texts');
      }

      const result = await withTenant(pool, tenantId, async (client) => {
        const settings = await loadSettings(client, tenantId);
        if (!settings.ai_enabled) {
          throw new AppError({
            code: 'NGOIS-AI-0001',
            message: 'AI is disabled for this tenant (kill switch).',
            statusCode: 503,
          });
        }
        const period = periodKey();
        const used = await usageForPeriod(client, tenantId, period);
        const budget = Number(settings.monthly_token_budget);
        if (used >= budget) {
          throw new AppError({
            code: 'NGOIS-AI-budget',
            message: 'Monthly AI token budget exhausted — generation degraded/blocked.',
            statusCode: 429,
            detail: `used=${used} budget=${budget}`,
          });
        }

        // Fetch aggregate context from analytics (never beneficiaries table)
        const headers: Record<string, string> = {
          Accept: 'application/json',
          'x-tenant-id': tenantId,
          'x-user-id': req.ctx.userId ?? '',
          'x-user-role': req.ctx.role ?? '',
          'x-permissions': (req.ctx.permissions ?? []).join(','),
          'x-correlation-id': req.ctx.correlationId,
        };
        const auth = req.header('authorization');
        if (auth) headers.authorization = auth;
        const ctxRes = await fetch(`${config.ANALYTICS_SERVICE_URL}/v1/analytics/context/for-ai`, {
          headers,
        });
        const ctxJson = (await ctxRes.json()) as {
          success: boolean;
          data: Record<string, unknown>;
          errors?: Array<{ message: string }>;
        };
        if (!ctxRes.ok || !ctxJson.success) {
          throw new AppError({
            code: 'NGOIS-AI-0002',
            message: ctxJson.errors?.[0]?.message ?? 'Failed to load analytics context',
            statusCode: 502,
          });
        }
        const structured = ctxJson.data;

        const gate = runRedactionGate({
          structured,
          source_view: String(structured.source_view ?? 'analytics_aggregates'),
          classification_max: (structured.classification_max as 'internal') ?? 'internal',
        });
        if (!gate.ok) {
          throw new AppError({
            code: gate.code,
            message: `Redaction gate blocked egress: ${gate.reason}`,
            statusCode: 422,
            detail: gate.detectors_fired.join(','),
          });
        }

        const promptRow = await client.query(
          `SELECT version, template FROM ai_prompts
           WHERE code = 'grant_narrative_v1' AND is_current LIMIT 1`,
        );
        const template =
          promptRow.rows[0]?.template ??
          'Write a short donor narrative from these aggregates only:\n{{context}}';
        const version = promptRow.rows[0]?.version ?? '1';
        const prompt = template.replace('{{context}}', JSON.stringify(gate.cleared));

        if (!assertNoFieldTextInPrompt(prompt, body.field_free_texts ?? [])) {
          throw new AppError({
            code: 'NGOIS-AI-0004',
            message: 'Injection defence: field text detected in prompt',
            statusCode: 422,
          });
        }

        const gen = await llm.generate(prompt);
        const figures = extractFigures(gate.cleared);
        const guard = numericalGuardrail(gen.text, figures);
        if (!guard.ok) {
          throw new AppError({
            code: 'NGOIS-AI-0005',
            message: 'Numerical guardrail failed — unmatched figures in output',
            statusCode: 422,
            detail: guard.unmatched.join(','),
          });
        }

        const id = randomUUID();
        const hash = createHash('sha256').update(prompt).digest('hex');
        await client.query(
          `INSERT INTO ai_generations (
             id, tenant_id, use_case, model_identifier, prompt_template_version, prompt_hash,
             prompt_stored, response_text, input_tokens, output_tokens, latency_ms,
             redaction_passed, guardrail_results, context_figures, approval_status, requested_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,$12::jsonb,$13::jsonb,'unapproved',$14)`,
          [
            id,
            tenantId,
            body.use_case,
            gen.model,
            version,
            hash,
            prompt,
            gen.text,
            gen.input_tokens,
            gen.output_tokens,
            gen.latency_ms,
            JSON.stringify({ numerical: guard, redaction: gate.detectors_fired }),
            JSON.stringify(figures),
            req.ctx.userId ?? null,
          ],
        );
        await client.query(
          `INSERT INTO ai_review_queue (tenant_id, generation_id) VALUES ($1,$2)`,
          [tenantId, id],
        );
        const tokens = gen.input_tokens + gen.output_tokens;
        await client.query(
          `INSERT INTO ai_token_usage (tenant_id, period_yyyymm, tokens_used)
           VALUES ($1,$2,$3)
           ON CONFLICT (tenant_id, period_yyyymm) DO UPDATE
             SET tokens_used = ai_token_usage.tokens_used + EXCLUDED.tokens_used,
                 updated_at = now()`,
          [tenantId, period, tokens],
        );
        await writeAuditEvent(client, {
          tenantId,
          serviceName: config.SERVICE_NAME,
          action: 'ai.insight.generated',
          resourceType: 'ai_generation',
          resourceId: id,
          actorUserId: req.ctx.userId,
          actorRole: req.ctx.role,
          correlationId: req.ctx.correlationId,
        });
        return {
          id,
          approval_status: 'unapproved',
          response_text: gen.text,
          model: gen.model,
          tokens,
          machine_generated: true,
        };
      });
      ok(res, req, result, 201);
    } catch (err) {
      next(err);
    }
  },
);

app.get(
  '/v1/ai/insights',
  requirePermission('ai:insight:read'),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const rows = await withTenant(pool, tenantId, async (client) => {
        const r = await client.query(
          `SELECT id, use_case, model_identifier, approval_status, created_at,
                  left(response_text, 200) AS preview
           FROM ai_generations ORDER BY created_at DESC LIMIT 50`,
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
  '/v1/ai/insights/:id',
  requirePermission('ai:insight:read'),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const row = await withTenant(pool, tenantId, async (client) => {
        const r = await client.query(`SELECT * FROM ai_generations WHERE id = $1`, [req.params.id]);
        if (!r.rows[0]) throw notFound('generation');
        return r.rows[0];
      });
      ok(res, req, { ...row, machine_generated: row.approval_status === 'unapproved' });
    } catch (err) {
      next(err);
    }
  },
);

app.post(
  '/v1/ai/insights/:id/approve',
  requirePermission('ai:insight:approve'),
  validateBody(approveSchema),
  async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const body = req.body as z.infer<typeof approveSchema>;
      if (!body.edited_text && !body.attest_verbatim) {
        throw validationError(
          'Approve requires edited_text or attest_verbatim',
          'attest_verbatim',
        );
      }
      const row = await withTenant(pool, tenantId, async (client) => {
        const existing = await client.query(
          `SELECT * FROM ai_generations WHERE id = $1`,
          [req.params.id],
        );
        if (!existing.rows[0]) throw notFound('generation');
        if (existing.rows[0].approval_status === 'approved') {
          return existing.rows[0];
        }
        const finalText = body.edited_text ?? existing.rows[0].response_text;
        const edited = Boolean(body.edited_text && body.edited_text !== existing.rows[0].response_text);
        const r = await client.query(
          `UPDATE ai_generations
           SET approval_status = 'approved',
               response_text = $2,
               approved_by = $3,
               approved_at = now(),
               edited_before_use = $4
           WHERE id = $1
           RETURNING *`,
          [req.params.id, finalText, req.ctx.userId ?? null, edited || body.attest_verbatim],
        );
        await client.query(
          `UPDATE ai_review_queue SET status = 'resolved', resolved_at = now()
           WHERE generation_id = $1`,
          [req.params.id],
        );
        await writeAuditEvent(client, {
          tenantId,
          serviceName: config.SERVICE_NAME,
          action: 'ai.insight.approved',
          resourceType: 'ai_generation',
          resourceId: req.params.id!,
          actorUserId: req.ctx.userId,
          actorRole: req.ctx.role,
          afterState: { edited, attest_verbatim: body.attest_verbatim },
          correlationId: req.ctx.correlationId,
        });
        // Never write to person decision fields — approval only marks narrative.
        return r.rows[0];
      });
      ok(res, req, row);
    } catch (err) {
      next(err);
    }
  },
);

app.use(errorHandler(log));
await listen(app, config.PORT, log);
