import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Brain, Target, MessageCircle, Plus, Scale, Zap, Shield, TrendingUp, BarChart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ChatInterface from '@/components/ai-chat/ChatInterface';
import SessionSidebar from '@/components/ai-chat/SessionSidebar';
import FAQSection from '@/components/ai-chat/FAQSection';


const AIChatPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeChat, setActiveChat] = useState<{
    type: 'mentor' | 'coach' | 'decision-maker';
    sessionId?: string;
  } | null>(null);

  const startNewChat = (type: 'mentor' | 'coach' | 'decision-maker') => {
    setActiveChat({ type });
  };

  const handleSessionCreated = (sessionId: string) => {
    if (activeChat) {
      setActiveChat({ ...activeChat, sessionId });
    }
  };

  const handleSessionSelect = (sessionId: string, sessionType: string) => {
    setActiveChat({ 
      type: sessionType as 'mentor' | 'coach' | 'decision-maker', 
      sessionId 
    });
  };

  if (activeChat) {
    return (
      <div className="container mx-auto p-4 h-screen flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-primary">
              {activeChat.type === 'mentor' ? 'منتور AI' : 
               activeChat.type === 'coach' ? 'کوچ AI' : 'مشاور تصمیم‌گیری AI'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {activeChat.type === 'mentor' 
                ? 'منتور شخصی برای رسیدن به اهدافتان'
                : activeChat.type === 'coach'
                ? 'کوچ حرفه‌ای برای بهبود مهارت‌هایتان'
                : 'مشاور هوشمند برای کمک در تصمیم‌گیری‌های مهم'
              }
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => navigate('/ai-chat/analytics')}
              className="gap-2"
            >
              <BarChart className="w-4 h-4" />
              آمار
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setActiveChat(null)}
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              چت جدید
            </Button>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4 min-h-0">
          <div className="lg:col-span-1 h-full overflow-hidden">
            <SessionSidebar 
              currentSessionId={activeChat.sessionId}
              onSessionSelect={handleSessionSelect}
            />
          </div>
          <div className="lg:col-span-3 h-full overflow-hidden">
            <ChatInterface
              sessionType={activeChat.type}
              sessionId={activeChat.sessionId}
              onSessionCreated={handleSessionCreated}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto space-y-8 p-4 md:p-6">
        <div className="mx-auto max-w-6xl space-y-2 pt-4">
          <h1 className="text-3xl font-bold md:text-4xl">دستیار هوشمند</h1>
          <p className="max-w-2xl text-base text-muted-foreground">
            منتور، کوچ و مشاور تصمیم‌گیری؛ یکی را انتخاب کنید و گفتگو را شروع کنید.
          </p>
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-1 pt-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2"><Zap className="h-4 w-4" aria-hidden />پاسخ فوری</li>
            <li className="flex items-center gap-2"><Shield className="h-4 w-4" aria-hidden />محرمانه و امن</li>
            <li className="flex items-center gap-2"><TrendingUp className="h-4 w-4" aria-hidden />یادگیری مستمر</li>
          </ul>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
            <CardHeader className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20 transition-colors">
                <Target className="w-8 h-8 text-primary" />
              </div>
              <CardTitle className="text-xl">منتور AI</CardTitle>
              <CardDescription>
                راهنمای شخصی برای تحقق اهداف و توسعه فردی
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground mb-6">
                <li>• تعیین و پیگیری اهداف</li>
                <li>• راهنمایی در تصمیم‌گیری</li>
                <li>• انگیزه و الهام بخشی</li>
                <li>• برنامه‌ریزی استراتژیک</li>
              </ul>
              <Button 
                onClick={() => startNewChat('mentor')}
                className="w-full gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                شروع چت با منتور
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
            <CardHeader className="text-center">
              <div className="w-16 h-16 bg-secondary/10 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-secondary/20 transition-colors">
                <Brain className="w-8 h-8 text-secondary-foreground" />
              </div>
              <CardTitle className="text-xl">کوچ AI</CardTitle>
              <CardDescription>
                مربی تخصصی برای بهبود مهارت‌ها و عملکرد
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground mb-6">
                <li>• تحلیل نقاط قوت و ضعف</li>
                <li>• برنامه‌های تمرینی</li>
                <li>• بازخورد و ارزیابی</li>
                <li>• راه‌حل‌های عملی</li>
              </ul>
              <Button 
                onClick={() => startNewChat('coach')}
                variant="secondary"
                className="w-full gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                شروع چت با کوچ
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
            <CardHeader className="text-center">
              <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-accent/20 transition-colors">
                <Scale className="w-8 h-8 text-accent-foreground" />
              </div>
              <CardTitle className="text-xl">مشاور تصمیم‌گیری AI</CardTitle>
              <CardDescription>
                راهنمای هوشمند برای تصمیم‌گیری‌های بهتر و مؤثرتر
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground mb-6">
                <li>• تحلیل گزینه‌های مختلف</li>
                <li>• ارزیابی ریسک و فرصت</li>
                <li>• ماتریس تصمیم‌گیری</li>
                <li>• پیشنهادات عملی</li>
              </ul>
              <Button 
                onClick={() => startNewChat('decision-maker')}
                variant="outline"
                className="w-full gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                شروع چت با مشاور
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg text-center">ویژگی‌های دستیار AI</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-3 gap-4 text-sm">
                <div className="space-y-2">
                  <h4 className="font-medium">منتور AI</h4>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>• تعیین اهداف SMART</li>
                    <li>• تحلیل مسیر پیشرفت</li>
                    <li>• راهنمایی در چالش‌ها</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium">کوچ AI</h4>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>• تحلیل عملکرد</li>
                    <li>• برنامه‌ریزی بهبود</li>
                    <li>• پیگیری مستمر</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium">مشاور تصمیم‌گیری AI</h4>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>• تحلیل داده‌ها و گزینه‌ها</li>
                    <li>• ارزیابی عواقب و نتایج</li>
                    <li>• راهنمایی در مواقع پیچیده</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        

        <FAQSection />
      </div>
    </div>
  );
};

export default AIChatPage;
