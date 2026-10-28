import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Newspaper, RefreshCw, Search, TrendingUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns-jalali';
import { SectionHeader } from '@/components/ui/section-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

// Latest headlines from news agencies' RSS feeds (read by the server), grouped by field.

interface Headline {
  title: string;
  url: string;
  snippet: string;
  date: string | null;
  source: string;
  domains: string[];
  keywords: string[];
}
interface NewsResponse {
  items: Headline[];
  sources: { source: string; count: number }[];
  keywords: { word: string; count: number }[];
  domains: string[];
  fetched_at: string;
}

const faDigits = (s: string) => s.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
const ago = (iso: string) => faDigits(formatDistanceToNow(new Date(iso), { addSuffix: true }));

const TrendsPage = () => {
  const [news, setNews] = useState<NewsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState<string>('all');

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await apiFetch(`/news${fresh ? '?fresh=1' : ''}`);
      if (!res.ok) throw new Error(String(res.status));
      setNews(await res.json());
    } catch {
      setFailed(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const items = news?.items ?? [];
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of items) for (const d of i.domains) c[d] = (c[d] || 0) + 1;
    return c;
  }, [items]);
  const q = query.trim();
  const shown = items.filter((i) =>
    (domain === 'all' || i.domains.includes(domain)) &&
    (!q || i.title.includes(q) || i.snippet.includes(q) || i.source.includes(q)));
  const reached = news?.sources.filter((s) => s.count > 0).length ?? 0;

  return (
    <div className="space-y-6 p-3 md:p-6">
      <SectionHeader
        title="رصد اخبار"
        subtitle="تازه‌ترین تیترهای خبرگزاری‌ها، دسته‌بندی‌شده بر اساس حوزه"
        icon={<TrendingUp className="h-6 w-6" />}
        action={
          <Button variant="outline" onClick={() => load(true)} disabled={loading} className="gap-2">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            به‌روزرسانی
          </Button>
        }
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جستجو در تیترها، مثلاً «بورس»…" className="ps-9" aria-label="جستجو در تیترها" />
        </div>
        {news && (
          <p className="text-sm text-muted-foreground">
            {faDigits(String(items.length))} تیتر از {faDigits(String(reached))} خبرگزاری · {ago(news.fetched_at)}
          </p>
        )}
      </div>

      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="حوزه">
          {['all', ...(news?.domains ?? [])].map((d) => (
            <Button key={d} size="sm" variant={domain === d ? 'default' : 'outline'} aria-pressed={domain === d} onClick={() => setDomain(d)}>
              {d === 'all' ? 'همه' : d}
              {d !== 'all' && <span className="ms-1 opacity-70">{faDigits(String(counts[d] || 0))}</span>}
            </Button>
          ))}
        </div>
      )}

      {news && news.keywords.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-2 text-sm font-medium">پرتکرارترین کلیدواژه‌ها</div>
            <div className="flex flex-wrap gap-1.5">
              {news.keywords.map((k) => (
                <button key={k.word} type="button" onClick={() => setQuery(k.word)} className="rounded-full border px-3 py-1 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {k.word} <span className="text-muted-foreground">{faDigits(String(k.count))}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {loading && !news ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : failed || items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <Newspaper className="h-10 w-10 text-muted-foreground" aria-hidden />
            <p className="font-medium">تیتری دریافت نشد</p>
            <p className="max-w-md text-sm text-muted-foreground">
              سرور به خبرگزاری‌ها دسترسی نداشت. چند دقیقه دیگر دوباره امتحان کنید؛ اگر باز هم خالی بود، دسترسی اینترنت سرور را بررسی کنید.
            </p>
            <Button variant="outline" onClick={() => load(true)} disabled={loading}>تلاش دوباره</Button>
          </CardContent>
        </Card>
      ) : shown.length === 0 ? (
        <Card>
          <CardContent className="px-4 py-10 text-center">
            <p className="font-medium">تیتری با این جستجو پیدا نشد</p>
            <Button variant="link" onClick={() => { setQuery(''); setDomain('all'); }}>نمایش همه تیترها</Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {shown.map((i) => (
                <li key={i.url || i.title} className="px-4 py-3">
                  <a href={i.url || undefined} target="_blank" rel="noopener noreferrer" className="group inline-flex items-start gap-1.5 font-medium hover:underline">
                    {i.title}
                    {i.url && <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="(در پنجره تازه)" />}
                  </a>
                  {i.snippet && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{i.snippet}</p>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{i.source}</span>
                    {i.date && <span>· {ago(i.date)}</span>}
                    {i.domains.map((d) => <Badge key={d} variant="secondary" className="font-normal">{d}</Badge>)}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TrendsPage;
