import pg from 'pg';

const url = process.env.DATABASE_URL ?? 'postgres://ngois:ngois_dev@127.0.0.1:5433/ngois';
const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query(`
  ALTER ROLE ngois_app WITH LOGIN PASSWORD 'ngois_app_dev' NOSUPERUSER NOBYPASSRLS
`);
const r = await client.query(`
  SELECT rolname, rolsuper, rolbypassrls
  FROM pg_roles
  WHERE rolname IN ('ngois', 'ngois_app')
  ORDER BY rolname
`);
console.log(r.rows);
await client.end();
