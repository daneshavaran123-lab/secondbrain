import * as React from "react";
import { Clock, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * What <Input type="time"> renders: an hour and a minute picked from two lists in Persian digits
 * (the browser's own time field follows the browser's language, often «--:-- AM»). The value
 * stays the browser's HH:mm, so forms, react-hook-form and stored data are unchanged.
 */
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));
const fa = (s: string) => s.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);

const selectClass =
  "h-8 cursor-pointer appearance-none rounded bg-transparent px-1 text-center text-base outline-none hover:bg-accent disabled:cursor-not-allowed md:text-sm";

export const TimeInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ value, defaultValue, onChange, onBlur, name, id, required, disabled, className, ...rest }, ref) => {
    const controlled = value !== undefined;
    const [inner, setInner] = React.useState(String(defaultValue ?? ""));
    const current = controlled ? String(value ?? "") : inner;
    const hourRef = React.useRef<HTMLSelectElement>(null);
    const hiddenEl = React.useRef<HTMLInputElement | null>(null);

    // react-hook-form writes defaults and resets straight to the registered element's value
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
          Object.defineProperty(el, "focus", { configurable: true, value: () => hourRef.current?.focus() });
        }
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      },
      [ref],
    );

    const emit = (next: string) => {
      setInner(next);
      const el = hiddenEl.current;
      if (el) Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, next);
      const target = el ?? { value: next, name: name ?? "", id: id ?? "" };
      onChange?.({ target, currentTarget: target } as unknown as React.ChangeEvent<HTMLInputElement>);
    };
    const blur = () => {
      const target = hiddenEl.current ?? { value: current, name: name ?? "" };
      onBlur?.({ target, currentTarget: target } as unknown as React.FocusEvent<HTMLInputElement>);
    };

    const [hh, mm] = /^\d{2}:\d{2}/.test(current) ? current.slice(0, 5).split(":") : ["", ""];
    const minutes = mm && !MINUTES.includes(mm) ? [...MINUTES, mm].sort() : MINUTES;
    const label = rest["aria-label"] ?? "ساعت";

    return (
      <div
        dir="ltr"
        className={cn(
          "relative flex h-10 w-full items-center gap-0.5 rounded-md border border-input bg-card px-2 ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
          disabled && "opacity-50",
          className,
        )}
      >
        <Clock className="me-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <select
          ref={hourRef}
          id={id}
          aria-label={`${label}: ساعت`}
          value={hh}
          disabled={disabled}
          onBlur={blur}
          onChange={(e) => emit(e.target.value ? `${e.target.value}:${mm || "00"}` : "")}
          className={selectClass}
        >
          <option value="">--</option>
          {HOURS.map((h) => <option key={h} value={h}>{fa(h)}</option>)}
        </select>
        <span className="text-muted-foreground" aria-hidden>:</span>
        <select
          aria-label={`${label}: دقیقه`}
          value={mm}
          disabled={disabled}
          onBlur={blur}
          onChange={(e) => emit(e.target.value ? `${hh || "00"}:${e.target.value}` : "")}
          className={selectClass}
        >
          <option value="">--</option>
          {minutes.map((m) => <option key={m} value={m}>{fa(m)}</option>)}
        </select>
        {current && !required && !disabled && (
          <button
            type="button"
            onClick={() => emit("")}
            className="ms-auto rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="پاک کردن ساعت"
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
    );
  },
);
TimeInput.displayName = "TimeInput";
