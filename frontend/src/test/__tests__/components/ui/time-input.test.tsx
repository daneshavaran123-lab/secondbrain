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
      <Input type="time" aria-label="شروع" value={value} onChange={(e) => setValue(e.target.value)} />
      <output aria-label="مقدار">{value}</output>
    </>
  );
}

describe('time inputs in Persian', () => {
  const user = userEvent.setup();

  it('shows a stored HH:mm with Persian digits', () => {
    render(<Controlled initial="09:30" />);
    const hour = screen.getByRole('combobox', { name: 'شروع: ساعت' }) as HTMLSelectElement;
    const minute = screen.getByRole('combobox', { name: 'شروع: دقیقه' }) as HTMLSelectElement;
    expect(hour.value).toBe('09');
    expect(hour.selectedOptions[0].textContent).toBe('۰۹');
    expect(minute.selectedOptions[0].textContent).toBe('۳۰');
  });

  it('writes the picked hour and minute back as HH:mm', async () => {
    render(<Controlled />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'شروع: ساعت' }), '14');
    expect(screen.getByLabelText('مقدار').textContent).toBe('14:00');
    await user.selectOptions(screen.getByRole('combobox', { name: 'شروع: دقیقه' }), '45');
    expect(screen.getByLabelText('مقدار').textContent).toBe('14:45');
    await user.click(screen.getByRole('button', { name: 'پاک کردن ساعت' }));
    expect(screen.getByLabelText('مقدار').textContent).toBe('');
  });

  it('keeps a minute that is not on the five-minute list', () => {
    render(<Controlled initial="10:07" />);
    expect((screen.getByRole('combobox', { name: 'شروع: دقیقه' }) as HTMLSelectElement).selectedOptions[0].textContent).toBe('۰۷');
  });

  it('follows react-hook-form defaults, changes and resets', async () => {
    let api!: ReturnType<typeof useForm<{ at: string }>>;
    function Form() {
      api = useForm<{ at: string }>({ defaultValues: { at: '08:15' } });
      return <Input type="time" aria-label="یادآوری" {...api.register('at')} />;
    }
    render(<Form />);
    const hour = screen.getByRole('combobox', { name: 'یادآوری: ساعت' }) as HTMLSelectElement;
    expect(hour.value).toBe('08');
    await user.selectOptions(hour, '21');
    expect(api.getValues('at')).toBe('21:15');
    act(() => api.reset({ at: '06:00' }));
    expect((screen.getByRole('combobox', { name: 'یادآوری: ساعت' }) as HTMLSelectElement).value).toBe('06');
  });
});
