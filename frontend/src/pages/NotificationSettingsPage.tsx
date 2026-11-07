import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, Loader2, Moon, Smartphone, Users } from 'lucide-react';
import { SectionHeader } from '@/components/ui/section-header';
import { AppIcon } from '@/components/ui/app-icon';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { TimeInput } from '@/components/ui/time-input';
import { toast } from '@/hooks/use-toast';
import { enablePush, pushPermission, type PushPermission } from '@/lib/push';
import {
  NotificationsError, notificationsService, type Channel, type NotificationSettings, type NotificationType,
} from '@/services/notificationsService';

const CHANNELS: Array<{ key: Channel; label: string }> = [
  { key: 'push', label: 'روی دستگاه' },
  { key: 'sms', label: 'پیامک' },
  { key: 'email', label: 'ایمیل' },
];
const CHANNEL_NAMES: Record<Channel, string> = { push: 'اعلان روی دستگاه', sms: 'پیامک', email: 'ایمیل' };

const DEVICE_STATE: Record<PushPermission, string> = {
  granted: 'روی این دستگاه فعال است.',
  default: 'روی این دستگاه هنوز فعال نشده است.',
  denied: 'اجازه اعلان در تنظیمات این مرورگر بسته است؛ از تنظیمات سایت آن را مجاز کنید.',
  unsupported: 'این مرورگر اعلان روی دستگاه را پشتیبانی نمی‌کند؛ اعلان‌ها در خود برنامه می‌آیند.',
};

