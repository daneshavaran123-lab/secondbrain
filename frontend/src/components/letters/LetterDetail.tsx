import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Check, ClipboardCopy, Download, FileDown, ListPlus, Loader2, Megaphone, Mail, MoreHorizontal, RefreshCw, Sparkles, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { actionExecutor } from '@/services/actionExecutorService';
import {
  KIND_LABEL, LetterStatus, OrgLetter, ReplyTone, STATUS_LABEL, URGENCY_LABEL, orgLettersService,
} from '@/services/orgLettersService';
import { STATUS_DOT, deadlineInfo, downloadAsWord, persianDate } from './letterFormat';
import { cn } from '@/lib/utils';

const TONES: Array<{ id: ReplyTone; label: string }> = [
  { id: 'agree', label: 'موافقت' },
  { id: 'decline', label: 'رد مؤدبانه' },
  { id: 'extension', label: 'درخواست مهلت' },
  { id: 'info', label: 'درخواست اطلاعات' },
  { id: 'ack', label: 'اعلام وصول' },
];

interface LetterDetailProps {
  letterId: string;
  onChanged: (letter: OrgLetter) => void;
  onDeleted: (id: string) => void;
}

function Meta({ label, value, className }: { label: string; value?: string | null; className?: string }) {
  if (!value) return null;
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm">{value}</dd>
    </div>
  );
}

