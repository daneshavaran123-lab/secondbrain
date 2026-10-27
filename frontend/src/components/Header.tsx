import { useState, useEffect } from "react";
import { Bell, Search, Settings, Menu, ChevronDown, HelpCircle, Plus, Calendar as CalendarIcon, BookOpen, FileText, User, LogOut, Shield, Mail } from "lucide-react";
import SettingsModal from "./SettingsModal";
import HelpModal from "./HelpModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { NotificationCenter, notificationService } from "@/components/ui/notification-center";
import { PlatformAware } from "@/components/ui/platform-aware";
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
import { askAssistant } from "@/lib/assistant";

interface HeaderProps {
  onMenuClick: () => void;
  sidebarOpen?: boolean;
}

const Header = ({ onMenuClick, sidebarOpen = true }: HeaderProps) => {
  const isMobile = useIsMobile();
  const device = useDeviceDetection();
  const layout = useAdaptiveLayout();
  const [searchValue, setSearchValue] = useState("");
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
  // Search runs through Mora, which looks across notes, meetings, ideas and tasks.
  const submitSearch = () => {
    const query = searchValue.trim();
    if (!query) return;
    askAssistant(`در مغز دومم جستجو کن: ${query}`);
    setSearchValue("");
  };

  const iconButton = "h-10 w-10 min-h-0 rounded-lg text-muted-foreground hover:text-foreground sm:h-9 sm:w-9";

  return (
    <header className={cn(
      "glass-header flex items-center gap-3 z-50 transition-[margin] duration-300",
      isMobile ? "h-14 px-3" : "h-16 px-4 md:px-6",
      device.type !== 'desktop' ? 'mr-0' : sidebarOpen ? 'mr-72' : 'mr-16',
      device.isNative && 'pt-safe'
    )} dir="rtl">
      {/* Menu, brand and date */}
      <div className="flex shrink-0 items-center gap-2">
        <PlatformAware showOn={['mobile']}>
          <Button variant="ghost" size="icon" className={iconButton} onClick={onMenuClick} aria-label="منو">
            <Menu className="h-5 w-5" />
          </Button>
        </PlatformAware>
        <span className="text-base font-semibold tracking-tight">مورا</span>
        <PlatformAware hideOn={['mobile', 'tablet']}>
          <span className="ms-2 text-xs text-muted-foreground">{getCurrentPersianDate()}</span>
        </PlatformAware>
      </div>

      {/* Search */}
      <form
        role="search"
        className="mx-auto w-full max-w-md flex-1"
        onSubmit={(e) => { e.preventDefault(); submitSearch(); }}
      >
        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder={isMobile ? "جستجو…" : "جستجو در یادداشت‌ها، جلسات و کارها…"}
            aria-label="جستجو"
            dir="rtl"
            className={cn(
              "h-9 rounded-lg border-transparent bg-muted/70 pr-9 pl-3 text-sm shadow-none",
              "placeholder:text-muted-foreground/80 focus-visible:border-border focus-visible:bg-background",
              "focus-visible:ring-0 focus-visible:ring-offset-0"
            )}
          />
          {searchValue && !isMobile && (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
              Enter برای جستجو با مورا
            </span>
          )}
        </div>
      </form>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-0.5">
        <OfflineChip compact={isMobile} className="me-1" />

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