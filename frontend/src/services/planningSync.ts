import { apiFetch } from '@/lib/api';
import type { PersonalTask } from '@/types';

/**
 * Keeps a planning service's local task list in step with the server table
 * `personal_planning` (one row per task, `domain` = personal | professional | organizational).
 *
 * The services stay synchronous: they read and write their localStorage copy as before,
 * and every save is also sent to the server. `pull()` brings the server's rows in — tasks
 * the assistant created, or ones made on another device — and uploads tasks that so far
 * only existed in this browser.
 */

export type PlanningDomain = 'personal' | 'professional' | 'organizational';
type Task = PersonalTask & Record<string, unknown>;

export const PLANNING_CHANGED_EVENT = 'planning:changed';

interface PlanningRow {
  id: string;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'done' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date: string | null;
  domain: string;
  category: string | null;
  tags: string[] | null;
  details: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

const ROW_FIELDS = new Set(['id', 'title', 'description', 'status', 'priority', 'due_date', 'tags', 'created_at', 'updated_at', 'domain']);

export function toRow(task: Task, domain: PlanningDomain): Omit<PlanningRow, 'created_at' | 'updated_at'> & { created_at?: string } {
  const details: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(task)) {
    if (!ROW_FIELDS.has(key) && value !== undefined) details[key] = value;
  }
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? null,
    status: task.status === 'completed' ? 'done' : task.status,
    priority: task.priority,
    due_date: task.due_date || null,
    domain,
    category: (task.subCategory || task.customCategory || task.category || null) as string | null,
    tags: Array.isArray(task.tags) ? task.tags : [],
    details,
    created_at: task.created_at,
  };
}

export function fromRow(row: PlanningRow): Task {
  const details = row.details || {};
  const status = row.status === 'done' ? 'completed' : row.status === 'cancelled' ? 'completed' : row.status;
  return {
    mainCategory: 'personal_life',
    subCategory: (row.category as PersonalTask['subCategory']) || 'personal',
    progress: status === 'completed' ? 100 : 0,
    ...details,
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    status,
    priority: row.priority === 'urgent' ? 'high' : row.priority,
    due_date: row.due_date ?? undefined,
    tags: row.tags || [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  } as Task;
}

async function db(body: Record<string, unknown>) {
  const res = await apiFetch('/db/personal_planning', { method: 'POST', body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error?.message || `HTTP ${res.status}`);
  return json.data;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createPlanningSync(domain: PlanningDomain, storageKey: string) {
  const pendingKey = `${storageKey}:pending`;
  // Ids the server is known to have; a known task missing from the server was deleted elsewhere
  const syncedKey = `${storageKey}:synced`;
  const readSynced = (): Set<string> => {
    try {
      return new Set(JSON.parse(localStorage.getItem(syncedKey) || '[]'));
    } catch {
      return new Set();
    }
  };
  const writeSynced = (ids: Set<string>) => {
    try { localStorage.setItem(syncedKey, JSON.stringify([...ids])); } catch { /* best effort */ }
  };

  const readPending = (): { upsert: string[]; remove: string[] } => {
    try {
      return { upsert: [], remove: [], ...JSON.parse(localStorage.getItem(pendingKey) || '{}') };
    } catch {
      return { upsert: [], remove: [] };
    }
  };
  const writePending = (p: { upsert: string[]; remove: string[] }) => {
    try {
      localStorage.setItem(pendingKey, JSON.stringify({ upsert: [...new Set(p.upsert)], remove: [...new Set(p.remove)] }));
    } catch { /* storage full or blocked: the next pull retries from the task list */ }
  };
  const readLocal = (): Task[] => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '[]');
    } catch {
      return [];
    }
  };

  let flushing: Promise<void> | null = null;

  /** Send queued changes; failures stay queued for the next save or pull. */
  const flush = (): Promise<void> => {
    flushing ??= (async () => {
      const pending = readPending();
      const tasks = new Map(readLocal().map((t) => [t.id, t]));
      const rows = pending.upsert.map((id) => tasks.get(id)).filter(Boolean).map((t) => toRow(t as Task, domain));
      try {
        if (rows.length) await db({ operation: 'upsert', data: rows });
        if (pending.remove.length) await db({ operation: 'delete', filters: [{ col: 'id', op: 'in', val: pending.remove }] });
        const synced = readSynced();
        rows.forEach((r) => synced.add(r.id));
        pending.remove.forEach((id) => synced.delete(id));
        writeSynced(synced);
        const after = readPending();
        writePending({
          upsert: after.upsert.filter((id) => !pending.upsert.includes(id)),
          remove: after.remove.filter((id) => !pending.remove.includes(id)),
        });
      } catch (error) {
        console.warn(`[planning:${domain}] sync deferred:`, error);
      }
    })().finally(() => { flushing = null; });
    return flushing;
  };

  return {
    /** Record what changed between two saves and send it to the server. */
    persist(previous: Task[], next: Task[]) {
      const before = new Map(previous.map((t) => [t.id, t]));
      const after = new Set(next.map((t) => t.id));
      const pending = readPending();
      for (const task of next) {
        const old = before.get(task.id);
        if (!old || JSON.stringify(old) !== JSON.stringify(task)) pending.upsert.push(task.id);
      }
      for (const id of before.keys()) {
        if (!after.has(id)) {
          pending.remove.push(id);
          pending.upsert = pending.upsert.filter((x) => x !== id);
        }
      }
      writePending(pending);
      void flush();
    },

    /**
     * Merge the server's tasks into the local list. Local edits not yet sent win; tasks
     * that exist only here are queued for upload.
     */
    async pull(): Promise<boolean> {
      await flush();
      let rows: PlanningRow[];
      try {
        rows = await db({ operation: 'select', filters: [{ col: 'domain', op: 'eq', val: domain }], order: { col: 'created_at', ascending: true } });
      } catch (error) {
        console.warn(`[planning:${domain}] using the offline copy:`, error);
        return false;
      }
      const pending = readPending();
      const synced = readSynced();
      // Tasks saved before sync existed may carry ids the server cannot store
      const local = readLocal().map((t) => (UUID.test(t.id) ? t : { ...t, id: crypto.randomUUID() }));
      const localById = new Map(local.map((t) => [t.id, t]));
      const serverIds = new Set(rows.map((r) => r.id));
      const merged: Task[] = rows
        .filter((r) => !pending.remove.includes(r.id))
        .map((r) => (pending.upsert.includes(r.id) && localById.has(r.id) ? localById.get(r.id)! : fromRow(r)));
      const localOnly = local.filter((t) => !serverIds.has(t.id) && (!synced.has(t.id) || pending.upsert.includes(t.id)));
      merged.push(...localOnly);
      writeSynced(new Set([...serverIds].filter((id) => !pending.remove.includes(id))));
      // Save the merged list first: the upload below reads tasks (and their new ids) from it
      const changed = JSON.stringify(merged) !== localStorage.getItem(storageKey);
      if (changed) localStorage.setItem(storageKey, JSON.stringify(merged));
      if (localOnly.length) {
        pending.upsert.push(...localOnly.map((t) => t.id));
        writePending(pending);
        void flush();
      }
      if (changed) window.dispatchEvent(new CustomEvent(PLANNING_CHANGED_EVENT, { detail: { domain } }));
      return changed;
    },

    flush,
  };
}
