import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useTenantStore } from './tenant';

export type AuthUser = {
  id: string;
  email: string;
  display_name: string;
  role: string;
  tenant_id: string;
  permissions?: string[];
};

export type AuthConfig = {
  auth_mode: 'dev' | 'oidc';
  dev_login_enabled: boolean;
  oidc_enabled: boolean;
  oidc_stub: boolean;
  redirect_uri: string;
};

type Envelope<T> = {
  success: boolean;
  data: T;
  errors: Array<{ message: string }> | null;
};

type SessionPayload = {
  access_token: string;
  expires_in?: number;
  user: AuthUser & { permissions?: string[] };
};

const OIDC_TENANT_KEY = 'ngois_oidc_tenant';

function readJson<T>(key: string): T | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function expFromJwt(token: string): number | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as {
      exp?: number;
    };
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

async function readEnvelope<T>(res: Response): Promise<Envelope<T>> {
  return (await res.json()) as Envelope<T>;
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('ngois_token'));
  const user = ref<AuthUser | null>(readJson<AuthUser>('ngois_user'));
  const permissions = ref<string[]>(
    readJson<string[]>('ngois_permissions') ?? user.value?.permissions ?? [],
  );
  const sessionExpiresAt = ref<number | null>(
    Number(localStorage.getItem('ngois_session_exp')) ||
      (token.value ? expFromJwt(token.value) : null),
  );
  const error = ref<string | null>(null);
  const loading = ref(false);
  const authConfig = ref<AuthConfig | null>(null);

  const isAuthenticated = computed(() => Boolean(token.value));

  function can(permission: string): boolean {
    if (!permission) return true;
    return permissions.value.includes(permission);
  }

  function canAny(list: string[] | undefined): boolean {
    if (!list?.length) return true;
    return list.some((p) => can(p));
  }

  function persistSession(
    accessToken: string,
    nextUser: AuthUser,
    perms: string[],
    expiresInSec?: number,
  ) {
    token.value = accessToken;
    user.value = { ...nextUser, permissions: perms };
    permissions.value = perms;
    const fromJwt = expFromJwt(accessToken);
    const fromTtl =
      typeof expiresInSec === 'number' ? Date.now() + expiresInSec * 1000 : null;
    sessionExpiresAt.value = fromJwt ?? fromTtl;
    localStorage.setItem('ngois_token', accessToken);
    localStorage.setItem('ngois_user', JSON.stringify(user.value));
    localStorage.setItem('ngois_permissions', JSON.stringify(perms));
    if (sessionExpiresAt.value) {
      localStorage.setItem('ngois_session_exp', String(sessionExpiresAt.value));
    }
  }

  async function afterSessionEstablished(body: SessionPayload) {
    const perms = body.user.permissions ?? [];
    persistSession(body.access_token, body.user, perms, body.expires_in);
    const tenant = useTenantStore();
    await tenant.loadBootstrap();
  }

  async function fetchAuthConfig() {
    try {
      const res = await fetch('/v1/auth/config');
      const body = await readEnvelope<AuthConfig>(res);
      if (res.ok && body.success) {
        authConfig.value = body.data;
      }
    } catch {
      authConfig.value = {
        auth_mode: 'dev',
        dev_login_enabled: true,
        oidc_enabled: false,
        oidc_stub: false,
        redirect_uri: '/auth/callback',
      };
    }
  }

  async function login(email: string, password: string, tenantSlug = 'design-partner') {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch('/v1/auth/dev/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, tenant_slug: tenantSlug }),
      });
      const body = await readEnvelope<SessionPayload>(res);
      if (!res.ok || !body.success) {
        throw new Error(body.errors?.[0]?.message ?? 'Login failed');
      }
      await afterSessionEstablished(body.data);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Login failed';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function startOidc(tenantSlug = 'design-partner') {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch('/v1/auth/oidc/start');
      const body = await readEnvelope<{
        mode: 'oidc' | 'oidc_stub';
        authorize_url?: string;
        state: string;
      }>(res);
      if (!res.ok || !body.success) {
        throw new Error(body.errors?.[0]?.message ?? 'SSO start failed');
      }
      sessionStorage.setItem(OIDC_TENANT_KEY, tenantSlug);
      if (body.data.mode === 'oidc' && body.data.authorize_url) {
        window.location.assign(body.data.authorize_url);
        return;
      }
      const params = new URLSearchParams({ state: body.data.state });
      window.location.assign(`/auth/callback?${params.toString()}`);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'SSO start failed';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function completeOidc(state: string, code?: string, tenantSlug?: string) {
    loading.value = true;
    error.value = null;
    const slug =
      tenantSlug ?? sessionStorage.getItem(OIDC_TENANT_KEY) ?? 'design-partner';
    sessionStorage.removeItem(OIDC_TENANT_KEY);
    try {
      const res = await fetch('/v1/auth/oidc/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, code, tenant_slug: slug }),
      });
      const body = await readEnvelope<SessionPayload>(res);
      if (!res.ok || !body.success) {
        throw new Error(body.errors?.[0]?.message ?? 'SSO sign-in failed');
      }
      await afterSessionEstablished(body.data);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'SSO sign-in failed';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  function logout() {
    token.value = null;
    user.value = null;
    permissions.value = [];
    sessionExpiresAt.value = null;
    localStorage.removeItem('ngois_token');
    localStorage.removeItem('ngois_user');
    localStorage.removeItem('ngois_permissions');
    localStorage.removeItem('ngois_session_exp');
    sessionStorage.removeItem(OIDC_TENANT_KEY);
    useTenantStore().reset();
  }

  return {
    token,
    user,
    permissions,
    sessionExpiresAt,
    error,
    loading,
    authConfig,
    isAuthenticated,
    can,
    canAny,
    fetchAuthConfig,
    login,
    startOidc,
    completeOidc,
    logout,
  };
});
