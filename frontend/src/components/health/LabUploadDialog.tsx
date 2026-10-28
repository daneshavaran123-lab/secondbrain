import { useRef, useState } from 'react';
import { FileUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { ocrService } from '@/services/ocrService';
import { prepareLetterFile } from '@/services/orgLettersService';
import { healthDataService, type LabReport } from '@/services/healthDataService';

/**
 * Photo or PDF of a lab sheet → text in the browser (the image never leaves the device for
 * OCR) → the server reads the results. Pasting the text works too, for a sheet received
 * as a message.
 */
export function LabUploadDialog({ open, onOpenChange, onCreated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (report: LabReport, notice?: string | null) => void;
}) {
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ value: 0, stage: '' });
  const [pasted, setPasted] = useState('');

  const reset = () => {
    setBusy(false);
    setProgress({ value: 0, stage: '' });
    setPasted('');
  };

  const submit = async (text: string, confidence?: number, file?: File) => {
    setProgress({ value: 1, stage: 'در حال خواندن نتایج' });
    const payload = file ? await prepareLetterFile(file) : null;
    const { data, notice } = await healthDataService.createLab({ ocr_text: text, ocr_confidence: confidence, file: payload });
    onCreated(data, notice);
    reset();
    onOpenChange(false);
  };

  const fromFile = async (file: File) => {
    if (!/^image\/|application\/pdf/.test(file.type)) {
      toast({ title: 'این نوع فایل خوانده نمی‌شود', description: 'عکس (JPG، PNG) یا PDF برگه آزمایش را انتخاب کنید.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const result = await ocrService.processDocument(file, (value, stage) => setProgress({ value, stage }));
      if (!result.text.trim()) throw new Error('متنی در فایل پیدا نشد؛ عکس واضح‌تری امتحان کنید یا متن را بچسبانید.');
      await submit(result.text, result.confidence, file);
    } catch (error) {
      toast({ title: 'برگه خوانده نشد', description: error instanceof Error ? error.message : 'دوباره امتحان کنید', variant: 'destructive' });
      setBusy(false);
    }
  };

  const fromText = async () => {
    setBusy(true);
    try {
      await submit(pasted.trim());
    } catch (error) {
      toast({ title: 'ذخیره نشد', description: error instanceof Error ? error.message : 'دوباره امتحان کنید', variant: 'destructive' });
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) { onOpenChange(o); if (!o) reset(); } }}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>افزودن برگه آزمایش</DialogTitle>
          <DialogDescription>
            عکس یا PDF جواب آزمایش را انتخاب کنید. متن روی همین دستگاه خوانده می‌شود و نتایج با محدوده مرجع جدا می‌شوند.
          </DialogDescription>
        </DialogHeader>

        {busy ? (
          <div className="space-y-3 py-4" aria-live="polite">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-signal" />
              {progress.stage || 'در حال آماده‌سازی…'}
            </div>
            <Progress value={Math.round(progress.value * 100)} className="h-1.5" />
            <p className="text-xs text-muted-foreground">بار اول چند ثانیه بیشتر طول می‌کشد تا خواننده متن فارسی آماده شود.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-input px-6 py-8 text-center hover:border-foreground/40 hover:bg-muted/40"
            >
              <FileUp className="h-6 w-6 text-muted-foreground" />
              <span className="font-medium">انتخاب عکس یا PDF</span>
              <span className="text-xs text-muted-foreground">روی گوشی می‌توانید مستقیم از برگه عکس بگیرید</span>
            </button>
            <input
              ref={input}
              type="file"
              accept="image/*,application/pdf"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void fromFile(file);
              }}
            />
            <details className="group rounded-lg border border-border">
              <summary className="cursor-pointer select-none px-3 py-2 text-sm text-muted-foreground group-open:border-b group-open:border-border">
                یا متن جواب را بچسبانید
              </summary>
              <div className="space-y-2 p-3">
                <Textarea
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  rows={6}
                  placeholder={'FBS  95  mg/dl  70-100\nCholesterol  180  mg/dl  < 200'}
                  className="latin-digits text-sm"
                  dir="auto"
                />
                <Button size="sm" onClick={fromText} disabled={pasted.trim().length < 5}>خواندن نتایج</Button>
              </div>
            </details>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
