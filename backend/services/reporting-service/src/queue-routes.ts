import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Express } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import { writeAuditEvent } from '@ngois/audit';
import { AppError } from '@ngois/errors';
import { ok, requirePermission, validateBody } from '@ngois/service-kit';
import { requireTenantId, withTenant } from '@ngois/tenant-context';
import { linesToPdf, rowsToCsv, rowsToXlsx } from './exporters.js';

type ServiceConfig = { SERVICE_NAME: string; REPORT_STORAGE_ROOT: string };

const enqueueSchema = z.object({
  job_type: z.enum([
    'grant_export',
    'portfolio_csv',
    'budget_vs_actual',
    'leave_balances',
  ]),
  formats: z.array(z.enum(['csv', 'xlsx', 'pdf', 'html', 'json'])).default(['csv']),
  input: z.record(z.unknown()).default({}),
});

async function assertReportQuota(client: pg.PoolClient, tenantId: string): Promise<void> {
  const q = await client.query<{ concurrent_reports: number }>(
    `SELECT concurrent_reports FROM tenant_quotas WHERE tenant_id = $1`,
    [tenantId],
  );
  const max = q.rows[0]?.concurrent_reports ?? 3;
  const running = await client.query(
    `SELECT count(*)::int AS n FROM report_jobs WHERE tenant_id = $1 AND status IN ('queued','running')`,
    [tenantId],
  );
  if ((running.rows[0]?.n ?? 0) >= max) {
    throw new AppError({
      code: 'NGOIS-RPT-0042',
      message: `Concurrent report quota exceeded (max ${max}).`,
      statusCode: 429,
    });
  }
}

