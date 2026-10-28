import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ExternalLink, Loader2, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  healthDataService, type LabFlag, type LabReport, type LabResult, type LabTestInfo, type LabTrendPoint,
} from '@/services/healthDataService';
import { ChartFrame, DailyLine, dayLabel } from '@/components/health/HealthCharts';

const fa = (n: number) => n.toLocaleString('fa-IR', { maximumFractionDigits: 2 });

let catalogue: Promise<LabTestInfo[]> | null = null;
export const labCatalogue = () => (catalogue ??= healthDataService.labTests().catch(() => { catalogue = null; return []; }));

/** Out-of-range results carry an arrow and a word, never colour alone. */
export function FlagBadge({ flag }: { flag: LabFlag }) {
  if (flag === 'high' || flag === 'low') {
    const Icon = flag === 'high' ? ArrowUp : ArrowDown;
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
        <Icon className="h-3 w-3" aria-hidden />
        {flag === 'high' ? 'بالا' : 'پایین'}
      </span>
    );
  }
  if (flag === 'normal') return <span className="text-xs text-muted-foreground">در محدوده</span>;
  return null;
}

/** Words rather than < and >, which turn around in right-to-left text */
const rangeText = (r: LabResult) =>
  r.ref_low != null && r.ref_high != null ? `${fa(r.ref_low)} تا ${fa(r.ref_high)}`
    : r.ref_high != null ? `حداکثر ${fa(r.ref_high)}`
      : r.ref_low != null ? `حداقل ${fa(r.ref_low)}`
        : r.ref_text || '—';

function Trend({ result }: { result: LabResult }) {
  const [points, setPoints] = useState<LabTrendPoint[] | null>(null);
  useEffect(() => {
    let live = true;
    healthDataService.trend(result.test_key).then((p) => live && setPoints(p)).catch(() => live && setPoints([]));
    return () => { live = false; };
  }, [result.test_key]);
  if (!points) return <div className="h-40 animate-pulse rounded-lg bg-muted/60" />;
  if (points.length < 2) return <p className="py-3 text-sm text-muted-foreground">برای دیدن روند، به جواب آزمایش دیگری با همین مورد نیاز است.</p>;
  const last = points[points.length - 1];
  return (
    <ChartFrame
      title={`روند ${result.test_name}`}
      figure={<>{fa(last.value)} <span className="text-sm font-normal text-muted-foreground">{last.unit || ''}</span></>}
      note={`${fa(points.length)} بار از ${dayLabel(points[0].day, 'd MMMM yyyy')} · ناحیه خاکستری محدوده مرجع است`}
      points={points}
      unit={last.unit || ''}
      digits={2}
      className="border-0 p-0"
    >
      <DailyLine points={points} unit={last.unit || ''} digits={2} band={{ low: last.ref_low, high: last.ref_high }} allDots tickPattern="MMMM yy" />
    </ChartFrame>
  );
}

const emptyRow = (): LabResult => ({ test_key: 'other', test_name: '', value: null, value_text: null, unit: '', ref_low: null, ref_high: null, ref_text: null, flag: null });
const toNum = (v: string) => {
  const n = Number(v.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace('٫', '.'));
  return v.trim() === '' || !Number.isFinite(n) ? null : n;
};

