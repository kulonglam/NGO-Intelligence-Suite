-- 008_payroll_role_hr_read.sql — svc_hr_payroll may read HR tables for payslip/compute joins

GRANT SELECT ON departments, positions, employees, contracts TO svc_hr_payroll;
GRANT SELECT ON leave_types, leave_balances, leave_requests TO svc_hr_payroll;
