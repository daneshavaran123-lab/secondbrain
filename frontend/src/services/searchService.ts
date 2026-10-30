import { apiFetch } from '@/lib/api';

// The person's own records, from GET /search (specs/001-unified-search/contracts/search-api.md).

export interface SearchItem {
  id: string;
  type: string;
  title: string;
  snippet: string;
  /** ISO; shown as a Jalali date */
  date: string | null;
  /** the page the record is on, with ?highlight=<id> where that page can show it */
  path: string;
  titleHit: boolean;
  status?: string;
}

export interface SearchGroup {
  type: string;
  label: string;
  total: number;
  items: SearchItem[];
}

export interface SearchResult {
  query: string;
  words: string[];
  total: number;
  groups: SearchGroup[];
}

export const MIN_QUERY = 2;
export const GROUP_LIMIT = 5;
export const EXPANDED_LIMIT = 20;

export async function searchRecords(
  q: string,
  { type, limit, signal }: { type?: string; limit?: number; signal?: AbortSignal } = {},
): Promise<SearchResult> {
  const params = new URLSearchParams({ q });
  if (type) params.set('type', type);
  if (limit) params.set('limit', String(limit));
  const res = await apiFetch(`/search?${params}`, { signal });
  if (!res.ok) throw new Error(`search ${res.status}`);
  return res.json();
}
