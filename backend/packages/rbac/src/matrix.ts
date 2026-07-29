/**
 * Grant cell encoding for Appendix C.
 * Columns always: SA, OA, FM, HM, ME, FO, DV, AU
 *
 * - `-`  not granted
 * - `Y`  granted (✓)
 * - `S`  scoped
 * - `O`  own-records only
 * - `‡`  break-glass required
 * - `DPO` external DPO approval required (not a standing grant)
 * Suffixes may combine: `Y†` maker-checker, `YP`/`SP`/`OP` purpose-logged, `S†` scoped + maker-checker
 */
export type GrantCell =
  | '-'
  | 'Y'
  | 'S'
  | 'O'
  | '‡'
  | 'DPO'
  | 'Y†'
  | 'YP'
  | 'SP'
  | 'OP'
  | 'S†';

export type PermissionFlags = {
  granted: boolean;
  scoped: boolean;
  ownOnly: boolean;
  makerChecker: boolean;
  breakGlass: boolean;
  purposeLogged: boolean;
  dpoRequired: boolean;
};

export function parseGrantCell(cell: GrantCell): PermissionFlags {
  if (cell === '-' || cell === 'DPO') {
    return {
      granted: false,
      scoped: false,
      ownOnly: false,
      makerChecker: false,
      breakGlass: false,
      purposeLogged: false,
      dpoRequired: cell === 'DPO',
    };
  }
  if (cell === '‡') {
    return {
      granted: false,
      scoped: false,
      ownOnly: false,
      makerChecker: false,
      breakGlass: true,
      purposeLogged: false,
      dpoRequired: false,
    };
  }

  const makerChecker = cell.includes('†');
  const purposeLogged = cell.includes('P');
  const scoped = cell.startsWith('S');
  const ownOnly = cell.startsWith('O');
  return {
    granted: true,
    scoped,
    ownOnly,
    makerChecker,
    breakGlass: false,
    purposeLogged,
    dpoRequired: false,
  };
}

/**
 * Full Appendix C matrix. Keep in sync with docs/sdd/appendices/c-rbac-matrix.md.
 * Generated authorisation tests assert invariants over this table.
 */
