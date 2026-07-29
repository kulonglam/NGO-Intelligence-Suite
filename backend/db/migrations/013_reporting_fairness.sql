-- 013_reporting_fairness.sql — expand job types/formats for Phase 2 standard set

ALTER TABLE report_jobs DROP CONSTRAINT IF EXISTS report_jobs_type_valid;
ALTER TABLE report_jobs ADD CONSTRAINT report_jobs_type_valid CHECK (job_type IN (
  'payslip_export', 'grant_export', 'portfolio_csv', 'budget_vs_actual', 'leave_balances'
));

ALTER TABLE report_artifacts DROP CONSTRAINT IF EXISTS report_artifacts_format_valid;
ALTER TABLE report_artifacts ADD CONSTRAINT report_artifacts_format_valid CHECK (format IN (
  'csv', 'html', 'json', 'xlsx', 'pdf'
));

-- Fair claim worker may see queued jobs across tenants when app.claim_mode=on
DROP POLICY IF EXISTS report_jobs_claim_mode ON report_jobs;
CREATE POLICY report_jobs_claim_mode ON report_jobs
  USING (current_setting('app.claim_mode', true) = 'on')
  WITH CHECK (current_setting('app.claim_mode', true) = 'on');

DROP POLICY IF EXISTS report_artifacts_claim_mode ON report_artifacts;
CREATE POLICY report_artifacts_claim_mode ON report_artifacts
  USING (current_setting('app.claim_mode', true) = 'on')
  WITH CHECK (current_setting('app.claim_mode', true) = 'on');
