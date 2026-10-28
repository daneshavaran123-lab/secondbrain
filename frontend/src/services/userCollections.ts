import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

// Lists the app used to keep only in this browser (social needs, partners, service log…) are
// kept on the server as one JSON document per person and list (table user_collections).
// The browser copy stays as a cache: the page opens instantly, and keeps working offline.

const read = (key: string): unknown[] | null => {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};
const write = (key: string, items: unknown[]) => {
  try { localStorage.setItem(key, JSON.stringify(items)); } catch { /* full or blocked: the server copy is the record */ }
};

export const userCollections = {
  /** The server's copy, or null when the server has none yet. */
  async load<T>(key: string): Promise<T[] | null> {
    const { data, error } = await supabase.from('user_collections').select('data').eq('collection', key).maybeSingle();
    if (error) throw new Error(error.message);
    return data && Array.isArray(data.data) ? (data.data as T[]) : null;
  },

  async save<T>(key: string, items: T[]): Promise<void> {
    const { data, error } = await supabase.from('user_collections').update({ data: items }).eq('collection', key).select('id');
    if (error) throw new Error(error.message);
    if (Array.isArray(data) && data.length) return;
    const inserted = await supabase.from('user_collections').insert({ collection: key, data: items });
    if (inserted.error) {
      // another tab created it in the meantime: write over it
      const retry = await supabase.from('user_collections').update({ data: items }).eq('collection', key);
      if (retry.error) throw new Error(inserted.error.message);
    }
  },
};

/**
 * A list kept on the server (and cached in this browser under the same key).
 * `normalize` tidies items read from either copy, e.g. older status names.
 * The first time, a list that so far lived only in this browser is moved to the server.
 */
export function useUserCollection<T>(key: string, normalize: (items: T[]) => T[] = (x) => x) {
  const normalizeRef = useRef(normalize);
  normalizeRef.current = normalize;
  const [items, setItemsState] = useState<T[]>(() => normalize((read(key) as T[]) ?? []));
  const [loading, setLoading] = useState(true);
  const loaded = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const pending = useRef<T[] | null>(null);
  const warned = useRef(false);

  const flush = useCallback(async () => {
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    try {
      await userCollections.save(key, next);
      warned.current = false;
    } catch {
      pending.current ??= next;
      if (!warned.current) {
        warned.current = true;
        toast({ title: 'روی سرور ذخیره نشد', description: 'تغییرات در همین مرورگر نگه داشته شد و با تغییر بعدی دوباره فرستاده می‌شود.', variant: 'destructive' });
      }
    }
  }, [key]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const server = await userCollections.load<T>(key);
        if (cancelled) return;
        if (server && !pending.current) {
          const list = normalizeRef.current(server);
          setItemsState(list);
          write(key, list);
        } else {
          const local = read(key) as T[] | null;
          if (local?.length) await userCollections.save(key, normalizeRef.current(local));
        }
      } catch {
        // offline or server error: keep showing the browser copy
      } finally {
        loaded.current = true;
        if (!cancelled) setLoading(false);
        // edits made while the server copy was loading win over it
        if (pending.current) void flush();
      }
    })();
    return () => { cancelled = true; };
  }, [key, flush]);

  // Send what is waiting when the page is left
  useEffect(() => () => { clearTimeout(timer.current); void flush(); }, [flush]);

  const setItems = useCallback((update: T[] | ((prev: T[]) => T[])) => {
    setItemsState((prev) => {
      const next = typeof update === 'function' ? (update as (p: T[]) => T[])(prev) : update;
      write(key, next);
      pending.current = next;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => { if (loaded.current) void flush(); }, 600);
      return next;
    });
  }, [key, flush]);

  return [items, setItems, { loading }] as const;
}
