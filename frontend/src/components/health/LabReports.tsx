import { useState } from 'react';
import { FlaskConical, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import type { LabReport, LabReportSummary } from '@/services/healthDataService';
import { dayLabel } from '@/components/health/HealthCharts';
import { LabReportDetail } from '@/components/health/LabReportDetail';
import { LabUploadDialog } from '@/components/health/LabUploadDialog';

const fa = (n: number) => n.toLocaleString('fa-IR');

const toSummary = (r: LabReport): LabReportSummary => ({
  id: r.id, title: r.title, lab_name: r.lab_name, report_date: r.report_date, summary: r.summary,
  extracted_by: r.extracted_by, created_at: r.created_at, result_count: r.results.length,
  flagged_count: r.results.filter((x) => x.flag === 'high' || x.flag === 'low').length,
});

export function LabReports({ reports, loading, uploadOpen, onUploadOpen, onChange }: {
  reports: LabReportSummary[];
  loading: boolean;
  uploadOpen: boolean;
  onUploadOpen: (open: boolean) => void;
  onChange: (next: LabReportSummary[]) => void;
}) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<string | null>(null);

  const upsert = (report: LabReport) => {
    const s = toSummary(report);
    onChange(reports.some((r) => r.id === s.id) ? reports.map((r) => (r.id === s.id ? s : r)) : [s, ...reports]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">جواب آزمایش‌ها را نگه دارید تا روند هر مورد را در طول زمان ببینید.</p>
        <Button onClick={() => onUploadOpen(true)}>
          <Upload className="h-4 w-4" />
          افزودن برگه آزمایش
        </Button>
      </div>

      {loading && !reports.length ? (
        <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-muted/60" />)}</div>
      ) : reports.length ? (
        <ul className="space-y-3">
          {reports.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setSelected(r.id)}
                className="flex w-full items-start gap-3 rounded-lg border border-border bg-card p-4 text-start transition-colors hover:border-input"
              >
                <FlaskConical className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-6">{r.title || r.lab_name || 'برگه آزمایش'}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[dayLabel(r.report_date || r.created_at.slice(0, 10), 'd MMMM yyyy'), r.title && r.lab_name].filter(Boolean).join(' · ')}
                  </p>
                  {r.summary && <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-muted-foreground">{r.summary}</p>}
                </div>
                <div className="shrink-0 text-end text-xs">
                  <div className="text-muted-foreground">{fa(r.result_count)} نتیجه</div>
                  {r.flagged_count > 0 && <div className="mt-1 font-medium text-destructive">{fa(r.flagged_count)} خارج از محدوده</div>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <FlaskConical className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="font-medium">هنوز برگه آزمایشی اضافه نشده</p>
            <p className="mt-1 text-sm text-muted-foreground">از جواب آزمایش عکس بگیرید یا PDF آن را بدهید؛ نتایج، واحد و محدوده مرجع جدا می‌شوند.</p>
          </div>
          <Button onClick={() => onUploadOpen(true)}><Upload className="h-4 w-4" />افزودن اولین برگه</Button>
        </div>
      )}

      <LabUploadDialog
        open={uploadOpen}
        onOpenChange={onUploadOpen}
        onCreated={(report, notice) => {
          upsert(report);
          setSelected(report.id);
          if (notice) toast({ title: 'برگه ذخیره شد', description: notice });
        }}
      />

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="left" className="w-full !max-w-full overflow-y-auto p-0 sm:!max-w-2xl" dir="rtl">
          <SheetTitle className="sr-only">جزئیات برگه آزمایش</SheetTitle>
          {selected && (
            <LabReportDetail
              reportId={selected}
              onChanged={upsert}
              onDeleted={(id) => {
                onChange(reports.filter((r) => r.id !== id));
                setSelected(null);
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
