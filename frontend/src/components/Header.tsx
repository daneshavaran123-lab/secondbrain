import { useState, useEffect } from "react";
import { Bell, Search, Settings, Menu, ChevronDown, HelpCircle, Plus, Calendar as CalendarIcon, BookOpen, FileText, User, LogOut, Shield, Mail, FlaskConical } from "lucide-react";
import SettingsModal from "./SettingsModal";
import HelpModal from "./HelpModal";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { NotificationCenter, notificationService } from "@/components/ui/notification-center";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useNavigate, useLocation } from "react-router-dom";
import { PersianNumber } from "@/components/ui/persian-number";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDeviceDetection } from "@/hooks/useDeviceDetection";
import { useAdaptiveLayout } from "@/hooks/useAdaptiveLayout";
import { useAuth } from "@/contexts/AuthContext";
import { ROLE_NAMES } from "@/types/user-management";
import { hasCapability } from "@/utils/roleAccess";
import { cn } from "@/lib/utils";
import { OfflineChip } from "@/components/ui/luxe/OfflineChip";
import { BrandMark, Wordmark } from "@/components/brand/BrandMark";
import { askAssistant } from "@/lib/assistant";
import { commandShortcutLabel, openCommandPalette } from "@/lib/command";

interface HeaderProps {
  onMenuClick: () => void;
  sidebarOpen?: boolean;
}

