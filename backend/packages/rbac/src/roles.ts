/**
 * Appendix C roles — single source of truth with the SDD RBAC matrix.
 * There is no role inheritance; every grant is explicit.
 */
export const ROLES = [
  'super_admin',
  'org_admin',
  'finance_manager',
  'hr_manager',
  'm_e_officer',
  'field_officer',
  'donor_viewer',
  'auditor',
] as const;

export type Role = (typeof ROLES)[number];

export const TENANT_ROLES = ROLES.filter((r) => r !== 'super_admin');

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
