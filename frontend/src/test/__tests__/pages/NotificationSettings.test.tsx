import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import NotificationSettingsPage from '@/pages/NotificationSettingsPage';
import type { NotificationSettings } from '@/services/notificationsService';

const api = vi.hoisted(() => ({ getSettings: vi.fn(), saveSettings: vi.fn() }));
vi.mock('@/services/notificationsService', async (orig) => ({
  ...(await orig<typeof import('@/services/notificationsService')>()),
  notificationsService: api,
}));
vi.mock('@/lib/push', () => ({ pushPermission: () => 'default', enablePush: vi.fn().mockResolvedValue(true) }));

const TYPES = [
  { type: 'reminder', label: 'یادآورها' },
  { type: 'task_due', label: 'کارهای با موعد امروز' },
] as NotificationSettings['types'];
const base = (): NotificationSettings => ({
  channels: { reminder: { push: true, sms: false, email: false }, task_due: { push: true, sms: false, email: false } } as NotificationSettings['channels'],
  quiet_start: null, quiet_end: null, accept_from_others: true, tz: 'Asia/Tehran', permission_explained: false,
  types: TYPES, has_phone: false, has_email: true, last_errors: [{ channel: 'email', error: 'آدرس پذیرفته نشد', at: '' }], vapid_public_key: 'k',
});

const show = () => render(<MemoryRouter><NotificationSettingsPage /></MemoryRouter>);

describe('notification settings page', () => {
  beforeEach(() => {
    api.getSettings.mockReset().mockResolvedValue(base());
    api.saveSettings.mockReset().mockImplementation(async (patch) => ({ ...base(), ...patch }));
  });

  it('lists every type with its channels and the device state', async () => {
    show();
    expect(await screen.findByRole('switch', { name: 'یادآورها' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'یادآورها: روی دستگاه' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'یادآورها: پیامک' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'کارهای با موعد امروز: ایمیل' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /فعال کردن اعلان روی این دستگاه/ })).toBeInTheDocument();
    expect(screen.getByText(/آخرین خطای ایمیل: آدرس پذیرفته نشد/)).toBeInTheDocument();
  });

  it('turning a type off saves it and disables its channels', async () => {
    show();
    await userEvent.click(await screen.findByRole('switch', { name: 'کارهای با موعد امروز' }));
    await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith({ channels: { task_due: { off: true } } }));
    expect(screen.getByRole('switch', { name: 'کارهای با موعد امروز: روی دستگاه' })).toBeDisabled();
  });

  it('SMS without a phone number: the error is shown next to the switches, and the switch goes back', async () => {
    const { NotificationsError } = await import('@/services/notificationsService');
    api.saveSettings.mockRejectedValueOnce(new NotificationsError('برای پیامک، شماره همراه را در پروفایل ثبت کنید', 422, 'phone'));
    show();
    const sms = await screen.findByRole('switch', { name: 'یادآورها: پیامک' });
    await userEvent.click(sms);
    expect(await screen.findByRole('alert')).toHaveTextContent('شماره همراه را در پروفایل ثبت کنید');
    expect(screen.getByRole('link', { name: 'رفتن به پروفایل' })).toHaveAttribute('href', '/profile');
    expect(screen.getByRole('switch', { name: 'یادآورها: پیامک' })).not.toBeChecked();
  });

  it('quiet hours with Persian time fields', async () => {
    show();
    await userEvent.click(await screen.findByRole('switch', { name: 'ساعت‌های سکوت' }));
    await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith({ quiet_start: '22:00', quiet_end: '07:00' }));
    const hour = screen.getByRole('combobox', { name: 'شروع سکوت: ساعت' });
    expect(hour).toHaveValue('22');
    expect(screen.getAllByRole('option', { name: '۲۳' }).length).toBeGreaterThan(0);
  });
});
