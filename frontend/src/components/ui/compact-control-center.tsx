import React, { useState, useEffect } from 'react';
import { useResponsiveBreakpoints } from '@/hooks/useResponsiveBreakpoints';
import { Button } from './button';
import { getDashboardStats, type DashboardStats } from '@/services/dashboardService';
import { getRecentActivities, type RecentActivity } from '@/services/activityService';
import {
  CheckCircle,
  Clock,
  Lightbulb,
  Calendar,
  ChevronDown,
  ChevronUp,
  BookOpen,
  FolderKanban,
  Target,
  ScrollText
} from 'lucide-react';

export function CompactControlCenter() {
  const { isMobile } = useResponsiveBreakpoints();
  const [expandedStats, setExpandedStats] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    todayActivities: 0,
    activeProjects: 0,
    newIdeas: 0,
    weeklyMeetings: 0,
    activeMissions: 0,
    activePolicies: 0,
    totalClaims: 0,
    totalKnowledgeItems: 0
  });
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [dashboardStats, activities] = await Promise.all([
          getDashboardStats(),
          getRecentActivities()
        ]);
        setStats(dashboardStats);
        setRecentActivities(activities);
      } catch (error) {
        console.error('خطا در دریافت آمار:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // Second-brain stats first; organisational ones sit behind «بیشتر».
  const allStats = [
    { label: 'فعالیت‌های امروز', value: stats.todayActivities, icon: CheckCircle },
    { label: 'جلسات این هفته', value: stats.weeklyMeetings, icon: Calendar },
    { label: 'ایده‌های جدید', value: stats.newIdeas, icon: Lightbulb },
    { label: 'آیتم‌های دانش', value: stats.totalKnowledgeItems, icon: BookOpen },
    { label: 'پروژه‌های فعال', value: stats.activeProjects, icon: FolderKanban },
    { label: 'ماموریت‌های فعال', value: stats.activeMissions, icon: Target },
    { label: 'سیاست‌های فعال', value: stats.activePolicies, icon: ScrollText },
    { label: 'کل ادعاها', value: stats.totalClaims, icon: Clock },
  ];
  const visibleStats = expandedStats ? allStats : allStats.slice(0, 4);
  const fa = (n: number) => n.toLocaleString('fa-IR');

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-card md:p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">نمای کلی</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpandedStats(!expandedStats)}
            className="h-8 gap-1 rounded-lg px-2 text-xs text-muted-foreground"
          >
            {expandedStats ? 'کمتر' : 'بیشتر'}
            {expandedStats ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {visibleStats.map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border p-3.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs leading-5 text-muted-foreground">{stat.label}</p>
                <stat.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/70" />
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
                {isLoading ? <span className="inline-block h-7 w-8 animate-pulse rounded bg-muted align-middle" /> : fa(stat.value)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {!isMobile && (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-card md:p-5">
          <h2 className="mb-3 text-sm font-semibold">فعالیت‌های اخیر</h2>
          {recentActivities.length > 0 ? (
            <ul className="divide-y divide-border">
              {recentActivities.map((activity) => (
                <li key={activity.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0 truncate text-sm">{activity.title}</span>
                  {activity.time && <span className="shrink-0 text-xs text-muted-foreground">{activity.time}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">هنوز فعالیتی ثبت نشده</p>
          )}
        </section>
      )}
    </div>
  );
}
