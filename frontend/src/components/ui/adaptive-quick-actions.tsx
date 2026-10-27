import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useResponsiveBreakpoints } from '@/hooks/useResponsiveBreakpoints';
import { getTodaysFocus, type TodaysFocusItem } from '@/services/activityService';
import { 
  Calendar, 
  CheckSquare, 
  Lightbulb, 
  UserCheck, 
  Scale, 
  BookOpen,
  MessageCircle,
  FolderKanban
} from 'lucide-react';

export function AdaptiveQuickActions() {
  const { isMobile } = useResponsiveBreakpoints();
  const navigate = useNavigate();
  const [todaysFocus, setTodaysFocus] = useState<TodaysFocusItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchTodaysFocus = async () => {
      try {
        const focus = await getTodaysFocus();
        setTodaysFocus(focus);
      } catch (error) {
        console.error('Error fetching today\'s focus:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTodaysFocus();
  }, []);

  const quickActions = [
    {
      title: 'برنامه‌ریزی شخصی',
      icon: CheckSquare,
      route: '/personal-planning',
    },
    {
      title: 'برنامه‌ریزی سازمانی',
      icon: UserCheck,
      route: '/organizational-planning',
    },
    {
      title: 'مدیریت پروژه‌ها',
      icon: FolderKanban,
      route: '/projects',
    },
    {
      title: 'ایده‌ها',
      icon: Lightbulb,
      route: '/ideas',
    },
    {
      title: 'مسائل حقوقی',
      icon: Scale,
      route: '/legal',
    },
    {
      title: 'دانش‌بنیان',
      icon: BookOpen,
      route: '/knowledge',
    },
    {
      title: 'گفتگوی هوشمند',
      icon: MessageCircle,
      route: '/ai-chat',
    },
    {
      title: 'تقویم',
      icon: Calendar,
      route: '/calendar',
    }
  ];

  const [showAll, setShowAll] = useState(false);
  const visibleActions = isMobile && !showAll ? quickActions.slice(0, 4) : quickActions;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-card md:p-5">
        <h2 className="mb-3 text-sm font-semibold">دسترسی سریع</h2>
        <div className="grid grid-cols-2 gap-2">
          {visibleActions.map((action) => (
            <button
              key={action.route}
              onClick={() => navigate(action.route)}
              className="flex min-h-[44px] items-center gap-2.5 rounded-xl border border-border px-3 py-2.5 text-right transition-colors hover:bg-muted/60 active:scale-[0.98]"
            >
              <action.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 text-[13px] font-medium leading-5">{action.title}</span>
            </button>
          ))}
        </div>
        {isMobile && quickActions.length > 4 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="mt-2 w-full rounded-lg py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            {showAll ? 'کمتر' : 'نمایش همه'}
          </button>
        )}
      </section>

      {!isMobile && (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-card md:p-5">
          <h2 className="mb-3 text-sm font-semibold">تمرکز امروز</h2>
          {todaysFocus.length > 0 ? (
            <ul className="space-y-1">
              {todaysFocus.map((item) => (
                <li key={item.id} className="flex items-start gap-3 rounded-lg px-2 py-2">
                  <span className={cn(
                    'mt-2 h-1.5 w-1.5 shrink-0 rounded-full',
                    item.status === 'completed' ? 'bg-success' : item.status === 'in_progress' ? 'bg-warning' : 'bg-muted-foreground/50'
                  )} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-6">{item.title}</p>
                    {item.description && <p className="truncate text-xs text-muted-foreground">{item.description}</p>}
                  </div>
                  {item.time && <span className="shrink-0 text-xs text-muted-foreground">{item.time}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {isLoading ? 'در حال بارگذاری…' : 'برای امروز کاری ثبت نشده'}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
