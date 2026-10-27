import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { CommandPalette } from '@/components/command/CommandPalette';
import { openCommandPalette } from '@/lib/command';
import { ASSISTANT_ASK_EVENT, type AssistantAskDetail } from '@/lib/assistant';

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

const search = () => screen.getByPlaceholderText('جستجوی صفحه‌ها یا پرسش از دستیار…');

describe('Command palette', () => {
  const user = userEvent.setup();

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
});