export const MATRIX: ReadonlyArray<{ permission: string; grants: readonly GrantCell[] }> = [
  // C.2 Identity
  { permission: 'identity:user:create', grants: ['‡', 'Y', '-', '-', '-', '-', '-', '-'] },
  { permission: 'identity:user:read', grants: ['‡', 'Y', 'Y', 'Y', 'Y', 'O', 'O', 'Y'] },
  { permission: 'identity:user:update', grants: ['‡', 'Y', '-', '-', '-', 'O', 'O', '-'] },
  { permission: 'identity:user:suspend', grants: ['‡', 'Y', '-', '-', '-', '-', '-', '-'] },
  { permission: 'identity:user:delete', grants: ['‡', 'Y', '-', '-', '-', '-', '-', '-'] },
  { permission: 'identity:user:list', grants: ['‡', 'Y', 'Y', 'Y', 'Y', '-', '-', 'Y'] },
  { permission: 'identity:user:invite', grants: ['‡', 'Y', '-', '-', '-', '-', '-', '-'] },
  { permission: 'identity:role:assign', grants: ['‡', 'Y', '-', '-', '-', '-', '-', '-'] },
  { permission: 'identity:role:revoke', grants: ['‡', 'Y', '-', '-', '-', '-', '-', '-'] },
  { permission: 'identity:role:read', grants: ['Y', 'Y', 'Y', 'Y', 'Y', '-', '-', 'Y'] },
  { permission: 'identity:session:list', grants: ['‡', 'Y', '-', '-', '-', 'O', 'O', 'Y'] },
  { permission: 'identity:session:revoke', grants: ['‡', 'Y', '-', '-', '-', 'O', 'O', '-'] },
  { permission: 'identity:mfa:enroll', grants: ['Y', 'O', 'O', 'O', 'O', 'O', 'O', 'O'] },
  { permission: 'identity:mfa:reset', grants: ['‡', 'Y', '-', '-', '-', '-', '-', '-'] },
  { permission: 'identity:breakglass:request', grants: ['Y', '-', '-', '-', '-', '-', '-', '-'] },
  { permission: 'identity:breakglass:approve', grants: ['‡', '-', '-', '-', '-', '-', '-', '-'] },

  // C.3 Tenant
  { permission: 'tenant:settings:read', grants: ['‡', 'Y', 'Y', 'Y', 'Y', '-', '-', 'Y'] },
  { permission: 'tenant:settings:update', grants: ['‡', 'Y', '-', '-', '-', '-', '-', '-'] },
  { permission: 'tenant:module:enable', grants: ['‡', 'Y', '-', '-', '-', '-', '-', '-'] },
  { permission: 'tenant:security:update', grants: ['‡', 'Y', '-', '-', '-', '-', '-', '-'] },
  { permission: 'tenant:pii_field:enable', grants: ['‡', 'DPO', '-', '-', '-', '-', '-', '-'] },
  { permission: 'tenant:retention:update', grants: ['‡', 'Y', '-', '-', '-', '-', '-', '-'] },
  { permission: 'tenant:export:request', grants: ['‡', 'Y', '-', '-', '-', '-', '-', '-'] },
  { permission: 'tenant:quota:read', grants: ['Y', 'Y', 'Y', '-', '-', '-', '-', 'Y'] },
  { permission: 'tenant:provision', grants: ['‡', '-', '-', '-', '-', '-', '-', '-'] },
  { permission: 'tenant:suspend', grants: ['‡', '-', '-', '-', '-', '-', '-', '-'] },
  { permission: 'tenant:offboard', grants: ['‡', '-', '-', '-', '-', '-', '-', '-'] },
  { permission: 'tenant:flag:read', grants: ['Y', 'Y', '-', '-', '-', '-', '-', 'Y'] },
  { permission: 'tenant:flag:update', grants: ['‡', '-', '-', '-', '-', '-', '-', '-'] },

  // C.4 Grants and finance
  { permission: 'grant:donor:create', grants: ['-', 'Y', 'Y', '-', '-', '-', '-', '-'] },
  { permission: 'grant:donor:read', grants: ['-', 'Y', 'Y', '-', 'Y', '-', '-', 'Y'] },
  { permission: 'grant:donor:update', grants: ['-', 'Y', 'Y', '-', '-', '-', '-', '-'] },
  { permission: 'grant:donor:delete', grants: ['-', 'Y', '-', '-', '-', '-', '-', '-'] },
  { permission: 'grant:award:create', grants: ['-', 'Y', 'Y', '-', '-', '-', '-', '-'] },
  { permission: 'grant:award:read', grants: ['-', 'Y', 'S', '-', 'S', '-', 'S', 'Y'] },
  { permission: 'grant:award:update', grants: ['-', 'Y', 'S', '-', '-', '-', '-', '-'] },
  { permission: 'grant:award:delete', grants: ['-', 'Y', '-', '-', '-', '-', '-', '-'] },
  { permission: 'grant:award:list', grants: ['-', 'Y', 'S', '-', 'S', '-', 'S', 'Y'] },
  { permission: 'grant:award:close', grants: ['-', 'Y', 'Y', '-', '-', '-', '-', '-'] },
  { permission: 'grant:budget:create', grants: ['-', 'Y', 'Y', '-', '-', '-', '-', '-'] },
  { permission: 'grant:budget:read', grants: ['-', 'Y', 'S', '-', 'S', '-', 'S', 'Y'] },
  { permission: 'grant:budget:update', grants: ['-', 'Y', 'S', '-', '-', '-', '-', '-'] },
  { permission: 'grant:budget:approve', grants: ['-', 'Y†', 'Y†', '-', '-', '-', '-', '-'] },
  { permission: 'grant:disbursement:create', grants: ['-', 'Y', 'Y', '-', '-', '-', '-', '-'] },
  { permission: 'grant:disbursement:read', grants: ['-', 'Y', 'S', '-', '-', '-', 'S', 'Y'] },
  { permission: 'grant:disbursement:update', grants: ['-', 'Y', 'S', '-', '-', '-', '-', '-'] },
  { permission: 'grant:disbursement:submit', grants: ['-', 'Y', 'Y', '-', '-', '-', '-', '-'] },
  { permission: 'grant:disbursement:approve', grants: ['-', 'Y†', 'Y†', '-', '-', '-', '-', '-'] },
  { permission: 'grant:disbursement:reverse', grants: ['-', 'Y†', 'Y†', '-', '-', '-', '-', '-'] },
  { permission: 'grant:expenditure:create', grants: ['-', 'Y', 'Y', '-', 'S', '-', '-', '-'] },
  { permission: 'grant:expenditure:read', grants: ['-', 'Y', 'S', '-', 'S', '-', 'S', 'Y'] },
  { permission: 'grant:expenditure:update', grants: ['-', 'Y', 'S', '-', '-', '-', '-', '-'] },
  { permission: 'grant:report:create', grants: ['-', 'Y', 'Y', '-', 'Y', '-', '-', '-'] },
  { permission: 'grant:report:read', grants: ['-', 'Y', 'S', '-', 'S', '-', 'S', 'Y'] },
  { permission: 'grant:report:update', grants: ['-', 'Y', 'S', '-', 'S', '-', '-', '-'] },
  { permission: 'grant:report:submit', grants: ['-', 'Y', 'Y', '-', '-', '-', '-', '-'] },
  { permission: 'grant:report:export', grants: ['-', 'Y', 'S', '-', 'S', '-', 'S', 'Y'] },
  { permission: 'grant:activity:create', grants: ['-', 'Y', 'Y', '-', 'Y', '-', '-', '-'] },
  { permission: 'grant:activity:read', grants: ['-', 'Y', 'S', '-', 'S', 'S', 'S', 'Y'] },
  { permission: 'grant:compliance:read', grants: ['-', 'Y', 'Y', '-', 'Y', '-', 'S', 'Y'] },
  { permission: 'grant:iati:configure', grants: ['-', 'Y', 'Y', '-', '-', '-', '-', '-'] },
  { permission: 'grant:iati:publish', grants: ['-', 'Y', 'Y', '-', '-', '-', '-', '-'] },
  { permission: 'finance:fx_rate:read', grants: ['-', 'Y', 'Y', 'Y', '-', '-', '-', 'Y'] },
  { permission: 'finance:fx_rate:override', grants: ['-', 'Y', 'Y', '-', '-', '-', '-', '-'] },

  // C.5 HR
  { permission: 'hr:employee:create', grants: ['-', 'Y', '-', 'Y', '-', '-', '-', '-'] },
  { permission: 'hr:employee:read', grants: ['-', 'Y', '-', 'S', '-', '-', '-', 'Y'] },
  { permission: 'hr:employee:read_pii', grants: ['-', 'YP', '-', 'SP', '-', '-', '-', 'YP'] },
  { permission: 'hr:employee:update', grants: ['-', 'Y', '-', 'S', '-', '-', '-', '-'] },
  { permission: 'hr:employee:terminate', grants: ['-', 'Y', '-', 'Y', '-', '-', '-', '-'] },
  { permission: 'hr:employee:list', grants: ['-', 'Y', '-', 'S', '-', '-', '-', 'Y'] },
  { permission: 'hr:employee:export', grants: ['-', 'YP', '-', 'SP', '-', '-', '-', 'YP'] },
  { permission: 'hr:contract:create', grants: ['-', 'Y', '-', 'Y', '-', '-', '-', '-'] },
  { permission: 'hr:contract:read_salary', grants: ['-', 'YP', 'YP', 'SP', '-', '-', '-', 'YP'] },
  { permission: 'hr:contract:update', grants: ['-', 'Y', '-', 'S', '-', '-', '-', '-'] },
  { permission: 'hr:department:admin', grants: ['-', 'Y', '-', 'Y', '-', '-', '-', '-'] },
  { permission: 'hr:position:admin', grants: ['-', 'Y', '-', 'Y', '-', '-', '-', '-'] },
  { permission: 'hr:leave:request', grants: ['-', 'O', 'O', 'O', 'O', 'O', '-', '-'] },
  { permission: 'hr:leave:read', grants: ['-', 'Y', '-', 'S', '-', 'O', '-', 'Y'] },
  { permission: 'hr:leave:approve', grants: ['-', 'Y', '-', 'S†', '-', '-', '-', '-'] },
  { permission: 'hr:leave:balance:adjust', grants: ['-', 'Y', '-', 'Y', '-', '-', '-', '-'] },

  // C.6 Payroll
  { permission: 'payroll:run:create', grants: ['-', '-', '-', 'Y', '-', '-', '-', '-'] },
  { permission: 'payroll:run:calculate', grants: ['-', '-', '-', 'Y', '-', '-', '-', '-'] },
  { permission: 'payroll:run:read', grants: ['-', 'YP', 'YP', 'YP', '-', '-', '-', 'YP'] },
  { permission: 'payroll:run:update', grants: ['-', '-', '-', 'Y', '-', '-', '-', '-'] },
  { permission: 'payroll:run:submit', grants: ['-', '-', '-', 'Y', '-', '-', '-', '-'] },
  { permission: 'payroll:run:approve', grants: ['-', '-', 'Y†', '-', '-', '-', '-', '-'] },
  { permission: 'payroll:run:reject', grants: ['-', '-', 'Y', '-', '-', '-', '-', '-'] },
  { permission: 'payroll:run:reverse', grants: ['-', '-', 'Y†', '-', '-', '-', '-', '-'] },
  { permission: 'payroll:record:read', grants: ['-', 'YP', 'YP', 'YP', '-', '-', '-', 'YP'] },
  { permission: 'payroll:record:read_own', grants: ['-', 'O', 'O', 'O', 'O', 'O', '-', '-'] },
  { permission: 'payroll:payslip:generate', grants: ['-', '-', '-', 'Y', '-', '-', '-', '-'] },
  { permission: 'payroll:payslip:read_own', grants: ['-', 'O', 'O', 'O', 'O', 'O', '-', '-'] },
  { permission: 'payroll:export:bank_file', grants: ['-', '-', 'Y', '-', '-', '-', '-', '-'] },
  { permission: 'payroll:statutory_rules:read', grants: ['-', 'Y', 'Y', 'Y', '-', '-', '-', 'Y'] },
  { permission: 'payroll:statutory_rules:update', grants: ['‡', '-', '-', '-', '-', '-', '-', '-'] },
  { permission: 'payroll:cost_allocation:read', grants: ['-', 'Y', 'Y', 'Y', '-', '-', '-', 'Y'] },

  // C.7 Beneficiaries and programmes
  { permission: 'beneficiary:record:create', grants: ['-', 'Y', '-', '-', 'Y', 'S', '-', '-'] },
  { permission: 'beneficiary:record:read', grants: ['-', 'Y', '-', '-', 'S', 'S', '-', 'Y'] },
  { permission: 'beneficiary:record:read_pii', grants: ['-', 'YP', '-', '-', 'SP', 'SP', '-', 'YP'] },
  { permission: 'beneficiary:location:read_precise', grants: ['-', 'YP', '-', '-', '-', 'SP', '-', 'YP'] },
  { permission: 'beneficiary:record:update', grants: ['-', 'Y', '-', '-', 'S', 'S', '-', '-'] },
  { permission: 'beneficiary:record:delete', grants: ['-', 'Y', '-', '-', '-', '-', '-', '-'] },
  { permission: 'beneficiary:record:list', grants: ['-', 'Y', '-', '-', 'S', 'S', '-', 'Y'] },
  { permission: 'beneficiary:record:export', grants: ['-', 'YP', '-', '-', 'SP', '-', '-', 'YP'] },
  { permission: 'beneficiary:household:read', grants: ['-', 'Y', '-', '-', 'S', 'S', '-', 'Y'] },
  { permission: 'beneficiary:household:update', grants: ['-', 'Y', '-', '-', 'S', 'S', '-', '-'] },
  { permission: 'beneficiary:vulnerability:read', grants: ['-', 'YP', '-', '-', 'SP', 'SP', '-', 'YP'] },
  { permission: 'beneficiary:vulnerability:assess', grants: ['-', 'Y', '-', '-', 'Y', 'S', '-', '-'] },
  { permission: 'beneficiary:duplicate:review', grants: ['-', 'Y', '-', '-', 'Y', '-', '-', '-'] },
  { permission: 'beneficiary:duplicate:merge', grants: ['-', 'Y', '-', '-', 'Y', '-', '-', '-'] },
  { permission: 'beneficiary:consent:record', grants: ['-', 'Y', '-', '-', 'Y', 'S', '-', '-'] },
  { permission: 'beneficiary:consent:read', grants: ['-', 'Y', '-', '-', 'S', 'S', '-', 'Y'] },
  { permission: 'beneficiary:erasure:request', grants: ['-', 'Y', '-', '-', 'Y', 'S', '-', '-'] },
  { permission: 'beneficiary:erasure:approve', grants: ['-', 'DPO', '-', '-', '-', '-', '-', '-'] },
  { permission: 'programme:record:admin', grants: ['-', 'Y', '-', '-', 'Y', '-', '-', '-'] },
  { permission: 'programme:record:read', grants: ['-', 'Y', 'S', '-', 'S', 'S', 'S', 'Y'] },
  { permission: 'programme:enrollment:create', grants: ['-', 'Y', '-', '-', 'Y', 'S', '-', '-'] },
  { permission: 'programme:enrollment:read', grants: ['-', 'Y', '-', '-', 'S', 'S', '-', 'Y'] },
  { permission: 'programme:enrollment:exit', grants: ['-', 'Y', '-', '-', 'Y', '-', '-', '-'] },
  { permission: 'programme:attendance:record', grants: ['-', 'Y', '-', '-', 'Y', 'S', '-', '-'] },
  { permission: 'programme:attendance:read', grants: ['-', 'Y', 'S', '-', 'S', 'S', 'S', 'Y'] },

  // C.8 Field
  { permission: 'field:form:create', grants: ['-', 'Y', '-', '-', 'Y', '-', '-', '-'] },
  { permission: 'field:form:read', grants: ['-', 'Y', '-', '-', 'Y', 'S', '-', 'Y'] },
  { permission: 'field:form:publish', grants: ['-', 'Y', '-', '-', 'Y', '-', '-', '-'] },
  { permission: 'field:form:assign', grants: ['-', 'Y', '-', '-', 'Y', '-', '-', '-'] },
  { permission: 'field:submission:create', grants: ['-', 'Y', '-', '-', 'Y', 'S', '-', '-'] },
  { permission: 'field:submission:read', grants: ['-', 'Y', '-', '-', 'S', 'O', '-', 'Y'] },
  { permission: 'field:submission:read_pii', grants: ['-', 'YP', '-', '-', 'SP', 'OP', '-', 'YP'] },
  { permission: 'field:submission:update', grants: ['-', 'Y', '-', '-', 'S', '-', '-', '-'] },
  { permission: 'field:submission:review', grants: ['-', 'Y', '-', '-', 'Y', '-', '-', '-'] },
  { permission: 'field:submission:reject', grants: ['-', 'Y', '-', '-', 'Y', '-', '-', '-'] },
  { permission: 'field:submission:export', grants: ['-', 'YP', '-', '-', 'SP', '-', '-', 'YP'] },
  { permission: 'field:conflict:resolve', grants: ['-', 'Y', '-', '-', 'Y', '-', '-', '-'] },
  { permission: 'field:device:register', grants: ['-', 'Y', '-', '-', 'Y', 'O', '-', '-'] },
  { permission: 'field:device:read', grants: ['-', 'Y', '-', '-', 'Y', 'O', '-', 'Y'] },
  { permission: 'field:device:revoke', grants: ['-', 'Y', '-', '-', 'Y', '-', '-', '-'] },
  { permission: 'field:device:wipe', grants: ['-', 'Y', '-', '-', 'Y', '-', '-', '-'] },
  { permission: 'field:sync:read_status', grants: ['-', 'Y', '-', '-', 'Y', 'O', '-', 'Y'] },

  // C.9 LMS
  { permission: 'lms:course:create', grants: ['-', 'Y', '-', 'Y', '-', '-', '-', '-'] },
  { permission: 'lms:course:read', grants: ['-', 'Y', 'Y', 'Y', 'Y', 'Y', '-', 'Y'] },
  { permission: 'lms:course:publish', grants: ['-', 'Y', '-', 'Y', '-', '-', '-', '-'] },
  { permission: 'lms:course:delete', grants: ['-', 'Y', '-', '-', '-', '-', '-', '-'] },
  { permission: 'lms:enrollment:create', grants: ['-', 'Y', '-', 'Y', '-', '-', '-', '-'] },
  { permission: 'lms:enrollment:read', grants: ['-', 'Y', '-', 'S', '-', 'O', '-', 'Y'] },
  { permission: 'lms:enrollment:read_own', grants: ['-', 'O', 'O', 'O', 'O', 'O', '-', '-'] },
  { permission: 'lms:progress:record_own', grants: ['-', 'O', 'O', 'O', 'O', 'O', '-', '-'] },
  { permission: 'lms:assessment:attempt', grants: ['-', 'O', 'O', 'O', 'O', 'O', '-', '-'] },
  { permission: 'lms:assessment:admin', grants: ['-', 'Y', '-', 'Y', '-', '-', '-', '-'] },
  { permission: 'lms:certificate:read', grants: ['-', 'Y', '-', 'S', '-', 'O', '-', 'Y'] },
  { permission: 'lms:certificate:issue', grants: ['-', 'Y', '-', 'Y', '-', '-', '-', '-'] },
  { permission: 'lms:compliance:read', grants: ['-', 'Y', '-', 'Y', '-', '-', '-', 'Y'] },
  { permission: 'lms:mandatory_rule:admin', grants: ['-', 'Y', '-', 'Y', '-', '-', '-', '-'] },

  // C.10 Reporting, files, AI, audit
  { permission: 'reporting:report:generate', grants: ['-', 'Y', 'Y', 'Y', 'Y', '-', 'S', 'Y'] },
  { permission: 'reporting:report:read', grants: ['-', 'Y', 'S', 'S', 'S', '-', 'S', 'Y'] },
  { permission: 'reporting:report:export', grants: ['-', 'Y', 'S', 'S', 'S', '-', 'S', 'Y'] },
  { permission: 'reporting:dashboard:read', grants: ['-', 'Y', 'S', 'S', 'S', 'S', 'S', 'Y'] },
  { permission: 'reporting:definition:admin', grants: ['-', 'Y', '-', '-', 'Y', '-', '-', '-'] },
  { permission: 'file:object:upload', grants: ['-', 'Y', 'Y', 'Y', 'Y', 'Y', '-', '-'] },
  { permission: 'file:object:read', grants: ['-', 'Y', 'S', 'S', 'S', 'O', 'S', 'Y'] },
  { permission: 'file:object:delete', grants: ['-', 'Y', 'S', 'S', 'S', '-', '-', '-'] },
  { permission: 'ai:insight:request', grants: ['-', 'Y', 'Y', '-', 'Y', '-', '-', '-'] },
  { permission: 'ai:insight:read', grants: ['-', 'Y', 'Y', '-', 'Y', '-', '-', 'Y'] },
  { permission: 'ai:prompt:read', grants: ['‡', 'Y', '-', '-', '-', '-', '-', 'Y'] },
  { permission: 'ai:insight:approve', grants: ['-', 'Y', 'Y', '-', 'Y', '-', '-', '-'] },
  { permission: 'ai:budget:read', grants: ['-', 'Y', 'Y', '-', '-', '-', '-', 'Y'] },
  { permission: 'ai:module:disable', grants: ['-', 'Y', '-', '-', '-', '-', '-', '-'] },
  { permission: 'audit:log:read', grants: ['‡', 'Y', '-', '-', '-', '-', '-', 'Y'] },
  { permission: 'audit:log:read_pii_values', grants: ['‡', 'YP', '-', '-', '-', '-', '-', 'YP'] },
  { permission: 'audit:log:export', grants: ['‡', 'YP', '-', '-', '-', '-', '-', 'YP'] },
  { permission: 'audit:purpose_log:read', grants: ['‡', 'Y', '-', '-', '-', '-', '-', 'Y'] },
  { permission: 'audit:integrity:verify', grants: ['Y', 'Y', '-', '-', '-', '-', '-', 'Y'] },
];
