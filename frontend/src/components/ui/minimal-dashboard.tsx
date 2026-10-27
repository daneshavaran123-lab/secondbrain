import React from 'react';
import { cn } from '@/lib/utils';
import { MinimalGreeting } from './minimal-greeting';
import { OverviewStrip, RecentActivityList } from './compact-control-center';
import { QuickLinks, TodayFocus } from './adaptive-quick-actions';
import { AskMoraCard } from '@/components/assistant/AskMoraCard';
import { Building2 } from 'lucide-react';

interface MinimalDashboardProps {
  className?: string;
  sidebarOpen?: boolean;
}

export function MinimalDashboard({ className }: MinimalDashboardProps) {
  return (
    <div className={cn('mx-auto w-full max-w-5xl space-y-7 md:py-2', className)}>
      <div className="space-y-5">
        <MinimalGreeting />
        <AskMoraCard />
      </div>
      <QuickAccessSection />
      <OverviewStrip />

      {/* Today leads; what happened and where to go sit beside it */}
      <div className="grid items-start gap-7 lg:grid-cols-3 lg:gap-6">
        <TodayFocus className="min-w-0 lg:col-span-2" />
        <div className="min-w-0 space-y-7 lg:space-y-6">
          <RecentActivityList />
          <QuickLinks />
        </div>
      </div>
    </div>
  );
}

// Shortcuts to the user's main company / organization, when set
function QuickAccessSection() {
  const read = (key: string) => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  };

  const mainCompany = read('main_company');
  const mainOrg = read('main_organization');

  if (!mainCompany && !mainOrg) return null;

  const links = [
    mainCompany && { href: '/companies', title: mainCompany.company_name, subtitle: 'شرکت اصلی' },
    mainOrg && { href: mainOrg.id ? `/organizations/${mainOrg.id}` : '/my-organizations', title: mainOrg.name, subtitle: 'سازمان اصلی' },
  ].filter(Boolean) as Array<{ href: string; title: string; subtitle: string }>;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-input"
        >
          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{link.title}</p>
            <p className="text-xs text-muted-foreground">{link.subtitle}</p>
          </div>
        </a>
      ))}
    </div>
  );
}
