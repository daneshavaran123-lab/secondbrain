import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HeartPulse } from 'lucide-react';
import { SectionHeader } from '@/components/ui/section-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { healthDataService, type HealthSummary, type LabReportSummary } from '@/services/healthDataService';
import { isNativeApp, lastNativeSync, syncNativeHealth } from '@/services/nativeHealth';
import { HealthToday } from '@/components/health/HealthToday';
import { LabReports } from '@/components/health/LabReports';
import { HealthDevices } from '@/components/health/HealthDevices';

type Tab = 'today' | 'labs' | 'devices';
const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'امروز' },
  { id: 'labs', label: 'آزمایش‌ها' },
  { id: 'devices', label: 'دستگاه‌ها' },
];

/** Health: the day's readings from watch and phone, lab reports, and connecting devices. */
const HealthPage = () => {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'today') as Tab;
  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [reports, setReports] = useState<LabReportSummary[]>([]);
  const [labsLoading, setLabsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(params.get('upload') === '1');

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await healthDataService.summary(period));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در بارگیری');
    }
  }, [period]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    healthDataService.labs().then(setReports).catch(() => setReports([])).finally(() => setLabsLoading(false));
  }, []);

  // In the phone app, pull new readings in the background at most every few hours
  useEffect(() => {
    if (!isNativeApp()) return;
    const last = lastNativeSync();
    if (last && Date.now() - last.getTime() < 3 * 3600_000) return;
    if (!last) return; // the first sync asks for permission, so it waits for the button
    syncNativeHealth(14).then(() => loadSummary()).catch(() => undefined);
  }, [loadSummary]);

  const setTab = (next: string) => {
    const p = new URLSearchParams(params);
    if (next === 'today') p.delete('tab'); else p.set('tab', next);
    p.delete('upload');
    setParams(p, { replace: true });
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <SectionHeader
        title="سلامت"
        subtitle="داده‌های ساعت و گوشی، جواب آزمایش‌ها و روند آن‌ها"
        icon={<HeartPulse />}
        className="mb-0 md:mb-0"
      />

      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
              {t.id === 'labs' && reports.length > 0 && <span className="ms-1.5 text-xs text-muted-foreground">{reports.length.toLocaleString('fa-IR')}</span>}
            </TabsTrigger>
          ))}
        </TabsList>

        {error && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-destructive/30 p-4 text-sm text-destructive">
            {error}
            <Button variant="outline" size="sm" onClick={() => loadSummary()}>تلاش دوباره</Button>
          </div>
        )}

        <TabsContent value="today" className="mt-5">
          <HealthToday summary={summary} period={period} onPeriod={setPeriod} onChanged={loadSummary} onConnect={() => setTab('devices')} />
        </TabsContent>
        <TabsContent value="labs" className="mt-5">
          <LabReports reports={reports} loading={labsLoading} uploadOpen={uploadOpen} onUploadOpen={setUploadOpen} onChange={setReports} />
        </TabsContent>
        <TabsContent value="devices" className="mt-5">
          <HealthDevices summary={summary} onChanged={loadSummary} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default HealthPage;
