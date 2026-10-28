import { motion } from 'framer-motion';
import { UserPlus, FolderPlus, Calendar, Bell, FileText, Settings } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const actions = [
  {
    icon: UserPlus,
    label: 'دعوت اعضا',
    description: 'افزودن اعضای جدید',
    gradient: 'bg-blue-500',
    bgColor: 'bg-blue-50',
  },
  {
    icon: FolderPlus,
    label: 'پروژه جدید',
    description: 'ایجاد پروژه',
    gradient: 'bg-purple-500',
    bgColor: 'bg-purple-50',
  },
  {
    icon: Calendar,
    label: 'جلسه جدید',
    description: 'برگزاری جلسه',
    gradient: 'bg-emerald-500',
    bgColor: 'bg-emerald-50',
  },
  {
    icon: Bell,
    label: 'اعلان عمومی',
    description: 'ارسال پیام',
    gradient: 'bg-orange-500',
    bgColor: 'bg-orange-50',
  },
  {
    icon: FileText,
    label: 'گزارش‌گیری',
    description: 'مشاهده گزارش‌ها',
    gradient: 'bg-rose-500',
    bgColor: 'bg-rose-50',
  },
  {
    icon: Settings,
    label: 'تنظیمات سریع',
    description: 'مدیریت سازمان',
    gradient: 'bg-slate-500',
    bgColor: 'bg-slate-50',
  },
];

export function OrganizationQuickActions() {
  return (
    <div className="mb-8">
      <h2 className="text-xl font-bold mb-4">عملیات سریع</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {actions.map((action, index) => {
          const Icon = action.icon;
          return (
            <motion.div
              key={action.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              whileHover={{ scale: 1.05, y: -5 }}
              whileTap={{ scale: 0.95 }}
            >
              <Card className="cursor-pointer hover:shadow-lg transition duration-300 border-0 bg-card overflow-hidden group">
                <CardContent className="p-4 text-center">
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${action.gradient} flex items-center justify-center mx-auto mb-3 shadow-lg group-hover:shadow-xl transition-shadow duration-300`}>
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="font-semibold text-sm mb-1">{action.label}</h3>
                  <p className="text-xs text-muted-foreground">{action.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
