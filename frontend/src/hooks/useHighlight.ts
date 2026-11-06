import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';

// an outline, not a ring: cards set their own box-shadow, which would hide a ring
const RING = ['outline', 'outline-2', 'outline-offset-4', 'outline-signal'];

/**
 * Brings the record named by ?highlight=<id> (a search result) into view and outlines it for
 * a moment. Items opt in with data-search-id; `ready` is true once the page's list is shown.
 */
export function useHighlight(ready = true) {
  const [params] = useSearchParams();
  const id = params.get('highlight');

  useEffect(() => {
    if (!id || !ready) return;
    let tries = 0;
    let clear: ReturnType<typeof setTimeout> | undefined;
    const find = () => [...document.querySelectorAll<HTMLElement>('[data-search-id]')].find((el) => el.dataset.searchId === id);
    const poll = setInterval(() => {
      const el = find();
      if (!el && ++tries < 20) return;
      clearInterval(poll);
      if (!el) {
        // the page is open; the record itself is gone (deleted since the link was made)
        toast({ title: 'این مورد دیگر وجود ندارد', description: 'ممکن است حذف شده باشد؛ بقیه موردهای همین بخش این‌جا هستند.' });
        return;
      }
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add(...RING);
      clear = setTimeout(() => el.classList.remove(...RING), 2500);
    }, 100);
    return () => {
      clearInterval(poll);
      if (clear) clearTimeout(clear);
    };
  }, [id, ready]);
}
