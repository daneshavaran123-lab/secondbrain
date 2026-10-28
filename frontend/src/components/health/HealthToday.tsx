import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Plus, Watch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  healthDataService, displayValue, formatMetric, METRIC_INFO, SOURCE_LABEL,
  type HealthMetric, type HealthSummary, type SampleInput,
} from '@/services/healthDataService';
import { ChartFrame, DailyBars, DailyLine, dayLabel, lastDays } from '@/components/health/HealthCharts';

const today = () => format(new Date(), 'yyyy-MM-dd');
const fa = (n: number, digits = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: digits });

// The readings people look at first, in this order; the strip shows those that have data
const HEADLINE: HealthMetric[] = ['steps', 'sleep_hours', 'resting_heart_rate', 'weight', 'active_energy', 'water', 'blood_glucose', 'systolic'];
const PERIODS = [7, 30, 90] as const;

function whenLabel(day: string) {
  if (day === today()) return 'امروز';
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (day === format(y, 'yyyy-MM-dd')) return 'دیروز';
  return dayLabel(day);
}

interface Props {
  summary: HealthSummary | null;
  period: (typeof PERIODS)[number];
  onPeriod: (p: (typeof PERIODS)[number]) => void;
  onChanged: () => void;
  onConnect: () => void;
}

export function HealthToday({ summary, period, onPeriod, onChanged, onConnect }: Props) {
  const [entryOpen, setEntryOpen] = useState(false);

  const series = useMemo(() => {
    const byMetric = new Map<HealthMetric, Map<string, number>>();
    for (const d of summary?.daily ?? []) {
      if (!byMetric.has(d.metric)) byMetric.set(d.metric, new Map());
      byMetric.get(d.metric)!.set(d.day, displayValue(d.metric, d.value));
    }
    return (metric: HealthMetric) => lastDays(period, byMetric.get(metric) ?? new Map());
  }, [summary, period]);

  const latest = summary?.latest ?? {};
  const tiles = HEADLINE.filter((m) => latest[m]).slice(0, 4);
  const avg = (metric: HealthMetric) => {
    const vals = series(metric).map((p) => p.value).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const hasData = (summary?.daily.length ?? 0) > 0;

  return (
    <div className="space-y-5">
      {tiles.length > 0 && (
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-4">
          {tiles.map((m) => {
            const d = latest[m]!;
            return (
              <div key={m} className="bg-card px-4 py-3">
                <dt className="text-sm text-muted-foreground">{METRIC_INFO[m].label}</dt>
                <dd className="mt-1 text-2xl font-semibold leading-8">
                  {m === 'systolic' && latest.diastolic ? `${formatMetric('systolic', d.value)}/${formatMetric('diastolic', latest.diastolic.value)}` : formatMetric(m, d.value)}
                  <span className="ms-1 text-sm font-normal text-muted-foreground">{METRIC_INFO[m].unit}</span>
                </dd>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{whenLabel(d.day)} · {SOURCE_LABEL[d.source].split(' (')[0]}</p>
              </div>
            );
          })}
        </dl>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1" role="group" aria-label="بازه نمودارها">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPeriod(p)}
              aria-pressed={period === p}
              className={cn('rounded-md px-3 py-1 text-sm', period === p ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}
            >
              {fa(p)} روز
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => setEntryOpen(true)}>
          <Plus className="h-4 w-4" />
          ثبت دستی
        </Button>
      </div>

      {hasData ? (
        <div className="grid gap-4 md:grid-cols-2">
          <ChartFrame title="قدم روزانه" figure={avg('steps') != null ? <>{fa(avg('steps')!)} <span className="text-sm font-normal text-muted-foreground">میانگین روزانه</span></> : undefined} points={series('steps')} unit="قدم" digits={0}>
            <DailyBars points={series('steps')} unit="قدم" />
          </ChartFrame>
          <ChartFrame title="خواب" figure={avg('sleep_hours') != null ? <>{fa(avg('sleep_hours')!, 1)} <span className="text-sm font-normal text-muted-foreground">ساعت در شب</span></> : undefined} points={series('sleep_hours')} unit="ساعت" digits={1}>
            <DailyBars points={series('sleep_hours')} unit="ساعت" digits={1} />
          </ChartFrame>
          <ChartFrame title="ضربان قلب در حال استراحت" figure={latest.resting_heart_rate ? <>{formatMetric('resting_heart_rate', latest.resting_heart_rate.value)} <span className="text-sm font-normal text-muted-foreground">آخرین</span></> : undefined} points={series('resting_heart_rate')} unit="ضربه در دقیقه" digits={0}>
            <DailyLine points={series('resting_heart_rate')} unit="ضربه در دقیقه" />
          </ChartFrame>
          <ChartFrame title="وزن" figure={latest.weight ? <>{formatMetric('weight', latest.weight.value)} <span className="text-sm font-normal text-muted-foreground">کیلوگرم</span></> : undefined} points={series('weight')} unit="کیلوگرم" digits={1}>
            <DailyLine points={series('weight')} unit="کیلوگرم" digits={1} />
          </ChartFrame>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <Watch className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="font-medium">هنوز داده‌ای از ساعت یا گوشی نرسیده است</p>
            <p className="mt-1 text-sm text-muted-foreground">اپل واچ و برنامه سلامت آیفون یا Health Connect اندروید را وصل کنید، یا مقادیر را دستی ثبت کنید.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={onConnect}>اتصال دستگاه</Button>
            <Button variant="outline" onClick={() => setEntryOpen(true)}>ثبت دستی</Button>
          </div>
        </div>
      )}

      <ManualEntryDialog open={entryOpen} onOpenChange={setEntryOpen} onSaved={onChanged} />
    </div>
  );
}

const FIELDS: { metric: HealthMetric; label: string; unit: string; step: string; toStored?: (v: number) => number }[] = [
  { metric: 'weight', label: 'وزن', unit: 'کیلوگرم', step: '0.1' },
  { metric: 'sleep_hours', label: 'خواب دیشب', unit: 'ساعت', step: '0.5' },
  { metric: 'steps', label: 'قدم', unit: 'قدم', step: '1' },
  { metric: 'water', label: 'آب', unit: 'لیوان', step: '1', toStored: (v) => v * 250 },
  { metric: 'systolic', label: 'فشار خون بالا', unit: 'mmHg', step: '1' },
  { metric: 'diastolic', label: 'فشار خون پایین', unit: 'mmHg', step: '1' },
  { metric: 'blood_glucose', label: 'قند خون', unit: 'mg/dL', step: '1' },
  { metric: 'resting_heart_rate', label: 'ضربان در حال استراحت', unit: 'در دقیقه', step: '1' },
];

function ManualEntryDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [day, setDay] = useState(today());
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const samples: SampleInput[] = FIELDS.flatMap((f) => {
      const raw = values[f.metric]?.trim();
      if (!raw) return [];
      const n = Number(raw.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace('٫', '.'));
      return Number.isFinite(n) ? [{ metric: f.metric, day, value: f.toStored ? f.toStored(n) : n }] : [];
    });
    if (!samples.length) return;
    setSaving(true);
    try {
      const stored = await healthDataService.saveSamples('manual', samples);
      toast({ title: 'ثبت شد', description: `${fa(stored)} مقدار برای ${dayLabel(day, 'd MMMM')} ذخیره شد.` });
      setValues({});
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast({ title: 'ثبت نشد', description: error instanceof Error ? error.message : 'دوباره امتحان کنید', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>ثبت دستی</DialogTitle>
          <DialogDescription>هر کدام را که اندازه گرفته‌اید وارد کنید؛ بقیه را خالی بگذارید.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="health-day">روز</Label>
            <Input id="health-day" type="date" value={day} max={today()} required onChange={(e) => setDay(e.target.value || today())} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map((f) => (
              <div key={f.metric} className="space-y-1.5">
                <Label htmlFor={`health-${f.metric}`}>{f.label} <span className="text-xs font-normal text-muted-foreground">({f.unit})</span></Label>
                <Input
                  id={`health-${f.metric}`}
                  inputMode="decimal"
                  value={values[f.metric] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.metric]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving || !Object.values(values).some((v) => v.trim())}>
            {saving ? 'در حال ذخیره…' : 'ذخیره'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
