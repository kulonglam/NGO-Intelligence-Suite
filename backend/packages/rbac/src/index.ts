export { ROLES, TENANT_ROLES, isRole, type Role } from './roles.js';
export {
  MATRIX,
  parseGrantCell,
  type GrantCell,
  type PermissionFlags,
} from './matrix.js';
export {
  permissionsForRole,
  permissionFlags,
  roleHasPermission,
  allPermissions,
  expandRoleOrThrow,
  isWritePermission,
  isTenantDomainPermission,
  rolePermissionRows,
  type RolePermission,
} from './expand.js';
