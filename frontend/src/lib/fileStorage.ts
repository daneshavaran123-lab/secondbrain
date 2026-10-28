import { apiFetch, BACKEND_URL, getStoredUser } from '@/lib/api';

// The app's uploads live on our server (backend/src/routes/files.js). This object answers the
// same calls the code already makes on `supabase.storage`: from(bucket).upload / download /
// remove / getPublicUrl / createSignedUrl / list.

type Result<T> = { data: T; error: null } | { data: null; error: { message: string } };

const KEY_STORE = 'brainforge_file_key';

const encodePath = (path: string) => path.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');

function cachedKey(): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY_STORE) || 'null');
    const user = getStoredUser();
    return saved && user && saved.userId === user.id ? saved.key : null;
  } catch {
    return null;
  }
}

let keyRequest: Promise<string | null> | null = null;
/** The signed-in person's link key, fetched once and kept with their id. */
export function ensureFileKey(): Promise<string | null> {
  const cached = cachedKey();
  if (cached) return Promise.resolve(cached);
  keyRequest ??= (async () => {
    try {
      const res = await apiFetch('/files/key');
      if (!res.ok) return null;
      const { key } = await res.json();
      const user = getStoredUser();
      if (user) localStorage.setItem(KEY_STORE, JSON.stringify({ userId: user.id, key }));
      return key as string;
    } catch {
      return null;
    } finally {
      keyRequest = null;
    }
  })();
  return keyRequest;
}

async function failure(res: Response) {
  const body = await res.json().catch(() => ({}));
  return { data: null, error: { message: body.error || `HTTP ${res.status}` } } as const;
}

const linkFor = (key: string, bucket: string, path: string) =>
  `${BACKEND_URL}/files/k/${key}/${encodeURIComponent(bucket)}/${encodePath(path)}`;

function bucketApi(bucket: string) {
  const base = `/files/o/${encodeURIComponent(bucket)}`;
  return {
    async upload(path: string, file: Blob | ArrayBuffer | File, options?: { contentType?: string; upsert?: boolean }): Promise<Result<{ id: string; path: string; fullPath: string }>> {
      try {
        const type = options?.contentType || (file instanceof Blob && file.type) || 'application/octet-stream';
        const res = await apiFetch(`${base}/${encodePath(path)}`, {
          method: 'POST',
          // the real type rides in its own header so a JSON file is not read as a request body
          headers: { 'Content-Type': 'application/octet-stream', 'X-File-Type': type, 'X-Upsert': String(!!options?.upsert) },
          body: file,
        });
        if (!res.ok) return failure(res);
        await ensureFileKey(); // so getPublicUrl right after the upload has the key
        return { data: await res.json(), error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message || 'آپلود نشد' } };
      }
    },

    async download(path: string): Promise<Result<Blob>> {
      try {
        const res = await apiFetch(`${base}/${encodePath(path)}`);
        if (!res.ok) return failure(res);
        return { data: await res.blob(), error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    },

    async remove(paths: string[]): Promise<Result<{ name: string }[]>> {
      try {
        const res = await apiFetch(base, { method: 'DELETE', body: JSON.stringify({ paths }) });
        if (!res.ok) return failure(res);
        return { data: await res.json(), error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    },

    async list(prefix = ''): Promise<Result<{ id: string; name: string; created_at: string; metadata: { size: number; mimetype: string } }[]>> {
      try {
        const res = await apiFetch(`${base}?prefix=${encodeURIComponent(prefix)}`);
        if (!res.ok) return failure(res);
        return { data: await res.json(), error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    },

    /** A link that opens the file without signing in (for images and saved links). */
    getPublicUrl(path: string): { data: { publicUrl: string } } {
      const key = cachedKey();
      if (!key) void ensureFileKey();
      return { data: { publicUrl: key ? linkFor(key, bucket, path) : '' } };
    },

    async createSignedUrl(path: string, _expiresIn?: number, options?: { download?: boolean | string }): Promise<Result<{ signedUrl: string }>> {
      const key = await ensureFileKey();
      if (!key) return { data: null, error: { message: 'لینک فایل ساخته نشد' } };
      return { data: { signedUrl: linkFor(key, bucket, path) + (options?.download ? '?download=1' : '') }, error: null };
    },
  };
}

export const fileStorage = {
  from: bucketApi,
};
