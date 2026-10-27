import React, { useState, useEffect } from 'react';
import { getDashboardStats, type DashboardStats } from '@/services/dashboardService';
import { getRecentActivities, type RecentActivity } from '@/services/activityService';
import { cn } from '@/lib/utils';

const fa = (n: number) => n.toLocaleString('fa-IR');

const EMPTY_STATS: DashboardStats = {
  todayActivities: 0,
  activeProjects: 0,
  newIdeas: 0,
  weeklyMeetings: 0,
  activeMissions: 0,
  activePolicies: 0,
  totalClaims: 0,
  totalKnowledgeItems: 0,
};

/** Headline counts in one divided strip: label over value, no icon tiles. */
export function OverviewStrip({ className }: { className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getDashboardStats()
      .then(setStats)
      .catch((error) => console.error('خطا در دریافت آمار:', error))
      .finally(() => setIsLoading(false));
  }, []);

  // Second-brain counts first; organisational ones sit behind «بیشتر».
  const all = [
    { label: 'فعالیت‌های امروز', value: stats.todayActivities },
    { label: 'جلسه‌های این هفته', value: stats.weeklyMeetings },
    { label: 'ایده‌های تازه', value: stats.newIdeas },
    { label: 'آیتم‌های دانش', value: stats.totalKnowledgeItems },
    { label: 'پروژه‌های فعال', value: stats.activeProjects },
    { label: 'مأموریت‌های فعال', value: stats.activeMissions },
    { label: 'سیاست‌های فعال', value: stats.activePolicies },
    { label: 'ادعاها', value: stats.totalClaims },
  ];
  const visible = expanded ? all : all.slice(0, 4);

  return (
    <section aria-labelledby="overview-title" className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <h2 id="overview-title" className="text-base font-semibold">نمای کلی</h2>
        <button
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className="rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {expanded ? 'کمتر' : 'همه آمار'}
        </button>
      </div>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-4">
        {visible.map((stat) => (
          <div key={stat.label} className="bg-card px-4 py-3.5">
            <dt className="text-sm text-muted-foreground">{stat.label}</dt>
            <dd className="mt-1 text-2xl font-medium leading-8">
              {isLoading ? <span className="inline-block h-6 w-8 rounded bg-muted align-middle" aria-label="در حال بارگذاری" /> : fa(stat.value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The last things that happened, newest first. */
export function RecentActivityList({ className }: { className?: string }) {
  const [items, setItems] = useState<RecentActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getRecentActivities()
      .then(setItems)
      .catch((error) => console.error('خطا در دریافت فعالیت‌ها:', error))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <section aria-labelledby="recent-title" className={cn('space-y-2', className)}>
      <h2 id="recent-title" className="text-base font-semibold">فعالیت‌های اخیر</h2>
      <div className="rounded-lg border border-border bg-card">
        {items.length > 0 ? (
          <ul className="divide-y divide-border">
            {items.map((activity) => (
              <li key={activity.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0 truncate text-sm">{activity.title}</span>
                {activity.time && <time className="shrink-0 text-xs text-muted-foreground">{activity.time}</time>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-5 text-sm text-muted-foreground">
            {isLoading ? 'در حال بارگذاری…' : 'هنوز فعالیتی ثبت نشده؛ هر چه ثبت کنید اینجا می‌آید.'}
          </p>
        )}
      </div>
    </section>
  );
}

export function CompactControlCenter() {
  return (
    <div className="space-y-6">
      <OverviewStrip />
      <RecentActivityList />
    </div>
  );
}
