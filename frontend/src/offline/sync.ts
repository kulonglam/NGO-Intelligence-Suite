import { api } from '../lib/api';
import {
  decryptJson,
  encryptJson,
  enqueueSubmission,
  ensureDeviceId,
  getSyncMeta,
  listForms,
  listQueue,
  markQueueStatus,
  putForms,
  setSyncMeta,
  wipeLocalOfflineData,
  type CachedForm,
  type QueuedSubmission,
} from './db';

type AssignedForm = CachedForm & { published_at?: string };

type Manifest = {
  session_id: string;
  cursor: string;
  forms: AssignedForm[];
};

type BatchResult = {
  results: Array<{
    client_uuid: string;
    status: string;
    submission_id?: string;
    error?: string;
  }>;
};

/** Pull assigned forms into IndexedDB (UI never writes field data to network directly). */
export async function pullAssignedForms(): Promise<CachedForm[]> {
  const remote = await api<AssignedForm[]>('/v1/field-data/forms/assigned');
  const mapped: CachedForm[] = remote.map((f) => ({
    form_id: f.form_id,
    form_version_id: f.form_version_id,
    code: f.code,
    title: f.title,
    version_number: f.version_number,
    fields: f.fields ?? [],
  }));
  await putForms(mapped);
  return mapped;
}

export async function saveDraftLocally(input: {
  form_version_id: string;
  payload: Record<string, unknown>;
  beneficiary_id?: string | null;
}): Promise<string> {
  const client_uuid = crypto.randomUUID();
  const cipher = await encryptJson(input.payload);
  const item: QueuedSubmission = {
    client_uuid,
    form_version_id: input.form_version_id,
    captured_at: new Date().toISOString(),
    payload: { _enc: cipher },
    beneficiary_id: input.beneficiary_id ?? null,
    status: 'queued',
    encrypted: true,
  };
  await enqueueSubmission(item);
  return client_uuid;
}

async function resolvePayload(p: QueuedSubmission): Promise<Record<string, unknown>> {
  if (p.encrypted && typeof p.payload._enc === 'string') {
    return decryptJson<Record<string, unknown>>(p.payload._enc);
  }
  return p.payload;
}

/**
 * Sync protocol subset (§13.4): manifest → batch upload → complete.
 * Idempotent via client_uuid on the server.
 */
export async function runSync(): Promise<{ uploaded: number; replayed: number; wiped?: boolean }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Cannot sync while offline.');
  }
  const deviceId = await ensureDeviceId();
  try {
    await api('/v1/field-data/devices/register', {
      method: 'POST',
      body: JSON.stringify({ device_id: deviceId }),
    });
  } catch {
    /* register best-effort */
  }
  const wipeCheck = await api<{ wipe?: boolean }>(
    `/v1/field-data/devices/me?device_id=${encodeURIComponent(deviceId)}`,
  ).catch(() => ({ wipe: false }));
  if (wipeCheck.wipe) {
    await wipeLocalOfflineData();
    await api('/v1/field-data/devices/me/wipe-ack', {
      method: 'POST',
      body: JSON.stringify({ device_id: deviceId }),
    }).catch(() => undefined);
    return { uploaded: 0, replayed: 0, wiped: true };
  }

  const meta = await getSyncMeta();
  const since = meta?.cursor ? `?since=${encodeURIComponent(meta.cursor)}` : '';
  const manifest = await api<Manifest>(`/v1/field-data/sync/manifest${since}`);
  if (manifest.forms?.length) {
    await putForms(
      manifest.forms.map((f) => ({
        form_id: f.form_id,
        form_version_id: f.form_version_id,
        code: f.code,
        title: f.title,
        version_number: f.version_number,
        fields: f.fields ?? [],
      })),
    );
  }

  const pending = await listQueue();
  let uploaded = 0;
  let replayed = 0;
  if (pending.length) {
    for (const p of pending) await markQueueStatus(p.client_uuid, 'syncing');
    const submissions = await Promise.all(
      pending.map(async (p) => ({
        client_uuid: p.client_uuid,
        form_version_id: p.form_version_id,
        captured_at: p.captured_at,
        beneficiary_id: p.beneficiary_id,
        device_id: deviceId,
        payload: await resolvePayload(p),
      })),
    );
    const batch = await api<BatchResult>('/v1/field-data/submissions/batch', {
      method: 'POST',
      body: JSON.stringify({ submissions }),
    });
    for (const r of batch.results) {
      if (r.status === 'accepted' || r.status === 'flagged') {
        await markQueueStatus(r.client_uuid, 'synced');
        uploaded += 1;
      } else if (r.status === 'idempotent_replay') {
        await markQueueStatus(r.client_uuid, 'synced');
        replayed += 1;
      } else {
        await markQueueStatus(r.client_uuid, 'rejected');
      }
    }
  }

  await api('/v1/field-data/sync/complete', {
    method: 'POST',
    body: JSON.stringify({ session_id: manifest.session_id, cursor: manifest.cursor }),
  });
  await setSyncMeta(manifest.cursor, manifest.session_id, deviceId);
  return { uploaded, replayed };
}

export async function loadLocalForms(): Promise<CachedForm[]> {
  const local = await listForms();
  if (local.length) return local;
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    return pullAssignedForms();
  }
  return [];
}
