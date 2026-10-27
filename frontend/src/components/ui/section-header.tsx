import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  gradient?: boolean;
}

export function SectionHeader({
  title,
  subtitle,
  icon,
  action,
  className,
  gradient = false
}: SectionHeaderProps) {
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-center justify-between mb-6 md:mb-8 gap-4", className)}>
      <div className="flex items-center gap-3">
        {icon && (
          <div className="flex-shrink-0 text-muted-foreground [&_svg]:h-5 [&_svg]:w-5" aria-hidden="true">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h1 className={cn(
            "text-xl md:text-2xl font-bold truncate",
            gradient && "heading-primary"
          )}>
            {title}
          </h1>
          {subtitle && (
            <p className="text-muted-foreground text-sm">{subtitle}</p>
          )}
        </div>
      </div>
      {action && (
        <div className="flex gap-2 md:gap-3 flex-shrink-0">
          {action}
        </div>
      )}
    </div>
  );
}