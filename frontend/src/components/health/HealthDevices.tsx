import { useEffect, useRef, useState } from 'react';
import { format, subDays } from 'date-fns';
import { formatDistanceToNow } from 'date-fns-jalali';
import { Check, Copy, FileArchive, KeyRound, Loader2, RefreshCw, Smartphone, Trash2, Watch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { healthDataService, SOURCE_LABEL, type HealthSummary, type SampleInput } from '@/services/healthDataService';
import { connectNativeHealth, isNativeApp, lastNativeSync, nativeAvailability, nativeSource, syncNativeHealth } from '@/services/nativeHealth';

const fa = (n: number) => n.toLocaleString('fa-IR');
const ago = (iso: string | Date) => formatDistanceToNow(new Date(iso), { addSuffix: true });

function Card({ icon: Icon, title, children, className }: { icon: typeof Watch; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-lg border border-border bg-card p-5', className)}>
      <h3 className="flex items-center gap-2 font-semibold">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
        {title}
      </h3>
      <div className="mt-3 space-y-3 text-sm leading-7">{children}</div>
    </section>
  );
}

function CopyField({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-1.5">
        <code className={cn('latin-digits min-w-0 flex-1 truncate text-xs', secret && 'select-all')} dir="ltr">{value}</code>
        <button
          type="button"
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={`رونوشت ${label}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch { /* clipboard blocked; the text is selectable */ }
          }}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

/** The app on the phone talks to HealthKit or Health Connect directly. */
function NativeCard({ onSynced }: { onSynced: () => void }) {
  const { toast } = useToast();
  const [state, setState] = useState<'checking' | 'ready' | 'unavailable' | 'syncing'>('checking');
  const [reason, setReason] = useState('');
  const [last, setLast] = useState(lastNativeSync());
  const source = nativeSource();
  const ios = source === 'apple_health';

  useEffect(() => {
    nativeAvailability().then((a) => {
      setState(a.available ? 'ready' : 'unavailable');
      setReason(a.reason || '');
    });
  }, []);

  const sync = async () => {
    setState('syncing');
    try {
      const allowed = await connectNativeHealth();
      if (!allowed.length) throw new Error(ios ? 'دسترسی در تنظیمات Health ← Sharing ← Apps داده نشده است.' : 'دسترسی در Health Connect داده نشده است.');
      const stored = await syncNativeHealth(90);
      setLast(new Date());
      toast({ title: 'همگام شد', description: `${fa(stored)} مقدار روزانه از ${ios ? 'برنامه سلامت' : 'Health Connect'} آمد.` });
      onSynced();
    } catch (error) {
      toast({ title: 'همگام نشد', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
    } finally {
      setState('ready');
    }
  };

  return (
    <Card icon={ios ? Watch : Smartphone} title={ios ? 'اپل واچ و برنامه سلامت آیفون' : 'Health Connect اندروید'}>
      {state === 'unavailable' ? (
        <p className="text-muted-foreground">
          {ios ? 'HealthKit روی این دستگاه در دسترس نیست.' : 'Health Connect نصب نیست یا به‌روز نیست؛ آن را از Play Store نصب کنید و دوباره امتحان کنید.'}
          {reason && reason !== 'web' && <span className="block text-xs">({reason})</span>}
        </p>
      ) : (
        <>
          <p className="text-muted-foreground">
            قدم، مسافت، کالری فعال، ضربان قلب و وزن از ۹۰ روز اخیر خوانده می‌شود{ios ? '؛ داده‌های اپل واچ هم از همین راه می‌آیند' : ''}. فقط خواندن؛ چیزی در برنامه سلامت نوشته نمی‌شود.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={sync} disabled={state !== 'ready'}>
              {state === 'syncing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {last ? 'همگام‌سازی دوباره' : 'اتصال و همگام‌سازی'}
            </Button>
            {last && <span className="text-xs text-muted-foreground">آخرین همگام‌سازی {ago(last)}</span>}
          </div>
        </>
      )}
    </Card>
  );
}

function ShortcutCard() {
  const { toast } = useToast();
  const [status, setStatus] = useState<{ exists: boolean; last_used_at?: string | null } | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const url = healthDataService.ingestUrl();

  useEffect(() => {
    healthDataService.tokenStatus().then(setStatus).catch(() => setStatus({ exists: false }));
  }, []);

  const issue = async () => {
    setBusy(true);
    try {
      setToken(await healthDataService.createToken());
      setStatus({ exists: true, last_used_at: null });
    } catch (error) {
      toast({ title: 'توکن ساخته نشد', description: error instanceof Error ? error.message : '', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    setBusy(true);
    try {
      await healthDataService.revokeToken();
      setToken(null);
      setStatus({ exists: false });
    } finally {
      setBusy(false);
    }
  };

  const body = '{\n  "steps": …,\n  "sleep_hours": …,\n  "resting_heart_rate": …,\n  "weight": …\n}';

  return (
    <Card icon={KeyRound} title="میان‌بر آیفون (بدون نصب برنامه)">
      <p className="text-muted-foreground">
        با برنامه Shortcuts آیفون می‌توانید هر شب خلاصه روز را از برنامه سلامت (و اپل واچ) بفرستید؛ خواب، ضربان استراحت و هر داده دیگری که برنامه سلامت دارد.
      </p>
      <ol className="space-y-1 ps-5 [list-style-type:persian]">
        <li>در Shortcuts یک میان‌بر تازه بسازید و برای هر داده «Find Health Samples» بگذارید (مثلاً Steps از امروز، Sleep Analysis از دیشب) و با «Calculate Statistics» جمع یا میانگین بگیرید.</li>
        <li>«Get Contents of URL» را با روش <span className="latin-digits" dir="ltr">POST</span> و نشانی زیر اضافه کنید.</li>
        <li>در Headers کلید <span className="latin-digits" dir="ltr">Authorization</span> را با مقدار <span className="latin-digits" dir="ltr">Bearer</span> و سپس توکن بگذارید.</li>
        <li>بدنه را JSON بگذارید و مقدارها را از قدم‌های قبل بدهید. کلیدهای دیگر: <span className="latin-digits" dir="ltr">distance, active_energy, hrv, blood_oxygen, systolic, diastolic, blood_glucose, water</span></li>
        <li>در Automation یک اجرای روزانه (مثلاً ساعت ۲۳) بسازید تا خودکار بفرستد.</li>
      </ol>
      <CopyField label="نشانی" value={url} />
      {token ? (
        <>
          <CopyField label="توکن (فقط همین یک بار نمایش داده می‌شود)" value={token} secret />
          <p className="text-xs text-muted-foreground">این توکن فقط اجازه افزودن داده سلامت را دارد. اگر لو رفت، توکن تازه بسازید؛ قبلی باطل می‌شود.</p>
        </>
      ) : status?.exists ? (
        <p className="text-xs text-muted-foreground">
          توکن ساخته شده است{status.last_used_at ? `؛ آخرین ارسال ${ago(status.last_used_at)}` : '، ولی هنوز داده‌ای با آن نرسیده'}.
        </p>
      ) : null}
      <pre className="latin-digits overflow-x-auto rounded-md bg-muted/50 p-3 text-xs leading-5" dir="ltr">{body}</pre>
      <div className="flex flex-wrap gap-2">
        <Button variant={status?.exists ? 'outline' : 'default'} size="sm" onClick={issue} disabled={busy}>
          {status?.exists ? 'ساخت توکن تازه' : 'ساخت توکن'}
        </Button>
        {status?.exists && <Button variant="ghost" size="sm" onClick={revoke} disabled={busy}>باطل کردن توکن</Button>}
      </div>
    </Card>
  );
}

function ImportCard({ onImported }: { onImported: () => void }) {
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ phase: 'idle' | 'reading' | 'saving'; share: number; records: number }>({ phase: 'idle', share: 0, records: 0 });

  const run = (file: File) => {
    const since = format(subDays(new Date(), 365), 'yyyy-MM-dd');
    setState({ phase: 'reading', share: 0, records: 0 });
    const worker = new Worker(new URL('../../workers/appleHealthImport.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = async (event: MessageEvent<{ type: string; share?: number; records?: number; samples?: SampleInput[]; message?: string }>) => {
      const msg = event.data;
      if (msg.type === 'progress') {
        setState({ phase: 'reading', share: msg.share ?? 0, records: msg.records ?? 0 });
        return;
      }
      worker.terminate();
      if (msg.type === 'error') {
        setState({ phase: 'idle', share: 0, records: 0 });
        toast({
          title: 'فایل خوانده نشد',
          description: msg.message === 'NO_EXPORT_XML' ? 'در این فایل export.xml پیدا نشد؛ همان export.zip برنامه سلامت را بدهید.' : msg.message,
          variant: 'destructive',
        });
        return;
      }
      const samples = msg.samples ?? [];
      setState({ phase: 'saving', share: 0, records: samples.length });
      try {
        const stored = await healthDataService.saveSamples('import', samples, (done) => setState((s) => ({ ...s, share: done / Math.max(1, samples.length) })));
        toast({ title: 'وارد شد', description: `${fa(stored)} مقدار روزانه از یک سال اخیر ثبت شد.` });
        onImported();
      } catch (error) {
        toast({ title: 'ذخیره نشد', description: error instanceof Error ? error.message : '', variant: 'destructive' });
      } finally {
        setState({ phase: 'idle', share: 0, records: 0 });
      }
    };
    worker.postMessage({ file, sinceDay: since });
  };

  return (
    <Card icon={FileArchive} title="وارد کردن خروجی برنامه سلامت">
      <p className="text-muted-foreground">
        برای سابقه کامل: در آیفون برنامه Health ← عکس پروفایل ← <span className="latin-digits" dir="ltr">Export All Health Data</span>. فایل
        <span className="latin-digits" dir="ltr"> export.zip </span>
        را اینجا بدهید؛ داده‌های یک سال اخیر (قدم، خواب، ضربان، وزن، فشار، قند، اکسیژن و…) روزبه‌روز وارد می‌شوند. فایل روی همین دستگاه باز می‌شود و فقط خلاصه روزانه فرستاده می‌شود.
      </p>
      {state.phase === 'idle' ? (
        <>
          <Button variant="outline" onClick={() => input.current?.click()}>انتخاب export.zip</Button>
          <input
            ref={input}
            type="file"
            accept=".zip,.xml,application/zip,text/xml"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) run(file);
            }}
          />
        </>
      ) : (
        <div className="space-y-2" aria-live="polite">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-signal" />
            {state.phase === 'reading' ? `در حال خواندن فایل… ${fa(state.records)} رکورد` : `در حال ذخیره ${fa(state.records)} مقدار روزانه…`}
          </div>
          <Progress value={Math.round(state.share * 100)} className="h-1.5" />
        </div>
      )}
    </Card>
  );
}

export function HealthDevices({ summary, onChanged }: { summary: HealthSummary | null; onChanged: () => void }) {
  const { toast } = useToast();
  const native = isNativeApp();
  const sources = summary?.sources ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {native ? (
        <NativeCard onSynced={onChanged} />
      ) : (
        <Card icon={Watch} title="اپل واچ، آیفون و اندروید">
          <p className="text-muted-foreground">
            در برنامه موبایل «مغز دوم من»، اتصال مستقیم است: روی آیفون به برنامه سلامت (و از آن به اپل واچ) و روی اندروید به Health Connect وصل می‌شود و با یک دکمه همگام می‌کند.
          </p>
          <p className="text-muted-foreground">در مرورگر می‌توانید از میان‌بر آیفون یا فایل خروجی برنامه سلامت استفاده کنید.</p>
        </Card>
      )}

      <section className="rounded-lg border border-border bg-card p-5">
        <h3 className="font-semibold">منبع‌های داده</h3>
        {sources.length ? (
          <ul className="mt-2 divide-y divide-border text-sm">
            {sources.map((s) => (
              <li key={s.source} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div>{SOURCE_LABEL[s.source]}</div>
                  <div className="text-xs text-muted-foreground">{fa(s.values)} مقدار · به‌روزرسانی {ago(s.last_sync)}</div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  aria-label={`پاک کردن داده‌های ${SOURCE_LABEL[s.source]}`}
                  onClick={async () => {
                    if (!window.confirm(`همه داده‌های «${SOURCE_LABEL[s.source]}» پاک شود؟`)) return;
                    await healthDataService.clearSource(s.source);
                    toast({ title: 'پاک شد' });
                    onChanged();
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">هنوز داده‌ای از دستگاهی نرسیده است.</p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          اگر یک روز از چند منبع داده رسیده باشد، اول برنامه سلامت گوشی، بعد میان‌بر، بعد فایل خروجی و در آخر ثبت دستی حساب می‌شود.
        </p>
      </section>

      <ShortcutCard />
      <ImportCard onImported={onChanged} />
    </div>
  );
}