/** Which notifications arrive, on which channels, and when not to disturb (spec 002, story 3). */
const NotificationSettingsPage = () => {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [quietError, setQuietError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [permission, setPermission] = useState<PushPermission>(() => pushPermission());
  const [enabling, setEnabling] = useState(false);

  const load = useCallback(async () => {
    setState('loading');
    try {
      setSettings(await notificationsService.getSettings());
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async (patch: Partial<NotificationSettings>, rollback: NotificationSettings) => {
    setSaving(true);
    setPhoneError(null);
    setQuietError(null);
    try {
      const saved = await notificationsService.saveSettings(patch);
      setSettings((s) => (s ? { ...s, ...saved } : s));
    } catch (error) {
      setSettings(rollback);
      const e = error as NotificationsError;
      if (e.field === 'phone') setPhoneError(e.message);
      else if (e.field === 'quiet_start' || e.field === 'quiet_end') setQuietError(e.message);
      else toast({ title: 'تنظیمات ذخیره نشد', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const setChannel = (type: NotificationType, channel: Channel | 'on', value: boolean) => {
    if (!settings) return;
    const current = settings.channels[type] ?? {};
    const next = channel === 'on'
      ? (value ? { push: true, sms: false, email: false } : { off: true })
      : { push: !!current.push, sms: !!current.sms, email: !!current.email, [channel]: value };
    const updated = { ...settings, channels: { ...settings.channels, [type]: next } };
    setSettings(updated);
    void save({ channels: { [type]: next } as NotificationSettings['channels'] }, settings);
  };

  const setQuiet = (patch: { quiet_start?: string | null; quiet_end?: string | null }) => {
    if (!settings) return;
    const updated = { ...settings, ...patch };
    setSettings(updated);
    if (Boolean(updated.quiet_start) !== Boolean(updated.quiet_end)) return; // wait for the other end
    void save({ quiet_start: updated.quiet_start, quiet_end: updated.quiet_end }, settings);
  };

  const enable = async () => {
    setEnabling(true);
    const ok = await enablePush({ ask: true, vapidKey: settings?.vapid_public_key });
    setPermission(pushPermission());
    setEnabling(false);
    toast(ok
      ? { title: 'اعلان روی این دستگاه فعال شد' }
      : { title: 'اعلان روی این دستگاه فعال نشد', description: 'اعلان‌ها همچنان در خود برنامه می‌آیند.' });
  };

  const errorOf = (channel: Channel) => settings?.last_errors?.find((e) => e.channel === channel)?.error;
  const quietOn = !!(settings?.quiet_start && settings?.quiet_end);

  return (
    <div className="space-y-6 p-3 md:p-6">
      <SectionHeader
        title="تنظیمات اعلان‌ها"
        subtitle="چه چیزهایی خبر داده شوند، از چه راهی، و چه ساعتی مزاحم نشوند"
        icon={<AppIcon size="lg"><BellRing /></AppIcon>}
      />

      {state === 'loading' && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" /> در حال بارگذاری…</p>
      )}
      {state === 'error' && (
        <Card><CardContent className="p-6 text-sm">
          <p className="text-muted-foreground">تنظیمات بارگذاری نشد.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={load}>دوباره امتحان کنید</Button>
        </CardContent></Card>
      )}

      {state === 'ready' && settings && (
        <>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Smartphone className="h-4 w-4" /> همین دستگاه</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <p className="text-muted-foreground">{DEVICE_STATE[permission]}</p>
              {permission === 'default' && (
                <Button onClick={enable} disabled={enabling}>
                  {enabling && <Loader2 className="h-4 w-4 animate-spin" />} فعال کردن اعلان روی این دستگاه
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">چه چیزهایی و از چه راهی</CardTitle>
              <p className="text-xs text-muted-foreground">همه اعلان‌ها همیشه در زنگوله خود برنامه هم دیده می‌شوند.</p>
            </CardHeader>
            <CardContent className="space-y-1 p-0 pb-2">
              {(settings.types ?? []).map(({ type, label }) => {
                const entry = settings.channels[type] ?? {};
                const on = !entry.off;
                return (
                  <div key={type} className="flex flex-col gap-3 border-t border-border/60 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <label className="flex items-center gap-3 text-sm font-medium">
                      <Switch checked={on} onCheckedChange={(v) => setChannel(type, 'on', v)} aria-label={label} disabled={saving} />
                      {label}
                    </label>
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 ps-12 sm:ps-0" aria-label={`راه‌های رسیدن ${label}`} role="group">
                      {CHANNELS.map(({ key, label: channelLabel }) => (
                        <label key={key} className={`flex items-center gap-2 text-xs ${on ? '' : 'opacity-50'}`}>
                          <Switch
                            checked={on && !!entry[key]}
                            disabled={!on || saving}
                            onCheckedChange={(v) => setChannel(type, key, v)}
                            aria-label={`${label}: ${channelLabel}`}
                          />
                          {channelLabel}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
              {phoneError && (
                <p className="px-6 pt-2 text-sm text-destructive" role="alert">
                  {phoneError}. <Link to="/profile" className="font-medium underline">رفتن به پروفایل</Link>
                </p>
              )}
              {CHANNELS.map(({ key }) => errorOf(key) && (
                <p key={key} className="px-6 pt-2 text-xs text-muted-foreground">آخرین خطای {CHANNEL_NAMES[key]}: {errorOf(key)}</p>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Moon className="h-4 w-4" /> ساعت‌های سکوت</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              <label className="flex items-center gap-3">
                <Switch
                  checked={quietOn}
                  disabled={saving}
                  onCheckedChange={(v) => setQuiet(v ? { quiet_start: '22:00', quiet_end: '07:00' } : { quiet_start: null, quiet_end: null })}
                  aria-label="ساعت‌های سکوت"
                />
                در این ساعت‌ها اعلان روی دستگاه، پیامک و ایمیل نفرستاده می‌شود؛ پایان بازه می‌رسند.
              </label>
              {quietOn && (
                <div className="flex flex-wrap items-center gap-4 ps-12">
                  <span className="flex items-center gap-2">از <TimeInput value={settings.quiet_start ?? ''} aria-label="شروع سکوت" onChange={(e) => setQuiet({ quiet_start: e.target.value || null })} /></span>
                  <span className="flex items-center gap-2">تا <TimeInput value={settings.quiet_end ?? ''} aria-label="پایان سکوت" onChange={(e) => setQuiet({ quiet_end: e.target.value || null })} /></span>
                </div>
              )}
              {quietError && <p className="ps-12 text-sm text-destructive" role="alert">{quietError}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" /> اعلان از دیگران</CardTitle></CardHeader>
            <CardContent className="text-sm">
              <label className="flex items-center gap-3">
                <Switch
                  checked={settings.accept_from_others}
                  disabled={saving}
                  onCheckedChange={(v) => { const before = settings; setSettings({ ...settings, accept_from_others: v }); void save({ accept_from_others: v }, before); }}
                  aria-label="اعلان از هم‌سازمانی‌ها"
                />
                هم‌سازمانی‌هایم (از راه دستیار) بتوانند برایم اعلان بفرستند.
              </label>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default NotificationSettingsPage;
