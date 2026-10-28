import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Activity, AlertCircle, CalendarClock, ChevronLeft, MapPin, TrendingUp, Users } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns-jalali';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserCollection } from '@/services/userCollections';

// The service room: every number here is counted from the person's own records in the other
// Khadim-e-Khalgh sections (social needs, service log, roadmap).

interface Need { id: string; title: string; area?: string; priority?: string; status?: string; beneficiaries?: number; created_at?: string; updated_at?: string }
interface ServiceProject { id: string; title: string; status?: string; location?: string; beneficiaries?: number; progress?: number; startDate?: string }
interface Program { id: number | string; title: string; status?: string; startDate?: string; endDate?: string; progress?: number; targetBeneficiaries?: number }

const fa = (n: number) => n.toLocaleString('fa-IR');
const faDigits = (s: string) => s.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
const dateOf = (s?: string) => {
  const d = s ? new Date(s) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};
const STATUS: Record<string, string> = { planned: 'برنامه‌ریزی‌شده', 'in-progress': 'در حال اجرا', completed: 'تکمیل‌شده' };

const Dashboard = () => {
  const [needs, , needsState] = useUserCollection<Need>('khk_social_needs');
  const [projects, , projectsState] = useUserCollection<ServiceProject>('khk_service_projects');
  const [programs, , programsState] = useUserCollection<Program>('roadmap-programs');
  const loading = needsState.loading || projectsState.loading || programsState.loading;

  const stats = useMemo(() => {
    const running = projects.filter((p) => p.status === 'in-progress');
    const openNeeds = needs.filter((n) => n.status !== 'completed');
    const regions = new Set([...projects.map((p) => p.location), ...needs.map((n) => n.area)].map((r) => (r || '').trim()).filter(Boolean));
    return [
      { title: 'اقدامات در جریان', value: running.length, note: `از ${fa(projects.length)} اقدام ثبت‌شده`, icon: Activity, to: '/organizational/khadim-e-khalgh/projects' },
      { title: 'افراد بهره‌مند', value: projects.reduce((sum, p) => sum + (Number(p.beneficiaries) || 0), 0), note: 'در اقدامات ثبت‌شده', icon: Users, to: '/organizational/khadim-e-khalgh/projects' },
      { title: 'مناطق تحت پوشش', value: regions.size, note: 'از محل اقدامات و نیازها', icon: MapPin, to: '/organizational/khadim-e-khalgh/needs' },
      { title: 'نیازهای باز', value: openNeeds.length, note: `${fa(openNeeds.filter((n) => n.priority === 'فوری').length)} مورد فوری`, icon: AlertCircle, to: '/organizational/khadim-e-khalgh/needs' },
    ];
  }, [needs, projects]);

  const running = projects.filter((p) => p.status === 'in-progress').slice(0, 5);
  const upcoming = programs
    .filter((p) => p.status !== 'completed')
    .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''))
    .slice(0, 4);
  const recent = useMemo(() => [
    ...needs.map((n) => ({ id: `n-${n.id}`, text: `نیاز «${n.title}»`, status: n.status, at: dateOf(n.updated_at || n.created_at) })),
    ...projects.map((p) => ({ id: `p-${p.id}`, text: `اقدام «${p.title}»`, status: p.status, at: dateOf(p.startDate) })),
  ].filter((r) => r.at).sort((a, b) => b.at!.getTime() - a.at!.getTime()).slice(0, 6), [needs, projects]);

  return (
    <div className="space-y-6 p-3 md:p-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">اتاق فرمان خادم خلق</h1>
        <p className="mt-1 text-muted-foreground">نمای کلی نیازها، اقدامات و برنامه‌های خدمت‌رسانی شما</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.title} to={s.to} className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Card className="h-full transition-colors hover:bg-muted/40">
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">{s.title}</p>
                  {loading ? <Skeleton className="mt-2 h-7 w-12" /> : <p className="mt-1 text-2xl font-bold">{fa(s.value)}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">{s.note}</p>
                </div>
                <s.icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><TrendingUp className="h-5 w-5" aria-hidden />اقدامات در جریان</CardTitle>
            <CardDescription>پیشرفت اقداماتی که اکنون انجام می‌شوند</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : running.length ? (
              <ul className="space-y-5">
                {running.map((p) => (
                  <li key={p.id} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{p.title}</span>
                      {p.location && <span className="text-sm text-muted-foreground">{p.location}</span>}
                    </div>
                    <Progress value={p.progress ?? 0} className="h-2" aria-label={`پیشرفت ${p.title}`} />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{fa(p.progress ?? 0)}٪ انجام شده</span>
                      {!!p.beneficiaries && <span>{fa(Number(p.beneficiaries))} نفر بهره‌مند</span>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyHint text="اقدامی در حال اجرا نیست." action="ثبت اقدام" to="/organizational/khadim-e-khalgh/projects" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><CalendarClock className="h-5 w-5" aria-hidden />برنامه‌های پیش رو</CardTitle>
            <CardDescription>از نقشه راه</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
            ) : upcoming.length ? (
              <ul className="space-y-3">
                {upcoming.map((p) => {
                  const start = dateOf(p.startDate);
                  return (
                    <li key={p.id} className="rounded-lg border p-3">
                      <div className="font-medium">{p.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {start && <span>{faDigits(format(start, 'd MMMM yyyy'))}</span>}
                        {p.status && <Badge variant="secondary" className="font-normal">{STATUS[p.status] ?? p.status}</Badge>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyHint text="برنامه‌ای در نقشه راه نیست." action="افزودن برنامه" to="/organizational/khadim-e-khalgh/roadmap" />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Activity className="h-5 w-5" aria-hidden />آخرین ثبت‌ها</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : recent.length ? (
            <ul className="divide-y">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0 truncate">{r.text}{r.status && STATUS[r.status] ? ` — ${STATUS[r.status]}` : ''}</span>
                  <span className="shrink-0 text-muted-foreground">{faDigits(formatDistanceToNow(r.at!, { addSuffix: true }))}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyHint text="هنوز چیزی ثبت نشده؛ از بانک نیازها شروع کنید." action="ثبت نیاز" to="/organizational/khadim-e-khalgh/needs" />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const EmptyHint = ({ text, action, to }: { text: string; action: string; to: string }) => (
  <div className="flex flex-col items-center gap-3 py-6 text-center text-sm text-muted-foreground">
    <p>{text}</p>
    <Button asChild variant="outline" size="sm" className="gap-1">
      <Link to={to}>{action}<ChevronLeft className="h-4 w-4" aria-hidden /></Link>
    </Button>
  </div>
);

export default Dashboard;
