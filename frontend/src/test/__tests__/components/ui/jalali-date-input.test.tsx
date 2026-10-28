import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { Input } from '@/components/ui/input';

function Controlled({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <Input id="due" type="date" value={value} onChange={(e) => setValue(e.target.value)} />
      <output aria-label="مقدار">{value}</output>
    </>
  );
}

describe('date inputs on the Jalali calendar', () => {
  const user = userEvent.setup();

  it('shows a stored Gregorian date as its Jalali day', () => {
    render(<Controlled initial="2026-10-28" />);
    expect(document.getElementById('due')!.textContent).toContain('۶ آبان ۱۴۰۵');
  });

  it('writes the picked Jalali day back as yyyy-MM-dd', async () => {
    render(<Controlled initial="2026-10-28" />);
    await user.click(document.getElementById('due')!);
    await user.click(screen.getByRole('button', { name: 'یک‌شنبه ۱۰ آبان ۱۴۰۵' }));
    expect(screen.getByLabelText('مقدار').textContent).toBe('2026-11-01');
  });

  it('follows react-hook-form defaults and resets', async () => {
    let api!: ReturnType<typeof useForm<{ when: string }>>;
    function Form() {
      api = useForm<{ when: string }>({ defaultValues: { when: '2026-03-21' } });
      return <Input id="when" type="date" {...api.register('when')} />;
    }
    render(<Form />);
    expect(document.getElementById('when')!.textContent).toContain('۱ فروردین ۱۴۰۵');
    act(() => api.reset({ when: '2026-10-28' }));
    expect(document.getElementById('when')!.textContent).toContain('۶ آبان ۱۴۰۵');
    await user.click(document.getElementById('when')!);
    await user.click(screen.getByRole('button', { name: 'پنج‌شنبه ۷ آبان ۱۴۰۵' }));
    expect(api.getValues('when')).toBe('2026-10-29');
  });
});
