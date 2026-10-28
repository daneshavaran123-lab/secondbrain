import { Users, FolderKanban, CheckCircle, CalendarClock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { OrganizationStats } from '@/services/organizationStatsService';

interface OrganizationStatsCardsProps {
  stats: OrganizationStats;
}

const fa = (n: number) => n.toLocaleString('fa-IR');

// Only figures the app actually counts: there is no history yet to show a trend against.
export function OrganizationStatsCards({ stats }: OrganizationStatsCardsProps) {
  const cards = [
    { title: 'اعضا', value: fa(stats.totalMembers), note: null, icon: Users },
    { title: 'پروژه‌های فعال', value: fa(stats.activeProjects), note: `از ${fa(stats.totalProjects)} پروژه`, icon: FolderKanban },
    { title: 'نرخ تکمیل پروژه‌ها', value: `${fa(stats.completionRate)}٪`, note: `${fa(stats.completedProjects)} پروژه تکمیل شده`, icon: CheckCircle, progress: stats.completionRate },
    { title: 'جلسه‌های پیش رو', value: fa(stats.upcomingMeetings), note: `از ${fa(stats.totalMeetings)} جلسه سازمانی`, icon: CalendarClock },
  ];

  return (
    <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.title}>
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm text-muted-foreground">{c.title}</h3>
                <p className="mt-1 text-2xl font-bold">{c.value}</p>
                {c.note && <p className="mt-1 text-xs text-muted-foreground">{c.note}</p>}
              </div>
              <c.icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            </div>
            {c.progress !== undefined && <Progress value={c.progress} className="mt-4 h-1.5" aria-label={c.title} />}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
