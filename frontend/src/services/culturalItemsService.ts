import { supabase } from '@/integrations/supabase/client';
import type { ContentItem } from '@/pages/CulturalContentPage';

// Books, films, podcasts… live in the cultural_content table, one row per item.
// Fields with no column of their own (category, PDF, AI summary, mind map) ride in metadata.

interface CulturalRow {
  id: string;
  title: string;
  content: string | null;
  content_type: string;
  reference: string | null;
  cover_image: string | null;
  status: string | null;
  rating: number | null;
  progress: number | null;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string | null;
}

type NewItem = Omit<ContentItem, 'id' | 'createdAt' | 'updatedAt'>;

const STATUSES: ContentItem['status'][] = ['planning', 'in-progress', 'completed', 'archived'];

export const toItem = (r: CulturalRow): ContentItem => {
  const meta = (r.metadata ?? {}) as Record<string, any>;
  return {
    id: r.id,
    title: r.title,
    description: r.content || undefined,
    type: r.content_type as ContentItem['type'],
    status: STATUSES.includes(r.status as ContentItem['status']) ? (r.status as ContentItem['status']) : 'planning',
    coverImage: r.cover_image || undefined,
    link: r.reference || undefined,
    rating: r.rating ?? undefined,
    progress: r.progress ?? 0,
    tags: Array.isArray(r.tags) ? r.tags : [],
    category: meta.category || undefined,
    pdfUrl: meta.pdfUrl || undefined,
    pdfFile: meta.pdfFile || undefined,
    aiSummary: meta.aiSummary,
    mindmap: meta.mindmap,
    createdAt: r.created_at,
    updatedAt: r.updated_at || r.created_at,
  };
};

export const toRow = (i: NewItem) => ({
  title: i.title,
  content: i.description ?? null,
  content_type: i.type,
  reference: i.link ?? null,
  cover_image: i.coverImage ?? null,
  status: i.status,
  rating: i.rating ?? null,
  progress: i.progress ?? 0,
  tags: i.tags ?? [],
  metadata: Object.fromEntries(
    Object.entries({ category: i.category, pdfUrl: i.pdfUrl, pdfFile: i.pdfFile, aiSummary: i.aiSummary, mindmap: i.mindmap })
      .filter(([, v]) => v !== undefined && v !== ''),
  ),
});

const fail = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

export const culturalItemsService = {
  async list(types: string[]): Promise<ContentItem[]> {
    const { data, error } = await supabase
      .from('cultural_content')
      .select('*')
      .in('content_type', types)
      .order('created_at', { ascending: false });
    fail(error);
    return ((data ?? []) as CulturalRow[]).map(toItem);
  },

  async types(): Promise<string[]> {
    const { data, error } = await supabase.from('cultural_content').select('content_type');
    fail(error);
    return ((data ?? []) as { content_type: string }[]).map((r) => r.content_type);
  },

  async create(item: NewItem): Promise<ContentItem> {
    const { data, error } = await supabase.from('cultural_content').insert(toRow(item)).select().single();
    fail(error);
    return toItem(data as CulturalRow);
  },

  async update(item: ContentItem): Promise<void> {
    const { error } = await supabase.from('cultural_content').update(toRow(item)).eq('id', item.id);
    fail(error);
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('cultural_content').delete().eq('id', id);
    fail(error);
  },

  /** Items earlier versions kept only in this browser (cw_books, cw_movies…) move to the server once. */
  async moveBrowserItems(): Promise<number> {
    let moved = 0;
    for (const key of ['cw_books', 'cw_movies', 'cw_podcasts', 'cw_audiobooks', 'cw_articles', 'cw_theater']) {
      let stored: ContentItem[] = [];
      try { stored = JSON.parse(localStorage.getItem(key) || '[]'); } catch { /* unreadable: leave it */ continue; }
      if (!Array.isArray(stored) || stored.length === 0) { localStorage.removeItem(key); continue; }
      const rows = stored.filter((i) => i && i.title && i.type).map((i) => toRow(i));
      if (rows.length) {
        const { error } = await supabase.from('cultural_content').insert(rows);
        if (error) continue; // keep them in the browser and try again next visit
        moved += rows.length;
      }
      localStorage.removeItem(key);
    }
    return moved;
  },
};
