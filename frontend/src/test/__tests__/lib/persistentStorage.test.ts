import { describe, it, expect, vi, beforeEach } from 'vitest';

// user_collections as the server holds it for the signed-in person
const server = vi.hoisted(() => ({ rows: new Map<string, unknown>() }));
const session = vi.hoisted(() => ({ user: { id: 'u1' } as { id: string } | null }));

vi.mock('@/lib/api', () => ({ getStoredUser: () => session.user }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      let op = 'select';
      let payload: { collection?: string; data?: unknown } = {};
      const filters: Record<string, string> = {};
      const run = () => {
        const key = filters.collection;
        if (op === 'select') return { data: [...server.rows].map(([collection, data]) => ({ collection, data })), error: null };
        if (op === 'update') {
          if (!server.rows.has(key)) return { data: [], error: null };
          server.rows.set(key, payload.data);
          return { data: [{ id: key }], error: null };
        }
        if (op === 'insert') {
          server.rows.set(payload.collection!, payload.data);
          return { data: payload, error: null };
        }
        server.rows.delete(key);
        return { data: [], error: null };
      };
      const b = {
        select: () => b,
        update: (d: typeof payload) => { op = 'update'; payload = d; return b; },
        insert: (d: typeof payload) => { op = 'insert'; payload = d; return b; },
        delete: () => { op = 'delete'; return b; },
        eq: (c: string, v: string) => { filters[c] = v; return b; },
        then: (resolve: (v: unknown) => void) => resolve(run()),
      };
      return b;
    },
  },
}));

import { flushPersistentStorage, isSyncedKey, persistentStorage, pullPersistentStorage } from '@/lib/persistentStorage';

const settle = () => new Promise((r) => setTimeout(r, 0));
let n = 0;
const signIn = () => { session.user = { id: `user-${++n}` }; return session.user.id; };

describe('persistent storage', () => {
  beforeEach(() => {
    localStorage.clear();
    server.rows.clear();
  });

  it('syncs records, not tokens, caches or sample-data flags', () => {
    expect(isSyncedKey('meetings_v3')).toBe(true);
    expect(isSyncedKey('legal_u1_cases')).toBe(true);
    expect(isSyncedKey('sprints_personal')).toBe(true);
    expect(isSyncedKey('legal_data_initialized')).toBe(false);
    expect(isSyncedKey('mora_access_token')).toBe(false);
    expect(isSyncedKey('sidebar-open-categories')).toBe(false);
  });

  it('sends a saved record to the server, and its removal too', async () => {
    signIn();
    persistentStorage.setItem('meetings_v3', JSON.stringify([{ id: 'm1', title: 'جلسه' }]));
    persistentStorage.setItem('mora_access_token', 'secret');
    flushPersistentStorage();
    await settle();
    expect(server.rows.get('meetings_v3')).toEqual([{ id: 'm1', title: 'جلسه' }]);
    expect(server.rows.has('mora_access_token')).toBe(false);

    persistentStorage.removeItem('meetings_v3');
    flushPersistentStorage();
    await settle();
    expect(server.rows.has('meetings_v3')).toBe(false);
  });

  it('keeps a value that is not JSON as it was', async () => {
    const me = signIn();
    persistentStorage.setItem('current_sprint_personal', 'sprint-7');
    flushPersistentStorage();
    await settle();
    localStorage.clear();
    localStorage.setItem('brainforge_storage_owner', me);
    await pullPersistentStorage();
    expect(localStorage.getItem('current_sprint_personal')).toBe('sprint-7');
  });

  it('brings the server copy in and sends up what only this browser had', async () => {
    const me = signIn();
    localStorage.setItem('brainforge_storage_owner', me);
    server.rows.set('knowledge_folders', [{ id: 'f1', name: 'از دستگاه دیگر' }]);
    localStorage.setItem('knowledge_folders', JSON.stringify([{ id: 'old' }]));
    localStorage.setItem('gratitude_entries', JSON.stringify([{ id: 'g1' }]));

    await pullPersistentStorage();
    flushPersistentStorage();
    await settle();

    expect(JSON.parse(localStorage.getItem('knowledge_folders')!)).toEqual([{ id: 'f1', name: 'از دستگاه دیگر' }]);
    expect(server.rows.get('gratitude_entries')).toEqual([{ id: 'g1' }]);
  });

  it('does not mix in records another person left in this browser', async () => {
    localStorage.setItem('brainforge_storage_owner', 'someone-else');
    localStorage.setItem('legal_x_cases', JSON.stringify([{ id: 'their-case' }]));
    signIn();
    server.rows.set('meetings_v3', [{ id: 'mine' }]);

    await pullPersistentStorage();
    flushPersistentStorage();
    await settle();

    expect(localStorage.getItem('legal_x_cases')).toBeNull();
    expect(server.rows.has('legal_x_cases')).toBe(false);
    expect(JSON.parse(localStorage.getItem('meetings_v3')!)).toEqual([{ id: 'mine' }]);
  });

  it('keeps an edit that has not reached the server over the older server copy', async () => {
    const me = signIn();
    localStorage.setItem('brainforge_storage_owner', me);
    server.rows.set('risk-assessments', [{ id: 'r1', level: 'old' }]);
    localStorage.setItem('risk-assessments', JSON.stringify([{ id: 'r1', level: 'edited offline' }]));
    localStorage.setItem('brainforge_storage_dirty', JSON.stringify(['risk-assessments']));

    await pullPersistentStorage();
    flushPersistentStorage();
    await settle();

    expect(JSON.parse(localStorage.getItem('risk-assessments')!)).toEqual([{ id: 'r1', level: 'edited offline' }]);
    expect(server.rows.get('risk-assessments')).toEqual([{ id: 'r1', level: 'edited offline' }]);
  });
});
