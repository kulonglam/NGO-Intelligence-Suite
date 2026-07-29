import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MATRIX,
  ROLES,
  allPermissions,
  isTenantDomainPermission,
  isWritePermission,
  parseGrantCell,
  permissionsForRole,
  rolePermissionRows,
} from './index.js';

describe('RBAC matrix shape', () => {
  it('has exactly 8 roles and 8 grant columns per row', () => {
    assert.equal(ROLES.length, 8);
    for (const row of MATRIX) {
      assert.equal(row.grants.length, 8, row.permission);
    }
  });

  it('has unique permission codes', () => {
    const codes = allPermissions();
    assert.equal(codes.length, new Set(codes).size);
  });

  it('grants every permission to at least one standing or break-glass/DPO path (invariant 2)', () => {
    for (const row of MATRIX) {
      const any = row.grants.some((c) => {
        const f = parseGrantCell(c);
        return f.granted || f.breakGlass || f.dpoRequired;
      });
      assert.ok(any, `orphan permission: ${row.permission}`);
    }
  });
});

describe('Appendix C.11 invariants', () => {
  it('no role holds both payroll:run:submit and payroll:run:approve (invariant 3)', () => {
    for (const role of ROLES) {
      const perms = new Set(permissionsForRole(role));
      assert.ok(
        !(perms.has('payroll:run:submit') && perms.has('payroll:run:approve')),
        role,
      );
    }
  });

  it('super_admin holds no tenant domain data permission (invariant 5)', () => {
    for (const p of permissionsForRole('super_admin')) {
      assert.ok(!isTenantDomainPermission(p), `super_admin must not hold ${p}`);
    }
  });

  it('auditor holds no write permission (invariant 10)', () => {
    for (const p of permissionsForRole('auditor')) {
      assert.ok(!isWritePermission(p), `auditor must not hold write ${p}`);
    }
  });

  it('org_admin has grant award list/create for Phase 1 grants UI', () => {
    const perms = permissionsForRole('org_admin');
    assert.ok(perms.includes('grant:award:list'));
    assert.ok(perms.includes('grant:award:create'));
    assert.ok(perms.includes('grant:award:read'));
  });

  it('disbursement approve carries maker-checker for OA and FM', () => {
    const rows = rolePermissionRows().filter(
      (r) => r.permission === 'grant:disbursement:approve' && r.granted,
    );
    assert.ok(rows.length >= 2);
    for (const r of rows) {
      assert.equal(r.makerChecker, true, r.role);
    }
  });
});
