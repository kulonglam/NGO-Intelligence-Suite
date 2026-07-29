import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Express } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import { writeAuditEvent } from '@ngois/audit';
import { AppError, notFound } from '@ngois/errors';
import { ok, requirePermission, validateBody } from '@ngois/service-kit';
import { requireTenantId, withTenant } from '@ngois/tenant-context';
import {
  buildPayslipCsv,
  buildPayslipHtml,
  sha256Hex,
  type PayslipRecord,
} from './payslip-export.js';
import { resolvePayrollSchema, withPayrollSchema } from './payroll-schema.js';

type ServiceConfig = {
  SERVICE_NAME: string;
  REPORT_STORAGE_ROOT: string;
};

const payslipJobSchema = z.object({
  payroll_run_id: z.string().uuid(),
  formats: z.array(z.enum(['csv', 'html'])).default(['csv', 'html']),
});

const EXPORTABLE_STATUSES = new Set(['computed', 'pending_approval', 'approved']);

export function registerReportingRoutes(
  app: Express,
  pool: pg.Pool,
  config: ServiceConfig,
): void {
  mkdirSync(config.REPORT_STORAGE_ROOT, { recursive: true });

  app.get('/v1/reporting/jobs', requirePermission('reporting:report:read'), async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const rows = await withTenant(pool, tenantId, async (client) => {
        const r = await client.query(
          `SELECT id, job_type, status, input, result, error_message, created_at, finished_at
           FROM report_jobs ORDER BY created_at DESC LIMIT 50`,
        );
        return r.rows;
      });
      ok(res, req, rows);
    } catch (err) {
      next(err);
    }
  });

  app.get('/v1/reporting/jobs/:id', requirePermission('reporting:report:read'), async (req, res, next) => {
    try {
      const tenantId = requireTenantId(req.ctx.tenantId);
      const jobId = req.params.id!;
      const payload = await withTenant(pool, tenantId, async (client) => {
        const job = await client.query(
          `SELECT id, job_type, status, input, result, error_message, created_at, started_at, finished_at
           FROM report_jobs WHERE id = $1`,
          [jobId],
        );
        if (!job.rows[0]) return null;
        const arts = await client.query(
          `SELECT id, format, byte_size, checksum_sha256, created_at
           FROM report_artifacts WHERE job_id = $1 ORDER BY created_at`,
          [jobId],
        );
        return { ...job.rows[0], artifacts: arts.rows };
      });
      if (!payload) throw notFound('report_job', jobId);
      ok(res, req, payload);
    } catch (err) {
      next(err);
    }
  });

  app.post(
    '/v1/reporting/payslips',
    requirePermission('reporting:report:generate'),
    validateBody(payslipJobSchema),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const body = req.body as z.infer<typeof payslipJobSchema>;
        const jobId = randomUUID();

        const result = await withTenant(pool, tenantId, async (client) => {
          await client.query(
            `INSERT INTO report_jobs (id, tenant_id, job_type, status, requested_by, input, started_at)
             VALUES ($1, $2, 'payslip_export', 'running', $3, $4::jsonb, now())`,
            [
              jobId,
              tenantId,
              req.ctx.userId ?? null,
              JSON.stringify({
                payroll_run_id: body.payroll_run_id,
                formats: body.formats,
              }),
            ],
          );

          try {
            const schema = await resolvePayrollSchema(client, tenantId);
            const runMeta = await withPayrollSchema(client, schema, async () => {
              const r = await client.query<{
                period_year: number;
                period_month: number;
                status: string;
              }>(
                `SELECT period_year, period_month, status FROM payroll_runs WHERE id = $1`,
                [body.payroll_run_id],
              );
              return r.rows[0];
            });
            if (!runMeta) throw notFound('payroll_run', body.payroll_run_id);
            if (!EXPORTABLE_STATUSES.has(runMeta.status)) {
              throw new AppError({
                code: 'NGOIS-RPT-0020',
                message: 'Payroll run must be calculated before payslip export.',
                statusCode: 409,
              });
            }

            const records = await withPayrollSchema(client, schema, async () => {
              const r = await client.query<{
                employee_number: string;
                display_name: string;
                gross: string;
                total_deductions: string;
                net: string;
                employer_cost: string;
                currency: string;
                record_id: string;
              }>(
                `SELECT e.employee_number, e.display_name,
                        pr.gross::text, pr.total_deductions::text, pr.net::text,
                        pr.employer_cost::text, pr.currency, pr.id AS record_id
                 FROM payroll_records pr
                 JOIN employees e ON e.id = pr.employee_id
                 WHERE pr.payroll_run_id = $1
                 ORDER BY e.employee_number`,
                [body.payroll_run_id],
              );
              const out: PayslipRecord[] = [];
              for (const row of r.rows) {
                const lines = await client.query<{
                  component_code: string;
                  basis_amount: string;
                  rate_applied: string | null;
                  amount: string;
                }>(
                  `SELECT component_code, basis_amount::text, rate_applied::text, amount::text
                   FROM payroll_record_lines
                   WHERE payroll_record_id = $1
                   ORDER BY line_order`,
                  [row.record_id],
                );
                out.push({
                  employee_number: row.employee_number,
                  display_name: row.display_name,
                  gross: row.gross,
                  total_deductions: row.total_deductions,
                  net: row.net,
                  employer_cost: row.employer_cost,
                  currency: row.currency,
                  lines: lines.rows,
                });
              }
              return out;
            });

            const artifacts: Array<{ id: string; format: string; byte_size: number }> = [];
            const relDir = join(tenantId, jobId);
            const absDir = join(config.REPORT_STORAGE_ROOT, relDir);
            mkdirSync(absDir, { recursive: true });

            for (const format of body.formats) {
              let content: string;
              let filename: string;
              if (format === 'csv') {
                content = buildPayslipCsv(runMeta, records);
                filename = 'payslips.csv';
              } else {
                content = buildPayslipHtml(runMeta, records);
                filename = 'payslips.html';
              }
              const storagePath = join(relDir, filename);
              const absPath = join(config.REPORT_STORAGE_ROOT, storagePath);
              await writeFile(absPath, content, 'utf8');
              const checksum = sha256Hex(content);
              const artifactId = randomUUID();
              await client.query(
                `INSERT INTO report_artifacts (
                   id, tenant_id, job_id, format, storage_path, byte_size, checksum_sha256
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                [
                  artifactId,
                  tenantId,
                  jobId,
                  format,
                  storagePath.replace(/\\/g, '/'),
                  Buffer.byteLength(content, 'utf8'),
                  checksum,
                ],
              );
              artifacts.push({
                id: artifactId,
                format,
                byte_size: Buffer.byteLength(content, 'utf8'),
              });
            }

            await client.query(
              `UPDATE report_jobs SET
                 status = 'completed',
                 result = $2::jsonb,
                 finished_at = now()
               WHERE id = $1`,
              [
                jobId,
                JSON.stringify({
                  payroll_run_id: body.payroll_run_id,
                  employee_count: records.length,
                  artifacts,
                }),
              ],
            );

            await writeAuditEvent(client, {
              tenantId,
              serviceName: config.SERVICE_NAME,
              action: 'reporting.payslip.exported',
              resourceType: 'payroll_run',
              resourceId: body.payroll_run_id,
              actorUserId: req.ctx.userId,
              actorRole: req.ctx.role,
              afterState: { job_id: jobId, formats: body.formats, employee_count: records.length },
              correlationId: req.ctx.correlationId,
            });

            return { job_id: jobId, status: 'completed', employee_count: records.length, artifacts };
          } catch (err) {
            try {
              await client.query(
                `UPDATE report_jobs SET status = 'failed', error_message = $2, finished_at = now() WHERE id = $1`,
                [jobId, (err instanceof Error ? err.message : 'Export failed').slice(0, 2000)],
              );
            } catch {
              /* preserve original error if txn already aborted */
            }
            throw err;
          }
        });

        ok(res, req, result, 202);
      } catch (err) {
        next(err);
      }
    },
  );

  app.get(
    '/v1/reporting/jobs/:jobId/artifacts/:artifactId/download',
    requirePermission('reporting:report:export'),
    async (req, res, next) => {
      try {
        const tenantId = requireTenantId(req.ctx.tenantId);
        const { jobId, artifactId } = req.params;
        const meta = await withTenant(pool, tenantId, async (client) => {
          const r = await client.query<{
            storage_path: string;
            format: string;
            byte_size: string;
          }>(
            `SELECT a.storage_path, a.format, a.byte_size::text
             FROM report_artifacts a
             JOIN report_jobs j ON j.id = a.job_id
             WHERE a.id = $1 AND a.job_id = $2 AND j.status = 'completed'`,
            [artifactId, jobId],
          );
          return r.rows[0];
        });
        if (!meta) throw notFound('report_artifact', artifactId!);
        if (!meta.storage_path.startsWith(`${tenantId}/`)) {
          throw new AppError({
            code: 'NGOIS-RPT-0004',
            message: 'Storage path failed tenant prefix check.',
            statusCode: 500,
          });
        }
        const absPath = join(config.REPORT_STORAGE_ROOT, meta.storage_path);
        if (!existsSync(absPath)) throw notFound('report content', artifactId!);

        const contentType = meta.format === 'csv' ? 'text/csv' : 'text/html';
        const filename = meta.format === 'csv' ? 'payslips.csv' : 'payslips.html';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        createReadStream(absPath).pipe(res);
      } catch (err) {
        next(err);
      }
    },
  );
}
