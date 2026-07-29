/**
 * Starts an embedded Postgres on :5433 for local browser/dev testing
 * without relying on the system Postgres password.
 *
 * Usage: node scripts/start-embedded-db.mjs
 */
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const databaseDir = join(root, '.data', 'embedded-pg');
mkdirSync(databaseDir, { recursive: true });

const PORT = 5433;
const USER = 'ngois';
const PASSWORD = 'ngois_dev';
const DATABASE = 'ngois';

const pg = new EmbeddedPostgres({
  databaseDir,
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true,
});

const alreadyInitialised = existsSync(join(databaseDir, 'PG_VERSION'));
if (!alreadyInitialised) {
  console.log('Initialising embedded Postgres…');
  await pg.initialise();
} else {
  console.log('Using existing data directory', databaseDir);
}
console.log('Starting on port', PORT);
await pg.start();

try {
  await pg.createDatabase(DATABASE);
  console.log(`Database "${DATABASE}" ready`);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (!/already exists/i.test(msg)) throw err;
  console.log(`Database "${DATABASE}" already exists`);
}

const url = `postgres://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DATABASE}`;
console.log('DATABASE_URL=' + url);
console.log('Embedded Postgres is running. Leave this process open.');
console.log('In other terminals:');
console.log(`  $env:DATABASE_URL = '${url}'`);
console.log('  npm run db:migrate');
console.log('  npm run db:seed');

const shutdown = async () => {
  console.log('Stopping embedded Postgres…');
  try {
    await pg.stop();
  } catch {
    /* ignore */
  }
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Keep alive
await new Promise(() => {});