const Header = ({ onMenuClick, sidebarOpen = true }: HeaderProps) => {
  const isMobile = useIsMobile();
  const device = useDeviceDetection();
  const layout = useAdaptiveLayout();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  // تاریخ شمسی امروز، مثل «سه‌شنبه ۵ آبان»
  const getCurrentPersianDate = () => {
    const parts = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    }).formatToParts(new Date());
    const part = (type: string) => parts.find((p) => p.type === type)?.value || '';
    return `${part('weekday')} ${part('day')} ${part('month')}`;
  };

  // به‌روزرسانی شمارش اعلانات
  useEffect(() => {
    const updateNotificationCount = () => {
      setUnreadNotifications(notificationService.getUnreadCount());
    };
    
    updateNotificationCount(); // اجرای فوری
    
    // بررسی تغییرات هر 5 ثانیه
    const interval = setInterval(updateNotificationCount, 5000);
    return () => clearInterval(interval);
  }, []);

  const navigate = useNavigate();
  const location = useLocation();

  // استفاده از AuthContext
  const { user: currentUser, role: currentRole, isLoading, signOut } = useAuth();

  // نام نمایشی کاربر
  const displayName = currentUser?.display_name || 
    `${currentUser?.first_name || ''} ${currentUser?.last_name || ''}`.trim() || 
    'کاربر';

  // خروج از سیستم
  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  // بررسی دسترسی مدیریت کاربران
  const canManageUsers = hasCapability(currentRole, 'مدیریت کاربران');

  // تابع به‌روزرسانی شمارش اعلانات
  const handleNotificationChange = () => {
    setUnreadNotifications(notificationService.getUnreadCount());
  };
  const iconButton = "h-10 w-10 min-h-0 rounded-lg text-muted-foreground hover:text-foreground sm:h-9 sm:w-9";

  return (
    <header className={cn(
      "glass-header flex items-center gap-3 z-50 transition-[margin] duration-300",
      isMobile ? "h-14 px-3" : "h-16 px-4 md:px-6",
      device.type !== 'desktop' ? 'mr-0' : sidebarOpen ? 'mr-72' : 'mr-16',
      device.isNative && 'pt-safe'
    )} dir="rtl">
      {/* Menu and brand on small screens (the sidebar carries them on desktop); the date on desktop */}
      <div className="flex shrink-0 items-center gap-1.5">
        {device.type !== 'desktop' && (
          <>
            <Button variant="ghost" size="icon" className={iconButton} onClick={onMenuClick} aria-label="منو">
              <Menu className="h-5 w-5" />
            </Button>
            <Wordmark size={17} />
          </>
        )}
        {device.type === 'desktop' && (
          <span className="text-sm text-muted-foreground">{getCurrentPersianDate()}</span>
        )}
      </div>

      {/* Search and commands */}
      {isMobile ? (
        <Button variant="ghost" size="icon" className={cn(iconButton, "ms-auto")} onClick={openCommandPalette} aria-label="جستجو">
          <Search className="h-[18px] w-[18px]" />
        </Button>
      ) : (
        <button
          type="button"
          onClick={openCommandPalette}
          className="mx-auto flex h-9 w-full max-w-md flex-1 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm text-muted-foreground transition-colors hover:border-input hover:text-foreground"
          aria-label="جستجو یا دستور"
        >
          <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="flex-1 truncate text-right">جستجوی صفحه‌ها یا پرسش از دستیار…</span>
          <kbd className="shrink-0 rounded border border-border px-1.5 text-[11px] leading-5" dir="ltr">{commandShortcutLabel()}</kbd>
        </button>
      )}

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-0.5">
        <OfflineChip compact={isMobile} className="me-1" />

        {!isMobile && (
          <Button
            variant="outline"
            onClick={() => askAssistant('', false)}
            className="me-1 h-9 min-h-0 gap-2 rounded-md bg-card px-3 text-sm font-medium"
          >
            <BrandMark size={18} />
            دستیار
          </Button>
        )}

        {!isMobile && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className={iconButton} aria-label="ایجاد سریع">
                <Plus className="h-[18px] w-[18px]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => navigate('/meetings')}>
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                جلسه جدید
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => navigate('/personal-journal')}>
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                یادداشت جدید
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => navigate('/organizational-letters?upload=1')}>
                <Mail className="h-4 w-4 text-muted-foreground" />
                بارگذاری نامه
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => navigate('/health?tab=labs&upload=1')}>
                <FlaskConical className="h-4 w-4 text-muted-foreground" />
                افزودن برگه آزمایش
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => navigate('/documentation')}>
                <FileText className="h-4 w-4 text-muted-foreground" />
                مستندات سیستم
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Notifications */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className={cn(iconButton, "relative")}
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            aria-label="اعلان‌ها"
          >
            <Bell className="h-[18px] w-[18px]" />
            {unreadNotifications > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-none text-destructive-foreground ring-2 ring-background">
                <PersianNumber>{unreadNotifications}</PersianNumber>
              </span>
            )}
          </Button>
          <NotificationCenter
            isOpen={isNotificationsOpen}
            onClose={() => setIsNotificationsOpen(false)}
            onNotificationChange={handleNotificationChange}
          />
        </div>

        <ThemeToggle />

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="ms-1 flex min-h-0 items-center gap-2 rounded-lg p-1 transition-colors hover:bg-accent" aria-label="حساب کاربری">
              <Avatar className="h-8 w-8">
                <AvatarImage src={currentUser?.avatar_url || undefined} alt={displayName} />
                <AvatarFallback className="bg-muted text-xs font-semibold text-foreground">
                  {displayName.split(' ')[0]?.slice(0, 2) || 'کا'}
                </AvatarFallback>
              </Avatar>
              <div className="hidden text-right leading-tight lg:block">
                <p className="text-sm font-medium">{isLoading ? '…' : displayName}</p>
                {currentRole && <p className="text-[11px] text-muted-foreground">{ROLE_NAMES[currentRole]}</p>}
              </div>
              <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground lg:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56" side="bottom">
            <DropdownMenuItem onClick={() => navigate('/profile')} className="cursor-pointer gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              پروفایل
            </DropdownMenuItem>
            {canManageUsers && (
              <DropdownMenuItem onClick={() => navigate('/admin/users')} className="cursor-pointer gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                مدیریت کاربران
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => setIsSettingsOpen(true)} className="cursor-pointer gap-2">
              <Settings className="h-4 w-4 text-muted-foreground" />
              تنظیمات
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setIsHelpOpen(true)} className="cursor-pointer gap-2">
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
              راهنما
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer gap-2 text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4" />
              خروج
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Modals */}
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </header>
  );
};

export default Header;