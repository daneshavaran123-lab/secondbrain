import { cn } from '@/lib/utils';

interface BrandMarkProps {
  size?: number;
  className?: string;
  /** Show the assistant at work: the node in the machine half pulses. */
  active?: boolean;
}

/**
 * The «مغز دوم من» mark: one circle in two halves. The solid half is the person,
 * the turquoise half with its single node is the second, machine-made half.
 */
export function BrandMark({ size = 24, className, active = false }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0', className)}
    >
      <path d="M16 4a12 12 0 0 1 0 24z" fill="currentColor" />
      <path d="M16 5.25a10.75 10.75 0 0 0 0 21.5" stroke="hsl(var(--signal))" strokeWidth="2.5" />
      <circle cx="5.25" cy="16" r="3" fill="hsl(var(--signal))" className={cn(active && 'brand-node-pulse')} />
    </svg>
  );
}

/** Mark plus the name, for the top of the shell and the sign-in screen. */
export function Wordmark({ className, size = 22 }: { className?: string; size?: number }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-foreground', className)}>
      <BrandMark size={size} />
      <span className="font-brand text-[15px] leading-none">مغز دوم من</span>
    </span>
  );
}
