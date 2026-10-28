import React, { useState, useEffect } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Heart, BookOpen, Calendar, Settings, Users, Building2, Briefcase, TrendingUp, Brain, UserCheck, Scale, Zap, Globe, User, Phone, MessageSquare, FileText, Target, BarChart3, Activity, Home, ChevronLeft, Lightbulb, UserPlus, ClipboardList, Bot, Shield, Leaf, GraduationCap, CheckSquare, Mail } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import SettingsModal from "@/components/SettingsModal";
import HelpModal from "@/components/HelpModal";
import { PersianNumber } from "@/components/ui/persian-number";
import type { DomainType } from "@/types";
import { useUserOrganizations } from '@/services/organizationService';
import { useIsMobile } from "@/hooks/use-mobile";
import { useResponsiveBreakpoints } from "@/hooks/useResponsiveBreakpoints";
import { getSidebarStats, getCurrentUser, type SidebarStats } from '@/services/sidebarStatsService';
import { companiesService, type BusinessCompany } from '@/services/companiesService';
import { cn } from "@/lib/utils";
import { BrandMark, Wordmark } from "@/components/brand/BrandMark";
import { buildNavigation, type MenuItem } from "@/config/navigation";
interface DomainSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}



const DomainSidebar: React.FC<DomainSidebarProps> = ({
  isOpen,
  onToggle
}) => {
  const isMobile = useIsMobile();
  const { isDesktop } = useResponsiveBreakpoints();
  const [selectedDomain, setSelectedDomain] = useState<DomainType>('personal');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [openCategories, setOpenCategories] = useState<string[]>([]);
  const [stats, setStats] = useState<SidebarStats | null>(null);
  const [currentUser, setCurrentUser] = useState<{displayName: string; role: string; avatarUrl: string | null} | null>(null);
  const [userCompanies, setUserCompanies] = useState<BusinessCompany[]>([]);
  const location = useLocation();
  const { userOrganizations } = useUserOrganizations();

  // Generate dynamic organization menu items from user's organizations
  const organizationMenuItems: MenuItem[] = userOrganizations.map((org, index) => {
    const icons = [Activity, Building2, UserCheck, Globe, Heart];

    return {
      id: `org-${org.organization_id}`,
      label: org.position_title 
        ? `${org.organization_name} (${org.position_title})`
        : org.organization_name,
      icon: icons[index % icons.length],
      path: `/organization/${org.organization_id}`,
      organization: org.organization_name
    };
  });

  // Generate dynamic company menu items from user's companies
  const mainCompany = companiesService.getMainCompany();
  const sortedCompanies = [...userCompanies].sort((a, b) => {
    if (a.id === mainCompany?.id) return -1;
    if (b.id === mainCompany?.id) return 1;
    return a.company_name.localeCompare(b.company_name, 'fa');
  });

  const companyMenuItems: MenuItem[] = sortedCompanies.map((company) => ({
    id: `company-${company.id}`,
    label: company.id === mainCompany?.id 
      ? `⭐ ${company.company_name}`
      : company.company_name,
    icon: Building2,
    path: `/company/${company.id}`,
    count: undefined
  }));

  const domains = buildNavigation({ stats, companyItems: companyMenuItems, organizationItems: organizationMenuItems });
  const isActivePath = (path: string) => location.pathname === path;
  // A menu item is active when its path matches and so do the query values it names
  // (/calendar?domain=professional is not the personal calendar; no domain means personal)
  const isItemActive = (itemPath: string) => {
    const [path, query] = itemPath.split('?');
    if (path !== location.pathname) return false;
    const want = new URLSearchParams(query || '');
    const have = new URLSearchParams(location.search);
    const value = (k: string) => have.get(k) ?? (k === 'domain' ? 'personal' : null);
    if (![...want.keys()].length) return (value('domain') === 'personal') && !have.get('tab');
    return [...want.entries()].every(([k, v]) => value(k) === v);
  };

  // The domain the current page belongs to, or null when it belongs to none (profile, settings…)
  const getCurrentDomain = (): DomainType | null => {
    const currentPath = location.pathname;
    const domainParam = new URLSearchParams(location.search).get('domain');
    if (domainParam && domains.some((d) => d.id === domainParam)) return domainParam as DomainType;
    const items = (d: typeof domains[number]) => d.categories.flatMap((cat) => cat.items);
    const exact = domains.find((d) => items(d).some((item) => isItemActive(item.path)));
    if (exact) return exact.id;
    const byPath = domains.find((d) => items(d).some((item) => item.path.split('?')[0] === currentPath));
    if (byPath) return byPath.id;
    if (/^\/(organizational\/khadim-e-khalgh|csr-project)/.test(currentPath)) return 'social';
    if (/^\/(organization|organizations)(\/|$)|^\/my-organizations/.test(currentPath)) return 'organizational';
    if (/^\/compan(y|ies)(\/|$)/.test(currentPath)) return 'professional';
    return null;
  };

  const getActiveCategoryForDomain = (domainId: DomainType): string | null => {
    const domain = domains.find(d => d.id === domainId);
    if (!domain) return null;
    for (const category of domain.categories) {
      if (category.items.some((item) => isItemActive(item.path))) return category.id;
    }
    for (const category of domain.categories) {
      if (category.items.some((item) => item.path.split('?')[0] === location.pathname)) return category.id;
    }
    return null;
  };

  const currentDomain = getCurrentDomain();

  // Follow the page: opening a professional page shows the professional menu
  useEffect(() => {
    if (currentDomain) setSelectedDomain(currentDomain);
  }, [currentDomain]);

  // Load stats and user data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [statsData, userData] = await Promise.all([
          getSidebarStats(),
          getCurrentUser()
        ]);
        setStats(statsData);
        setCurrentUser(userData);
      } catch (error) {
        console.error('Error loading sidebar data:', error);
      }
    };

    loadData();
  }, []);

  // Load user companies
  useEffect(() => {
    const loadCompanies = async () => {
      try {
        const companies = await companiesService.getUserCompanies();
        setUserCompanies(companies);
      } catch (error) {
        console.error('Error loading companies:', error);
      }
    };

    if (currentUser) {
      loadCompanies();
    }
  }, [currentUser]);

  // Listen for companies updates
  useEffect(() => {
    const handleCompaniesUpdate = async () => {
      try {
        const companies = await companiesService.getUserCompanies();
        setUserCompanies(companies);
      } catch (error) {
        console.error('Error refreshing companies:', error);
      }
    };

    window.addEventListener('companies-updated', handleCompaniesUpdate);
    
    return () => {
      window.removeEventListener('companies-updated', handleCompaniesUpdate);
    };
  }, []);

  // Load saved open categories from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('sidebar-open-categories');
    
    if (saved) {
      try {
        setOpenCategories(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse saved categories:', e);
      }
    }
  }, []);

  // Auto-open category containing active route
  useEffect(() => {
    const activeCategory = getActiveCategoryForDomain(selectedDomain);
    if (activeCategory && !openCategories.includes(activeCategory)) {
      const newOpenCategories = [...openCategories, activeCategory];
      setOpenCategories(newOpenCategories);
      localStorage.setItem('sidebar-open-categories', JSON.stringify(newOpenCategories));
    }
  }, [selectedDomain, location.pathname, openCategories]);

  const handleCategoryToggle = (categoryId: string) => {
    const newOpenCategories = openCategories.includes(categoryId)
      ? openCategories.filter(id => id !== categoryId)
      : [...openCategories, categoryId];

    setOpenCategories(newOpenCategories);
    localStorage.setItem('sidebar-open-categories', JSON.stringify(newOpenCategories));
  };
  return (
    <div className={cn(
      "fixed top-0 right-0 h-full",
      "bg-sidebar border-l border-sidebar-border",
      "transition-[width,transform,opacity] duration-200 ease-out flex flex-col",
      "touch-manipulation overflow-hidden",
      !isDesktop
        ? cn(
            'w-[280px] max-w-[85vw] z-50',
            isOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none opacity-0'
          )
        : (isOpen ? 'w-72 z-40' : 'w-16 z-40')
    )} dir="rtl">

      {/* Header */}
      <div className={cn(
        "flex items-center justify-between sidebar-header-glass",
        !isDesktop ? "p-3 h-14" : "p-4 h-16"
      )}>
        {isOpen ? (
          <NavLink to="/" className="mr-1 rounded-md" aria-label="مغز دوم من، داشبورد">
            <Wordmark size={17} />
          </NavLink>
        ) : (
          <button
            onClick={onToggle}
            className="mx-auto flex h-9 w-9 items-center justify-center rounded-md text-foreground hover:bg-sidebar-accent"
            aria-label="باز کردن منو"
            title="باز کردن منو"
          >
            <BrandMark size={22} />
          </button>
        )}
        {isOpen && (
          <button
            onClick={onToggle}
            className="sidebar-toggle-btn"
            aria-label={isDesktop ? 'جمع کردن منو' : 'بستن منو'}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Domain Tabs */}
      {isOpen && (
        <div className="px-2.5 pb-2">
          <div className="flex gap-1 rounded-lg bg-sidebar-accent/70 p-1">
            {domains.map(domain => (
              <button
                key={domain.id}
                onClick={() => setSelectedDomain(domain.id)}
                className={cn(
                  "domain-tab",
                  selectedDomain === domain.id && "active"
                )}
              >
                <domain.icon className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{domain.title.replace('حوزه ', '')}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 py-2">
        {/* Home Button */}
        <div className="px-2 mb-1">
          <NavLink
            to="/"
            className={({ isActive }) => cn(
              "nav-item",
              isActive && "active"
            )}
          >
            <Home className="h-4 w-4 flex-shrink-0" />
            {isOpen && <span className="flex-1">داشبورد</span>}
          </NavLink>
        </div>

        {/* Selected Domain Section */}
        {isOpen && (() => {
          const currentDomainData = domains.find(domain => domain.id === selectedDomain);
          if (!currentDomainData) return null;
          return (
            <div className="mb-2 px-2">
              <div className="category-header mb-1">
                {currentDomainData.title}
              </div>

              <Accordion
                type="multiple"
                value={openCategories.filter(cat => currentDomainData.categories.some(c => c.id === cat))}
                className="space-y-0.5"
              >
                {currentDomainData.categories.map(category => (
                  <AccordionItem key={category.id} value={category.id} className="border-none">
                    <AccordionTrigger
                      className={cn(
                        "accordion-trigger-refined hover:no-underline py-2",
                        "[&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:text-muted-foreground"
                      )}
                      onClick={() => handleCategoryToggle(category.id)}
                    >
                      {category.title}
                    </AccordionTrigger>
                    <AccordionContent className="pb-1 pt-0.5">
                      <div className="space-y-0.5 pr-2 border-r border-sidebar-border mr-3">
                        {category.items.map(item => (
                          <Link
                            key={item.id}
                            to={item.path}
                            className={cn("nav-item text-[13px] py-1.5", isItemActive(item.path) && "active")}
                            aria-current={isItemActive(item.path) ? 'page' : undefined}
                          >
                            <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="flex-1 text-right">{item.label}</span>
                            {item.count !== undefined && item.count > 0 && (
                              <span className="badge-count">
                                <PersianNumber>{item.count}</PersianNumber>
                              </span>
                            )}
                          </Link>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          );
        })()}

        {/* Compact Navigation for Collapsed State */}
        {!isOpen && (
          <div className="space-y-1 px-2">
            {domains.flatMap(domain => domain.categories.flatMap(cat => cat.items)).slice(0, 12).map(item => (
              <NavLink
                key={item.id}
                to={item.path}
                className={({ isActive }) => cn(
                  "flex items-center justify-center rounded-md p-2 transition-colors text-muted-foreground",
                  isActive
                    ? "bg-sidebar-accent text-foreground"
                    : "hover:bg-sidebar-accent/70 hover:text-foreground"
                )}
                title={item.label}
                aria-label={item.label}
              >
                <item.icon className="h-4 w-4" />
              </NavLink>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-2">
        <NavLink
          to="/assistant-reports"
          className={({ isActive }) => cn(
            "nav-item",
            isActive && "active",
            !isOpen && "justify-center px-2"
          )}
          title="گزارش‌های دستیار"
        >
          <BarChart3 className="h-4 w-4 flex-shrink-0" />
          {isOpen && <span className="flex-1">گزارش‌های دستیار</span>}
        </NavLink>
      </div>

      {/* Modals */}
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </div>
  );
};
export default DomainSidebar;