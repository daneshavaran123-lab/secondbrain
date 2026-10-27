import type React from "react";
import { Heart, BookOpen, Calendar, Users, Building2, Briefcase, Brain, Scale, Zap, User, MessageSquare, FileText, Target, BarChart3, Activity, Lightbulb, UserPlus, ClipboardList, Bot, Shield, Leaf, GraduationCap, CheckSquare, Mail } from "lucide-react";
import type { DomainType } from "@/types";
import type { SidebarStats } from "@/services/sidebarStatsService";

export interface MenuItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  count?: number;
  organization?: string;
}

export interface CategorySection {
  id: string;
  title: string;
  items: MenuItem[];
}

export interface DomainSection {
  id: DomainType;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  categories: CategorySection[];
}

interface NavigationInput {
  stats?: SidebarStats | null;
  companyItems?: MenuItem[];
  organizationItems?: MenuItem[];
}

/** Every destination of the app, grouped by domain. The sidebar and the command palette both read it. */
export function buildNavigation({ stats, companyItems = [], organizationItems = [] }: NavigationInput = {}): DomainSection[] {
  return [{
  id: 'personal',
  title: 'حوزه فردی',
  icon: User,
  color: 'text-emerald-600',
  bgColor: 'bg-emerald-50',
  categories: [{
    id: 'personal-planning',
    title: 'برنامه‌ریزی',
    items: [{
      id: 'ideas-personal',
      label: 'ایده‌های شخصی',
      icon: Lightbulb,
      path: '/ideas?domain=personal',
      count: stats?.personalIdeas
    }, {
      id: 'calendar',
      label: 'تقویم شخصی',
      icon: Calendar,
      path: '/calendar'
    }, {
      id: 'personal-planning',
      label: 'برنامه‌ریزی فردی',
      icon: ClipboardList,
      path: '/personal-planning',
      count: stats?.personalPlanning
    }, {
      id: 'habit-tracker',
      label: 'عادت‌سازی',
      icon: CheckSquare,
      path: '/habits'
    }, {
      id: 'delegation-personal',
      label: 'واگذاری وظایف',
      icon: UserPlus,
      path: '/delegation?domain=personal'
    }]
  }, {
    id: 'personal-learning',
    title: 'یادگیری',
    items: [{
      id: 'cultural-content',
      label: 'مدیریت محتوای فرهنگی',
      icon: BookOpen,
      path: '/cultural-content'
    }]
  }, {
    id: 'personal-health',
    title: 'سلامت',
    items: [{
      id: 'health',
      label: 'سلامت',
      icon: Activity,
      path: '/health',
      count: stats?.personalHealth
    }]
  }, {
    id: 'personal-spiritual',
    title: 'معنوی',
    items: [{
      id: 'gratitude-journal',
      label: 'دفتر شکرگذاری',
      icon: Heart,
      path: '/gratitude-journal'
    }, {
      id: 'journal',
      label: 'دل‌نوشته‌ها',
      icon: BookOpen,
      path: '/personal-journal',
      count: stats?.personalJournal
    }]
  }, {
    id: 'personal-tools',
    title: 'ابزارها',
    items: [{
      id: 'gadgets',
      label: 'ابزارهای کاربردی',
      icon: Zap,
      path: '/gadgets'
    }, {
      id: 'ai-chat',
      label: 'چت با AI',
      icon: Bot,
      path: '/ai-chat'
    }]
  }]
}, {
  id: 'professional',
  title: 'حوزه حرفه‌ای',
  icon: Briefcase,
  color: 'text-blue-600',
  bgColor: 'bg-blue-50',
  categories: [{
    id: 'professional-profile',
    title: 'پروفایل',
    items: [{
      id: 'resume',
      label: 'رزومه حرفه‌ای',
      icon: FileText,
      path: '/resume'
    }]
  }, {
    id: 'professional-planning',
    title: 'برنامه‌ریزی',
    items: [{
      id: 'professional-planning',
      label: 'برنامه‌ریزی حرفه‌ای',
      icon: Briefcase,
      path: '/professional-planning',
      count: stats?.professionalPlanning
    }, {
      id: 'calendar-professional',
      label: 'تقویم حرفه‌ای',
      icon: Calendar,
      path: '/calendar?domain=professional'
    }, {
      id: 'delegation-professional',
      label: 'واگذاری وظایف',
      icon: UserPlus,
      path: '/delegation?domain=professional'
    }]
  }, {
    id: 'professional-meetings',
    title: 'جلسات',
    items: [{
      id: 'meetings',
      label: 'جلسات',
      icon: Users,
      path: '/meetings',
      count: stats?.professionalMeetings
    }, {
      id: 'meeting-preparation',
      label: 'آمادگی قبل از جلسه',
      icon: Lightbulb,
      path: '/meetings/preparation'
    }, {
      id: 'projects',
      label: 'پروژه‌ها',
      icon: BarChart3,
      path: '/projects',
      count: stats?.professionalProjects
    }]
  }, {
  id: 'professional-companies',
    title: 'شرکت‌ها و کسب‌وکارها',
    items: [
      {
        id: 'companies-management',
        label: '➕ مدیریت شرکت‌ها',
        icon: Building2,
        path: '/companies',
        count: stats?.companies
      },
      ...(companyItems.length > 0
        ? companyItems 
        : [{
            id: 'no-companies',
            label: 'شرکتی ثبت نشده',
            icon: Building2,
            path: '/companies',
            count: undefined
          }]
      )
    ]
  }, {
    id: 'professional-knowledge',
    title: 'دانش',
    items: [{
      id: 'ideas-professional',
      label: 'ایده‌های حرفه‌ای',
      icon: Lightbulb,
      path: '/ideas?domain=professional',
      count: stats?.professionalIdeas
    }, {
      id: 'knowledge',
      label: 'دانش',
      icon: Brain,
      path: '/knowledge',
      count: stats?.knowledge
    }]
  }, {
    id: 'professional-legal',
    title: 'حقوقی',
    items: [{
      id: 'legal',
      label: 'امور حقوقی',
      icon: Scale,
      path: '/legal',
      count: stats?.legal
    }]
  }]
}, {
  id: 'organizational',
  title: 'حوزه سازمانی',
  icon: Building2,
  color: 'text-purple-600',
  bgColor: 'bg-purple-50',
  categories: [{
    id: 'organizational-ideas-planning',
    title: 'ایده‌ها و برنامه‌ریزی',
    items: [{
      id: 'ideas-organizational',
      label: 'ایده‌های سازمانی',
      icon: Lightbulb,
      path: '/ideas?domain=organizational',
      count: stats?.organizationalIdeas
    }, {
      id: 'organizational-planning',
      label: 'برنامه‌ریزی سازمانی',
      icon: Target,
      path: '/organizational-planning',
      count: stats?.organizationalPlanning
    }, {
      id: 'calendar-organizational',
      label: 'تقویم سازمانی',
      icon: Calendar,
      path: '/calendar?domain=organizational'
    }, {
      id: 'delegation-organizational',
      label: 'واگذاری وظایف',
      icon: UserPlus,
      path: '/delegation?domain=organizational'
    }]
  }, {
    id: 'organizational-correspondence',
    title: 'مکاتبات',
    items: [{
      id: 'organizational-letters',
      label: 'نامه‌ها و بخشنامه‌ها',
      icon: Mail,
      path: '/organizational-letters'
    }]
  }, {
    id: 'organizational-organizations',
    title: 'سمت‌ها (سازمان‌ها/انجمن‌ها)',
    items: [
      ...((() => {
        try {
          const stored = localStorage.getItem('main_organization');
          if (stored) {
            const mainOrg = JSON.parse(stored);
            return [{
              id: 'main-organization',
              label: `📍 ${mainOrg.name}`,
              icon: Building2,
              path: '/my-organizations',
              count: undefined
            }];
          }
        } catch (e) {
          console.error('Error loading main organization:', e);
        }
        return [];
      })()),
      ...organizationItems,
      {
        id: 'all-organizations',
        label: 'همه سازمان‌ها',
        icon: Building2,
        path: '/my-organizations',
        count: organizationItems.length
      }
    ]
  }, {
    id: 'organizational-communication',
    title: 'ارتباطات',
    items: [{
      id: 'social',
      label: 'رسانه‌های اجتماعی',
      icon: MessageSquare,
      path: '/social-media'
    }]
  }]
}, {
  id: 'social',
  title: 'حوزه اجتماعی',
  icon: Users,
  color: 'text-pink-600',
  bgColor: 'bg-pink-50',
  categories: [{
    id: 'social-khadim',
    title: 'خدمات اجتماعی',
    items: [{
      id: 'khadim-e-khalgh',
      label: 'خادم خلق',
      icon: Heart,
      path: '/organizational/khadim-e-khalgh'
    }]
  }, {
    id: 'social-responsibility',
    title: 'مسئولیت‌های اجتماعی',
    items: [{
      id: 'csr-projects',
      label: 'پروژه‌های CSR',
      icon: Shield,
      path: '/social-responsibility',
      count: stats?.csrProjects
    }, {
      id: 'charity-activities',
      label: 'فعالیت‌های خیریه',
      icon: Heart,
      path: '/social-responsibility?tab=charity'
    }, {
      id: 'environment',
      label: 'محیط زیست',
      icon: Leaf,
      path: '/social-responsibility?tab=environment'
    }, {
      id: 'community-education',
      label: 'آموزش جامعه',
      icon: GraduationCap,
      path: '/social-responsibility?tab=education'
    }, {
      id: 'csr-reporting',
      label: 'گزارش‌دهی CSR',
      icon: FileText,
      path: '/social-responsibility?tab=reports'
    }]
  }]
}];
}
