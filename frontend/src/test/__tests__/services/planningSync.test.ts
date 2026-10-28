import { describe, it, expect, vi, beforeEach } from 'vitest';

// The planning table as the server would hold it
const server = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], fail: false }));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(async (_path: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (server.fail) return new Response(JSON.stringify({ error: { message: 'offline' } }), { status: 503 });
    if (body.operation === 'select') {
      const domain = body.filters[0].val;
      return Response.json({ data: server.rows.filter((r) => r.domain === domain) });
    }
    if (body.operation === 'upsert') {
      for (const row of body.data) {
        const at = server.rows.findIndex((r) => r.id === row.id);
        const stored = { created_at: '2026-10-20T08:00:00Z', ...row, updated_at: '2026-10-28T08:00:00Z' };
        if (at >= 0) server.rows[at] = stored; else server.rows.push(stored);
      }
      return Response.json({ data: body.data });
    }
    if (body.operation === 'delete') {
      const ids: string[] = body.filters[0].val;
      server.rows = server.rows.filter((r) => !ids.includes(r.id as string));
      return Response.json({ data: [] });
    }
    return Response.json({ data: null });
  }),
}));

import { createPlanningSync, fromRow, toRow, PLANNING_CHANGED_EVENT } from '@/services/planningSync';

const KEY = 'personal_tasks_test';
const task = (id: string, extra: Record<string, unknown> = {}) => ({
  id, title: `کار ${id}`, status: 'todo', priority: 'medium', created_at: '2026-10-20T08:00:00Z',
  mainCategory: 'personal_life', subCategory: 'health', progress: 0, ...extra,
});
const uuid = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const save = (tasks: unknown[]) => localStorage.setItem(KEY, JSON.stringify(tasks));
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('planning sync', () => {
  beforeEach(() => {
    localStorage.clear();
    server.rows = [];
    server.fail = false;
  });

  it('keeps the extra task fields in details and maps the status both ways', () => {
    const row = toRow(task(uuid(1), { status: 'completed', estimatedHours: 3 }) as never, 'personal');
    expect(row).toMatchObject({ status: 'done', domain: 'personal', category: 'health' });
    expect(row.details).toMatchObject({ estimatedHours: 3, mainCategory: 'personal_life' });
    const back = fromRow({ ...row, created_at: 'x', updated_at: 'y' } as never);
    expect(back).toMatchObject({ status: 'completed', estimatedHours: 3, subCategory: 'health' });
  });

  it('sends new, changed and removed tasks to the server', async () => {
    const sync = createPlanningSync('personal', KEY);
    const first = [task(uuid(1)), task(uuid(2))];
    save(first);
    sync.persist([], first as never[]);
    await sync.flush();
    expect(server.rows.map((r) => r.id)).toEqual([uuid(1), uuid(2)]);

    const second = [{ ...first[0], title: 'عنوان تازه' }];
    save(second);
    sync.persist(first as never[], second as never[]);
    await sync.flush();
    expect(server.rows).toHaveLength(1);
    expect(server.rows[0].title).toBe('عنوان تازه');
  });

  it('brings in tasks made elsewhere and uploads ones that only exist here', async () => {
    server.rows.push({ ...toRow(task(uuid(3)) as never, 'personal'), title: 'از دستیار', created_at: 'a', updated_at: 'b' });
    save([task('local-1')]);
    const changed = vi.fn();
    window.addEventListener(PLANNING_CHANGED_EVENT, changed);
    const sync = createPlanningSync('personal', KEY);

    expect(await sync.pull()).toBe(true);
    await settle();
    await sync.flush();
    const local = JSON.parse(localStorage.getItem(KEY)!);
    expect(local.map((t: { title: string }) => t.title)).toEqual(['از دستیار', 'کار local-1']);
    // the old local id is replaced by a UUID the server accepts, and the task is uploaded
    expect(local[1].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(server.rows.map((r) => r.id)).toContain(local[1].id);
    expect(changed).toHaveBeenCalled();
    window.removeEventListener(PLANNING_CHANGED_EVENT, changed);
  });

  it('keeps edits made offline and sends them once the server is back', async () => {
    const sync = createPlanningSync('personal', KEY);
    server.fail = true;
    const tasks = [task(uuid(4))];
    save(tasks);
    sync.persist([], tasks as never[]);
    await sync.flush();
    expect(server.rows).toHaveLength(0);
    expect(await sync.pull()).toBe(false);

    server.fail = false;
    await sync.pull();
    expect(server.rows.map((r) => r.id)).toEqual([uuid(4)]);
  });

  it('drops a task deleted on another device', async () => {
    const sync = createPlanningSync('personal', KEY);
    const tasks = [task(uuid(5)), task(uuid(6))];
    save(tasks);
    sync.persist([], tasks as never[]);
    await sync.flush();
    server.rows = server.rows.filter((r) => r.id !== uuid(6));
    await sync.pull();
    expect(JSON.parse(localStorage.getItem(KEY)!).map((t: { id: string }) => t.id)).toEqual([uuid(5)]);
  });
});
