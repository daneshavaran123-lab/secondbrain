import * as React from "react";
import { CalendarDays, X } from "lucide-react";
import { format as formatGregorian, isValid, parse } from "date-fns";
import { format } from "date-fns-jalali";

import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TimeInput } from "@/components/ui/time-input";

/**
 * What <Input type="date"> and <Input type="datetime-local"> render: the date is shown and
 * picked on the Jalali calendar, while the value stays the browser's Gregorian string
 * (yyyy-MM-dd, or yyyy-MM-ddTHH:mm), so forms, react-hook-form and stored data are unchanged.
 */
type Props = React.ComponentProps<"input"> & { type: "date" | "datetime-local" };

const PATTERN = { date: "yyyy-MM-dd", "datetime-local": "yyyy-MM-dd'T'HH:mm" } as const;
const fa = (s: string) => s.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);

const parseValue = (value: string, type: Props["type"]) => {
  if (!value) return undefined;
  const date = parse(value.slice(0, type === "date" ? 10 : 16), PATTERN[type], new Date());
  return isValid(date) ? date : undefined;
};

export const JalaliDateInput = React.forwardRef<HTMLInputElement, Props>(
  ({ type, value, defaultValue, onChange, onBlur, name, id, min, max, required, disabled, placeholder, className, ...rest }, ref) => {
    const controlled = value !== undefined;
    const [inner, setInner] = React.useState(String(defaultValue ?? ""));
    const current = controlled ? String(value ?? "") : inner;
    const [open, setOpen] = React.useState(false);
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    const hiddenEl = React.useRef<HTMLInputElement | null>(null);

    // react-hook-form's register() writes defaults and resets straight to the element's value;
    // the hidden input reports those writes so the visible field follows them.
    const hiddenRef = React.useCallback(
      (el: HTMLInputElement | null) => {
        hiddenEl.current = el;
        if (el) {
          const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!;
          Object.defineProperty(el, "value", {
            configurable: true,
            get: () => native.get!.call(el),
            set: (v: string) => {
              native.set!.call(el, v);
              setInner(v ?? "");
            },
          });
          Object.defineProperty(el, "focus", { configurable: true, value: () => triggerRef.current?.focus() });
        }
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      },
      [ref],
    );

    const emit = (next: string) => {
      setInner(next);
      // react-hook-form reads the registered element, so it must hold the new value first
      const el = hiddenEl.current;
      if (el) Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, next);
      const target = el ?? { value: next, name: name ?? "", id: id ?? "" };
      onChange?.({ target, currentTarget: target } as unknown as React.ChangeEvent<HTMLInputElement>);
    };

    const date = parseValue(current, type);
    const time = type === "datetime-local" ? current.slice(11, 16) || "09:00" : "";
    const outOfRange = (day: Date) => {
      const ymd = formatGregorian(day, "yyyy-MM-dd");
      return (!!min && ymd < String(min).slice(0, 10)) || (!!max && ymd > String(max).slice(0, 10));
    };

    const pick = (day: Date | undefined) => {
      if (!day) return;
      const ymd = formatGregorian(day, "yyyy-MM-dd");
      emit(type === "date" ? ymd : `${ymd}T${time}`);
      if (type === "date") setOpen(false);
    };

    const label = date ? fa(format(date, type === "date" ? "EEEE d MMMM yyyy" : "d MMMM yyyy، HH:mm")) : "";

    return (
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) onBlur?.({ target: { name, value: current } } as never); }}>
        <div className="relative w-full">
          <PopoverTrigger asChild>
            <button
              ref={triggerRef}
              type="button"
              id={id}
              disabled={disabled}
              aria-haspopup="dialog"
              aria-required={required || undefined}
              aria-label={rest["aria-label"]}
              className={cn(
                "flex h-10 w-full items-center gap-2 rounded-md border border-input bg-card px-3 py-2 text-start text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
                className,
              )}
            >
              <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className={cn("min-w-0 flex-1 truncate", !label && "text-muted-foreground")}>
                {label || placeholder || "انتخاب تاریخ"}
              </span>
            </button>
          </PopoverTrigger>
          {current && !required && !disabled && (
            <button
              type="button"
              onClick={() => emit("")}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="پاک کردن تاریخ"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <input
            ref={hiddenRef}
            type="text"
            tabIndex={-1}
            aria-hidden
            className="sr-only"
            name={name}
            value={current}
            required={required}
            disabled={disabled}
            onChange={() => undefined}
          />
        </div>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            defaultMonth={date}
            onSelect={pick}
            disabled={outOfRange}
            initialFocus
          />
          <div className="flex items-center gap-2 border-t border-border p-2">
            {type === "datetime-local" && (
              <TimeInput
                aria-label="ساعت"
                required
                value={time}
                onChange={(e) => emit(`${formatGregorian(date ?? new Date(), "yyyy-MM-dd")}T${e.target.value || "09:00"}`)}
                className="h-9 w-auto"
              />
            )}
            <button
              type="button"
              className="ms-auto rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => pick(new Date())}
            >
              امروز
            </button>
          </div>
        </PopoverContent>
      </Popover>
    );
  },
);
JalaliDateInput.displayName = "JalaliDateInput";
