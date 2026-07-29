# @ngois/rbac

Appendix C permission matrix as TypeScript — **single source of truth** for roles and grants.

## Usage

```ts
import { permissionsForRole, expandRoleOrThrow, isRole } from '@ngois/rbac';

const permissions = permissionsForRole('org_admin');
```

## Regenerate DB seed

```powershell
npm run generate:sql -w @ngois/rbac
```

Writes [`backend/db/migrations/002_rbac.sql`](../../db/migrations/002_rbac.sql).

## Tests

```powershell
npm run test -w @ngois/rbac
```

Asserts C.11 invariants (payroll SoD, super_admin domain isolation, auditor read-only, orphan permissions).
