import { MATRIX, parseGrantCell, type PermissionFlags } from './matrix.js';
import { ROLES, isRole, type Role } from './roles.js';

export type RolePermission = PermissionFlags & {
  permission: string;
  role: Role;
};

const WRITE_ACTIONS = new Set([
  'create',
  'update',
  'delete',
  'approve',
  'reject',
  'submit',
  'admin',
  'reverse',
  'terminate',
  'invite',
  'assign',
  'revoke',
  'suspend',
  'provision',
  'offboard',
  'enable',
  'publish',
  'configure',
  'merge',
  'assess',
  'record',
  'wipe',
  'calculate',
  'generate',
  'issue',
  'override',
  'close',
  'request',
]);

function actionOf(permission: string): string {
  const parts = permission.split(':');
  return parts[parts.length - 1] ?? '';
}

/** Standing JWT permissions: granted and not break-glass / DPO-gated. */
export function permissionsForRole(role: Role): string[] {
  const idx = ROLES.indexOf(role);
  if (idx < 0) return [];
  const out: string[] = [];
  for (const row of MATRIX) {
    const cell = row.grants[idx];
    if (!cell) continue;
    const flags = parseGrantCell(cell);
    if (flags.granted) out.push(row.permission);
  }
  return out;
}

export function permissionFlags(role: Role, permission: string): PermissionFlags | null {
  const idx = ROLES.indexOf(role);
  const row = MATRIX.find((r) => r.permission === permission);
  if (!row || idx < 0) return null;
  const cell = row.grants[idx];
  if (!cell) return null;
  return parseGrantCell(cell);
}

export function roleHasPermission(role: Role, permission: string): boolean {
  return permissionsForRole(role).includes(permission);
}

export function allPermissions(): string[] {
  return MATRIX.map((r) => r.permission);
}

export function expandRoleOrThrow(role: string): { role: Role; permissions: string[] } {
  if (!isRole(role)) {
    throw new Error(`Unknown role: ${role}`);
  }
  return { role, permissions: permissionsForRole(role) };
}

export function isWritePermission(permission: string): boolean {
  const action = actionOf(permission);
  // Read / list / verify / enroll / attempt / export / generate are not mutations.
  // Auditor is allowed exports/generates per Appendix C; invariant 10 targets mutations.
  if (
    action === 'read' ||
    action.startsWith('read_') ||
    action === 'list' ||
    action === 'enroll' ||
    action === 'attempt' ||
    action === 'verify' ||
    action === 'export' ||
    action === 'generate'
  ) {
    return false;
  }
  return WRITE_ACTIONS.has(action);
}

/** Permissions considered tenant domain data (invariant 5). */
export function isTenantDomainPermission(permission: string): boolean {
  const root = permission.split(':')[0] ?? '';
  return [
    'grant',
    'finance',
    'hr',
    'payroll',
    'beneficiary',
    'programme',
    'field',
    'lms',
    'reporting',
    'file',
    'ai',
  ].includes(root);
}

export function rolePermissionRows(): RolePermission[] {
  const rows: RolePermission[] = [];
  for (const role of ROLES) {
    const idx = ROLES.indexOf(role);
    for (const row of MATRIX) {
      const cell = row.grants[idx];
      if (!cell) continue;
      rows.push({ role, permission: row.permission, ...parseGrantCell(cell) });
    }
  }
  return rows;
}
