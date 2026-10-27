import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { getTodaysFocus, type TodaysFocusItem } from '@/services/activityService';
import { askAssistant } from '@/lib/assistant';
import {
  Calendar,
  CheckSquare,
  Lightbulb,
  UserCheck,
  Scale,
  BookOpen,
  Mail,
  FolderKanban
} from 'lucide-react';

const STATUS_WORD: Record<TodaysFocusItem['status'], string> = {
  pending: 'در انتظار',
  in_progress: 'در حال انجام',
  completed: 'انجام شد',
};

/** Today's meetings and tasks: the first thing the home screen answers. */
export function TodayFocus({ className }: { className?: string }) {
  const [items, setItems] = useState<TodaysFocusItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getTodaysFocus()
      .then(setItems)
      .catch((error) => console.error("Error fetching today's focus:", error))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <section aria-labelledby="today-title" className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <h2 id="today-title" className="text-base font-semibold">امروز</h2>
        <Link to="/calendar" className="rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          تقویم
        </Link>
      </div>
      <div className="rounded-lg border border-border bg-card">
        {items.length > 0 ? (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.id} className="grid grid-cols-[3.5rem_1fr_auto] items-start gap-3 px-4 py-3">
                <time className="pt-px text-sm text-muted-foreground">{item.time || '—'}</time>
                <div className="min-w-0">
                  <p className={cn('text-sm leading-6', item.status === 'completed' && 'text-muted-foreground line-through decoration-muted-foreground/50')}>
                    {item.title}
                  </p>
                  {item.description && <p className="truncate text-xs text-muted-foreground">{item.description}</p>}
                </div>
                {item.status !== 'pending' ? (
                  <span className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
                    <span className={cn('h-1.5 w-1.5 rounded-full', item.status === 'completed' ? 'bg-success' : 'bg-signal')} aria-hidden />
                    {STATUS_WORD[item.status]}
                  </span>
                ) : <span />}
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-5">
            <p className="text-sm text-muted-foreground">
              {isLoading ? 'در حال بارگذاری…' : 'برای امروز جلسه یا کاری ثبت نشده.'}
            </p>
            {!isLoading && (
              <button
                onClick={() => askAssistant('برای امروزم یک برنامه پیشنهاد بده', true)}
                className="text-sm font-medium text-signal underline-offset-4 hover:underline"
              >
                از دستیار برنامه بخواه
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

const QUICK_LINKS = [
  { title: 'برنامه‌ریزی شخصی', icon: CheckSquare, route: '/personal-planning' },
  { title: 'برنامه‌ریزی سازمانی', icon: UserCheck, route: '/organizational-planning' },
  { title: 'نامه‌ها', icon: Mail, route: '/organizational-letters' },
  { title: 'پروژه‌ها', icon: FolderKanban, route: '/projects' },
  { title: 'ایده‌ها', icon: Lightbulb, route: '/ideas' },
  { title: 'دانش', icon: BookOpen, route: '/knowledge' },
  { title: 'امور حقوقی', icon: Scale, route: '/legal' },
  { title: 'تقویم', icon: Calendar, route: '/calendar' },
];

/** A short list of the places people go most; everything else is in the menu and Ctrl K. */
export function QuickLinks({ className }: { className?: string }) {
  return (
    <section aria-labelledby="quick-title" className={cn('space-y-2', className)}>
      <h2 id="quick-title" className="text-base font-semibold">دسترسی سریع</h2>
      <ul className="grid grid-cols-2 gap-x-2 rounded-lg border border-border bg-card p-1.5">
        {QUICK_LINKS.map((link) => (
          <li key={link.route}>
            <Link
              to={link.route}
              className="flex min-h-[40px] items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-muted"
            >
              <link.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 truncate">{link.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AdaptiveQuickActions() {
  return (
    <div className="space-y-6">
      <QuickLinks />
      <TodayFocus />
    </div>
  );
}
