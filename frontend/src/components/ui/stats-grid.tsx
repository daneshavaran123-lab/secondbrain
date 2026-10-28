import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ProgressRing } from "./progress-ring";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  description?: string;
  progress?: number;
  trend?: "up" | "down" | "neutral";
  color?: "primary" | "medical" | "tech" | "accent";
  className?: string;
}

export function StatCard({
  title,
  value,
  icon,
  description,
  progress,
  trend,
  color = "primary",
  className
}: StatCardProps) {
  const colorClasses = {
    primary: "bg-primary/10 border-primary/20",
    medical: "bg-medical-blue/10 border-medical-blue/20", 
    tech: "bg-tech-cyan/10 border-tech-cyan/20",
    accent: "bg-accent/10 border-accent/20"
  };

  const iconColorClasses = {
    primary: "bg-gradient-primary",
    medical: "bg-gradient-medical",
    tech: "bg-tech-cyan",
    accent: "bg-accent"
  };

  return (
    <div className={cn(
      "relative p-6 rounded-2xl border glass-card",
      "bg-gradient-to-br",
      colorClasses[color],
      "hover-lift transition-elegant group",
      className
    )}>
      {/* Icon */}
      <div className={cn(
        "w-12 h-12 rounded-xl flex items-center justify-center mb-4",
        "text-white shadow-elegant group-hover:scale-110 transition-transform",
        iconColorClasses[color]
      )}>
        {icon}
      </div>
      
      {/* Content */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </h3>
        
        <div className="flex items-center gap-3">
          <span className="text-3xl font-bold font-futuristic text-foreground">
            {value}
          </span>
          
          {progress !== undefined && (
            <ProgressRing 
              progress={progress} 
              size={32}
              strokeWidth={3}
              className="text-primary"
            />
          )}
        </div>
        
        {description && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {description}
          </p>
        )}
        
        {/* Trend Indicator */}
        {trend && (
          <div className={cn(
            "inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full",
            trend === "up" && "bg-green-100 text-green-700",
            trend === "down" && "bg-red-100 text-red-700",
            trend === "neutral" && "bg-gray-100 text-gray-700"
          )}>
            {trend === "up" && "↗"}
            {trend === "down" && "↘"}
            {trend === "neutral" && "→"}
            <span className="ml-1">
              {trend === "up" && "بهبود"}
              {trend === "down" && "کاهش"}
              {trend === "neutral" && "ثابت"}
            </span>
          </div>
        )}
      </div>
      
      {/* Decorative Element */}
      <div className="absolute top-0 right-0 w-20 h-20 bg-white/5 rounded-bl-3xl" />
    </div>
  );
}

interface StatsGridProps {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}

export function StatsGrid({ 
  children, 
  columns = 3,
  className 
}: StatsGridProps) {
  const gridClasses = {
    2: "grid-cols-1 md:grid-cols-2",
    3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
  };

  return (
    <div className={cn(
      "grid gap-6",
      gridClasses[columns],
      className
    )}>
      {children}
    </div>
  );
}