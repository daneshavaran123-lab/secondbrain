import { apiFetch } from '@/lib/api';

// The person's notifications on the server (specs/002-assistant-links-notifications/contracts/notifications-api.md).

export type NotificationType = 'reminder' | 'event' | 'task_due' | 'invitation' | 'delegated' | 'delegation_status' | 'message';
export type Channel = 'push' | 'sms' | 'email';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  due_at: string;
  created_at: string;
  read_at: string | null;
  path: string | null;
  sender: { id: string; display_name: string } | null;
}

export interface NotificationSettings {
  channels: Record<NotificationType, Partial<Record<Channel, boolean>> & { off?: boolean }>;
  quiet_start: string | null;
  quiet_end: string | null;
  accept_from_others: boolean;
  tz: string;
  permission_explained: boolean;
  types?: Array<{ type: NotificationType; label: string }>;
  has_phone?: boolean;
  has_email?: boolean;
  last_errors?: Array<{ channel: Channel; error: string; at: string }>;
  vapid_public_key?: string | null;
}

export class NotificationsError extends Error {
  constructor(message: string, readonly status: number, readonly field?: string) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(`/notifications${path}`, init);
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new NotificationsError(data.error || 'ارتباط با سرور برقرار نشد', res.status, data.field);
  return data as T;
}

export const notificationsService = {
  list: (before?: string) =>
    call<{ unread: number; items: AppNotification[] }>(`?limit=30${before ? `&before=${encodeURIComponent(before)}` : ''}`),
  unreadCount: () => call<{ unread: number; latest: string | null; quiet_until: string | null }>('/unread-count'),
  markRead: (ids: string[] | 'all') =>
    call<{ updated: number; unread: number }>('/read', { method: 'POST', body: JSON.stringify(ids === 'all' ? { all: true } : { ids }) }),
  remove: (id: string) => call<void>(`/${id}`, { method: 'DELETE' }),
  getSettings: () => call<NotificationSettings>('/settings'),
  saveSettings: (patch: Partial<NotificationSettings>) =>
    call<NotificationSettings>('/settings', { method: 'PUT', body: JSON.stringify(patch) }),
  registerDevice: (device: { kind: 'webpush' | 'fcm'; endpoint: string; p256dh?: string; auth?: string; label?: string }) =>
    call<{ id: string }>('/devices', { method: 'POST', body: JSON.stringify(device) }),
  removeDevice: (id: string) => call<void>(`/devices/${id}`, { method: 'DELETE' }),
};

/** Fired after the list changes here (read, delete), so the bell and any open list refresh. */
export const NOTIFICATIONS_CHANGED = 'second-brain:notifications-changed';
export const announceNotificationsChanged = () => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