export function LetterDetail({ letterId, onChanged, onDeleted }: LetterDetailProps) {
  const [letter, setLetter] = useState<OrgLetter | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState('reply');
  const [draft, setDraft] = useState('');
  const [letterText, setLetterText] = useState('');
  const [tone, setTone] = useState<ReplyTone | null>(null);
  const [instructions, setInstructions] = useState('');
  const [busy, setBusy] = useState<null | 'reply' | 'save' | 'analyze' | 'text' | 'tasks'>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const apply = (next: OrgLetter) => {
    setLetter(next);
    setDraft(next.reply_draft || '');
    setLetterText(next.clean_text || next.ocr_text || '');
    onChanged(next);
  };

  useEffect(() => {
    let cancelled = false;
    setLetter(null);
    setLoadError(null);
    setFileUrl(null);
    orgLettersService.get(letterId)
      .then(({ data }) => {
        if (cancelled) return;
        setLetter(data);
        setDraft(data.reply_draft || '');
        setLetterText(data.clean_text || data.ocr_text || '');
        setTab(data.needs_reply === false ? 'summary' : 'reply');
      })
      .catch((e) => !cancelled && setLoadError(e.message));
    return () => {
      cancelled = true;
    };
  }, [letterId]);

  // Load the original scan only when its tab is opened
  const letterKey = letter?.id;
  const hasFile = letter?.has_file;
  useEffect(() => {
    if (tab !== 'original' || !letterKey || !hasFile || fileUrl) return;
    let cancelled = false;
    orgLettersService.fileUrl(letterKey)
      .then((u) => (cancelled ? URL.revokeObjectURL(u) : setFileUrl(u)))
      .catch((e) => toast.error(e.message));
    return () => {
      cancelled = true;
    };
  }, [tab, letterKey, hasFile, fileUrl]);

  useEffect(() => () => {
    if (fileUrl) URL.revokeObjectURL(fileUrl);
  }, [fileUrl]);

  const run = async (kind: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'انجام نشد');
    } finally {
      setBusy(null);
    }
  };

  if (loadError) return <p className="p-6 text-sm text-destructive">{loadError}</p>;
  if (!letter) {
    return (
      <div className="flex h-60 items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const deadline = deadlineInfo(letter.deadline);
  const draftChanged = draft !== (letter.reply_draft || '');
  const textChanged = letterText !== (letter.clean_text || letter.ocr_text || '');
  const replyName = letter.kind === 'circular' ? 'گزارش اقدام' : 'جوابیه';
  const KindIcon = letter.kind === 'circular' ? Megaphone : Mail;

  const updateStatus = (status: LetterStatus) =>
    run('save', async () => {
      apply((await orgLettersService.update(letter.id, { status })).data);
      toast.success(`وضعیت: ${STATUS_LABEL[status]}`);
    });

  const addTasks = () =>
    run('tasks', async () => {
      const result = await actionExecutor.executeAction({
        function: 'create_tasks_batch',
        status: 'pending',
        params: {
          domain: 'organizational',
          tasks: letter.action_items.map((item) => ({
            title: item.task,
            due_date: item.deadline_iso || letter.deadline || undefined,
            assignee: item.owner || undefined,
          })),
        },
      });
      if (result.success) toast.success(result.message);
      else toast.error(result.message);
    });

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="space-y-3 border-b border-border p-5 pr-12">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <KindIcon className="h-3.5 w-3.5" />
          <span>{KIND_LABEL[letter.kind]}</span>
          <span>·</span>
          <span className="flex items-center gap-1.5">
            <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[letter.status])} />
            {STATUS_LABEL[letter.status]}
          </span>
          {letter.urgency && letter.urgency !== 'normal' && (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">{URGENCY_LABEL[letter.urgency]}</span>
          )}
        </div>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold leading-8">{letter.subject || 'بدون موضوع'}</h2>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 min-h-0 shrink-0 text-muted-foreground" aria-label="گزینه‌ها">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              {(Object.keys(STATUS_LABEL) as LetterStatus[]).filter((s) => s !== letter.status).map((s) => (
                <DropdownMenuItem key={s} className="cursor-pointer gap-2" onClick={() => updateStatus(s)}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[s])} />
                  {STATUS_LABEL[s]}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer gap-2"
                disabled={busy !== null}
                onClick={() => run('analyze', async () => {
                  const { data, warning } = await orgLettersService.analyze(letter.id);
                  apply(data);
                  if (warning) toast.warning(warning);
                  else toast.success('تحلیل دوباره انجام شد');
                })}
              >
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
                تحلیل دوباره با هوش مصنوعی
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer gap-2 text-destructive focus:text-destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" />
                حذف
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <Meta label="فرستنده" value={letter.sender} className="col-span-2 sm:col-span-1" />
          <Meta label="گیرنده" value={letter.recipient} />
          <Meta label="شماره" value={letter.letter_number} />
          <Meta label="تاریخ نامه" value={letter.letter_date} />
          <Meta label="سازمان" value={letter.organization_name} />
          {deadline && <Meta label="مهلت اقدام" value={deadline.label.replace('مهلت: ', '')} className={deadline.urgent ? '[&_dd]:text-destructive' : ''} />}
        </dl>
        {busy === 'analyze' && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> در حال تحلیل…
          </p>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex flex-1 flex-col" dir="rtl">
        <TabsList className="mx-5 mt-4 grid grid-cols-4">
          <TabsTrigger value="reply">{replyName}</TabsTrigger>
          <TabsTrigger value="summary">خلاصه</TabsTrigger>
          <TabsTrigger value="text">متن</TabsTrigger>
          <TabsTrigger value="original" disabled={!letter.has_file}>اصل</TabsTrigger>
        </TabsList>

        {/* AI reply */}
        <TabsContent value="reply" className="space-y-4 p-5">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">لحن پیش‌نویس</p>
            <div className="flex flex-wrap gap-2">
              {TONES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTone(tone === t.id ? null : t.id)}
                  aria-pressed={tone === t.id}
                  className={cn(
                    'min-h-[32px] rounded-full border px-3 text-xs transition-colors sm:min-h-0 sm:py-1',
                    tone === t.id ? 'border-signal bg-signal-soft text-foreground' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="توضیح برای هوش مصنوعی، مثلاً «بگو گزارش تا آخر ماه ارسال می‌شود»"
                className="text-sm"
              />
              <Button
                onClick={() => run('reply', async () => {
                  if (draftChanged && draft.trim() && !window.confirm('پیش‌نویس فعلی ذخیره نشده و جایگزین می‌شود. ادامه می‌دهید؟')) return;
                  apply((await orgLettersService.draftReply(letter.id, { tone: tone ?? undefined, instructions })).data);
                  toast.success(`پیش‌نویس ${replyName} آماده شد`);
                })}
                disabled={busy !== null}
                className="shrink-0"
              >
                {busy === 'reply' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {draft ? 'پیشنهاد جدید' : 'نوشتن پیشنهاد'}
              </Button>
            </div>
          </div>

          {draft || busy === 'reply' ? (
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-h-[340px] text-sm leading-8"
              dir="rtl"
              disabled={busy === 'reply'}
              aria-label={`پیش‌نویس ${replyName}`}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              هنوز پیش‌نویسی نوشته نشده. لحن را انتخاب کنید و «نوشتن پیشنهاد» را بزنید.
            </div>
          )}

          {draft && (
            <div className="flex flex-wrap gap-2">
              {draftChanged && (
                <Button
                  onClick={() => run('save', async () => {
                    apply((await orgLettersService.update(letter.id, { reply_draft: draft })).data);
                    toast.success('پیش‌نویس ذخیره شد');
                  })}
                  disabled={busy !== null}
                >
                  {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  ذخیره تغییرات
                </Button>
              )}
              <Button
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(draft);
                  toast.success('متن کپی شد');
                }}
              >
                <ClipboardCopy className="h-4 w-4" />
                کپی
              </Button>
              <Button variant="outline" onClick={() => downloadAsWord(`${replyName} - ${letter.subject || 'نامه'}`, draft)}>
                <FileDown className="h-4 w-4" />
                دانلود Word
              </Button>
              {letter.status !== 'replied' && (
                <Button variant="ghost" onClick={() => updateStatus('replied')} disabled={busy !== null}>
                  علامت «پاسخ داده شد»
                </Button>
              )}
            </div>
          )}
          <p className="text-xs leading-5 text-muted-foreground">
            پیش‌نویس هوش مصنوعی است؛ پیش از امضا، اعداد، تعهدها و جاهای خالی [ــــ] را بررسی کنید.
          </p>
        </TabsContent>

        {/* Summary and actions */}
        <TabsContent value="summary" className="space-y-5 p-5">
          {!letter.analyzed_at ? (
            <div className="space-y-3 rounded-lg border border-dashed border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">این نامه هنوز با هوش مصنوعی تحلیل نشده است.</p>
              <Button
                onClick={() => run('analyze', async () => {
                  const { data, warning } = await orgLettersService.analyze(letter.id);
                  apply(data);
                  if (warning) toast.warning(warning);
                })}
                disabled={busy !== null}
              >
                {busy === 'analyze' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                تحلیل نامه
              </Button>
            </div>
          ) : (
            <>
              {letter.summary && <p className="text-sm leading-7">{letter.summary}</p>}
              {letter.key_points?.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">نکات مهم</h3>
                  <ul className="list-disc space-y-1 ps-5 text-sm leading-7 marker:text-muted-foreground">
                    {letter.key_points.map((point, i) => <li key={i}>{point}</li>)}
                  </ul>
                </section>
              )}
              {letter.action_items?.length > 0 && (
                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">اقدامات لازم</h3>
                    <Button variant="outline" size="sm" onClick={addTasks} disabled={busy !== null} className="h-8 gap-1.5 text-xs">
                      {busy === 'tasks' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListPlus className="h-3.5 w-3.5" />}
                      افزودن به کارها
                    </Button>
                  </div>
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {letter.action_items.map((item, i) => (
                      <li key={i} className="flex items-start justify-between gap-3 px-3.5 py-2.5 text-sm">
                        <span className="leading-6">{item.task}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {[item.owner, item.deadline_iso ? persianDate(item.deadline_iso, false) : item.deadline].filter(Boolean).join(' · ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {!letter.summary && !letter.key_points?.length && !letter.action_items?.length && (
                <p className="text-sm text-muted-foreground">نکته‌ای استخراج نشد.</p>
              )}
            </>
          )}
        </TabsContent>

        {/* Letter text */}
        <TabsContent value="text" className="space-y-3 p-5">
          <Textarea
            value={letterText}
            onChange={(e) => setLetterText(e.target.value)}
            className="min-h-[380px] text-sm leading-8"
            dir="rtl"
            aria-label="متن نامه"
          />
          <div className="flex flex-wrap items-center gap-2">
            {textChanged && (
              <Button
                onClick={() => run('text', async () => {
                  apply((await orgLettersService.update(letter.id, { clean_text: letterText })).data);
                  toast.success('متن ذخیره شد؛ برای به‌روز شدن خلاصه و جوابیه «تحلیل دوباره» را بزنید.');
                })}
                disabled={busy !== null}
              >
                {busy === 'text' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                ذخیره متن
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              {letter.clean_text ? 'متن اصلاح‌شده با هوش مصنوعی' : 'متن خوانده‌شده از فایل'}
              {letter.ocr_confidence !== null && ` · دقت خواندن ${Math.round(Number(letter.ocr_confidence)).toLocaleString('fa-IR')}٪`}
            </span>
          </div>
        </TabsContent>

        {/* Original scan */}
        <TabsContent value="original" className="space-y-3 p-5">
          {!fileUrl ? (
            <div className="flex h-60 items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : letter.file_type === 'application/pdf' ? (
            <iframe src={fileUrl} title={letter.file_name || 'نامه'} className="h-[70vh] w-full rounded-lg border border-border" />
          ) : (
            <img src={fileUrl} alt={letter.subject || 'تصویر نامه'} className="w-full rounded-lg border border-border" />
          )}
          {fileUrl && (
            <Button variant="outline" asChild>
              <a href={fileUrl} download={letter.file_name || 'letter'}>
                <Download className="h-4 w-4" />
                دانلود فایل اصلی
              </a>
            </Button>
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader className="text-right">
            <AlertDialogTitle>حذف این {KIND_LABEL[letter.kind]}؟</AlertDialogTitle>
            <AlertDialogDescription>متن، تحلیل، پیش‌نویس جوابیه و فایل اصلی برای همیشه پاک می‌شوند.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => run('save', async () => {
                await orgLettersService.remove(letter.id);
                toast.success('حذف شد');
                onDeleted(letter.id);
              })}
            >
              حذف
            </AlertDialogAction>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
