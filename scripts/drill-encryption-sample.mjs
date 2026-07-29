/**
 * Gate #8 — encrypt/decrypt round-trip with tenant DEK via @ngois/crypto.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = join(root, 'ops', 'drills', 'evidence');
mkdirSync(evidenceDir, { recursive: true });

const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://ngois:ngois_dev@127.0.0.1:5433/ngois';
const tenantId = '11111111-1111-4111-8111-111111111111';
const sample = 'PII sample: Jane Doe +211900000001';

const cryptoMod = await import(
  pathToFileURL(join(root, 'backend/packages/crypto/dist/index.js')).href
);
const { ensureTenantDek, encryptUtf8, decryptUtf8 } = cryptoMod;

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
await client.query('BEGIN');
await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);

const { keyVersion, dek } = await ensureTenantDek(client, tenantId);
const { ciphertext } = encryptUtf8(dek, sample, keyVersion);
const plain = decryptUtf8(dek, ciphertext);
await client.query('COMMIT');
await client.end();

const ok = plain === sample;
const evidence = {
  gate: 8,
  at: new Date().toISOString(),
  ok,
  tenantId,
  keyVersion,
  ciphertextPrefix: ciphertext.slice(0, 24),
  roundTrip: ok,
};
writeFileSync(join(evidenceDir, 'encryption-sample.json'), JSON.stringify(evidence, null, 2));

if (!ok) {
  console.error('drill:encryption FAIL');
  process.exit(1);
}
console.log('drill:encryption OK');
