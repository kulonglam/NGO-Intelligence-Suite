/**
 * Retention sweep (default --dry-run). Soft-deletes expired file_objects when not on hold.
 * Writes report JSON under .data/retention/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const dryRun = !process.argv.includes('--apply');
const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://ngois:ngois_dev@127.0.0.1:5433/ngois';

const outDir = join(root, '.data', 'retention');
mkdirSync(outDir, { recursive: true });

const pool = new pg.Pool({ connectionString: databaseUrl });

async function main() {
  const client = await pool.connect();
  const started = new Date().toISOString();
  try {
    await client.query('BEGIN');
    // Owner role for cross-tenant sweep framework (ops job).
    const candidates = await client.query(
      `SELECT f.id, f.tenant_id, f.retention_until, f.original_filename
       FROM file_objects f
       WHERE f.retention_until IS NOT NULL
         AND f.retention_until < CURRENT_DATE
         AND NOT f.is_deleted
       ORDER BY f.retention_until ASC
       LIMIT 500`,
    );

    const heldTenants = await client.query(
      `SELECT DISTINCT tenant_id FROM legal_holds
       WHERE released_at IS NULL AND scope_type = 'tenant'`,
    );
    const heldTenantIds = new Set(heldTenants.rows.map((r) => r.tenant_id));

    const heldFiles = await client.query(
      `SELECT scope_id FROM legal_holds
       WHERE released_at IS NULL AND scope_type = 'file' AND scope_id IS NOT NULL`,
    );
    const heldFileIds = new Set(heldFiles.rows.map((r) => r.scope_id));

    const wouldAffect = [];
    const skippedHold = [];
    for (const row of candidates.rows) {
      if (heldTenantIds.has(row.tenant_id) || heldFileIds.has(row.id)) {
        skippedHold.push(row.id);
        continue;
      }
      wouldAffect.push(row);
    }

    let affected = 0;
    if (!dryRun) {
      for (const row of wouldAffect) {
        await client.query(
          `UPDATE file_objects SET is_deleted = true, deleted_at = now(), updated_at = now()
           WHERE id = $1 AND NOT is_deleted`,
          [row.id],
        );
        affected += 1;
      }
    }

    const report = {
      started,
      finished: new Date().toISOString(),
      dryRun,
      candidates: candidates.rowCount,
      wouldAffect: wouldAffect.length,
      affected: dryRun ? 0 : affected,
      skippedHold: skippedHold.length,
      sampleIds: wouldAffect.slice(0, 20).map((r) => r.id),
    };

    await client.query(
      `INSERT INTO retention_sweep_runs (dry_run, finished_at, would_affect, affected, report, status)
       VALUES ($1, now(), $2, $3, $4::jsonb, 'completed')`,
      [dryRun, wouldAffect.length, dryRun ? 0 : affected, JSON.stringify(report)],
    );
    await client.query('COMMIT');

    const stamp = started.replace(/[:.]/g, '-');
    const outPath = join(outDir, `sweep-${stamp}.json`);
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ok: true, outPath, ...report }, null, 2));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
