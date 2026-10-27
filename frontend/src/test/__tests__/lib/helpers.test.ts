import { describe, it, expect, vi, afterEach } from 'vitest';
import { deadlineInfo, persianDate } from '@/components/letters/letterFormat';
import { buildNavigation } from '@/config/navigation';
import { commandShortcutLabel } from '@/lib/command';

const isoInDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('letter deadlines', () => {
  it('has nothing to say without a deadline', () => {
    expect(deadlineInfo(null)).toBeNull();
    expect(deadlineInfo('not a date')).toBeNull();
  });

  it('flags overdue, today and tomorrow as urgent', () => {
    expect(deadlineInfo(isoInDays(-2))).toMatchObject({ urgent: true, label: expect.stringMatching(/^مهلت گذشته/) });
    expect(deadlineInfo(isoInDays(0))).toEqual({ label: 'مهلت: امروز', urgent: true });
    expect(deadlineInfo(isoInDays(1))).toEqual({ label: 'مهلت: فردا', urgent: true });
  });

  it('counts the days left in Persian digits and is urgent only within three days', () => {
    expect(deadlineInfo(isoInDays(3))).toMatchObject({ urgent: true, label: expect.stringContaining('(۳ روز)') });
    expect(deadlineInfo(isoInDays(10))).toMatchObject({ urgent: false, label: expect.stringContaining('(۱۰ روز)') });
  });

  it('writes dates in the Persian calendar', () => {
    expect(persianDate('2026-11-06')).toBe('۱۵ آبان ۱۴۰۵');
    expect(persianDate('2026-11-06', false)).toBe('۱۵ آبان');
    expect(persianDate('')).toBe('');
  });
});

describe('navigation', () => {
  const domains = buildNavigation();

  it('covers the four domains', () => {
    expect(domains.map((d) => d.id)).toEqual(['personal', 'professional', 'organizational', 'social']);
  });

  it('gives every destination a unique id within its domain and an app path', () => {
    for (const domain of domains) {
      const items = domain.categories.flatMap((c) => c.items);
      expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
      for (const item of items) expect(item.path).toMatch(/^\//);
    }
  });

  it('lists the letters section under organizational correspondence', () => {
    const org = domains.find((d) => d.id === 'organizational')!;
    const letters = org.categories.flatMap((c) => c.items).find((i) => i.path === '/organizational-letters');
    expect(letters?.label).toBe('نامه‌ها و بخشنامه‌ها');
  });

  it('shows sidebar counts from the stats it is given', () => {
    const withStats = buildNavigation({ stats: { personalPlanning: 4 } as never });
    const planning = withStats[0].categories.flatMap((c) => c.items).find((i) => i.id === 'personal-planning');
    expect(planning?.count).toBe(4);
  });
});

describe('command shortcut label', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses ⌘ on Apple devices and Ctrl elsewhere', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel', userAgent: '' });
    expect(commandShortcutLabel()).toBe('⌘K');
    vi.stubGlobal('navigator', { platform: 'Win32', userAgent: '' });
    expect(commandShortcutLabel()).toBe('Ctrl K');
  });
});
