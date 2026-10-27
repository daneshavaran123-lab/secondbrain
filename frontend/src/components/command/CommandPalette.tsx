import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command as CommandPrimitive } from 'cmdk';
import { BarChart3, BookOpen, Calendar as CalendarIcon, CheckSquare, Home, Mail, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { BrandMark } from '@/components/brand/BrandMark';
import { buildNavigation } from '@/config/navigation';
import { askAssistant } from '@/lib/assistant';
import { COMMAND_OPEN_EVENT } from '@/lib/command';

interface Destination {
  path: string;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}

const CREATE: Destination[] = [
  { path: '/meetings', label: 'جلسه جدید', hint: 'ایجاد', icon: CalendarIcon },
  { path: '/personal-planning', label: 'کار جدید', hint: 'ایجاد', icon: CheckSquare },
  { path: '/personal-journal', label: 'یادداشت جدید', hint: 'ایجاد', icon: BookOpen },
  { path: '/organizational-letters?upload=1', label: 'بارگذاری نامه', hint: 'ایجاد', icon: Mail },
];

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

/**
 * Ctrl/⌘ K from anywhere: jump to any page, start something new, or hand the
 * typed text to the assistant.
 */
export function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const pages = useMemo(destinations, []);

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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="top-[14vh] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 sm:rounded-xl [&>button:last-child]:hidden"
        dir="rtl"
      >
        <DialogTitle className="sr-only">جستجو و دستور</DialogTitle>
        <CommandPrimitive label="جستجو و دستور" className="flex flex-col" loop>
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <CommandPrimitive.Input
              value={query}
              onValueChange={setQuery}
              placeholder="جستجوی صفحه‌ها یا پرسش از دستیار…"
              className="h-12 min-w-0 flex-1 bg-transparent py-4 text-[15px] outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden rounded border border-border px-1.5 text-[11px] text-muted-foreground sm:inline">Esc</kbd>
          </div>

          <CommandPrimitive.List className="max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain p-2">
            {query.trim() && (
              <CommandPrimitive.Group heading="دستیار" forceMount className={groupClass}>
                <CommandPrimitive.Item value={`ask ${query}`} onSelect={ask} forceMount className={itemClass}>
                  <BrandMark size={18} className="text-foreground" />
                  <span className="min-w-0 flex-1 truncate">{query}</span>
                  <span className="shrink-0 text-xs text-signal">از دستیار بپرس</span>
                </CommandPrimitive.Item>
              </CommandPrimitive.Group>
            )}

            <CommandPrimitive.Group heading="ایجاد" className={groupClass}>
              {CREATE.map((d) => (
                <CommandPrimitive.Item key={d.path} value={`${d.label} ${d.hint}`} onSelect={() => go(d.path)} className={itemClass}>
                  <d.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1">{d.label}</span>
                </CommandPrimitive.Item>
              ))}
            </CommandPrimitive.Group>

            <CommandPrimitive.Group heading="صفحه‌ها" className={groupClass}>
              {pages.map((d) => (
                <CommandPrimitive.Item key={d.path} value={`${d.label} ${d.hint} ${d.path}`} onSelect={() => go(d.path)} className={itemClass}>
                  <d.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{d.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{d.hint}</span>
                </CommandPrimitive.Item>
              ))}
            </CommandPrimitive.Group>
          </CommandPrimitive.List>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}
