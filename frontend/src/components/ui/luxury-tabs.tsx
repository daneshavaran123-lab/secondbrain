import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs";
import { TabsListScrollable } from "./tabs-list-scrollable";
import { useIsMobile } from "@/hooks/use-mobile";

interface LuxuryTabItem {
  value: string;
  label: string;
  icon?: ReactNode;
  count?: number;
}

interface LuxuryTabsProps {
  items: LuxuryTabItem[];
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}

export function LuxuryTabs({
  items,
  value,
  onValueChange,
  children,
  className
}: LuxuryTabsProps) {
  const isMobile = useIsMobile();

  return (
    <Tabs value={value} onValueChange={onValueChange} className={className} dir="rtl">
      {isMobile ? (
        <TabsListScrollable 
          className="gap-1 h-auto p-1 bg-muted rounded-lg"
          dir="rtl"
        >
          {items.map((item) => (
            <TabsTrigger
              key={item.value}
              value={item.value}
              className={cn(
                "flex items-center gap-2 px-3.5 py-2 rounded-md transition-colors text-right whitespace-nowrap text-muted-foreground",
                "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-[0_0_0_1px_hsl(var(--border))]",
                "hover:text-foreground font-medium min-w-max"
              )}
              dir="rtl"
            >
              {item.icon && (
                <span className="text-current opacity-90 order-1">{item.icon}</span>
              )}
              <span className="order-2">{item.label}</span>
              {item.count !== undefined && (
                <span className={cn(
                  "px-2 py-1 rounded-full text-xs font-semibold order-3",
                  "bg-foreground/[0.07] text-current"
                )}>
                  {item.count}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsListScrollable>
      ) : (
        <TabsList 
          className="grid w-full gap-1 h-auto p-1 bg-muted rounded-lg"
          style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
          dir="rtl"
        >
          {items.map((item) => (
            <TabsTrigger
              key={item.value}
              value={item.value}
              className={cn(
                "flex items-center justify-center gap-2 px-4 py-2 rounded-md transition-colors text-right text-muted-foreground",
                "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-[0_0_0_1px_hsl(var(--border))]",
                "hover:text-foreground font-medium"
              )}
              dir="rtl"
            >
              {item.icon && (
                <span className="text-current opacity-90 order-1">{item.icon}</span>
              )}
              <span className="order-2">{item.label}</span>
              {item.count !== undefined && (
                <span className={cn(
                  "px-2 py-1 rounded-full text-xs font-semibold order-3",
                  "bg-foreground/[0.07] text-current"
                )}>
                  {item.count}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      )}
      <div dir="rtl">
        {children}
      </div>
    </Tabs>
  );
}