export function LabReportDetail({ reportId, onChanged, onDeleted }: {
  reportId: string;
  onChanged: (report: LabReport) => void;
  onDeleted: (id: string) => void;
}) {
  const { toast } = useToast();
  const [report, setReport] = useState<LabReport | null>(null);
  const [tests, setTests] = useState<LabTestInfo[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<LabResult[] | null>(null);
  const [busy, setBusy] = useState<'save' | 'analyze' | 'delete' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let live = true;
    setReport(null);
    healthDataService.lab(reportId).then((r) => live && setReport(r)).catch((e) => toast({ title: 'باز نشد', description: e.message, variant: 'destructive' }));
    labCatalogue().then((t) => live && setTests(t));
    return () => { live = false; };
  }, [reportId, toast]);

  const label = useMemo(() => new Map(tests.map((t) => [t.key, t.label])), [tests]);
  const name = (r: LabResult) => (r.test_key !== 'other' && label.get(r.test_key)) || r.test_name;

  const run = async (kind: 'save' | 'analyze', fn: () => Promise<LabReport>) => {
    setBusy(kind);
    try {
      const next = await fn();
      setReport(next);
      onChanged(next);
      setEditing(null);
    } catch (error) {
      toast({ title: 'انجام نشد', description: error instanceof Error ? error.message : 'دوباره امتحان کنید', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const openFile = async () => {
    const tab = window.open('', '_blank');
    try {
      const url = await healthDataService.fileUrl(reportId);
      if (tab) tab.location.href = url; else window.location.href = url;
    } catch {
      tab?.close();
      toast({ title: 'فایل باز نشد', variant: 'destructive' });
    }
  };

  if (!report) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const flagged = report.results.filter((r) => r.flag === 'high' || r.flag === 'low');

  return (
    <div className="space-y-5 p-5 sm:p-6">
      <header className="space-y-1 ps-8">
        <h2 className="text-xl font-semibold">{report.title || report.lab_name || 'برگه آزمایش'}</h2>
        <p className="text-sm text-muted-foreground">
          {[report.report_date && dayLabel(report.report_date, 'd MMMM yyyy'), report.title && report.lab_name, `${fa(report.results.length)} نتیجه`]
            .filter(Boolean).join(' · ')}
        </p>
      </header>

      {report.summary && (
        <section className="rounded-lg bg-muted/50 p-4 text-sm leading-7">
          <p>{report.summary}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            این خلاصه {report.extracted_by === 'ai' ? 'را هوش مصنوعی نوشته' : 'از مقایسه با محدوده‌های مرجع ساخته شده'} و جای نظر پزشک را نمی‌گیرد.
          </p>
        </section>
      )}

      {flagged.length > 0 && !editing && (
        <p className="text-sm">
          <span className="font-medium">{fa(flagged.length)} مورد خارج از محدوده:</span>{' '}
          <span className="text-muted-foreground">{flagged.map(name).join('، ')}</span>
        </p>
      )}

      {editing ? (
        <section className="space-y-3">
          <p className="text-sm text-muted-foreground">مقادیر را با برگه مقایسه و هرجا لازم است اصلاح کنید. وضعیت بالا/پایین دوباره حساب می‌شود.</p>
          <div className="space-y-2">
            {editing.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_5rem_5rem_auto] items-center gap-2 sm:grid-cols-[1fr_5rem_5rem_4.5rem_4.5rem_auto]">
                <Input aria-label="نام آزمایش" value={r.test_name} onChange={(e) => setEditing(editing.map((x, j) => (j === i ? { ...x, test_name: e.target.value, test_key: j === i && e.target.value !== x.test_name ? 'other' : x.test_key } : x)))} className="h-9" />
                <Input aria-label="مقدار" className="latin-digits h-9" inputMode="decimal" value={r.value ?? r.value_text ?? ''} onChange={(e) => setEditing(editing.map((x, j) => (j === i ? { ...x, value: toNum(e.target.value), value_text: toNum(e.target.value) == null ? e.target.value : null } : x)))} />
                <Input aria-label="واحد" className="latin-digits h-9" value={r.unit ?? ''} onChange={(e) => setEditing(editing.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} />
                <Input aria-label="حد پایین" placeholder="از" className="latin-digits hidden h-9 sm:block" inputMode="decimal" value={r.ref_low ?? ''} onChange={(e) => setEditing(editing.map((x, j) => (j === i ? { ...x, ref_low: toNum(e.target.value), ref_text: null } : x)))} />
                <Input aria-label="حد بالا" placeholder="تا" className="latin-digits hidden h-9 sm:block" inputMode="decimal" value={r.ref_high ?? ''} onChange={(e) => setEditing(editing.map((x, j) => (j === i ? { ...x, ref_high: toNum(e.target.value), ref_text: null } : x)))} />
                <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`حذف ${r.test_name || 'ردیف'}`} onClick={() => setEditing(editing.filter((_, j) => j !== i))}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing([...editing, emptyRow()])}><Plus className="h-4 w-4" />افزودن ردیف</Button>
            <span className="flex-1" />
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>انصراف</Button>
            <Button size="sm" disabled={busy === 'save'} onClick={() => run('save', () => healthDataService.updateLab(report.id, { results: editing }))}>
              {busy === 'save' ? 'در حال ذخیره…' : 'ذخیره'}
            </Button>
          </div>
        </section>
      ) : report.results.length ? (
        <section>
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b border-border pb-2 text-xs text-muted-foreground sm:grid-cols-[1fr_8rem_8rem_4.5rem]">
            <span>آزمایش</span>
            <span className="text-end">نتیجه</span>
            <span className="hidden text-end sm:block">محدوده مرجع</span>
            <span className="text-end">وضعیت</span>
          </div>
          <ul className="divide-y divide-border">
            {report.results.map((r) => {
              const key = r.id || r.test_name;
              const expandable = r.value != null && r.test_key !== 'other';
              return (
                <li key={key}>
                  <button
                    type="button"
                    disabled={!expandable}
                    onClick={() => setOpen(open === key ? null : key)}
                    aria-expanded={expandable ? open === key : undefined}
                    className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-x-4 py-2.5 text-start enabled:hover:bg-muted/40 sm:grid-cols-[1fr_8rem_8rem_4.5rem]"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      {expandable && <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open === key && 'rotate-180')} />}
                      <span className="truncate text-sm">{name(r)}</span>
                    </span>
                    <span className="text-end text-sm font-medium">
                      {r.value != null ? fa(r.value) : r.value_text}
                      {r.unit && <span className="latin-digits mr-1 text-xs font-normal text-muted-foreground" dir="ltr">{r.unit}</span>}
                    </span>
                    <span className="hidden text-end text-xs text-muted-foreground sm:block">{rangeText(r)}</span>
                    <span className="text-end"><FlagBadge flag={r.flag} /></span>
                  </button>
                  {open === key && expandable && <div className="pb-4 pt-1"><Trend result={{ ...r, test_name: name(r) }} /></div>}
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          نتیجه‌ای از این برگه خوانده نشد. می‌توانید دوباره تحلیل کنید یا مقادیر را دستی وارد کنید.
        </p>
      )}

      {!editing && (
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button variant="outline" size="sm" onClick={() => setEditing(report.results.length ? report.results.map((r) => ({ ...r, test_name: name(r) })) : [emptyRow()])}>
            <Pencil className="h-4 w-4" />ویرایش نتایج
          </Button>
          <Button variant="outline" size="sm" disabled={busy === 'analyze' || !report.ocr_text} onClick={() => run('analyze', () => healthDataService.reanalyze(report.id))}>
            <RefreshCw className={cn('h-4 w-4', busy === 'analyze' && 'animate-spin')} />تحلیل دوباره
          </Button>
          {report.has_file && (
            <Button variant="outline" size="sm" onClick={openFile}><ExternalLink className="h-4 w-4" />برگه اصلی</Button>
          )}
          <span className="flex-1" />
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4" />حذف
          </Button>
        </div>
      )}

      {report.ocr_text && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">متن خوانده‌شده از برگه</summary>
          <pre className="latin-digits mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-3 font-sans text-xs leading-6" dir="auto">{report.ocr_text}</pre>
        </details>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>این برگه آزمایش حذف شود؟</AlertDialogTitle>
            <AlertDialogDescription>نتایج و فایل آن پاک می‌شوند و از نمودار روندها هم کنار می‌روند.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                setBusy('delete');
                try {
                  await healthDataService.deleteLab(report.id);
                  onDeleted(report.id);
                } catch (error) {
                  toast({ title: 'حذف نشد', description: error instanceof Error ? error.message : '', variant: 'destructive' });
                } finally {
                  setBusy(null);
                }
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
