import React from 'react';
import { cn } from '@/lib/utils';

interface TaskStats {
  total: number;
  completed: number;
  in_progress: number;
  overdue: number;
  completion_rate: number;
}

interface PlanningStatsCardsProps {
  stats: TaskStats;
  overdueCount: number;
  /** Kept for callers; every domain now shares one look. */
  variant?: 'personal' | 'professional' | 'organizational';
}

const fa = (n: number) => Math.round(n).toLocaleString('fa-IR');

/** Task counts in one divided strip; only overdue work gets colour, and only when there is some. */
export function PlanningStatsCards({ stats, overdueCount }: PlanningStatsCardsProps) {
  const share = (n: number) => (stats.total ? (n / stats.total) * 100 : 0);
  const items = [
    { label: 'تکمیل شده', value: stats.completed, bar: stats.completion_rate, note: stats.total ? `${fa(stats.completion_rate)}٪ از ${fa(stats.total)} کار` : 'هنوز کاری نیست' },
    { label: 'در حال انجام', value: stats.in_progress, bar: share(stats.in_progress), note: stats.total ? `${fa(share(stats.in_progress))}٪ از کارها` : '—' },
    { label: 'معوقه', value: overdueCount, bar: share(overdueCount), note: overdueCount ? 'مهلتشان گذشته' : 'کار عقب‌افتاده‌ای ندارید', alert: overdueCount > 0 },
  ];

  return (
    <dl className="mb-8 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="bg-card px-4 py-3.5">
          <dt className="text-sm text-muted-foreground">{item.label}</dt>
          <dd className={cn('mt-1 text-2xl font-medium leading-8', item.alert && 'text-destructive')}>{fa(item.value)}</dd>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div
              className={cn('h-full rounded-full', item.alert ? 'bg-destructive' : 'bg-foreground/70')}
              style={{ width: `${Math.min(100, Math.max(0, item.bar))}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{item.note}</p>
        </div>
      ))}
    </dl>
  );
}
