import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SmartAssistant } from '@/components/assistant/SmartAssistant';
import { askAssistant } from '@/lib/assistant';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  executeAction: vi.fn(),
  logAssistantAction: vi.fn(),
}));

vi.mock('@/lib/api', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('@/services/actionExecutorService', () => ({ actionExecutor: { executeAction: mocks.executeAction } }));
vi.mock('@/services/assistantLogService', () => ({ logAssistantAction: mocks.logAssistantAction }));
// File reading pulls in OCR and spreadsheet libraries the conversation does not need here
vi.mock('@/services/fileProcessorService', () => ({ fileProcessor: { processFile: vi.fn() } }));
// Voice mode loads the on-device wake-word engine, which only ships a browser build
vi.mock('@/components/assistant/MoraVoiceAssistant', () => ({ MoraVoiceAssistant: () => null }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { first_name: 'سارا' } }) }));
vi.mock('@/hooks/usePersianTTS', () => ({
  usePersianTTS: () => ({ isEnabled: false, isSpeaking: false, isSupported: false, speak: vi.fn(), stop: vi.fn(), toggleEnabled: vi.fn() }),
}));

const reply = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

function renderAssistant() {
  return render(
    <MemoryRouter>
      <SmartAssistant />
    </MemoryRouter>
  );
}

const panel = () => screen.getByRole('complementary', { name: 'دستیار مغز دوم من' });

describe('Assistant conversation', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.executeAction.mockResolvedValue({ success: true, message: 'ثبت شد' });
  });

  it('opens from anywhere, sends the question and shows the answer with what it did', async () => {
    mocks.apiFetch.mockReturnValueOnce(reply({
      message: 'جلسه **فردا ساعت ۱۰** ثبت شد.',
      steps: [{ tool: 'search_calendar', label: 'تقویم را بررسی کرد' }],
      actions: [{
        function: 'create_meeting',
        params: { title: 'جلسه با تیم', date: '2026-10-28', time: '10:00' },
        status: 'pending',
        feedback: { location: 'تقویم', details: 'فردا ساعت ۱۰' },
      }],
    }));

    renderAssistant();
    act(() => askAssistant('فردا ساعت ۱۰ جلسه با تیم بذار'));

    expect(await within(panel()).findByText('فردا ساعت ۱۰ جلسه با تیم بذار')).toBeInTheDocument();
    expect(mocks.apiFetch).toHaveBeenCalledWith('/smart-assistant', expect.objectContaining({ method: 'POST' }));
    const body = JSON.parse(mocks.apiFetch.mock.calls[0][1].body);
    expect(body.message).toBe('فردا ساعت ۱۰ جلسه با تیم بذار');

    // Markdown is rendered, the agent's steps are listed and the action runs by itself
    expect(await within(panel()).findByText('فردا ساعت ۱۰', { selector: 'strong' })).toBeInTheDocument();
    expect(within(panel()).getByRole('list', { name: 'کارهایی که دستیار انجام داد' })).toHaveTextContent('تقویم را بررسی کرد');
    await waitFor(() => expect(mocks.executeAction).toHaveBeenCalledWith(expect.objectContaining({ function: 'create_meeting' })));
    expect(await within(panel()).findByText(/انجام شد/)).toBeInTheDocument();
    expect(mocks.logAssistantAction).toHaveBeenCalledWith(expect.objectContaining({ action_type: 'create_meeting', status: 'success' }));
  });

  it('waits for approval before a sensitive action, and runs it only when approved', async () => {
    mocks.apiFetch.mockReturnValueOnce(reply({
      message: 'این پیامک را بفرستم؟',
      actions: [{ function: 'send_sms', params: { to: '09120000000', text: 'سلام' }, status: 'needs_confirmation', feedback: { location: 'پیامک', details: 'به ۰۹۱۲۰۰۰۰۰۰۰' } }],
    }));

    renderAssistant();
    act(() => askAssistant('به علی پیامک بده سلام'));

    const approve = await within(panel()).findByRole('button', { name: 'تأیید و انجام' });
    expect(within(panel()).getByText(/منتظر تأیید/)).toBeInTheDocument();
    expect(mocks.executeAction).not.toHaveBeenCalled();

    await user.click(approve);
    await waitFor(() => expect(mocks.executeAction).toHaveBeenCalledWith(expect.objectContaining({ function: 'send_sms' })));
  });

  it('does nothing when the user declines', async () => {
    mocks.apiFetch.mockReturnValueOnce(reply({
      message: 'جلسه را لغو کنم؟',
      actions: [{ function: 'cancel_meeting', params: { id: 'e1' }, status: 'needs_confirmation', feedback: { location: 'تقویم' } }],
    }));

    renderAssistant();
    act(() => askAssistant('جلسه فردا را لغو کن'));
    await user.click(await within(panel()).findByRole('button', { name: 'نه، ممنون' }));

    expect(within(panel()).getByText(/رد شد/)).toBeInTheDocument();
    expect(mocks.executeAction).not.toHaveBeenCalled();
  });

  it('turns clarifying options into one-tap answers', async () => {
    mocks.apiFetch
      .mockReturnValueOnce(reply({ message: 'کدام روز؟', questions: [{ question: 'کدام روز؟', options: ['فردا', 'پس‌فردا'] }] }))
      .mockReturnValueOnce(reply({ message: 'باشه، فردا.' }));

    renderAssistant();
    act(() => askAssistant('یک جلسه بذار'));
    await user.click(await within(panel()).findByRole('button', { name: 'پس‌فردا' }));

    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(mocks.apiFetch.mock.calls[1][1].body).message).toBe('پس‌فردا');
  });

  it('explains a server failure in Persian instead of failing silently', async () => {
    mocks.apiFetch.mockReturnValueOnce(reply({ error: 'سرویس هوش مصنوعی در دسترس نیست' }, 503));

    renderAssistant();
    act(() => askAssistant('برنامه امروزم چیه؟'));

    expect(await within(panel()).findByText('سرویس هوش مصنوعی در دسترس نیست')).toBeInTheDocument();
  });
});
