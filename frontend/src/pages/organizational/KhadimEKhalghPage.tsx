import React, { useMemo } from 'react';
import { Heart, BarChart3, Target, Users, Calendar, MessageSquare, FileText } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useUserCollection } from '@/services/userCollections';

const KhadimEKhalghPage = () => {
  const navigate = useNavigate();
  // Counted from the person's own records in the sections below
  const [projects, , projectsState] = useUserCollection<{ status?: string; location?: string; beneficiaries?: number }>('khk_service_projects');
  const [needs, , needsState] = useUserCollection<{ area?: string }>('khk_social_needs');
  const [partners, , partnersState] = useUserCollection<{ status?: string }>('partners');
  const loading = projectsState.loading || needsState.loading || partnersState.loading;
  const stats = useMemo(() => ({
    activeProjects: projects.filter((p) => p.status === 'in-progress').length,
    beneficiaries: projects.reduce((sum, p) => sum + (Number(p.beneficiaries) || 0), 0),
    coveredRegions: new Set([...projects.map((p) => p.location), ...needs.map((n) => n.area)].map((r) => (r || '').trim()).filter(Boolean)).size,
    activeColleagues: partners.filter((p) => p.status !== 'inactive').length,
  }), [projects, needs, partners]);

  const modules = [
    {
      id: 'dashboard',
      title: 'اتاق فرمان خادم خلق',
      description: 'نمای کلی فعالیت‌ها و آمارهای مدیریتی',
      icon: BarChart3,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      path: '/organizational/khadim-e-khalgh/dashboard'
    },
    {
      id: 'mission',
      title: 'رسالت و فلسفه خدمت',
      description: 'بیانیه‌ها و اهداف راهبردی خدمت‌رسانی',
      icon: Target,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      path: '/organizational/khadim-e-khalgh/mission'
    },
    {
      id: 'needs',
      title: 'بانک نیازهای اجتماعی',
      description: 'شناسایی و مدیریت نیازهای مردم',
      icon: Users,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      path: '/organizational/khadim-e-khalgh/needs'
    },
    {
      id: 'projects',
      title: 'دفتر اقدامات انجام‌شده',
      description: 'ثبت و پیگیری پروژه‌های خدمت‌رسانی',
      icon: Heart,
      color: 'text-rose-600',
      bgColor: 'bg-rose-50',
      path: '/organizational/khadim-e-khalgh/projects'
    },
    {
      id: 'roadmap',
      title: 'برنامه‌های در جریان و آتی',
      description: 'مدیریت برنامه‌ها و پویش‌های آینده',
      icon: Calendar,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      path: '/organizational/khadim-e-khalgh/roadmap'
    },
    {
      id: 'partners',
      title: 'نقشه تعاملات و همکاران',
      description: 'مدیریت روابط و شبکه همکاری‌ها',
      icon: MessageSquare,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      path: '/organizational/khadim-e-khalgh/partners'
    },
    {
      id: 'meeting-minutes',
      title: 'مدیریت صورت‌جلسات',
      description: 'ثبت جلسات، مصوبات و پیگیری اجرا',
      icon: FileText,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      path: '/organizational/khadim-e-khalgh/meeting-minutes'
    }
  ];


  return (
    <div className="min-h-screen bg-gradient-subtle p-8">
      <div className="max-w-7xl mx-auto spacing-relaxed">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Heart className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-bold text-foreground">خادم خلق</h1>
          </div>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            سامانه جامع مدیریت خدمت‌رسانی و تعامل با جامعه
          </p>
          <div className="mt-4 p-4 bg-card rounded-lg border max-w-md mx-auto">
            <p className="text-sm text-muted-foreground italic">
            "و ما جعلنا منهم أئمة يهدون بأمرنا لما صبروا وكانوا بآياتنا يوقنون"
            </p>
            <p className="text-xs text-muted-foreground mt-2">سجده - آیه ۲۴</p>
          </div>
        </div>

        {/* Modules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {modules.map((module) => (
            <Card 
              key={module.id} 
              className="glass-card hover-lift cursor-pointer transition-elegant group"
              onClick={() => navigate(module.path)}
            >
              <CardHeader className="pb-4">
                <div className={`w-16 h-16 rounded-lg ${module.bgColor} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <module.icon className={`h-8 w-8 ${module.color}`} />
                </div>
                <CardTitle className="text-xl font-bold text-foreground">
                  {module.title}
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  {module.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  variant="outline" 
                  className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                >
                  ورود به ماژول
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick Stats */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="text-center">
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-primary mb-2">
                {loading ? '...' : stats.activeProjects.toLocaleString('fa-IR')}
              </div>
              <p className="text-sm text-muted-foreground">اقدام در جریان</p>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-emerald-600 mb-2">
                {loading ? '...' : stats.beneficiaries.toLocaleString('fa-IR')}
              </div>
              <p className="text-sm text-muted-foreground">افراد بهره‌مند</p>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-orange-600 mb-2">
                {loading ? '...' : stats.coveredRegions.toLocaleString('fa-IR')}
              </div>
              <p className="text-sm text-muted-foreground">منطقه تحت پوشش</p>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-purple-600 mb-2">
                {loading ? '...' : stats.activeColleagues.toLocaleString('fa-IR')}
              </div>
              <p className="text-sm text-muted-foreground">همکار و شریک</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default KhadimEKhalghPage;