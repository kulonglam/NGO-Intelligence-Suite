import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export type AuthUser = {
  id: string;
  email: string;
  display_name: string;
  role: string;
  tenant_id: string;
};

type Envelope<T> = {
  success: boolean;
  data: T;
  errors: Array<{ message: string }> | null;
};

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('ngois_token'));
  const user = ref<AuthUser | null>(
    localStorage.getItem('ngois_user')
      ? (JSON.parse(localStorage.getItem('ngois_user')!) as AuthUser)
      : null,
  );
  const error = ref<string | null>(null);
  const loading = ref(false);

  const isAuthenticated = computed(() => Boolean(token.value));

  async function login(email: string, password: string, tenantSlug = 'design-partner') {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch('/v1/auth/dev/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, tenant_slug: tenantSlug }),
      });
      const body = (await res.json()) as Envelope<{
        access_token: string;
        user: AuthUser;
      }>;
      if (!res.ok || !body.success) {
        throw new Error(body.errors?.[0]?.message ?? 'Login failed');
      }
      token.value = body.data.access_token;
      user.value = body.data.user;
      localStorage.setItem('ngois_token', body.data.access_token);
      localStorage.setItem('ngois_user', JSON.stringify(body.data.user));
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Login failed';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  function logout() {
    token.value = null;
    user.value = null;
    localStorage.removeItem('ngois_token');
    localStorage.removeItem('ngois_user');
  }

  return { token, user, error, loading, isAuthenticated, login, logout };
});
