import { useCallback, useEffect, useRef, useState } from 'react';
import { EXPANDED_LIMIT, MIN_QUERY, searchRecords, type SearchGroup } from '@/services/searchService';

export type RecordSearchStatus = 'idle' | 'loading' | 'done' | 'error';

export const SEARCH_DELAY_MS = 250;

/**
 * Searches the person's records as they type: after a 250ms pause, from 2 characters on.
 * A newer query cancels the one before it, so an older answer never replaces a newer one.
 */
export function useRecordSearch(query: string) {
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<RecordSearchStatus>('idle');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const current = useRef<{ q: string; controller: AbortController } | null>(null);

  useEffect(() => {
    const q = query.trim();
    current.current?.controller.abort();
    current.current = null;
    setExpanded(new Set());
    if (q.length < MIN_QUERY) {
      setGroups([]);
      setTotal(0);
      setStatus('idle');
      return;
    }
    setStatus('loading');
    const controller = new AbortController();
    const timer = setTimeout(() => {
      current.current = { q, controller };
      searchRecords(q, { signal: controller.signal })
        .then((result) => {
          if (controller.signal.aborted) return;
          setGroups(result.groups);
          setTotal(result.total);
          setStatus('done');
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setGroups([]);
          setTotal(0);
          setStatus('error');
        });
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  /** Shows up to 20 records of one type («بیشتر»). */
  const expand = useCallback(async (type: string) => {
    const active = current.current;
    if (!active) return;
    try {
      const result = await searchRecords(active.q, { type, limit: EXPANDED_LIMIT, signal: active.controller.signal });
      if (active.controller.signal.aborted) return;
      const more = result.groups.find((g) => g.type === type);
      if (!more) return;
      setGroups((gs) => gs.map((g) => (g.type === type ? more : g)));
      setExpanded((s) => new Set(s).add(type));
    } catch {
      /* the five already shown stay */
    }
  }, []);

  return { groups, total, status, expanded, expand };
}
