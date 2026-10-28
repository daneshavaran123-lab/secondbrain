import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ListTodo, Plus, Trash2 } from 'lucide-react';
import { differenceInCalendarDays, format } from 'date-fns-jalali';
import { SectionHeader } from '@/components/ui/section-header';
import { AppIcon } from '@/components/ui/app-icon';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

// Every task the person has, whichever domain it was planned in (the same rows the planning
// pages and the assistant read and write)

type Domain = 'personal' | 'professional' | 'organizational';
type Priority = 'low' | 'medium' | 'high' | 'urgent';

interface TaskRow {
  id: string;
  title: string;
  status: string | null;
  priority: Priority | null;
  due_date: string | null;
  domain: Domain | null;
  created_at: string;
}

const DOMAINS: Record<Domain, { label: string; planning: string }> = {
  personal: { label: 'فردی', planning: '/personal-planning' },
  professional: { label: 'حرفه‌ای', planning: '/professional-planning' },
  organizational: { label: 'سازمانی', planning: '/organizational-planning' },
};
const PRIORITIES: Record<Priority, { label: string; className: string }> = {
  urgent: { label: 'فوری', className: 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300' },
  high: { label: 'بالا', className: 'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300' },
  medium: { label: 'متوسط', className: 'border-border bg-muted text-foreground' },
  low: { label: 'پایین', className: 'border-border text-muted-foreground' },
};
const isDone = (t: TaskRow) => ['done', 'completed', 'cancelled'].includes(t.status ?? '');
const fa = (n: number) => n.toLocaleString('fa-IR');

function dueLabel(due: string | null, done: boolean): { text: string; late: boolean } | null {
  if (!due) return null;
  const date = new Date(due);
  const days = differenceInCalendarDays(date, new Date());
  const day = format(date, 'd MMMM').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
  if (done) return { text: day, late: false };
  if (days === 0) return { text: 'امروز', late: false };
  if (days === 1) return { text: 'فردا', late: false };
  if (days < 0) return { text: `${fa(-days)} روز گذشته · ${day}`, late: true };
  return { text: day, late: false };
}

const TasksPage = () => {
  const isMobile = useIsMobile();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'open' | 'done' | 'all'>('open');
  const [domainFilter, setDomainFilter] = useState<Domain | 'all'>('all');
  const [draft, setDraft] = useState({ title: '', domain: 'personal' as Domain, priority: 'medium' as Priority, due: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('personal_planning')
      .select('id, title, status, priority, due_date, domain, created_at')
      .order('due_date', { ascending: true });
    if (error) toast({ title: 'کارها بارگذاری نشدند', description: error.message, variant: 'destructive' });
    else setTasks((data ?? []) as TaskRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = draft.title.trim();
    if (!title) return;
    setSaving(true);
    const { data, error } = await supabase
      .from('personal_planning')
      .insert({
        title,
        status: 'todo',
        priority: draft.priority,
        domain: draft.domain,
        // a picked day is kept at local noon so it never slides to the day before
        due_date: draft.due ? new Date(`${draft.due}T12:00:00`).toISOString() : null,
      })
      .select('id, title, status, priority, due_date, domain, created_at')
      .single();
    setSaving(false);
    if (error) {
      toast({ title: 'کار ذخیره نشد', description: error.message, variant: 'destructive' });
      return;
    }
    setTasks((prev) => [...prev, data as TaskRow]);
    setDraft((d) => ({ ...d, title: '', due: '' }));
    toast({ title: 'کار اضافه شد', description: title });
  };

  const toggle = async (task: TaskRow) => {
    const status = isDone(task) ? 'todo' : 'done';
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status } : t)));
    const { error } = await supabase.from('personal_planning').update({ status }).eq('id', task.id);
    if (error) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      toast({ title: 'تغییر ذخیره نشد', description: error.message, variant: 'destructive' });
    }
  };

  const remove = async (task: TaskRow) => {
    if (!window.confirm(`«${task.title}» حذف شود؟`)) return;
    const { error } = await supabase.from('personal_planning').delete().eq('id', task.id);
    if (error) {
      toast({ title: 'حذف نشد', description: error.message, variant: 'destructive' });
      return;
    }
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
  };

  const stats = useMemo(() => {
    const open = tasks.filter((t) => !isDone(t));
    const today = open.filter((t) => t.due_date && differenceInCalendarDays(new Date(t.due_date), new Date()) === 0).length;
    const late = open.filter((t) => t.due_date && differenceInCalendarDays(new Date(t.due_date), new Date()) < 0).length;
    return { open: open.length, today, late, done: tasks.length - open.length };
  }, [tasks]);

  const shown = tasks.filter((t) =>
    (view === 'all' || (view === 'done') === isDone(t)) &&
    (domainFilter === 'all' || (t.domain ?? 'personal') === domainFilter));

  return (
    <div className="space-y-6 p-3 md:p-6">
      <SectionHeader
        title="کارهای من"
        subtitle="همه کارهای فردی، حرفه‌ای و سازمانی در یک فهرست"
        icon={<AppIcon size={isMobile ? 'md' : 'lg'}><ListTodo /></AppIcon>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'باز', value: stats.open },
          { label: 'موعد امروز', value: stats.today },
          { label: 'عقب‌افتاده', value: stats.late, tone: stats.late ? 'text-red-600 dark:text-red-400' : '' },
          { label: 'انجام‌شده', value: stats.done },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">{s.label}</div>
              <div className={cn('mt-1 text-2xl font-bold', s.tone)}>{loading ? '…' : fa(s.value)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          <form onSubmit={addTask} className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <label htmlFor="new-task" className="mb-1.5 block text-sm font-medium">کار تازه</label>
              <Input id="new-task" placeholder="مثلاً تماس با دفتر بیمه…" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3 md:flex">
              <Select value={draft.domain} onValueChange={(v) => setDraft({ ...draft, domain: v as Domain })}>
                <SelectTrigger className="md:w-28" aria-label="حوزه"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(DOMAINS).map(([k, d]) => <SelectItem key={k} value={k}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={draft.priority} onValueChange={(v) => setDraft({ ...draft, priority: v as Priority })}>
                <SelectTrigger className="md:w-28" aria-label="اولویت"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['urgent', 'high', 'medium', 'low'] as Priority[]).map((p) => <SelectItem key={p} value={p}>اولویت {PRIORITIES[p].label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="date" aria-label="موعد" placeholder="موعد" value={draft.due} onChange={(e) => setDraft({ ...draft, due: e.target.value })} className="md:w-44" />
            </div>
            <Button type="submit" disabled={!draft.title.trim() || saving} className="gap-2">
              <Plus className="h-4 w-4" />
              افزودن
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
          <TabsList>
            <TabsTrigger value="open">باز ({fa(stats.open)})</TabsTrigger>
            <TabsTrigger value="done">انجام‌شده ({fa(stats.done)})</TabsTrigger>
            <TabsTrigger value="all">همه</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="حوزه">
          {(['all', 'personal', 'professional', 'organizational'] as const).map((d) => (
            <Button key={d} type="button" size="sm" variant={domainFilter === d ? 'default' : 'outline'} aria-pressed={domainFilter === d} onClick={() => setDomainFilter(d)}>
              {d === 'all' ? 'همه حوزه‌ها' : DOMAINS[d].label}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-4" aria-busy="true">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : shown.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
              <CheckCircle2 className="h-10 w-10 text-muted-foreground" aria-hidden />
              <p className="font-medium">
                {view === 'open' ? (tasks.length ? 'کار بازی نمانده؛ آفرین!' : 'هنوز کاری ثبت نکرده‌اید') : view === 'done' ? 'هنوز کاری انجام نشده' : 'کاری پیدا نشد'}
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">کار تازه را در کادر بالا بنویسید، یا از دستیار بخواهید برایتان ثبت کند.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {shown.map((t) => {
                const done = isDone(t);
                const due = dueLabel(t.due_date, done);
                const priority = PRIORITIES[t.priority ?? 'medium'] ?? PRIORITIES.medium;
                const domain = DOMAINS[t.domain ?? 'personal'] ?? DOMAINS.personal;
                return (
                  <li key={t.id} className="group flex items-center gap-3 px-4 py-3">
                    <Checkbox checked={done} onCheckedChange={() => toggle(t)} aria-label={done ? `برگرداندن «${t.title}» به کارهای باز` : `انجام شد: ${t.title}`} />
                    <div className="min-w-0 flex-1">
                      <div className={cn('truncate font-medium', done && 'text-muted-foreground line-through')}>{t.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <Link to={domain.planning} className="hover:text-foreground hover:underline">{domain.label}</Link>
                        {due && <span className={cn(due.late && 'font-medium text-red-600 dark:text-red-400')}>· {due.text}</span>}
                      </div>
                    </div>
                    {!done && t.priority && t.priority !== 'medium' && (
                      <Badge variant="outline" className={cn('shrink-0 text-xs', priority.className)}>{priority.label}</Badge>
                    )}
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground opacity-100 hover:text-destructive md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100" onClick={() => remove(t)} aria-label={`حذف «${t.title}»`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TasksPage;
