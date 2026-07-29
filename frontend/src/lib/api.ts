import { useAuthStore } from '../stores/auth';

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('You are offline.');
  }
  const auth = useAuthStore();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (auth.token) headers.set('Authorization', `Bearer ${auth.token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch {
    throw new Error('Network request failed.');
  }
  const body = (await res.json()) as {
    success: boolean;
    data: T;
    errors: Array<{ message: string }> | null;
  };

  if (!res.ok || !body.success) {
    throw new Error(body.errors?.[0]?.message ?? `Request failed (${res.status})`);
  }
  return body.data;
}
