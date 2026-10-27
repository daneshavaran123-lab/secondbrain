import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Mail, Megaphone, Search, Upload } from 'lucide-react';
import { SectionHeader } from '@/components/ui/section-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { LetterUploadDialog } from '@/components/letters/LetterUploadDialog';
import { LetterDetail } from '@/components/letters/LetterDetail';
import { STATUS_DOT, deadlineInfo, persianDate } from '@/components/letters/letterFormat';
import {
  KIND_LABEL, LetterKind, LetterStatus, OrgLetter, STATUS_LABEL, URGENCY_LABEL, orgLettersService,
} from '@/services/orgLettersService';
import { cn } from '@/lib/utils';

type KindFilter = 'all' | LetterKind;
type StatusFilter = 'all' | 'open' | LetterStatus;

const KIND_FILTERS: Array<{ id: KindFilter; label: string }> = [
  { id: 'all', label: 'همه' },
  { id: 'letter', label: 'نامه‌ها' },
  { id: 'circular', label: 'بخشنامه‌ها' },
];

const STATUS_FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: 'همه وضعیت‌ها' },
  { id: 'open', label: 'در انتظار پاسخ' },
  { id: 'replied', label: 'پاسخ داده شده' },
  { id: 'archived', label: 'بایگانی' },
];

const isOpen = (l: OrgLetter) => l.status === 'new' || l.status === 'in_progress';

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'min-h-[34px] rounded-full px-3 text-xs transition-colors sm:min-h-0 sm:py-1.5',
        active ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}

function LetterRow({ letter, onOpen }: { letter: OrgLetter; onOpen: () => void }) {
  const deadline = isOpen(letter) ? deadlineInfo(letter.deadline) : null;
  const Icon = letter.kind === 'circular' ? Megaphone : Mail;
  const meta = [
    letter.sender,
    letter.letter_number && `شماره ${letter.letter_number}`,
    letter.letter_date || persianDate(letter.created_at),
  ].filter(Boolean).join(' · ');

  return (
    <button
      onClick={onOpen}
      className="flex w-full flex-wrap items-start gap-3 rounded-xl border border-border bg-card p-4 text-right transition-colors hover:bg-muted/40 sm:flex-nowrap"
    >
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium leading-6">{letter.subject || 'بدون موضوع'}</p>
          {letter.urgency && letter.urgency !== 'normal' && (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive">{URGENCY_LABEL[letter.urgency]}</span>
          )}
        </div>
        {meta && <p className="mt-0.5 truncate text-xs text-muted-foreground">{meta}</p>}
        {letter.summary && <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-muted-foreground">{letter.summary}</p>}
      </div>
      <div className="flex w-full items-center gap-3 ps-12 text-xs sm:w-auto sm:shrink-0 sm:flex-col sm:items-end sm:gap-1.5 sm:ps-0">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[letter.status])} />
          {STATUS_LABEL[letter.status]}
        </span>
        {deadline && <span className={cn(deadline.urgent ? 'text-destructive' : 'text-muted-foreground')}>{deadline.label}</span>}
      </div>
    </button>
  );
}

const OrganizationalLettersPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [letters, setLetters] = useState<OrgLetter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<KindFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [uploadOpen, setUploadOpen] = useState(searchParams.get('upload') === '1');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const { data } = await orgLettersService.list({ q: q.trim() || undefined });
      setLetters(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'بارگیری ممکن نشد');
    } finally {
      setLoading(false);
    }
  }, []);

  // Search on the server (it looks inside letter text too), debounced
  useEffect(() => {
    const t = setTimeout(() => load(query), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [query, load]);

  // Opened from the header's «بارگذاری نامه»
  useEffect(() => {
    if (searchParams.get('upload') === '1') {
      setUploadOpen(true);
      searchParams.delete('upload');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const visible = letters.filter((l) =>
    (kind === 'all' || l.kind === kind) &&
    (status === 'all' || (status === 'open' ? isOpen(l) : l.status === status))
  );
  const openCount = letters.filter(isOpen).length;

  const upsertLetter = (letter: OrgLetter) =>
    setLetters((prev) => {
      const { ocr_text, clean_text, reply_draft, ...summary } = letter;
      const exists = prev.some((l) => l.id === letter.id);
      return exists ? prev.map((l) => (l.id === letter.id ? { ...l, ...summary } : l)) : [summary as OrgLetter, ...prev];
    });

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <SectionHeader
        title="نامه‌ها و بخشنامه‌ها"
        subtitle="بارگذاری نامه، خواندن خودکار متن و پیشنهاد جوابیه با هوش مصنوعی"
        icon={<Mail />}
        className="mb-0 md:mb-0"
        action={
          <Button onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4" />
            بارگذاری نامه
          </Button>
        }
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-1">
          {KIND_FILTERS.map((f) => (
            <Chip key={f.id} active={kind === f.id} onClick={() => setKind(f.id)}>{f.label}</Chip>
          ))}
          <span className="mx-1 h-4 w-px bg-border" aria-hidden />
          {STATUS_FILTERS.map((f) => (
            <Chip key={f.id} active={status === f.id} onClick={() => setStatus(f.id)}>
              {f.label}
              {f.id === 'open' && openCount > 0 && ` (${openCount.toLocaleString('fa-IR')})`}
            </Chip>
          ))}
        </div>
        <div className="relative md:w-64">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجو در موضوع، فرستنده، شماره و متن"
            className="pr-9 text-sm"
            aria-label="جستجوی نامه‌ها"
          />
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/30 p-6 text-center text-sm text-destructive">
          {error}
          <Button variant="outline" size="sm" className="mr-3" onClick={() => load(query)}>تلاش دوباره</Button>
        </div>
      ) : loading && !letters.length ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/60" />)}
        </div>
      ) : visible.length ? (
        <div className="space-y-3">
          {visible.map((letter) => <LetterRow key={letter.id} letter={letter} onOpen={() => setSelectedId(letter.id)} />)}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-14 text-center">
          <Mail className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="font-medium">{letters.length || query ? 'نامه‌ای با این شرایط پیدا نشد' : 'هنوز نامه‌ای بارگذاری نشده'}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              عکس یا PDF نامه را بارگذاری کنید؛ متن خوانده می‌شود و پیش‌نویس جوابیه آماده می‌شود.
            </p>
          </div>
          {!letters.length && !query && (
            <Button onClick={() => setUploadOpen(true)}>
              <Upload className="h-4 w-4" />
              بارگذاری اولین نامه
            </Button>
          )}
        </div>
      )}

      <LetterUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onCreated={(letter) => {
          upsertLetter(letter);
          setSelectedId(letter.id);
        }}
      />

      <Sheet open={!!selectedId} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent side="left" className="w-full !max-w-full overflow-y-auto p-0 sm:!max-w-2xl" dir="rtl">
          <SheetTitle className="sr-only">جزئیات {selectedId ? KIND_LABEL[letters.find((l) => l.id === selectedId)?.kind || 'letter'] : 'نامه'}</SheetTitle>
          {selectedId && (
            <LetterDetail
              letterId={selectedId}
              onChanged={upsertLetter}
              onDeleted={(id) => {
                setLetters((prev) => prev.filter((l) => l.id !== id));
                setSelectedId(null);
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default OrganizationalLettersPage;
