import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AssistantMarkdown } from '@/components/assistant/AssistantMarkdown';
import { actionPage, referenceFor, type AssistantReference } from '@/lib/assistantLinks';

const refs: AssistantReference[] = [
  { key: 'r1', type: 'need', id: 'n1', title: 'آب شرب روستای کلاته', label: 'نیاز اجتماعی', path: '/organizational/khadim-e-khalgh/needs?highlight=n1' },
  { key: 'r2', type: 'idea', id: 'x', title: 'بد', path: 'https://evil.example' },
];

function Where() {
  const l = useLocation();
  return <output aria-label="مسیر">{l.pathname + l.search}</output>;
}

const show = (content: string) => render(
  <MemoryRouter>
    <Routes><Route path="*" element={<><AssistantMarkdown content={content} references={refs} /><Where /></>} /></Routes>
  </MemoryRouter>,
);

describe('links in assistant answers', () => {
  it('a record of this answer is an in-app link with its type for screen readers', async () => {
    show('نیاز [آب شرب کلاته](ref:r1) در حال اجراست.');
    const link = screen.getByRole('link', { name: 'نیاز اجتماعی: آب شرب روستای کلاته' });
    expect(link).toHaveAttribute('href', '/organizational/khadim-e-khalgh/needs?highlight=n1');
    await userEvent.click(link);
    expect(screen.getByLabelText('مسیر')).toHaveTextContent('/organizational/khadim-e-khalgh/needs?highlight=n1');
  });

  it('a link with Tab and Enter', async () => {
    show('[آب شرب کلاته](ref:r1)');
    await userEvent.tab();
    expect(screen.getByRole('link')).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByLabelText('مسیر')).toHaveTextContent('highlight=n1');
  });

  it('outside links, unknown keys and references to outside pages are plain text', () => {
    show('[سایت](https://evil.example) و [ساختگی](ref:r9) و [بد](ref:r2) و <https://x.example> و ![تصویر](https://x/y.png)');
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText(/سایت/)).toBeInTheDocument();
  });

  it('referenceFor accepts only keys of this answer with an in-app page', () => {
    expect(referenceFor('ref:r1', refs)?.id).toBe('n1');
    expect(referenceFor('ref:r2', refs)).toBeNull();
    expect(referenceFor('ref:r9', refs)).toBeNull();
    expect(referenceFor('/tasks', refs)).toBeNull();
    expect(referenceFor(undefined, refs)).toBeNull();
  });

  it('«باز کردن» goes to the page, with the new record when the page can show it', () => {
    expect(actionPage({ page: '/contacts', highlight: true }, 'c 1')).toBe('/contacts?highlight=c%201');
    expect(actionPage({ page: '/contacts', highlight: true }, undefined)).toBe('/contacts');
    expect(actionPage({ page: '/calendar' }, 'e1')).toBe('/calendar');
    expect(actionPage({ page: 'https://evil.example' }, 'x')).toBeNull();
    expect(actionPage(undefined, 'x')).toBeNull();
  });
});
