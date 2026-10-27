import { FormEvent, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { askAssistant } from '@/lib/assistant';
import { MoraRobotIcon } from './MoraRobotIcon';
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
    <section className={cn('rounded-2xl border border-border bg-card p-3 shadow-card md:p-4', className)}>
      <form onSubmit={submit} className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
          <MoraRobotIcon size="sm" animate={false} />
        </div>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="از مغز دومت بپرس یا چیزی ثبت کن…"
          aria-label="پیام به دستیار"
          className="h-10 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground focus-visible:outline-none"
        />
        <Button type="submit" size="icon" className="h-10 w-10 min-h-0 shrink-0 rounded-lg sm:h-9 sm:w-9" disabled={!text.trim()} aria-label="ارسال">
          <ArrowUp className="h-4 w-4" />
        </Button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2 sm:ps-12">
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
            className="min-h-[34px] rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:min-h-0"
          >
            {p.label}
          </button>
        ))}
      </div>
    </section>
  );
}
