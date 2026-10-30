import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { CommandPalette } from '@/components/command/CommandPalette';
import { openCommandPalette } from '@/lib/command';
import { ASSISTANT_ASK_EVENT, type AssistantAskDetail } from '@/lib/assistant';
import type { SearchResult } from '@/services/searchService';

const searchRecords = vi.fn();
vi.mock('@/services/searchService', async (orig) => ({
  ...(await orig<typeof import('@/services/searchService')>()),
  searchRecords: (...args: unknown[]) => searchRecords(...args),
}));

const empty = (q: string): SearchResult => ({ query: q, words: [q], total: 0, groups: [] });
const need = (id: string, title: string) => ({
  id, type: 'need', title, snippet: `${title} — ۱۲۰ خانوار`, date: '2026-10-28T10:00:00.000Z',
  path: `/organizational/khadim-e-khalgh/needs?highlight=${id}`, titleHit: true,
});

function Where() {
  const location = useLocation();
  return <output aria-label="مسیر">{location.pathname + location.search}</output>;
}

function renderPalette() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="*" element={<><CommandPalette /><Where /></>} />
      </Routes>
    </MemoryRouter>
  );
}

const search = () => screen.getByPlaceholderText('جستجو در داده‌ها و صفحه‌ها، یا پرسش از دستیار…');

