import React from 'react';
import { cn } from '@/lib/utils';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, CheckSquare, Briefcase, Calendar } from 'lucide-react';
import { askAssistant } from '@/lib/assistant';
import { MoraRobotIcon } from '@/components/assistant/MoraRobotIcon';

interface MobileOptimizedNavProps {
  className?: string;
}

const NAV_ITEMS = [
  { id: 'home', label: 'خانه', icon: Home, route: '/' },
  { id: 'personal', label: 'شخصی', icon: CheckSquare, route: '/personal-planning' },
  { id: 'professional', label: 'حرفه‌ای', icon: Briefcase, route: '/professional-planning' },
  { id: 'calendar', label: 'تقویم', icon: Calendar, route: '/calendar' },
];

export function MobileOptimizedNav({ className }: MobileOptimizedNavProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const renderItem = (item: (typeof NAV_ITEMS)[number]) => {
    const active = location.pathname === item.route;
    return (
      <button
        key={item.id}
        onClick={() => navigate(item.route)}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex flex-1 flex-col items-center gap-1 py-1.5 text-[11px] font-medium transition-colors',
          active ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        <item.icon className="h-5 w-5" strokeWidth={active ? 2.25 : 1.75} />
        {item.label}
      </button>
    );
  };

  return (
    <nav
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur',
        className
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center px-2 pt-1.5 pb-1">
        {NAV_ITEMS.slice(0, 2).map(renderItem)}
        <div className="flex flex-1 justify-center">
          <button
            onClick={() => {
              if ('vibrate' in navigator) navigator.vibrate(20);
              askAssistant();
            }}
            aria-label="گفتگو با مورا"
            className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-foreground text-background shadow-lg shadow-foreground/15 transition-transform active:scale-95"
          >
            <MoraRobotIcon size="sm" animate={false} />
          </button>
        </div>
        {NAV_ITEMS.slice(2).map(renderItem)}
      </div>
    </nav>
  );
}
