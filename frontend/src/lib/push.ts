import { Capacitor } from '@capacitor/core';
import { notificationsService } from '@/services/notificationsService';

// Registers this browser or phone for notifications that arrive while the app is closed
// (research R6, R9): Web Push through the service worker, Firebase in the Android/iOS app.

const DEVICE_KEY = 'notify_device_id';
const native = () => Capacitor.isNativePlatform();

export type PushPermission = 'granted' | 'denied' | 'default' | 'unsupported';

export function pushPermission(): PushPermission {
  if (native()) return 'default';
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
  return Notification.permission as PushPermission;
}

const remember = (id: string) => { try { localStorage.setItem(DEVICE_KEY, id); } catch { /* storage blocked */ } };
const remembered = () => { try { return localStorage.getItem(DEVICE_KEY); } catch { return null; } };

function base64UrlToBytes(value: string) {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function browserLabel() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'مرورگر';
  const os = /Android/.test(ua) ? 'اندروید' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'ویندوز' : /Mac OS/.test(ua) ? 'مک' : /Linux/.test(ua) ? 'لینوکس' : '';
  return os ? `${browser} روی ${os}` : browser;
}

async function registerNative(): Promise<boolean> {
  const { PushNotifications } = await import('@capacitor/push-notifications');
  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== 'granted') return false;
  const token = await new Promise<string | null>((resolve) => {
    void PushNotifications.addListener('registration', (t) => resolve(t.value));
    void PushNotifications.addListener('registrationError', () => resolve(null));
    void PushNotifications.register();
  });
  if (!token) return false;
  const { id } = await notificationsService.registerDevice({ kind: 'fcm', endpoint: token, label: Capacitor.getPlatform() === 'ios' ? 'iPhone' : 'Android' });
  remember(id);
  return true;
}

/**
 * Asks for permission when `ask` (it must follow a tap) and registers this device with the
 * signed-in account. Without `ask` it only refreshes a registration the person already allowed,
 * so a browser another person signed in on moves to the account now using it.
 */
export async function enablePush({ ask = false, vapidKey }: { ask?: boolean; vapidKey?: string | null } = {}): Promise<boolean> {
  try {
    if (native()) return ask ? await registerNative() : false;
    if (pushPermission() === 'unsupported') return false;
    if (Notification.permission !== 'granted') {
      if (!ask || (await Notification.requestPermission()) !== 'granted') return false;
    }
    const key = vapidKey ?? (await notificationsService.getSettings()).vapid_public_key;
    if (!key) return false; // the server has no browser push configured; in-app notifications still work
    const registration = await navigator.serviceWorker.ready;
    const subscription = (await registration.pushManager.getSubscription())
      ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(key) }));
    const json = subscription.toJSON();
    const { id } = await notificationsService.registerDevice({
      kind: 'webpush', endpoint: subscription.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth, label: browserLabel(),
    });
    remember(id);
    return true;
  } catch (error) {
    console.warn('[push] could not register this device', error);
    return false;
  }
}

/** On sign-out: this device stops receiving the account's notifications. */
export async function disablePush() {
  const id = remembered();
  if (!id) return;
  try { await notificationsService.removeDevice(id); } catch { /* already gone */ }
  try { localStorage.removeItem(DEVICE_KEY); } catch { /* storage blocked */ }
}

export const hasPushDevice = () => !!remembered();

/** A system notification while the app is open (same tag as a push for it, so it is shown once). */
export async function showSystemNotification(n: { id: string; title: string; body: string | null; path: string | null }) {
  if (native()) {
    if (hasPushDevice()) return; // the phone's push already shows it
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const permission = await LocalNotifications.checkPermissions();
    if (permission.display !== 'granted') return;
    await LocalNotifications.schedule({ notifications: [{ id: Date.now() % 2_000_000_000, title: n.title, body: n.body || '', extra: { path: n.path } }] });
    return;
  }
  if (pushPermission() !== 'granted') return;
  const registration = await navigator.serviceWorker.getRegistration();
  const options = { body: n.body || '', tag: n.id, dir: 'rtl' as const, lang: 'fa', icon: '/android-chrome-192x192.png', data: { path: n.path || '/' } };
  if (registration) await registration.showNotification(n.title, options);
  else new Notification(n.title, options);
}