async function storeArtifact(
  client: pg.PoolClient,
  config: ServiceConfig,
  tenantId: string,
  jobId: string,
  format: string,
  filename: string,
  content: string | Buffer,
): Promise<{ id: string; format: string; byte_size: number }> {
  const relDir = join(tenantId, jobId);
  const absDir = join(config.REPORT_STORAGE_ROOT, relDir);
  mkdirSync(absDir, { recursive: true });
  const storagePath = join(relDir, filename).replace(/\\/g, '/');
  const absPath = join(config.REPORT_STORAGE_ROOT, storagePath);
  const buf = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
  await writeFile(absPath, buf);
  const { createHash } = await import('node:crypto');
  const checksum = createHash('sha256').update(buf).digest('hex');
  const id = randomUUID();
  await client.query(
    `INSERT INTO report_artifacts (id, tenant_id, job_id, format, storage_path, byte_size, checksum_sha256)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, tenantId, jobId, format, storagePath, buf.length, checksum],
  );
  return { id, format, byte_size: buf.length };
}

async function buildStandardReport(
  client: pg.PoolClient,
  jobType: string,
): Promise<{ headers: string[]; rows: string[][]; title: string }> {
  if (jobType === 'portfolio_csv' || jobType === 'grant_export') {
    const r = await client.query(
      `SELECT grant_number, title, donor_name, currency, total_budget::text, status::text
       FROM grants WHERE deleted_at IS NULL ORDER BY grant_number`,
    );
    return {
      title: 'Grant portfolio',
      headers: ['grant_number', 'title', 'donor_name', 'currency', 'total_budget', 'status'],
      rows: r.rows.map((x) => [
        x.grant_number,
        x.title,
        x.donor_name,
        x.currency,
        x.total_budget,
        x.status,
      ]),
    };
  }
  if (jobType === 'budget_vs_actual') {
    const r = await client.query(
      `SELECT g.grant_number, g.total_budget::text,
              COALESCE((SELECT sum(d.amount) FROM disbursements d
                WHERE d.grant_id=g.id AND d.status IN ('approved','reconciled') AND NOT d.is_deleted),0)::text AS disbursed,
              COALESCE((SELECT sum(e.amount) FROM expenses e
                WHERE e.grant_id=g.id AND e.status='approved'),0)::text AS expenses
       FROM grants g WHERE g.deleted_at IS NULL ORDER BY g.grant_number`,
    );
    return {
      title: 'Budget vs actual',
      headers: ['grant_number', 'budget', 'disbursed', 'expenses'],
      rows: r.rows.map((x) => [x.grant_number, x.total_budget, x.disbursed, x.expenses]),
    };
  }
  // leave_balances
  const r = await client.query(
    `SELECT e.employee_number, e.display_name, lt.code,
            lb.accrued_days::text, lb.taken_days::text
     FROM leave_balances lb
     JOIN employees e ON e.id = lb.employee_id
     JOIN leave_types lt ON lt.id = lb.leave_type_id
     ORDER BY e.employee_number`,
  );
  return {
    title: 'Leave balances',
    headers: ['employee_number', 'display_name', 'leave_type', 'accrued', 'taken'],
    rows: r.rows.map((x) => [
      x.employee_number,
      x.display_name,
      x.code,
      x.accrued_days,
      x.taken_days,
    ]),
  };
}

export function registerQueueRoutes(
  app: Express,
  pool: pg.Pool,
  config: ServiceConfig,
): void {
  mkdirSync(config.REPORT_STORAGE_ROOT, { recursive: true });

  app.post(
    '/v1/reporting/jobs',
    requirePermission('reporting:report:generate'),
    validateBody(enqueueSchema),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const body = req.body as z.infer<typeof enqueueSchema>;
        const jobId = randomUUID();
        await withTenant(pool, tenantId, async (client) => {
          await assertReportQuota(client, tenantId);
          await client.query(
            `INSERT INTO report_jobs (id, tenant_id, job_type, status, requested_by, input)
             VALUES ($1,$2,$3,'queued',$4,$5::jsonb)`,
            [
              jobId,
              tenantId,
              body.job_type,
              req.ctx.userId ?? null,
              JSON.stringify({ ...body.input, formats: body.formats }),
            ],
          );
        });
        ok(res, req, { job_id: jobId, status: 'queued' }, 202);
      } catch (err) {
        next(err);
      }
    },
  );

  /** Round-robin claim: prefer tenants with oldest last-completed job. */
  app.post(
    '/v1/reporting/jobs/claim',
    requirePermission('reporting:definition:admin', 'reporting:report:generate'),
    async (req, res, next) => {
      try {
        // Platform-style claim without tenant header — use owner connection briefly via pool
        // but still scoped: claim one queued job fairly.
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(`SELECT set_config('app.claim_mode', 'on', true)`);
          // Fair-share claim: oldest last-completed tenant first.
          // Cannot combine FOR UPDATE with window functions — ORDER BY + LIMIT instead.
          const claimed = await client.query<{
            id: string;
            tenant_id: string;
            job_type: string;
            input: Record<string, unknown>;
          }>(
            `WITH next_job AS (
               SELECT j.id
               FROM report_jobs j
               WHERE j.status = 'queued'
               ORDER BY COALESCE(
                 (SELECT max(j2.finished_at) FROM report_jobs j2
                  WHERE j2.tenant_id = j.tenant_id AND j2.status = 'completed'),
                 '1970-01-01'::timestamptz
               ) ASC,
               j.created_at ASC
               FOR UPDATE OF j SKIP LOCKED
               LIMIT 1
             )
             UPDATE report_jobs j
             SET status = 'running', started_at = now()
             FROM next_job n
             WHERE j.id = n.id
             RETURNING j.id, j.tenant_id, j.job_type, j.input`,
          );
          if (!claimed.rows[0]) {
            await client.query('COMMIT');
            ok(res, req, { claimed: null });
            return;
          }
          const job = claimed.rows[0];
          await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [job.tenant_id]);
          await client.query(`SELECT set_config('app.claim_mode', 'on', true)`);
          try {
            const { headers, rows, title } = await buildStandardReport(client, job.job_type);
            const formats = (Array.isArray(job.input?.formats)
              ? job.input.formats
              : ['csv']) as string[];
            const artifacts = [];
            for (const format of formats) {
              let content: string | Buffer;
              let filename: string;
              if (format === 'xlsx') {
                content = rowsToXlsx(title, headers, rows);
                filename = 'report.xml';
              } else if (format === 'pdf') {
                content = linesToPdf(
                  title,
                  [headers.join(' | '), ...rows.map((r) => r.join(' | '))],
                );
                filename = 'report.pdf';
              } else if (format === 'json') {
                content = JSON.stringify({ title, headers, rows }, null, 2);
                filename = 'report.json';
              } else if (format === 'html') {
                content = `<html><body><h1>${title}</h1><pre>${rowsToCsv(headers, rows)}</pre></body></html>`;
                filename = 'report.html';
              } else {
                content = rowsToCsv(headers, rows);
                filename = 'report.csv';
              }
              artifacts.push(
                await storeArtifact(
                  client,
                  config,
                  job.tenant_id,
                  job.id,
                  format === 'xlsx' ? 'xlsx' : format,
                  filename,
                  content,
                ),
              );
            }
            await client.query(
              `UPDATE report_jobs SET status='completed', result=$2::jsonb, finished_at=now() WHERE id=$1`,
              [job.id, JSON.stringify({ title, row_count: rows.length, artifacts })],
            );
            await writeAuditEvent(client, {
              tenantId: job.tenant_id,
              serviceName: config.SERVICE_NAME,
              action: 'reporting.job.completed',
              resourceType: 'report_job',
              resourceId: job.id,
              afterState: { job_type: job.job_type, rows: rows.length },
              correlationId: req.ctx.correlationId,
            });
            await client.query('COMMIT');
            ok(res, req, { claimed: job.id, status: 'completed', artifacts });
          } catch (err) {
            await client.query(
              `UPDATE report_jobs SET status='failed', error_message=$2, finished_at=now() WHERE id=$1`,
              [job.id, (err instanceof Error ? err.message : 'fail').slice(0, 2000)],
            );
            await client.query('COMMIT');
            throw err;
          }
        } catch (err) {
          try {
            await client.query('ROLLBACK');
          } catch {
            /* */
          }
          throw err;
        } finally {
          client.release();
        }
      } catch (err) {
        next(err);
      }
    },
  );
}