describe('Command palette', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    searchRecords.mockReset();
    searchRecords.mockImplementation(async (q: string) => empty(q));
  });

  it('opens with Ctrl K on any keyboard layout', () => {
    renderPalette();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // A Persian layout reports «ن» as the key, but the physical key is still K
    fireEvent.keyDown(window, { key: 'ن', code: 'KeyK', ctrlKey: true });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('opens from the header trigger', () => {
    renderPalette();
    act(() => openCommandPalette());
    expect(search()).toBeInTheDocument();
  });

  it('finds a page and goes there', async () => {
    renderPalette();
    act(() => openCommandPalette());
    await user.type(search(), 'نامه');
    await user.click(screen.getByRole('option', { name: /نامه‌ها و بخشنامه‌ها/ }));
    expect(screen.getByLabelText('مسیر')).toHaveTextContent('/organizational-letters');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hands free text to the assistant', async () => {
    const asks: AssistantAskDetail[] = [];
    const onAsk = (e: Event) => asks.push((e as CustomEvent<AssistantAskDetail>).detail);
    window.addEventListener(ASSISTANT_ASK_EVENT, onAsk);

    renderPalette();
    act(() => openCommandPalette());
    await user.type(search(), 'قرارداد شرکت آریا کی تمام می‌شود؟');
    const ask = screen.getByRole('option', { name: /از دستیار بپرس/ });
    expect(ask).toHaveAttribute('data-selected', 'true');
    await user.keyboard('{Enter}');

    expect(asks).toEqual([{ text: 'قرارداد شرکت آریا کی تمام می‌شود؟', send: true }]);
    window.removeEventListener(ASSISTANT_ASK_EVENT, onAsk);
  });

  it('starts new items from the create group', async () => {
    renderPalette();
    act(() => openCommandPalette());
    await user.click(screen.getByRole('option', { name: /بارگذاری نامه/ }));
    expect(screen.getByLabelText('مسیر')).toHaveTextContent('/organizational-letters?upload=1');
  });

  it('finds the person\'s own records, grouped by type, and opens the one chosen', async () => {
    searchRecords.mockImplementation(async (q: string) => ({
      query: q, words: [q], total: 1,
      groups: [{ type: 'need', label: 'نیاز اجتماعی', total: 1, items: [need('n1', 'آب شرب روستای کلاته')] }],
    }));
    renderPalette();
    act(() => openCommandPalette());
    await user.type(search(), 'کلاته');
    const found = await screen.findByRole('option', { name: /آب شرب روستای کلاته/ });
    expect(screen.getByRole('group', { name: /نیاز اجتماعی/ })).toBeInTheDocument();
    expect(found).toHaveTextContent('۱۲۰ خانوار');
    expect(found).toHaveTextContent('۱۴۰۵');
    expect(screen.getByRole('status')).toHaveTextContent('۱ مورد در داده‌های شما پیدا شد');
    // the assistant stays first, so Enter still asks it
    expect(screen.getByRole('option', { name: /از دستیار بپرس/ })).toHaveAttribute('data-selected', 'true');
    await user.click(found);
    expect(screen.getByLabelText('مسیر')).toHaveTextContent('/organizational/khadim-e-khalgh/needs?highlight=n1');
  });

  it('waits for a pause in typing and does not search one letter', async () => {
    renderPalette();
    act(() => openCommandPalette());
    await user.type(search(), 'ک');
    await new Promise((r) => setTimeout(r, 400));
    expect(searchRecords).not.toHaveBeenCalled();
    await user.type(search(), 'لاته');
    await waitFor(() => expect(searchRecords).toHaveBeenCalledTimes(1));
    expect(searchRecords.mock.calls[0][0]).toBe('کلاته');
  });

  it('shows more of one type on request', async () => {
    const five = Array.from({ length: 5 }, (_, i) => need(`n${i}`, `نیاز کلاته ${i}`));
    const seven = [...five, need('n5', 'نیاز کلاته 5'), need('n6', 'نیاز کلاته 6')];
    searchRecords.mockImplementation(async (q: string, opts?: { type?: string }) => ({
      query: q, words: [q], total: 7,
      groups: [{ type: 'need', label: 'نیاز اجتماعی', total: 7, items: opts?.type ? seven : five }],
    }));
    renderPalette();
    act(() => openCommandPalette());
    await user.type(search(), 'کلاته');
    await user.click(await screen.findByRole('option', { name: /۲ مورد دیگر/ }));
    expect(await screen.findByRole('option', { name: /نیاز کلاته 6/ })).toBeInTheDocument();
    expect(searchRecords).toHaveBeenLastCalledWith('کلاته', expect.objectContaining({ type: 'need', limit: 20 }));
    expect(screen.queryByRole('option', { name: /مورد دیگر/ })).not.toBeInTheDocument();
  });

  it('says when nothing was found and when search is unavailable, and pages still work', async () => {
    renderPalette();
    act(() => openCommandPalette());
    await user.type(search(), 'زززز');
    expect(await screen.findByText(/چیزی با «زززز» پیدا نشد/)).toBeInTheDocument();

    searchRecords.mockRejectedValue(new Error('offline'));
    await user.clear(search());
    await user.type(search(), 'نامه');
    expect(await screen.findByText(/صفحه‌ها همچنان پیدا می‌شوند/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('الان در دسترس نیست');
    expect(screen.getByRole('option', { name: /نامه‌ها و بخشنامه‌ها/ })).toBeInTheDocument();
  });

  it('matches pages whatever the writing (ي/ك, ZWNJ)', async () => {
    renderPalette();
    act(() => openCommandPalette());
    await user.type(search(), 'بخشنامهها');
    expect(screen.getByRole('option', { name: /نامه‌ها و بخشنامه‌ها/ })).toBeInTheDocument();
  });

  it('never lets an older answer replace a newer one', async () => {
    let releaseFirst: (r: SearchResult) => void = () => {};
    searchRecords.mockImplementationOnce((q: string, { signal }: { signal: AbortSignal }) =>
      new Promise<SearchResult>((resolve, reject) => {
        releaseFirst = resolve;
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }).then(() => ({ query: q, words: [q], total: 1, groups: [{ type: 'need', label: 'نیاز اجتماعی', total: 1, items: [need('old', 'نتیجه کهنه')] }] })));
    searchRecords.mockImplementationOnce(async (q: string) => ({
      query: q, words: [q], total: 1, groups: [{ type: 'need', label: 'نیاز اجتماعی', total: 1, items: [need('new', 'نتیجه تازه')] }],
    }));
    renderPalette();
    act(() => openCommandPalette());
    await user.type(search(), 'کلا');
    await waitFor(() => expect(searchRecords).toHaveBeenCalledTimes(1));
    await user.type(search(), 'ته');
    expect(await screen.findByRole('option', { name: /نتیجه تازه/ })).toBeInTheDocument();
    act(() => releaseFirst(empty('کلا')));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('option', { name: /نتیجه کهنه/ })).not.toBeInTheDocument();
  });
});
