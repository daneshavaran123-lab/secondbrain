import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MinimalDashboard } from '@/components/ui/minimal-dashboard';
import { CommandPalette } from '@/components/command/CommandPalette';
import { SmartAssistant } from '@/components/assistant/SmartAssistant';
import { askAssistant } from '@/lib/assistant';

// The home screen, the palette and the assistant as they sit together in the app shell,
// with the network replaced by empty answers.
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { first_name: 'سارا' } }) }));
vi.mock('@/services/dashboardService', () => ({
  getDashboardStats: vi.fn().mockResolvedValue({
    todayActivities: 0, weeklyMeetings: 0, newIdeas: 0, totalKnowledgeItems: 0,
    activeProjects: 0, activeMissions: 0, activePolicies: 0, totalClaims: 0,
  }),
}));
vi.mock('@/services/activityService', () => ({
  getRecentActivities: vi.fn().mockResolvedValue([]),
  getTodaysFocus: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));
vi.mock('@/services/actionExecutorService', () => ({ actionExecutor: { executeAction: vi.fn() } }));
vi.mock('@/services/assistantLogService', () => ({ logAssistantAction: vi.fn() }));
vi.mock('@/services/fileProcessorService', () => ({ fileProcessor: { processFile: vi.fn() } }));
vi.mock('@/components/assistant/MoraVoiceAssistant', () => ({ MoraVoiceAssistant: () => null }));

function renderShell() {
  return render(
    <MemoryRouter>
      <main>
        <MinimalDashboard />
      </main>
      <SmartAssistant />
      <CommandPalette />
    </MemoryRouter>
  );
}

describe('Smoke', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { consoleError = vi.spyOn(console, 'error'); });
  afterEach(() => consoleError.mockRestore());

  it('renders the home screen without errors', async () => {
    renderShell();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(await screen.findByText('برای امروز جلسه یا کاری ثبت نشده.')).toBeInTheDocument();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('is written in Persian, right to left', () => {
    const { container } = renderShell();
    expect(container.textContent).toMatch(/[؀-ۿ]/);
    expect(screen.getByRole('textbox', { name: 'پیام به دستیار' })).toBeInTheDocument();
  });

  it('opens the command palette and the assistant on demand', () => {
    renderShell();
    fireEvent.keyDown(window, { key: 'k', code: 'KeyK', metaKey: true });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'k', code: 'KeyK', metaKey: true });

    act(() => askAssistant('', false));
    expect(screen.getByRole('complementary', { name: 'دستیار مغز دوم من' })).toBeInTheDocument();
  });
});
