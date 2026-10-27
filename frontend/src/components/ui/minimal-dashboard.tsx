import React from 'react';
import { cn } from '@/lib/utils';
import { MinimalGreeting } from './minimal-greeting';
import { CompactControlCenter } from './compact-control-center';
import { AdaptiveQuickActions } from './adaptive-quick-actions';
import { AskMoraCard } from '@/components/assistant/AskMoraCard';
import { Building2 } from 'lucide-react';

interface MinimalDashboardProps {
  className?: string;
  sidebarOpen?: boolean;
}

export function MinimalDashboard({ className }: MinimalDashboardProps) {
  return (
    <div className={cn('page-enter mx-auto w-full max-w-5xl space-y-6 md:space-y-8 md:py-2', className)}>
      <MinimalGreeting />
      <AskMoraCard />
      <QuickAccessSection />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <CompactControlCenter />
        </div>
        <div className="min-w-0">
          <AdaptiveQuickActions />
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
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-muted/50"
        >
          <div className="rounded-lg bg-muted p-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{link.title}</p>
            <p className="text-xs text-muted-foreground">{link.subtitle}</p>
          </div>
        </a>
      ))}
    </div>
  );
}
