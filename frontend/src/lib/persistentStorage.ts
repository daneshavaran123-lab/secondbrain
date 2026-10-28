import { supabase } from '@/integrations/supabase/client';
import { getStoredUser } from '@/lib/api';

/**
 * Many services keep the person's records in localStorage (meetings, legal cases, knowledge
 * folders, gratitude entries, project tasks, sprints…). Writes made through this module also go
 * to the server (table user_collections, one row per key), and `pullPersistentStorage()` brings
 * the server's copies into this browser after sign-in, so the records follow the person to any
 * device and survive a cleared browser.
 *
 * Keys that are not records (tokens, caches, UI state) pass straight through to localStorage.
 */

const SYNCED = new Set([
  'meetings_v3', 'meetings', 'meeting_minutes', 'meeting_resolutions', 'professional_meetings_v1', 'meeting_preparation_data',
  'gratitude_entries', 'enhanced_gratitude_entries',
  'brainforge_projects', 'brainforge_project_tasks', 'brainforge_project_members', 'brainforge_project_notifications',
  'projects', 'projectMembers', 'personalTasks',
  'professional_company_goals', 'risk-assessments',
  'organizational_kpis', 'approval_workflows', 'organizational_policies', 'organizational_missions',
  'knowledge_folders', 'knowledgeItems', 'custom_categories',
  'secretary_users', 'secretary_requests', 'secretary_notifications', 'secretaryRequests', 'secretaryNotifications',
  'dailyContentFavorites', 'dailyContentSettings', 'healthMetrics', 'main_company', 'main_organization', 'default_meeting_location',
  'brainforge_succession_positions', 'brainforge_succession_talent_pool', 'brainforge_succession_programs', 'brainforge_succession_goals',
]);
const SYNCED_PREFIXES = ['legal_', 'sprints_', 'sprint_tasks_', 'current_sprint_', 'succession_'];
// legal_data_* are flags of the sample-data loader, not records
const NOT_SYNCED_PREFIXES = ['legal_data_'];

export const isSyncedKey = (key: string) =>
  !NOT_SYNCED_PREFIXES.some((p) => key.startsWith(p)) && (SYNCED.has(key) || SYNCED_PREFIXES.some((p) => key.startsWith(p)));

const OWNER_KEY = 'brainforge_storage_owner';
const DIRTY_KEY = 'brainforge_storage_dirty';
export const PULLED_EVENT = 'persistent-storage:pulled';

const toServer = (value: string | null): unknown => {
  if (value === null) return null;
  try { return JSON.parse(value); } catch { return { __raw: value }; }
};
const fromServer = (data: unknown): string =>
  data && typeof data === 'object' && '__raw' in (data as object) ? String((data as { __raw: string }).__raw) : JSON.stringify(data);

const dirty = (): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(DIRTY_KEY) || '[]')); } catch { return new Set(); }
};
const setDirty = (keys: Set<string>) => {
  try { localStorage.setItem(DIRTY_KEY, JSON.stringify([...keys])); } catch { /* storage blocked */ }
};

async function send(key: string) {
  if (!getStoredUser()) return;
  const value = localStorage.getItem(key);
  if (value === null) {
    const { error } = await supabase.from('user_collections').delete().eq('collection', key);
    if (error) throw new Error(error.message);
    return;
  }
  const data = toServer(value);
  const { data: rows, error } = await supabase.from('user_collections').update({ data }).eq('collection', key).select('id');
  if (error) throw new Error(error.message);
  if (Array.isArray(rows) && rows.length) return;
  const inserted = await supabase.from('user_collections').insert({ collection: key, data });
  if (inserted.error) {
    const retry = await supabase.from('user_collections').update({ data }).eq('collection', key);
    if (retry.error) throw new Error(inserted.error.message);
  }
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
function schedule(key: string) {
  const d = dirty();
  d.add(key);
  setDirty(d);
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => void flushKey(key), 800));
}
async function flushKey(key: string) {
  timers.delete(key);
  try {
    await send(key);
    const d = dirty();
    d.delete(key);
    setDirty(d);
  } catch {
    // stays marked dirty: sent again with the next change or the next sign-in
  }
}

/** Send every change still waiting (when the page is hidden or closed). */
export function flushPersistentStorage() {
  for (const key of [...timers.keys()]) {
    clearTimeout(timers.get(key));
    void flushKey(key);
  }
}
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushPersistentStorage);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushPersistentStorage(); });
}

export const persistentStorage = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem(key: string, value: string) {
    localStorage.setItem(key, value);
    if (isSyncedKey(key)) schedule(key);
  },
  removeItem(key: string) {
    localStorage.removeItem(key);
    if (isSyncedKey(key)) schedule(key);
  },
};

let pulling: Promise<void> | null = null;
let pulledFor: string | null = null;
/**
 * Bring the signed-in person's records into this browser. Records found only here are sent up
 * the first time (when they are this person's); records another person left in this browser
 * are removed rather than mixed in.
 */
export function pullPersistentStorage(): Promise<void> {
  const user = getStoredUser();
  if (!user?.id) return Promise.resolve();
  // signing in as someone else in the same tab pulls again
  if (pulling && pulledFor === user.id) return pulling;
  pulledFor = user.id;
  pulling = (async () => {
    const { data, error } = await supabase.from('user_collections').select('collection, data');
    if (error) throw new Error(error.message);
    const server = new Map<string, unknown>(((data ?? []) as { collection: string; data: unknown }[])
      .filter((r) => isSyncedKey(r.collection))
      .map((r) => [r.collection, r.data]));
    const owner = localStorage.getItem(OWNER_KEY);
    const mine = !owner || owner === user.id;
    const waiting = mine ? dirty() : new Set<string>();
    const local = Object.keys(localStorage).filter(isSyncedKey);

    for (const key of local) {
      if (waiting.has(key)) continue; // edited here and not sent yet: this copy is newer
      if (server.has(key)) continue;
      if (mine) schedule(key); // only in this browser so far: send it up
      else localStorage.removeItem(key); // someone else's record
    }
    for (const [key, value] of server) {
      if (waiting.has(key)) { schedule(key); continue; }
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, fromServer(value));
    }
    if (!mine) setDirty(new Set());
    localStorage.setItem(OWNER_KEY, user.id);
    window.dispatchEvent(new Event(PULLED_EVENT));
  })().catch((e) => {
    pulling = null; // try again on the next page
    console.warn('[persistentStorage] pull failed:', (e as Error).message);
  });
  return pulling;
}

