import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns-jalali";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

/**
 * A Jalali month grid (week starts on Saturday). It keeps the props the app used from
 * react-day-picker's single-date mode, so callers did not change.
 */
export interface CalendarProps {
  mode?: "single";
  selected?: Date;
  onSelect?: (date: Date | undefined) => void;
  /** Month shown first; defaults to the selected date or today */
  defaultMonth?: Date;
  disabled?: Date[] | ((date: Date) => boolean);
  modifiers?: Record<string, Date[] | ((date: Date) => boolean)>;
  modifiersClassNames?: Record<string, string>;
  modifiersStyles?: Record<string, React.CSSProperties>;
  showOutsideDays?: boolean;
  initialFocus?: boolean;
  className?: string;
}

const WEEKDAYS = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
const WEEK = { weekStartsOn: 6 as const };
const fa = (n: number) => n.toLocaleString("fa-IR", { useGrouping: false });
const faDigits = (s: string) => s.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);

const matches = (rule: Date[] | ((date: Date) => boolean) | undefined, date: Date) =>
  typeof rule === "function" ? rule(date) : !!rule?.some((d) => isSameDay(d, date));

function Calendar({
  selected,
  onSelect,
  defaultMonth,
  disabled,
  modifiers,
  modifiersClassNames,
  modifiersStyles,
  showOutsideDays = true,
  initialFocus,
  className,
}: CalendarProps) {
  const [month, setMonth] = React.useState(() => startOfMonth(defaultMonth ?? selected ?? new Date()));
  const gridRef = React.useRef<HTMLDivElement>(null);
  const today = new Date();

  const days = React.useMemo(() => {
    const out: Date[] = [];
    for (let d = startOfWeek(month, WEEK); d <= endOfWeek(endOfMonth(month), WEEK); d = addDays(d, 1)) out.push(d);
    return out;
  }, [month]);

  React.useEffect(() => {
    if (initialFocus) gridRef.current?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus();
  }, [initialFocus]);

  const focusTarget = days.find((d) => selected && isSameDay(d, selected)) ?? days.find((d) => isSameDay(d, today) && isSameMonth(d, month)) ?? startOfMonth(month);

  const onKeyDown = (event: React.KeyboardEvent, date: Date) => {
    // RTL: the left arrow moves forward in time
    const step = { ArrowLeft: 1, ArrowRight: -1, ArrowDown: 7, ArrowUp: -7 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = addDays(date, step);
    if (!isSameMonth(next, month)) setMonth(startOfMonth(next));
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${next.toDateString()}"]`)?.focus());
  };

  const navButton = cn(buttonVariants({ variant: "outline" }), "h-7 w-7 bg-transparent p-0 text-muted-foreground hover:text-foreground");

  return (
    <div className={cn("p-3", className)} dir="rtl">
      <div className="relative flex items-center justify-center pb-3 pt-1">
        <button type="button" className={cn(navButton, "absolute right-1")} onClick={() => setMonth(addMonths(month, -1))} aria-label="ماه قبل">
          <ChevronRight className="h-4 w-4" />
        </button>
        <div className="text-sm font-medium" aria-live="polite">
          {format(month, "MMMM")} {fa(Number(format(month, "yyyy")))}
        </div>
        <button type="button" className={cn(navButton, "absolute left-1")} onClick={() => setMonth(addMonths(month, 1))} aria-label="ماه بعد">
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <div ref={gridRef} role="grid" aria-label={faDigits(format(month, "MMMM yyyy"))}>
        <div role="row" className="flex">
          {WEEKDAYS.map((w) => (
            <div key={w} role="columnheader" className="w-9 text-center text-[0.8rem] font-normal text-muted-foreground">
              {w}
            </div>
          ))}
        </div>
        {Array.from({ length: days.length / 7 }, (_, row) => (
          <div key={row} role="row" className="mt-2 flex w-full">
            {days.slice(row * 7, row * 7 + 7).map((date) => {
              const outside = !isSameMonth(date, month);
              const isSelected = !!selected && isSameDay(date, selected);
              const isDisabled = matches(disabled, date);
              const active = Object.keys(modifiers ?? {}).filter((name) => matches(modifiers![name], date));
              if (outside && !showOutsideDays) return <div key={date.toISOString()} className="h-9 w-9" role="gridcell" />;
              return (
                <div key={date.toISOString()} role="gridcell" className="h-9 w-9 p-0 text-center text-sm">
                  <button
                    type="button"
                    data-day={date.toDateString()}
                    tabIndex={isSameDay(date, focusTarget) ? 0 : -1}
                    disabled={isDisabled}
                    aria-selected={isSelected}
                    aria-label={faDigits(format(date, "EEEE d MMMM yyyy"))}
                    onClick={() => onSelect?.(isSelected ? undefined : date)}
                    onKeyDown={(e) => onKeyDown(e, date)}
                    style={Object.assign({}, ...active.map((name) => modifiersStyles?.[name] ?? {}))}
                    className={cn(
                      buttonVariants({ variant: "ghost" }),
                      "h-9 w-9 p-0 font-normal",
                      isSameDay(date, today) && !isSelected && "bg-accent text-accent-foreground",
                      isSelected && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                      outside && "text-muted-foreground opacity-50",
                      isDisabled && "text-muted-foreground opacity-50",
                      active.map((name) => modifiersClassNames?.[name]),
                    )}
                  >
                    {fa(Number(format(date, "d")))}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
