import { cn } from '@/lib/utils';

/**
 * The «مغز دوم من» mark is the word «من» (me, mine): mim's loop sitting on the line, the line
 * dipping into nun's bowl, and nun's dot in the signal colour. Next to the name the mark is the
 * last word: «مغز دوم» + mark. Masters, icons and usage rules live in /brand.
 */
const BODY = 'M242 110C242 142.03 216.03 168 184 168H139.25C131.61 192.34 108.87 210 82 210C48.86 210 22 183.14 22 150V124C22 114.06 30.06 106 40 106C49.94 106 58 114.06 58 124V150C58 163.25 68.75 174 82 174C95.25 174 106 163.25 106 150C106 140.06 114.06 132 124 132H130.32C127.53 125.22 126 117.79 126 110C126 77.97 151.97 52 184 52C216.03 52 242 77.97 242 110ZM206 110C206 97.85 196.15 88 184 88C171.85 88 162 97.85 162 110C162 122.15 171.85 132 184 132C196.15 132 206 122.15 206 110Z';
const DOT = { cx: 82, cy: 62, r: 19 };
// Drawing box 22 43 220 167; the square view centres it, the inline view hugs it
const SQUARE = '22 16.5 220 220';
const TIGHT = '22 43 220 167';

interface BrandMarkProps {
  size?: number;
  className?: string;
  /** Show the assistant at work: the dot pulses. */
  active?: boolean;
}

function Paths({ active }: { active?: boolean }) {
  return (
    <>
      <path d={BODY} fill="currentColor" />
      <circle cx={DOT.cx} cy={DOT.cy} r={DOT.r} fill="hsl(var(--signal))" className={cn(active && 'brand-node-pulse')} />
    </>
  );
}

export function BrandMark({ size = 24, className, active = false }: BrandMarkProps) {
  return (
    <svg width={size} height={size} viewBox={SQUARE} aria-hidden="true" className={cn('shrink-0', className)}>
      <Paths active={active} />
    </svg>
  );
}

/**
 * The name with the mark as its last word, set at the text's size. The mark's loop-to-baseline
 * band is the Kufi x-height (0.495 em) and its baseline sits on the text's baseline.
 */
export function Wordmark({ className, size = 15 }: { className?: string; size?: number }) {
  return (
    <span className={cn('inline-block whitespace-nowrap font-brand leading-none text-foreground', className)} style={{ fontSize: size }} aria-label="مغز دوم من" role="img">
      <span aria-hidden="true">مغز دوم </span>
      <svg viewBox={TIGHT} aria-hidden="true" style={{ height: '0.713em', width: '0.939em', verticalAlign: '-0.179em', display: 'inline' }}>
        <Paths />
      </svg>
    </span>
  );
}
