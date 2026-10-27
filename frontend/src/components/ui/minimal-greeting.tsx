import React from 'react';
import { cn } from '@/lib/utils';
import { getTehranHour } from '@/lib/date-utils';
import { useAuth } from '@/contexts/AuthContext';
import { AnimatedSubtitle } from './animated-subtitle';

function greetingFor(hour: number) {
  if (hour >= 5 && hour < 12) return 'صبح بخیر';
  if (hour >= 12 && hour < 16) return 'ظهر بخیر';
  if (hour >= 16 && hour < 20) return 'عصر بخیر';
  return 'شب بخیر';
}

/** «سه‌شنبه ۵ آبان ۱۴۰۵» */
function todayLabel() {
  const parts = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return `${part('weekday')} ${part('day')} ${part('month')} ${part('year')}`;
}

export function MinimalGreeting({ className }: { className?: string }) {
  const { user } = useAuth();
  const name = user?.first_name || user?.display_name || '';

  return (
    <div className={cn('space-y-1.5', className)}>
      <p className="text-sm text-muted-foreground lg:hidden">{todayLabel()}</p>
      <h1 className="text-2xl font-bold md:text-3xl">
        {greetingFor(getTehranHour())}{name ? `، ${name}` : ''}
      </h1>
      <AnimatedSubtitle className="pt-1" />
    </div>
  );
}
