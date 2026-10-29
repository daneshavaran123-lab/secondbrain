import * as React from "react"

import { cn } from "@/lib/utils"
import { JalaliDateInput } from "@/components/ui/jalali-date-input"
import { TimeInput } from "@/components/ui/time-input"

const inputClass =
  "flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"

// The browser's own file picker speaks the browser's language («No file chosen»); this one speaks Persian
const FileInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, onChange, multiple, disabled, ...props }, ref) => {
    const [names, setNames] = React.useState<string[]>([])
    return (
      <label
        className={cn(
          inputClass,
          "cursor-pointer items-center gap-3 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
          disabled && "cursor-not-allowed opacity-50",
          className,
        )}
      >
        <span className="shrink-0 rounded bg-muted px-2.5 py-1 text-sm font-medium text-foreground">
          {multiple ? "انتخاب فایل‌ها" : "انتخاب فایل"}
        </span>
        <span className={cn("min-w-0 truncate", !names.length && "text-muted-foreground")}>
          {names.length === 0 ? "فایلی انتخاب نشده" : names.length === 1 ? names[0] : `${names.length.toLocaleString("fa-IR")} فایل`}
        </span>
        <input
          type="file"
          ref={ref}
          multiple={multiple}
          disabled={disabled}
          className="sr-only"
          onChange={(e) => {
            setNames(Array.from(e.target.files ?? []).map((f) => f.name))
            onChange?.(e)
          }}
          {...props}
        />
      </label>
    )
  }
)
FileInput.displayName = "FileInput"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    // Dates are picked on the Jalali calendar; the value keeps the browser's yyyy-MM-dd form
    if (type === "date" || type === "datetime-local") {
      return <JalaliDateInput ref={ref} type={type as "date" | "datetime-local"} className={className} {...props} />
    }
    if (type === "time") {
      return <TimeInput ref={ref} className={className} {...props} />
    }
    if (type === "file" && !/\b(hidden|sr-only)\b/.test(className ?? "")) {
      return <FileInput ref={ref} className={className} {...props} />
    }
    return (
      <input
        type={type}
        className={cn(inputClass, "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground", className)}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
