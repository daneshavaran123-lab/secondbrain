import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Needs from '@/pages/organizational/khadim-e-khalgh/Needs';
import Partners from '@/pages/organizational/khadim-e-khalgh/Partners';
import Roadmap from '@/pages/organizational/khadim-e-khalgh/Roadmap';

// Lists saved by older versions can hold items with only an id and a title; the pages used to
// crash on them (reading estimatedCost / expertise / milestones of undefined).
const OLD_ITEMS: Record<string, unknown[]> = {
  khk_social_needs: [{ id: 1, title: 'آب شرب روستا' }],
  partners: [{ id: 'p1', name: 'خیریه قدیمی' }],
  'roadmap-programs': [{ id: 3, title: 'برنامه قدیمی', status: 'active' }],
};

vi.mock('@/services/userCollections', () => ({
  useUserCollection: (key: string, normalize: (items: unknown[]) => unknown[] = (x) => x) =>
    [normalize(OLD_ITEMS[key] ?? []), vi.fn(), { loading: false }] as const,
}));

const show = (page: React.ReactElement) => render(<MemoryRouter initialEntries={['/?highlight=1']}>{page}</MemoryRouter>);

describe('Khadim-e-Khalgh lists with items saved by older versions', () => {
  it('the needs page shows an old need', () => {
    show(<Needs />);
    expect(screen.getByText('آب شرب روستا')).toBeInTheDocument();
    expect(document.querySelector('[data-search-id="1"]')).not.toBeNull();
  });

  it('the partners page shows an old partner', () => {
    show(<Partners />);
    expect(screen.getAllByText('خیریه قدیمی').length).toBeGreaterThan(0);
  });

  it('the roadmap shows an old program', () => {
    show(<Roadmap />);
    expect(screen.getAllByText('برنامه قدیمی').length).toBeGreaterThan(0);
  });
});
