import { FormEvent, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { askAssistant } from '@/lib/assistant';
import { BrandMark } from '@/components/brand/BrandMark';
import { cn } from '@/lib/utils';

const PROMPTS = [
  { label: 'برنامه امروزم چیه؟', send: true },
  { label: 'چه کارهایی عقب افتاده؟', send: true },
  { label: 'فردا ساعت ۱۰ جلسه با تیم بذار', send: true },
  { label: 'یه ایده دارم…', prefill: 'یه ایده دارم: ', send: false },
];

/** Home-screen entry point: type anything and the assistant takes it from there. */
export function AskMoraCard({ className }: { className?: string }) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    askAssistant(text);
    setText('');
  };

  return (
    <section aria-label="پرسش از دستیار" className={cn('space-y-3', className)}>
      <form
        onSubmit={submit}
        className="flex items-center gap-3 rounded-lg border border-input bg-card py-2 pe-2 ps-3.5 transition-[border-color,box-shadow] focus-within:border-signal focus-within:shadow-[0_0_0_3px_hsl(var(--signal)/0.14)]"
      >
        <BrandMark size={24} className="text-foreground" />
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="از مغز دومت بپرس یا چیزی ثبت کن…"
          aria-label="پیام به دستیار"
          className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground focus-visible:outline-none md:text-[15px]"
        />
        <Button type="submit" size="icon" className="h-10 w-10 min-h-0 shrink-0 rounded-md disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 sm:h-9 sm:w-9" disabled={!text.trim()} aria-label="ارسال">
          <ArrowUp className="h-4 w-4" />
        </Button>
      </form>
      <div className="flex flex-wrap gap-2">
        {PROMPTS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => {
              if (p.send) {
                askAssistant(p.label);
              } else {
                setText(p.prefill || p.label);
                inputRef.current?.focus();
              }
            }}
            className="min-h-[34px] rounded-md border border-border bg-card px-3 py-1 text-sm text-muted-foreground transition-colors hover:border-input hover:text-foreground sm:min-h-0"
          >
            {p.label}
          </button>
        ))}
      </div>
    </section>
  );
}
