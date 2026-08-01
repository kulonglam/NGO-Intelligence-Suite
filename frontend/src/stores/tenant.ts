import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api } from '../lib/api';

export type TenantStatus = 'active' | 'suspended';

export type TenantConfig = {
  status: TenantStatus;
  /** Module id → enabled. Missing keys default to enabled. */
  modules: Record<string, boolean>;
  /** Feature flag → enabled. Missing keys default to enabled. */
  featureFlags: Record<string, boolean>;
};

type SessionBootstrap = {
  status: string;
  modules: Record<string, boolean>;
  feature_flags: Record<string, boolean>;
};

const STORAGE_KEY = 'ngois_tenant';

const DEFAULTS: TenantConfig = {
  status: 'active',
  modules: {},
  featureFlags: {},
};

function readCache(): TenantConfig {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULTS, modules: {}, featureFlags: {} };
  try {
    const parsed = JSON.parse(raw) as Partial<TenantConfig>;
    return {
      status: parsed.status === 'suspended' ? 'suspended' : 'active',
      modules: { ...(parsed.modules ?? {}) },
      featureFlags: { ...(parsed.featureFlags ?? {}) },
    };
  } catch {
    return { ...DEFAULTS, modules: {}, featureFlags: {} };
  }
}

function applyBootstrap(data: SessionBootstrap): TenantConfig {
  return {
    status: data.status === 'suspended' ? 'suspended' : 'active',
    modules: { ...data.modules },
    featureFlags: { ...data.feature_flags },
  };
}

export const useTenantStore = defineStore('tenant', () => {
  const config = ref<TenantConfig>(readCache());
  const loading = ref(false);
  const bootstrapLoaded = ref(false);

  const status = computed(() => config.value.status);
  const isActive = computed(() => config.value.status === 'active');

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config.value));
  }

  function moduleEnabled(moduleId: string | undefined): boolean {
    if (!moduleId) return true;
    const v = config.value.modules[moduleId];
    return v !== false;
  }

  function featureEnabled(flag: string | undefined): boolean {
    if (!flag) return true;
    const v = config.value.featureFlags[flag];
    return v !== false;
  }

  async function loadBootstrap() {
    loading.value = true;
    try {
      const data = await api<SessionBootstrap>('/v1/tenant/session-bootstrap');
      config.value = applyBootstrap(data);
      persist();
      bootstrapLoaded.value = true;
    } catch {
      bootstrapLoaded.value = true;
    } finally {
      loading.value = false;
    }
  }

  function setStatus(next: TenantStatus) {
    config.value = { ...config.value, status: next };
    persist();
  }

  function setModule(moduleId: string, enabled: boolean) {
    config.value = {
      ...config.value,
      modules: { ...config.value.modules, [moduleId]: enabled },
    };
    persist();
  }

  function setFeatureFlag(flag: string, enabled: boolean) {
    config.value = {
      ...config.value,
      featureFlags: { ...config.value.featureFlags, [flag]: enabled },
    };
    persist();
  }

  function reset() {
    config.value = { status: 'active', modules: {}, featureFlags: {} };
    bootstrapLoaded.value = false;
    localStorage.removeItem(STORAGE_KEY);
  }

  return {
    config,
    loading,
    bootstrapLoaded,
    status,
    isActive,
    moduleEnabled,
    featureEnabled,
    loadBootstrap,
    setStatus,
    setModule,
    setFeatureFlag,
    reset,
  };
});
