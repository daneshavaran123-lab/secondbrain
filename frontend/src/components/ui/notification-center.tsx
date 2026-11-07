import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlarmClock, Bell, BellRing, Calendar, CheckCheck, CheckSquare, Loader2, MessageSquare, RefreshCw, Send, Settings, UserPlus, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toPersianDigits } from "@/lib/date-utils";
import { enablePush, pushPermission, type PushPermission } from "@/lib/push";
import {
  announceNotificationsChanged, notificationsService, type AppNotification, type NotificationType,
} from "@/services/notificationsService";

const ICONS: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
  reminder: AlarmClock, event: Calendar, task_due: CheckSquare, invitation: UserPlus,
  delegated: Send, delegation_status: RefreshCw, message: MessageSquare,
};

const timeFmt = new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dayFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { day: "numeric", month: "long" });

/** «امروز، ۰۹:۰۰» or «۱۲ آبان، ۰۹:۰۰» */
function whenLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return `${sameDay ? "امروز" : dayFmt.format(d)}، ${timeFmt.format(d)}`;
}

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  /** after reading or deleting, so the bell's count follows */
  onChanged?: () => void;
}

/** The bell's list: the person's notifications from the server, newest first. */
export function NotificationCenter({ isOpen, onClose, onChanged }: NotificationCenterProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [more, setMore] = useState(false);
  const [permission, setPermission] = useState<PushPermission>(() => pushPermission());
  const [explained, setExplained] = useState(true);
  const [enabling, setEnabling] = useState(false);

  const load = useCallback(async () => {
    setState((s) => (s === "ready" ? s : "loading"));
    try {
      const data = await notificationsService.list();
      setItems(data.items);
      setUnread(data.unread);
      setMore(data.items.length >= 30);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void load();
    setPermission(pushPermission());
    notificationsService.getSettings().then((s) => setExplained(s.permission_explained)).catch(() => {});
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, load, onClose]);

  const changed = () => {
    onChanged?.();
    announceNotificationsChanged();
  };

  const open = async (n: AppNotification) => {
    if (!n.read_at) {
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      setUnread((u) => Math.max(0, u - 1));
      notificationsService.markRead([n.id]).then(changed).catch(() => {});
    }
    if (n.path) {
      onClose();
      navigate(n.path);
    }
  };

  const remove = async (n: AppNotification) => {
    setItems((list) => list.filter((x) => x.id !== n.id));
    if (!n.read_at) setUnread((u) => Math.max(0, u - 1));
    await notificationsService.remove(n.id).catch(() => load());
    changed();
  };

  const readAll = async () => {
    setItems((list) => list.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })));
    setUnread(0);
    await notificationsService.markRead("all").catch(() => load());
    changed();
  };

  const loadOlder = async () => {
    const last = items.at(-1);
    if (!last) return;
    const data = await notificationsService.list(last.created_at).catch(() => null);
    if (!data) return;
    setItems((list) => [...list, ...data.items]);
    setMore(data.items.length >= 30);
  };

  const enable = async () => {
    setEnabling(true);
    await enablePush({ ask: true });
    setPermission(pushPermission());
    setEnabling(false);
  };

  const dismissExplanation = () => {
    setExplained(true);
    void notificationsService.saveSettings({ permission_explained: true }).catch(() => {});
  };

  if (!isOpen) return null;

  return (
    <div
      className="notification-center bg-background border border-border/50 rounded-xl shadow-floating animate-scale-in"
      style={{ zIndex: 10000 }}
      role="dialog"
      aria-label="اعلان‌ها"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/50 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Bell className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground">اعلان‌ها</h3>
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {unread ? `${toPersianDigits(unread)} خوانده‌نشده` : "همه خوانده شده"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={readAll}>
              <CheckCheck className="h-3.5 w-3.5" /> همه خوانده شد
            </Button>
          )}
          <Button asChild variant="ghost" size="icon" className="h-8 w-8" aria-label="تنظیمات اعلان‌ها" title="تنظیمات اعلان‌ها">
            <Link to="/settings/notifications" onClick={onClose}><Settings className="h-4 w-4" /></Link>
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="بستن">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {permission === "default" && (
        <div className="flex items-center justify-between gap-3 border-b border-border/50 bg-signal-soft px-4 py-3 text-xs">
          <span className="flex items-center gap-2 text-foreground"><BellRing className="h-4 w-4 shrink-0 text-signal" /> اعلان‌ها روی همین دستگاه هم برسند، حتی وقتی برنامه بسته است.</span>
          <Button size="sm" className="h-8 shrink-0 px-3 text-xs" onClick={enable} disabled={enabling}>
            {enabling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "فعال کردن"}
          </Button>
        </div>
      )}
      {permission === "denied" && !explained && (
        <div className="border-b border-border/50 bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
          <p>اجازه اعلان برای این سایت در مرورگر بسته است. برای اعلان روی دستگاه، از تنظیمات سایت در مرورگر «اعلان‌ها» را مجاز کنید. اعلان‌ها همچنان همین‌جا می‌آیند.</p>
          <button type="button" className="mt-1.5 font-medium text-signal hover:underline" onClick={dismissExplanation}>متوجه شدم</button>
        </div>
      )}

      <div className="max-h-96 overflow-y-auto">
        {state === "loading" && (
          <p className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" /> در حال بارگذاری…
          </p>
        )}
        {state === "error" && (
          <div className="p-8 text-center text-sm">
            <p className="text-muted-foreground">اعلان‌ها بارگذاری نشد.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={load}>دوباره امتحان کنید</Button>
          </div>
        )}
        {state === "ready" && items.length === 0 && (
          <div className="p-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
              <Bell className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">هنوز اعلانی ندارید</p>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">
              یادآورها سر وقت، جلسه‌ها ۱۵ دقیقه پیش از شروع، کارهای با موعد امروز، دعوت‌نامه‌ها و خبر کارهای واگذارشده این‌جا می‌آیند.
            </p>
          </div>
        )}
        {state === "ready" && items.length > 0 && (
          <ul className="p-2">
            {items.map((n) => {
              const Icon = ICONS[n.type] ?? Bell;
              return (
                <li key={n.id} className={cn("group relative mb-1 flex items-start gap-3 rounded-lg p-3 transition-colors", !n.read_at ? "bg-primary/5" : "hover:bg-muted/50")}>
                  <span className={cn("mt-0.5 shrink-0 rounded-lg p-2", !n.read_at ? "bg-primary/10 text-primary" : "bg-muted/50 text-muted-foreground")}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <button type="button" onClick={() => open(n)} className="min-w-0 flex-1 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
                    <span className={cn("block text-sm font-medium", n.read_at ? "text-muted-foreground" : "text-foreground")}>
                      {!n.read_at && <span className="sr-only">خوانده‌نشده: </span>}
                      {n.title}
                    </span>
                    {n.body && <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{n.body}</span>}
                    <span className="mt-1 block text-[11px] text-muted-foreground">{whenLabel(n.created_at)}</span>
                  </button>
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 shrink-0 opacity-60 hover:opacity-100 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                    onClick={() => remove(n)}
                    aria-label={`حذف اعلان «${n.title}»`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                  {!n.read_at && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden="true" />}
                </li>
              );
            })}
            {more && (
              <li>
                <Button variant="ghost" className="w-full text-xs" onClick={loadOlder}>اعلان‌های قدیمی‌تر</Button>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
