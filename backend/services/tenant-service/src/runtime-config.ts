/** Module ids aligned with frontend router meta.module */
export const TENANT_MODULE_IDS = [
  'grants',
  'reports',
  'finance',
  'hr',
  'payroll',
  'field',
  'lms',
  'notifications',
  'intelligence',
  'ai',
  'compliance',
  'integrations',
] as const;

export const TENANT_FEATURE_FLAG_KEYS = ['ai_insights', 'webhooks'] as const;

export type TenantModuleId = (typeof TENANT_MODULE_IDS)[number];
export type TenantFeatureFlagKey = (typeof TENANT_FEATURE_FLAG_KEYS)[number];

export type SessionBootstrap = {
  status: string;
  modules: Record<string, boolean>;
  feature_flags: Record<string, boolean>;
};

type Pool = import('pg').Pool;

export async function loadSessionBootstrap(pool: Pool, tenantId: string): Promise<SessionBootstrap> {
  const tenantRow = await pool.query<{ status: string }>(
    `SELECT status FROM tenants WHERE id = $1 AND deleted_at IS NULL`,
    [tenantId],
  );
  const status = tenantRow.rows[0]?.status ?? 'active';

  const modules: Record<string, boolean> = Object.fromEntries(
    TENANT_MODULE_IDS.map((id) => [id, true]),
  );
  const moduleRows = await pool.query<{ module_id: string; enabled: boolean }>(
    `SELECT module_id, enabled FROM tenant_module_entitlements WHERE tenant_id = $1`,
    [tenantId],
  );
  for (const row of moduleRows.rows) {
    modules[row.module_id] = row.enabled;
  }

  const feature_flags: Record<string, boolean> = {
    ai_insights: true,
    webhooks: true,
  };
  const flagRows = await pool.query<{ flag_key: string; enabled: boolean }>(
    `SELECT flag_key, enabled FROM tenant_feature_flags WHERE tenant_id = $1`,
    [tenantId],
  );
  for (const row of flagRows.rows) {
    feature_flags[row.flag_key] = row.enabled;
  }

  const aiRow = await pool.query<{ ai_enabled: boolean }>(
    `SELECT ai_enabled FROM tenant_ai_settings WHERE tenant_id = $1`,
    [tenantId],
  );
  if (aiRow.rows[0]) {
    feature_flags.ai_insights = aiRow.rows[0].ai_enabled;
  }

  return { status, modules, feature_flags };
}

export async function seedTenantRuntimeDefaults(
  client: import('pg').PoolClient,
  tenantId: string,
): Promise<void> {
  for (const moduleId of TENANT_MODULE_IDS) {
    await client.query(
      `INSERT INTO tenant_module_entitlements (tenant_id, module_id, enabled)
       VALUES ($1, $2, true)
       ON CONFLICT (tenant_id, module_id) DO NOTHING`,
      [tenantId, moduleId],
    );
  }
  for (const flag of TENANT_FEATURE_FLAG_KEYS) {
    await client.query(
      `INSERT INTO tenant_feature_flags (tenant_id, flag_key, enabled)
       VALUES ($1, $2, true)
       ON CONFLICT (tenant_id, flag_key) DO NOTHING`,
      [tenantId, flag],
    );
  }
}
