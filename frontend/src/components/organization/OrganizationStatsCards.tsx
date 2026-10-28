import { motion } from 'framer-motion';
import { Users, FolderKanban, CheckCircle, Clock, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { OrganizationStats } from '@/services/organizationStatsService';

interface OrganizationStatsCardsProps {
  stats: OrganizationStats;
}

export function OrganizationStatsCards({ stats }: OrganizationStatsCardsProps) {
  const statsData = [
    {
      title: 'کل اعضا',
      value: stats.totalMembers,
      icon: Users,
      gradient: 'bg-blue-500',
      bgGradient: 'bg-blue-50',
      change: '+12%',
      trend: 'up' as const,
    },
    {
      title: 'پروژه‌های فعال',
      value: stats.activeProjects,
      icon: FolderKanban,
      gradient: 'bg-purple-500',
      bgGradient: 'bg-purple-50',
      change: '+8%',
      trend: 'up' as const,
    },
    {
      title: 'نرخ تکمیل',
      value: `${stats.completionRate}%`,
      icon: CheckCircle,
      gradient: 'bg-emerald-500',
      bgGradient: 'bg-emerald-50',
      change: '+5%',
      trend: 'up' as const,
    },
    {
      title: 'میانگین زمان پاسخ',
      value: `${stats.averageResponseTime}h`,
      icon: Clock,
      gradient: 'bg-orange-500',
      bgGradient: 'bg-orange-50',
      change: '-3%',
      trend: 'down' as const,
    },
  ];

  const getTrendIcon = (trend: 'up' | 'down' | 'neutral') => {
    if (trend === 'up') return TrendingUp;
    if (trend === 'down') return TrendingDown;
    return Minus;
  };

  const getTrendColor = (trend: 'up' | 'down' | 'neutral', isNegative = false) => {
    if (trend === 'neutral') return 'text-muted-foreground';
    if (isNegative) {
      return trend === 'up' ? 'text-red-500' : 'text-emerald-500';
    }
    return trend === 'up' ? 'text-emerald-500' : 'text-red-500';
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {statsData.map((stat, index) => {
        const Icon = stat.icon;
        const TrendIcon = getTrendIcon(stat.trend);
        const isNegativeStat = stat.title.includes('زمان');

        return (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            whileHover={{ scale: 1.03, y: -5 }}
          >
            <Card className="overflow-hidden border-0 shadow-lg hover:shadow-xl transition duration-300 relative group">
              {/* Background gradient */}
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.bgGradient} opacity-50 group-hover:opacity-70 transition-opacity`} />
              
              {/* Animated background blob */}
              <div className={`absolute -top-10 -right-10 w-32 h-32 bg-gradient-to-br ${stat.gradient} rounded-full blur-2xl opacity-20 group-hover:opacity-30 transition-opacity`} />
              
              <CardContent className="p-6 relative z-10">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:rotate-6 transition duration-300`}>
                    <Icon className="w-7 h-7 text-white" />
                  </div>
                  <div className={`flex items-center gap-1 text-sm font-medium ${getTrendColor(stat.trend, isNegativeStat)}`}>
                    <TrendIcon className="w-4 h-4" />
                    {stat.change}
                  </div>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">
                    {stat.title}
                  </h3>
                  <p className="text-3xl font-bold bg-foreground bg-clip-text">
                    {stat.value}
                  </p>
                </div>

                {/* Progress indicator */}
                <div className="mt-4 h-1 w-full bg-border/30 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: '70%' }}
                    transition={{ delay: index * 0.1 + 0.3, duration: 0.8 }}
                    className={`h-full bg-gradient-to-r ${stat.gradient} rounded-full`}
                  />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}
