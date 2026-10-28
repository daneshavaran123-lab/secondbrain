import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PersianDatePicker } from '@/components/ui/persian-date-picker';

describe('PersianDatePicker', () => {
  it('returns the picked day at noon, so toISOString keeps the same day in Tehran', async () => {
    const onChange = vi.fn();
    render(<PersianDatePicker value={new Date(2026, 9, 28, 12)} onChange={onChange} placeholder="روز" />);
    await userEvent.click(screen.getByRole('button', { name: /۱۴۰۵|روز/ }));
    await userEvent.click(screen.getByRole('button', { name: '۱۰' }));
    const picked: Date = onChange.mock.calls[0][0];
    expect(picked.getHours()).toBe(12);
    // 10 Aban 1405 is 1 Nov 2026; at noon local time the UTC date is the same day from UTC-11 to UTC+11
    expect([picked.getFullYear(), picked.getMonth() + 1, picked.getDate()]).toEqual([2026, 11, 1]);
    expect(picked.toISOString().slice(0, 10)).toBe('2026-11-01');
  });
});
