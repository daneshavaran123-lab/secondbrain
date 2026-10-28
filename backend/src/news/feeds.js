/**
 * News headlines from Persian news agencies' RSS feeds, shared by meeting preparation and the
 * news page. Each headline is put in a field (economy, politics…) by the keywords it mentions.
 *
 * NEWS_FEEDS (JSON: [{ "url": "...", "source": "..." }]) replaces the built-in feed list.
 */

export const IRAN_FEEDS = [
  { url: 'https://www.irna.ir/rss/',               source: 'خبرگزاری ایرنا' },
  { url: 'https://www.isna.ir/rss/',               source: 'ایسنا' },
  { url: 'https://www.mashreghnews.ir/rss',        source: 'مشرق نیوز' },
  { url: 'https://www.iribnews.ir/fa/rss/allnews', source: 'صدا و سیما' },
  { url: 'https://www.yjc.ir/fa/rss/allnews',      source: 'باشگاه خبرنگاران' },
];

export const INTL_FEEDS = [
  { url: 'https://feeds.bbci.co.uk/persian/rss.xml',              source: 'BBC فارسی' },
  { url: 'https://feeds.bbci.co.uk/persian/business/rss.xml',     source: 'BBC فارسی اقتصاد' },
  { url: 'https://feeds.bbci.co.uk/persian/science/rss.xml',      source: 'BBC فارسی علم' },
];

export const DOMAINS = {
  'اقتصاد': ['تورم', 'بورس', 'ارز', 'دلار', 'سرمایه‌گذاری', 'نفت', 'گاز', 'صادرات', 'واردات', 'بانک', 'اقتصاد', 'قیمت', 'بودجه', 'مالیات'],
  'سیاست': ['انتخابات', 'دولت', 'مجلس', 'روابط خارجی', 'دیپلماسی', 'وزیر', 'رئیس‌جمهور', 'سفیر', 'مذاکره', 'تحریم'],
  'ورزش': ['فوتبال', 'المپیک', 'تیم ملی', 'لیگ برتر', 'والیبال', 'کشتی', 'شنا', 'قهرمانی', 'جام'],
  'فرهنگ': ['هنر', 'سینما', 'کتاب', 'موسیقی', 'تئاتر', 'نمایشگاه', 'جشنواره', 'فیلم'],
  'جامعه': ['آموزش', 'بهداشت', 'محیط زیست', 'ترافیک', 'آلودگی', 'درمان', 'بیمارستان', 'مدرسه', 'دانشگاه', 'زلزله', 'سیل'],
  'فناوری': ['هوش مصنوعی', 'اینترنت', 'موبایل', 'نرم‌افزار', 'سایبری', 'دیجیتال', 'فناوری', 'استارتاپ', 'ماهواره'],
};

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Text of the first <tag> in xml, without CDATA, markup or entities. */
export function parseTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>(?:\\s*<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>\\s*)?<\\/${tag}>`, 'i');
  const m = xml.match(re);
  if (!m) return '';
  return m[1]
    .replace(/<[^>]+>/g, ' ')
    // numeric entities matter in Persian: &#8204; is the half-space inside many words
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, e) => ENTITIES[e])
    .replace(/\s+/g, ' ')
    .trim();
}

function parseLink(body) {
  return parseTag(body, 'link')
    || (body.match(/<link[^>]*href="([^"]+)"/i) || [])[1]
    || parseTag(body, 'guid')
    || '';
}

/** Headlines in an RSS document. */
export function parseItems(xml, source, limit = 15) {
  const items = [];
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) !== null && items.length < limit) {
    const body = m[1];
    const title = parseTag(body, 'title');
    if (!title) continue;
    const when = new Date(parseTag(body, 'pubDate') || parseTag(body, 'dc:date') || '');
    items.push({
      title,
      url: parseLink(body),
      snippet: parseTag(body, 'description').slice(0, 350),
      date: Number.isNaN(when.getTime()) ? null : when.toISOString(),
      source,
    });
  }
  return items;
}

/** The fields a headline belongs to and the keywords that put it there. */
export function classify(item) {
  const text = `${item.title} ${item.snippet || ''}`;
  const keywords = [];
  const domains = [];
  for (const [domain, words] of Object.entries(DOMAINS)) {
    const hits = words.filter((w) => text.includes(w));
    if (hits.length) { domains.push(domain); keywords.push(...hits); }
  }
  return { ...item, domains, keywords: [...new Set(keywords)] };
}

export function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

export async function fetchRSS(feedInfo, timeoutMs = 5000, limit = 8) {
  try {
    const res = await fetch(feedInfo.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return [];
    return parseItems(await withTimeout(res.text(), 4000), feedInfo.source, limit);
  } catch {
    return [];
  }
}

export function configuredFeeds() {
  try {
    const custom = JSON.parse(process.env.NEWS_FEEDS || 'null');
    if (Array.isArray(custom) && custom.length) return custom;
  } catch { /* fall back to the built-in list */ }
  return [...IRAN_FEEDS, ...INTL_FEEDS];
}

let cache = null;
const TTL = 10 * 60 * 1000;

/** Latest headlines from every feed, newest first; kept for ten minutes. */
export async function latestNews({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cache.at < TTL) return cache.value;
  const feeds = configuredFeeds();
  const results = await Promise.all(feeds.map(async (f) => ({ feed: f, items: await fetchRSS(f, 6000, 15) })));
  const seen = new Set();
  const items = results
    .flatMap((r) => r.items)
    .filter((i) => (seen.has(i.title) ? false : seen.add(i.title)))
    .map(classify)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const value = {
    items,
    sources: results.map((r) => ({ source: r.feed.source, count: r.items.length })),
    fetched_at: new Date().toISOString(),
  };
  // an empty answer (no network) is not kept, so the next visit tries again
  if (items.length) cache = { at: Date.now(), value };
  return value;
}
