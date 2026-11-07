import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { NotificationCenter } from '@/components/ui/notification-center';
import type { AppNotification } from '@/services/notificationsService';

const api = vi.hoisted(() => ({
  list: vi.fn(), markRead: vi.fn(), remove: vi.fn(), getSettings: vi.fn(), saveSettings: vi.fn(),
}));
vi.mock('@/services/notificationsService', async (orig) => ({
  ...(await orig<typeof import('@/services/notificationsService')>()),
  notificationsService: api,
}));
const push = vi.hoisted(() => ({ permission: 'granted' as string, enablePush: vi.fn() }));
vi.mock('@/lib/push', () => ({ pushPermission: () => push.permission, enablePush: push.enablePush }));

const n = (over: Partial<AppNotification>): AppNotification => ({
  id: 'n1', type: 'reminder', title: 'یادآوری: تماس با پیمانکار', body: 'سه‌شنبه ۱۲ آبان، ساعت ۹:۰۰', due_at: new Date().toISOString(),
  created_at: new Date().toISOString(), read_at: null, path: '/calendar', sender: null, ...over,
});

function Where() {
  const l = useLocation();
  return <output aria-label="مسیر">{l.pathname}</output>;
}
const show = (onClose = vi.fn()) => render(
  <MemoryRouter><Routes><Route path="*" element={<><NotificationCenter isOpen onClose={onClose} /><Where /></>} /></Routes></MemoryRouter>,
);

describe('notification center', () => {
  beforeEach(() => {
    for (const f of Object.values(api)) f.mockReset();
    api.getSettings.mockResolvedValue({ permission_explained: false });
    api.markRead.mockResolvedValue({ updated: 1, unread: 0 });
    api.remove.mockResolvedValue(undefined);
    api.saveSettings.mockResolvedValue({});
    push.permission = 'granted';
  });

  it('says what will appear when there is nothing yet', async () => {
    api.list.mockResolvedValue({ unread: 0, items: [] });
    show();
    expect(await screen.findByText('هنوز اعلانی ندارید')).toBeInTheDocument();
    expect(screen.getByText(/جلسه‌ها ۱۵ دقیقه پیش از شروع/)).toBeInTheDocument();
  });

  it('opens a notification’s record and marks it read', async () => {
    api.list.mockResolvedValue({ unread: 1, items: [n({})] });
    const onClose = vi.fn();
    show(onClose);
    await userEvent.click(await screen.findByRole('button', { name: /خوانده‌نشده: یادآوری: تماس با پیمانکار/ }));
    expect(api.markRead).toHaveBeenCalledWith(['n1']);
    expect(screen.getByLabelText('مسیر')).toHaveTextContent('/calendar');
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the time in Persian and the sender of a message', async () => {
    api.list.mockResolvedValue({ unread: 1, items: [n({ id: 'm', type: 'message', title: 'سارا کرباسی', body: 'جلسه به ساعت ۱۱ منتقل شد', path: null })] });
    show();
    expect(await screen.findByText('جلسه به ساعت ۱۱ منتقل شد')).toBeInTheDocument();
    expect(screen.getByText(/^امروز، [۰-۹]{2}:[۰-۹]{2}$/)).toBeInTheDocument();
  });

  it('marks all read and deletes one', async () => {
    api.list.mockResolvedValue({ unread: 2, items: [n({}), n({ id: 'n2', title: 'موعد امروز: گزارش' })] });
    show();
    await userEvent.click(await screen.findByRole('button', { name: /همه خوانده شد/ }));
    expect(api.markRead).toHaveBeenCalledWith('all');
    expect(screen.getByText('همه خوانده شده')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'حذف اعلان «موعد امروز: گزارش»' }));
    expect(api.remove).toHaveBeenCalledWith('n2');
    expect(screen.queryByText('موعد امروز: گزارش')).toBeNull();
  });

  it('a failed load says so and can try again', async () => {
    api.list.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ unread: 0, items: [] });
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'دوباره امتحان کنید' }));
    expect(await screen.findByText('هنوز اعلانی ندارید')).toBeInTheDocument();
  });

  it('offers to turn on notifications on this device, and explains once when the browser blocks them', async () => {
    api.list.mockResolvedValue({ unread: 0, items: [] });
    push.permission = 'default';
    const { unmount } = show();
    await userEvent.click(await screen.findByRole('button', { name: 'فعال کردن' }));
    expect(push.enablePush).toHaveBeenCalledWith({ ask: true });
    unmount();
    push.permission = 'denied';
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'متوجه شدم' }));
    await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith({ permission_explained: true }));
  });
});
