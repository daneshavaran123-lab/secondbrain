import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command as CommandPrimitive } from 'cmdk';
import {
  BarChart3, BookOpen, Building2, Calendar as CalendarIcon, CheckSquare, Clapperboard, Contact, Feather,
  FileText, FlaskConical, FolderKanban, HandHeart, Handshake, Heart, HeartHandshake, Home, Landmark, Lightbulb,
  Loader2, Mail, Route, Scale, Search, Send, ShieldAlert, Sprout, User, Users,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { BrandMark } from '@/components/brand/BrandMark';
import { buildNavigation } from '@/config/navigation';
import { askAssistant } from '@/lib/assistant';
import { COMMAND_OPEN_EVENT } from '@/lib/command';
import { formatJalaliDate, toPersianDigits } from '@/lib/date-utils';
import { matchesAll, queryWords } from '@/lib/persianText';
import { useRecordSearch } from '@/hooks/useRecordSearch';
import type { SearchGroup } from '@/services/searchService';

type Icon = React.ComponentType<{ className?: string }>;

interface Destination {
  path: string;
  label: string;
  hint: string;
  icon: Icon;
}

const CREATE: Destination[] = [
  { path: '/meetings', label: 'جلسه جدید', hint: 'ایجاد', icon: CalendarIcon },
  { path: '/personal-planning', label: 'کار جدید', hint: 'ایجاد', icon: CheckSquare },
  { path: '/personal-journal', label: 'یادداشت جدید', hint: 'ایجاد', icon: BookOpen },
  { path: '/organizational-letters?upload=1', label: 'بارگذاری نامه', hint: 'ایجاد', icon: Mail },
  { path: '/health?tab=labs&upload=1', label: 'افزودن برگه آزمایش', hint: 'ایجاد', icon: FlaskConical },
];

const TYPE_ICONS: Record<string, Icon> = {
  task: CheckSquare, delegated: Send, event: CalendarIcon, meeting: Users, minutes: FileText,
  note: BookOpen, journal: Feather, idea: Lightbulb, contact: User, company_contact: Contact,
  project: FolderKanban, legal: Scale, letter: Mail, cultural: Clapperboard, gratitude: Heart,
  need: HandHeart, partner: Handshake, service: HeartHandshake, program: Route, risk: ShieldAlert,
  csr: Sprout, company: Building2, organization: Landmark,
};

/** Every page once, labelled with the domain it lives in. */
function destinations(): Destination[] {
  const seen = new Set<string>();
  const pages: Destination[] = [
    { path: '/', label: 'داشبورد', hint: 'خانه', icon: Home },
    { path: '/assistant-reports', label: 'گزارش‌های دستیار', hint: 'دستیار', icon: BarChart3 },
  ];
  for (const domain of buildNavigation()) {
    for (const category of domain.categories) {
      for (const item of category.items) {
        if (!item.path.startsWith('/') || seen.has(item.path)) continue;
        seen.add(item.path);
        pages.push({
          path: item.path,
          label: item.label.replace(/^[^\p{L}]+/u, '').trim(),
          hint: domain.title.replace('حوزه ', ''),
          icon: item.icon,
        });
      }
    }
  }
  return pages;
}

const itemClass =
  'flex cursor-pointer select-none items-center gap-3 rounded-md px-3 py-2.5 text-sm outline-none ' +
  'data-[selected=true]:bg-accent data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50';
const groupClass =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 ' +
  '[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground';
const noteClass = 'px-3 py-2 text-xs text-muted-foreground';

const count = (n: number) => toPersianDigits(n);

function RecordGroup({ group, expanded, onOpen, onMore }: {
  group: SearchGroup;
  expanded: boolean;
  onOpen: (path: string) => void;
  onMore: () => void;
}) {
  const TypeIcon = TYPE_ICONS[group.type] ?? FileText;
  const rest = group.total - group.items.length;
  return (
    <CommandPrimitive.Group heading={`${group.label} (${count(group.total)})`} className={groupClass}>
      {group.items.map((item) => (
        <CommandPrimitive.Item
          key={`${group.type}:${item.id}`}
          value={`record:${group.type}:${item.id}`}
          onSelect={() => onOpen(item.path)}
          className={`${itemClass} items-start`}
        >
          <TypeIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block truncate">{item.title || 'بدون عنوان'}</span>
            {item.snippet && item.snippet !== item.title && (
              <span className="block truncate text-xs text-muted-foreground">{item.snippet}</span>
            )}
          </span>
          {item.date && <span className="mt-0.5 shrink-0 text-xs text-muted-foreground">{formatJalaliDate(item.date)}</span>}
        </CommandPrimitive.Item>
      ))}
      {rest > 0 && !expanded && (
        <CommandPrimitive.Item value={`more:${group.type}`} onSelect={onMore} className={`${itemClass} text-signal`}>
          <span className="w-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{count(rest)} مورد دیگر — نمایش بیشتر</span>
        </CommandPrimitive.Item>
      )}
    </CommandPrimitive.Group>
  );
}

/**
 * Ctrl/⌘ K from anywhere: find the person's own records (tasks, needs, minutes, letters…),
 * jump to any page, start something new, or hand the typed text to the assistant.
 */
export function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const pages = useMemo(destinations, []);
  const records = useRecordSearch(open ? query : '');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // e.code keeps the shortcut working with a Persian keyboard layout
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(COMMAND_OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(COMMAND_OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const ask = () => {
    const text = query.trim();
    if (!text) return;
    setOpen(false);
    askAssistant(text);
  };

  // Pages and shortcuts are matched here, with the same Persian normalization as the server
  const words = queryWords(query);
  const matches = (d: Destination) => !words.length || matchesAll(`${d.label} ${d.hint}`, words);
  const create = CREATE.filter(matches);
  const shownPages = pages.filter(matches);
  const typed = query.trim();

  const announcement =
    records.status === 'loading' ? 'در حال جستجو در داده‌ها'
      : records.status === 'error' ? 'جستجو در داده‌ها الان در دسترس نیست'
        : records.status === 'done'
          ? (records.total ? `${count(records.total)} مورد در داده‌های شما پیدا شد` : 'در داده‌های شما چیزی پیدا نشد')
          : '';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="top-[10vh] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 sm:top-[14vh] sm:rounded-xl [&>button:last-child]:hidden"
        dir="rtl"
      >
        <DialogTitle className="sr-only">جستجو و دستور</DialogTitle>
        <CommandPrimitive label="جستجو و دستور" className="flex flex-col" loop shouldFilter={false}>
          <div className="flex items-center gap-3 border-b border-border px-4">
            {records.status === 'loading'
              ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
              : <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
            <CommandPrimitive.Input
              value={query}
              onValueChange={setQuery}
              placeholder="جستجو در داده‌ها و صفحه‌ها، یا پرسش از دستیار…"
              className="h-12 min-w-0 flex-1 bg-transparent py-4 text-[15px] outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden rounded border border-border px-1.5 text-[11px] text-muted-foreground sm:inline">Esc</kbd>
          </div>
          <p className="sr-only" role="status" aria-live="polite">{announcement}</p>

          <CommandPrimitive.List className="max-h-[min(65vh,480px)] overflow-y-auto overscroll-contain p-2">
            {typed && (
              <CommandPrimitive.Group heading="دستیار" className={groupClass}>
                <CommandPrimitive.Item value={`ask:${query}`} onSelect={ask} className={itemClass}>
                  <BrandMark size={18} className="text-foreground" />
                  <span className="min-w-0 flex-1 truncate">{query}</span>
                  <span className="shrink-0 text-xs text-signal">از دستیار بپرس</span>
                </CommandPrimitive.Item>
              </CommandPrimitive.Group>
            )}

            {records.groups.map((group) => (
              <RecordGroup
                key={group.type}
                group={group}
                expanded={records.expanded.has(group.type)}
                onOpen={go}
                onMore={() => void records.expand(group.type)}
              />
            ))}
            {records.status === 'loading' && !records.groups.length && (
              <p className={noteClass} aria-hidden="true">در حال جستجو در داده‌ها…</p>
            )}
            {records.status === 'done' && !records.total && (
              <p className={noteClass}>در داده‌های شما چیزی با «{typed}» پیدا نشد؛ می‌توانید از دستیار بپرسید.</p>
            )}
            {records.status === 'error' && (
              <p className={noteClass}>جستجو در داده‌ها الان در دسترس نیست؛ صفحه‌ها همچنان پیدا می‌شوند.</p>
            )}

            {create.length > 0 && (
              <CommandPrimitive.Group heading="ایجاد" className={groupClass}>
                {create.map((d) => (
                  <CommandPrimitive.Item key={d.path} value={`create:${d.path}`} onSelect={() => go(d.path)} className={itemClass}>
                    <d.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1">{d.label}</span>
                  </CommandPrimitive.Item>
                ))}
              </CommandPrimitive.Group>
            )}

            {shownPages.length > 0 && (
              <CommandPrimitive.Group heading="صفحه‌ها" className={groupClass}>
                {shownPages.map((d) => (
                  <CommandPrimitive.Item key={d.path} value={`page:${d.path}`} onSelect={() => go(d.path)} className={itemClass}>
                    <d.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{d.label}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{d.hint}</span>
                  </CommandPrimitive.Item>
                ))}
              </CommandPrimitive.Group>
            )}
          </CommandPrimitive.List>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}
