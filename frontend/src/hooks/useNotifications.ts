import { useCallback, useEffect, useRef, useState } from 'react';
import { NOTIFICATIONS_CHANGED, notificationsService } from '@/services/notificationsService';
import { enablePush, showSystemNotification } from '@/lib/push';

export const POLL_MS = 20_000;

/**
 * The bell's unread count, kept fresh every 20 s and when the app comes back into view
 * (SC-005). Notifications that arrive while the app is open are also shown once as a system
 * notification, except in the person's quiet hours (FR-013).
 */
export function useNotifications() {
  const [unread, setUnread] = useState(0);
  const latest = useRef<string | null | undefined>(undefined);
  const known = useRef<Set<string> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const status = await notificationsService.unreadCount();
      setUnread(status.unread);
      if (status.latest === latest.current) return;
      latest.current = status.latest;
      const { items } = await notificationsService.list();
      if (!known.current) {
        // what was already there when the app opened is not announced again
        known.current = new Set(items.map((n) => n.id));
        return;
      }
      const quiet = status.quiet_until && new Date(status.quiet_until) > new Date();
      for (const n of items) {
        if (known.current.has(n.id)) continue;
        known.current.add(n.id);
        if (!n.read_at && !quiet) void showSystemNotification(n);
      }
    } catch {
      /* offline or signed out: the next poll tries again */
    }
  }, []);

  useEffect(() => {
    void refresh();
    notificationsService.getSettings().then((s) => {
      // due times follow the person's time zone (research R7)
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && tz !== s.tz) void notificationsService.saveSettings({ tz }).catch(() => {});
      // keeps an earlier permission tied to whoever is signed in now
      void enablePush({ vapidKey: s.vapid_public_key });
    }).catch(() => {});
    const timer = setInterval(() => { void refresh(); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(NOTIFICATIONS_CHANGED, refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(NOTIFICATIONS_CHANGED, refresh);
    };
  }, [refresh]);

  return { unread, refresh };
}
