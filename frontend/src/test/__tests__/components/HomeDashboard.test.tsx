import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MinimalDashboard } from '@/components/ui/minimal-dashboard';
import { ASSISTANT_ASK_EVENT, type AssistantAskDetail } from '@/lib/assistant';

const services = vi.hoisted(() => ({
  getDashboardStats: vi.fn(),
  getRecentActivities: vi.fn(),
  getTodaysFocus: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { first_name: 'سارا', display_name: 'سارا کرباسی' } }),
}));
vi.mock('@/services/dashboardService', () => ({ getDashboardStats: services.getDashboardStats }));
vi.mock('@/services/activityService', () => ({
  getRecentActivities: services.getRecentActivities,
  getTodaysFocus: services.getTodaysFocus,
}));

const STATS = {
  todayActivities: 12,
  weeklyMeetings: 4,
  newIdeas: 3,
  totalKnowledgeItems: 0,
  activeProjects: 2,
  activeMissions: 1,
  activePolicies: 0,
  totalClaims: 0,
};

function renderHome() {
  return render(
    <MemoryRouter>
      <MinimalDashboard />
    </MemoryRouter>
  );
}

/** Collect what the home screen sends to the assistant. */
function listenForAsks() {
  const asks: AssistantAskDetail[] = [];
  const onAsk = (e: Event) => asks.push((e as CustomEvent<AssistantAskDetail>).detail);
  window.addEventListener(ASSISTANT_ASK_EVENT, onAsk);
  return { asks, stop: () => window.removeEventListener(ASSISTANT_ASK_EVENT, onAsk) };
}

describe('Home dashboard', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    services.getDashboardStats.mockResolvedValue(STATS);
    services.getRecentActivities.mockResolvedValue([{ id: 'r1', title: 'جلسه با تیم مالی', time: '۱۰:۳۰', type: 'info' }]);
    services.getTodaysFocus.mockResolvedValue([
      { id: 't1', title: 'ارسال گزارش فصلی', status: 'pending', type: 'task' },
      { id: 'm1', title: 'جلسه با تیم مالی', time: '۱۰:۳۰', status: 'in_progress', type: 'meeting' },
      { id: 't2', title: 'بررسی قرارداد', status: 'completed', type: 'task' },
    ]);
  });

  it('greets the user by name in the page title', () => {
    renderHome();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/سارا/);
  });

  it('shows the headline counts in Persian digits', async () => {
    renderHome();
    const overview = screen.getByRole('region', { name: 'نمای کلی' });
    await waitFor(() => expect(within(overview).getByText('۱۲')).toBeInTheDocument());
    expect(within(overview).getByText('فعالیت‌های امروز')).toBeInTheDocument();
    expect(within(overview).getByText('۴')).toBeInTheDocument();
    // The organisational counts wait behind «همه آمار»
    expect(within(overview).queryByText('پروژه‌های فعال')).not.toBeInTheDocument();
    await user.click(within(overview).getByRole('button', { name: 'همه آمار' }));
    expect(within(overview).getByText('پروژه‌های فعال')).toBeInTheDocument();
  });

  it("lists today's items and marks only those in progress or done", async () => {
    renderHome();
    const today = screen.getByRole('region', { name: 'امروز' });
    expect(await within(today).findByText('ارسال گزارش فصلی')).toBeInTheDocument();
    expect(within(today).getByText('در حال انجام')).toBeInTheDocument();
    expect(within(today).getByText('انجام شد')).toBeInTheDocument();
    expect(within(today).queryByText('در انتظار')).not.toBeInTheDocument();
  });

  it('offers to plan the day when nothing is scheduled', async () => {
    services.getTodaysFocus.mockResolvedValue([]);
    const { asks, stop } = listenForAsks();
    renderHome();
    const today = screen.getByRole('region', { name: 'امروز' });
    await user.click(await within(today).findByRole('button', { name: 'از دستیار برنامه بخواه' }));
    expect(asks).toEqual([{ text: 'برای امروزم یک برنامه پیشنهاد بده', send: true }]);
    stop();
  });

  it('sends what is typed in the ask bar to the assistant', async () => {
    const { asks, stop } = listenForAsks();
    renderHome();
    const input = screen.getByRole('textbox', { name: 'پیام به دستیار' });
    const send = screen.getByRole('button', { name: 'ارسال' });
    expect(send).toBeDisabled();

    await user.type(input, 'فردا ساعت ۹ با دکتر احمدی جلسه دارم');
    await user.click(send);

    expect(asks).toEqual([{ text: 'فردا ساعت ۹ با دکتر احمدی جلسه دارم', send: true }]);
    expect(input).toHaveValue('');
    stop();
  });

  it('prefills the ask bar for open-ended prompts instead of sending them', async () => {
    const { asks, stop } = listenForAsks();
    renderHome();
    await user.click(screen.getByRole('button', { name: 'یه ایده دارم…' }));
    expect(asks).toEqual([]);
    expect(screen.getByRole('textbox', { name: 'پیام به دستیار' })).toHaveValue('یه ایده دارم: ');
    stop();
  });

  it('links to the main company when one is set', () => {
    localStorage.setItem('main_company', JSON.stringify({ company_name: 'دانش‌آوران' }));
    renderHome();
    expect(screen.getByRole('link', { name: /دانش‌آوران/ })).toHaveAttribute('href', '/companies');
    localStorage.removeItem('main_company');
  });
});
