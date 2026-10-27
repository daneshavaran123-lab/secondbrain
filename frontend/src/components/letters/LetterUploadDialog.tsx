import { useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import { Camera, FileText, Loader2, Sparkles, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { ocrService } from '@/services/ocrService';
import { KIND_LABEL, LetterKind, OrgLetter, orgLettersService, prepareLetterFile } from '@/services/orgLettersService';
import { cn } from '@/lib/utils';

const ORG_KEY = 'letters:last-organization';
const ACCEPT = { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'], 'application/pdf': ['.pdf'] };

type Step = 'pick' | 'reading' | 'review' | 'saving';

interface LetterUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (letter: OrgLetter) => void;
}

export function LetterUploadDialog({ open, onOpenChange, onCreated }: LetterUploadDialogProps) {
  const [step, setStep] = useState<Step>('pick');
  const [kind, setKind] = useState<LetterKind>('letter');
  const [organization, setOrganization] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [confidence, setConfidence] = useState<number | null>(null);
  const [progress, setProgress] = useState({ value: 0, stage: '' });
  const cameraRef = useRef<HTMLInputElement>(null);

  // Fresh state every time the dialog opens
  useEffect(() => {
    if (!open) return;
    setStep('pick');
    setKind('letter');
    setFile(null);
    setText('');
    setConfidence(null);
    setProgress({ value: 0, stage: '' });
    try {
      setOrganization(localStorage.getItem(ORG_KEY) || '');
    } catch {
      setOrganization('');
    }
  }, [open]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const readFile = async (selected: File) => {
    setFile(selected);
    setPreviewUrl(selected.type.startsWith('image/') ? URL.createObjectURL(selected) : null);
    setStep('reading');
    try {
      const result = await ocrService.processDocument(selected, (value, stage) => setProgress({ value, stage }));
      setText(result.text);
      setConfidence(Math.round(result.confidence));
      if (!result.text.trim()) toast.warning('متنی در فایل پیدا نشد؛ می‌توانید متن را دستی وارد کنید.');
    } catch (error) {
      console.error('[letters] OCR failed', error);
      toast.error('خواندن متن ممکن نشد؛ می‌توانید متن را دستی وارد کنید.');
    }
    setStep('review');
  };

  const { getRootProps, getInputProps, isDragActive, open: openPicker } = useDropzone({
    accept: ACCEPT,
    multiple: false,
    noClick: true,
    onDropAccepted: ([accepted]) => readFile(accepted),
    onDropRejected: () => toast.error('فقط تصویر (JPG، PNG) یا PDF قابل بارگذاری است.'),
  });

  const save = async () => {
    setStep('saving');
    try {
      localStorage.setItem(ORG_KEY, organization.trim());
    } catch {
      // per-device convenience only
    }
    try {
      const filePayload = file ? await prepareLetterFile(file) : null;
      if (file && !filePayload) toast.message('فایل اصلی بیش از ۷ مگابایت است؛ فقط متن ذخیره می‌شود.');
      const { data, warning } = await orgLettersService.create({
        kind,
        organization_name: organization.trim() || undefined,
        ocr_text: text,
        ocr_confidence: confidence ?? undefined,
        file: filePayload ?? undefined,
      });
      if (warning) toast.warning(warning);
      else toast.success(`${KIND_LABEL[kind]} ذخیره و تحلیل شد`);
      onCreated(data);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ذخیره ممکن نشد');
      setStep('review');
    }
  };

  const busy = step === 'reading' || step === 'saving';

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl" dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle>بارگذاری نامه یا بخشنامه</DialogTitle>
          <DialogDescription>
            متن به‌صورت خودکار خوانده می‌شود؛ بعد از بررسی، هوش مصنوعی مشخصات نامه را استخراج و پیش‌نویس جوابیه را آماده می‌کند.
          </DialogDescription>
        </DialogHeader>

        {(step === 'pick' || step === 'review') && (
          <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
            <div className="inline-flex rounded-lg bg-muted p-1" role="radiogroup" aria-label="نوع">
              {(['letter', 'circular'] as LetterKind[]).map((k) => (
                <button
                  key={k}
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => setKind(k)}
                  className={cn(
                    'min-h-0 rounded-md px-4 py-1.5 text-sm transition-colors',
                    kind === k ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
            <Input
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              placeholder="سازمان یا انجمن (اختیاری)"
              aria-label="سازمان"
            />
          </div>
        )}

        {step === 'pick' && (
          <div
            {...getRootProps()}
            className={cn(
              'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
              isDragActive ? 'border-primary bg-primary/5' : 'border-border'
            )}
          >
            <input {...getInputProps()} />
            <Upload className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">فایل را اینجا رها کنید</p>
              <p className="mt-1 text-sm text-muted-foreground">تصویر (JPG، PNG) یا PDF، حداکثر ۷ مگابایت برای نگهداری اصل فایل</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" variant="outline" onClick={openPicker}>
                <FileText className="h-4 w-4" />
                انتخاب فایل
              </Button>
              <Button type="button" variant="outline" onClick={() => cameraRef.current?.click()}>
                <Camera className="h-4 w-4" />
                عکس گرفتن
              </Button>
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const picked = e.target.files?.[0];
                  if (picked) readFile(picked);
                  e.target.value = '';
                }}
              />
            </div>
            <button type="button" onClick={() => setStep('review')} className="min-h-0 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
              متن را خودم وارد می‌کنم
            </button>
          </div>
        )}

        {step === 'reading' && (
          <div className="space-y-4 py-4">
            {previewUrl && <img src={previewUrl} alt="" className="mx-auto max-h-48 rounded-lg border border-border object-contain" />}
            <Progress value={Math.round(progress.value * 100)} className="h-2" />
            <p className="text-center text-sm text-muted-foreground">
              {progress.stage || 'در حال آماده‌سازی…'} {progress.value > 0 && `${Math.round(progress.value * 100).toLocaleString('fa-IR')}٪`}
            </p>
            <p className="text-center text-xs text-muted-foreground">بار اول ممکن است دریافت مدل زبان فارسی کمی طول بکشد.</p>
          </div>
        )}

        {(step === 'review' || step === 'saving') && (
          <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
            <div className="hidden sm:block">
              {previewUrl ? (
                <img src={previewUrl} alt="" className="w-full rounded-lg border border-border object-contain" />
              ) : file ? (
                <div className="flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-lg border border-border text-xs text-muted-foreground">
                  <FileText className="h-8 w-8" />
                  <span className="break-all px-2 text-center">{file.name}</span>
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <label htmlFor="letter-text" className="font-medium">متن نامه</label>
                {confidence !== null && (
                  <span className={cn('text-xs', confidence < 70 ? 'text-warning' : 'text-muted-foreground')}>
                    دقت خواندن: {confidence.toLocaleString('fa-IR')}٪
                  </span>
                )}
              </div>
              <Textarea
                id="letter-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="متن نامه را اینجا وارد یا اصلاح کنید…"
                className="min-h-[260px] text-sm leading-7"
                dir="rtl"
                disabled={step === 'saving'}
              />
              <p className="text-xs text-muted-foreground">
                اگر جایی اشتباه خوانده شده، همین‌جا اصلاحش کنید؛ هوش مصنوعی هم غلط‌های رایج خواندن را درست می‌کند.
              </p>
            </div>
          </div>
        )}

        {(step === 'review' || step === 'saving') && (
          <DialogFooter className="gap-2 sm:justify-start">
            <Button onClick={save} disabled={!text.trim() || step === 'saving'}>
              {step === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {step === 'saving' ? 'در حال تحلیل و نوشتن پیش‌نویس جوابیه…' : 'ذخیره و تحلیل'}
            </Button>
            <Button variant="ghost" onClick={() => setStep('pick')} disabled={step === 'saving'}>
              فایل دیگر
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
