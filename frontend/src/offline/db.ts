/** Offline IndexedDB schema (SDD §13.3) — thin Phase 3 tranche. */

const DB_NAME = 'ngois-field-v1';
const DB_VERSION = 1;

export type QueuedSubmission = {
  client_uuid: string;
  form_version_id: string;
  captured_at: string;
  payload: Record<string, unknown>;
  beneficiary_id?: string | null;
  status: 'queued' | 'syncing' | 'synced' | 'rejected';
  encrypted?: boolean;
};

export type CachedForm = {
  form_id: string;
  form_version_id: string;
  code: string;
  title: string;
  version_number: number;
  fields: Array<{
    field_key: string;
    label: string;
    field_type: string;
    required: boolean;
  }>;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of [
        'forms',
        'assignments',
        'drafts',
        'queue',
        'reference',
        'beneficiary_cache',
        'sync_meta',
      ]) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

async function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('tx failed'));
    tx.onabort = () => reject(tx.error ?? new Error('tx aborted'));
  });
}

export async function putForms(forms: CachedForm[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('forms', 'readwrite');
  const store = tx.objectStore('forms');
  for (const f of forms) {
    store.put({ id: f.form_version_id, ...f });
  }
  await txDone(tx);
  db.close();
}

export async function listForms(): Promise<CachedForm[]> {
  const db = await openDb();
  const tx = db.transaction('forms', 'readonly');
  const store = tx.objectStore('forms');
  const rows = await new Promise<CachedForm[]>((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as CachedForm[]);
    req.onerror = () => reject(req.error);
  });
  await txDone(tx);
  db.close();
  return rows;
}

export async function enqueueSubmission(
  item: Omit<QueuedSubmission, 'status'> & { status?: QueuedSubmission['status'] },
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('queue', 'readwrite');
  tx.objectStore('queue').put({
    id: item.client_uuid,
    ...item,
    status: item.status ?? 'queued',
  });
  await txDone(tx);
  db.close();
}

export async function listQueue(): Promise<QueuedSubmission[]> {
  const db = await openDb();
  const tx = db.transaction('queue', 'readonly');
  const rows = await new Promise<QueuedSubmission[]>((resolve, reject) => {
    const req = tx.objectStore('queue').getAll();
    req.onsuccess = () =>
      resolve(
        (req.result as Array<QueuedSubmission & { id: string }>).map(({ id: _id, ...rest }) => rest),
      );
    req.onerror = () => reject(req.error);
  });
  await txDone(tx);
  db.close();
  return rows.filter((r) => r.status === 'queued' || r.status === 'syncing');
}

export async function markQueueStatus(
  clientUuid: string,
  status: QueuedSubmission['status'],
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('queue', 'readwrite');
  const store = tx.objectStore('queue');
  const existing = await new Promise<QueuedSubmission & { id: string } | undefined>(
    (resolve, reject) => {
      const req = store.get(clientUuid);
      req.onsuccess = () => resolve(req.result as QueuedSubmission & { id: string });
      req.onerror = () => reject(req.error);
    },
  );
  if (existing) {
    store.put({ ...existing, status });
  }
  await txDone(tx);
  db.close();
}

export async function setSyncMeta(
  cursor: string,
  sessionId?: string,
  deviceId?: string,
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('sync_meta', 'readwrite');
  const existing = await new Promise<Record<string, string> | undefined>((resolve, reject) => {
    const req = tx.objectStore('sync_meta').get('default');
    req.onsuccess = () => resolve(req.result as Record<string, string> | undefined);
    req.onerror = () => reject(req.error);
  });
  tx.objectStore('sync_meta').put({
    id: 'default',
    cursor,
    session_id: sessionId ?? existing?.session_id ?? null,
    device_id: deviceId ?? existing?.device_id ?? null,
    updated_at: new Date().toISOString(),
  });
  await txDone(tx);
  db.close();
}

export async function getSyncMeta(): Promise<{
  cursor?: string;
  session_id?: string;
  device_id?: string;
} | null> {
  const db = await openDb();
  const tx = db.transaction('sync_meta', 'readonly');
  const row = await new Promise<Record<string, string> | undefined>((resolve, reject) => {
    const req = tx.objectStore('sync_meta').get('default');
    req.onsuccess = () => resolve(req.result as Record<string, string> | undefined);
    req.onerror = () => reject(req.error);
  });
  await txDone(tx);
  db.close();
  return row
    ? { cursor: row.cursor, session_id: row.session_id, device_id: row.device_id }
    : null;
}

export async function ensureDeviceId(): Promise<string> {
  const meta = await getSyncMeta();
  if (meta?.device_id) return meta.device_id;
  const deviceId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? `dev-${crypto.randomUUID()}`
      : `dev-${Date.now()}`;
  await setSyncMeta(meta?.cursor ?? new Date(0).toISOString(), meta?.session_id, deviceId);
  return deviceId;
}

/** Remote wipe — clear all offline stores and session key. */
export async function wipeLocalOfflineData(): Promise<void> {
  clearSessionKey();
  const db = await openDb();
  const names = [
    'forms',
    'assignments',
    'drafts',
    'queue',
    'reference',
    'beneficiary_cache',
    'sync_meta',
  ];
  const tx = db.transaction(names, 'readwrite');
  for (const name of names) tx.objectStore(name).clear();
  await txDone(tx);
  db.close();
}

/** Session-memory AES-GCM key for drafts/queue (does not survive reload — intentional). */
let sessionKey: CryptoKey | null = null;

export async function ensureSessionKey(): Promise<CryptoKey> {
  if (sessionKey) return sessionKey;
  sessionKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  return sessionKey;
}

export async function encryptJson(value: unknown): Promise<string> {
  const key = await ensureSessionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const packed = new Uint8Array(iv.length + cipher.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(cipher), iv.length);
  return btoa(String.fromCharCode(...packed));
}

export async function decryptJson<T = unknown>(packedB64: string): Promise<T> {
  const key = await ensureSessionKey();
  const packed = Uint8Array.from(atob(packedB64), (c) => c.charCodeAt(0));
  const iv = packed.slice(0, 12);
  const cipher = packed.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

export function clearSessionKey(): void {
  sessionKey = null;
}
