/**
 * Emits backend/db/migrations/002_rbac.sql (schema + seed) from the MATRIX.
 * Regenerate: npm run generate:sql -w @ngois/rbac
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MATRIX, parseGrantCell } from './matrix.js';
import { ROLES } from './roles.js';

const header = `-- 002_rbac.sql
-- Appendix C RBAC: align roles, permissions catalogue, role_permissions seed
-- Generated from @ngois/rbac - regenerate with: npm run generate:sql -w @ngois/rbac

-- ---------------------------------------------------------------------------
-- Role rename (legacy scaffold -> Appendix C)
-- ---------------------------------------------------------------------------
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

UPDATE users SET role = 'org_admin' WHERE role = 'ngo_admin';
UPDATE users SET role = 'm_e_officer' WHERE role IN ('programme_manager', 'm&e_officer');
UPDATE users SET role = 'donor_viewer' WHERE role = 'viewer';

ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (
  'super_admin', 'org_admin', 'finance_manager', 'hr_manager',
  'm_e_officer', 'field_officer', 'donor_viewer', 'auditor'
));

-- ---------------------------------------------------------------------------
-- Permission catalogue
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS permissions (
  code        text PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role             text NOT NULL CHECK (role IN (
                     'super_admin', 'org_admin', 'finance_manager', 'hr_manager',
                     'm_e_officer', 'field_officer', 'donor_viewer', 'auditor'
                   )),
  permission_code  text NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  scoped           boolean NOT NULL DEFAULT false,
  own_only         boolean NOT NULL DEFAULT false,
  maker_checker    boolean NOT NULL DEFAULT false,
  break_glass      boolean NOT NULL DEFAULT false,
  purpose_logged   boolean NOT NULL DEFAULT false,
  dpo_required     boolean NOT NULL DEFAULT false,
  PRIMARY KEY (role, permission_code)
);

CREATE INDEX IF NOT EXISTS role_permissions_permission_idx ON role_permissions (permission_code);

-- Platform catalogue tables: readable by app role; mutable only via migrations/seed
GRANT SELECT ON permissions TO ngois_app;
GRANT SELECT ON role_permissions TO ngois_app;

`;

const lines: string[] = [header];

for (const row of MATRIX) {
  const esc = row.permission.replace(/'/g, "''");
  lines.push(`INSERT INTO permissions (code) VALUES ('${esc}') ON CONFLICT (code) DO NOTHING;`);
}

for (const role of ROLES) {
  const idx = ROLES.indexOf(role);
  for (const row of MATRIX) {
    const cell = row.grants[idx];
    if (!cell) continue;
    const flags = parseGrantCell(cell);
    if (!flags.granted && !flags.breakGlass && !flags.dpoRequired) continue;
    const esc = row.permission.replace(/'/g, "''");
    lines.push(
      `INSERT INTO role_permissions (role, permission_code, scoped, own_only, maker_checker, break_glass, purpose_logged, dpo_required) ` +
        `VALUES ('${role}', '${esc}', ${flags.scoped}, ${flags.ownOnly}, ${flags.makerChecker}, ${flags.breakGlass}, ${flags.purposeLogged}, ${flags.dpoRequired}) ` +
        `ON CONFLICT (role, permission_code) DO UPDATE SET scoped = EXCLUDED.scoped, own_only = EXCLUDED.own_only, maker_checker = EXCLUDED.maker_checker, break_glass = EXCLUDED.break_glass, purpose_logged = EXCLUDED.purpose_logged, dpo_required = EXCLUDED.dpo_required;`,
    );
  }
}

const out = join(dirname(fileURLToPath(import.meta.url)), '../../../db/migrations/002_rbac.sql');
writeFileSync(out, lines.join('\n') + '\n', 'utf8');
console.log(`wrote ${out} (${lines.length} statements)`);
