import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { IRAN_FEEDS, INTL_FEEDS, fetchRSS, withTimeout } from '../news/feeds.js';
import { z } from 'zod';

const router = Router();

const schema = z.object({
  meetingTitle: z.string().trim().min(1, 'عنوان جلسه الزامی است').max(500),
  meetingDescription: z.string().trim().max(5000).optional().default(''),
});

const MODELS = [
  'openai/gpt-oss-120b:free',
  'openai/gpt-oss-20b:free',
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
  'deepseek/deepseek-v3-0324:free',
  'meta-llama/llama-3.3-70b-instruct:free',
];

// ─── AI Call ──────────────────────────────────────────────────────────────────
async function callAI(apiKey, messages, maxTokens = 3000) {
  for (const model of MODELS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 35000);

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://aimora.app',
          'X-Title': 'My Second Brain Meeting Prep',
        },
        body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: maxTokens }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      const d = await withTimeout(res.json(), 10000);
      const c = d.choices?.[0]?.message?.content;
      if (c && c.trim().length > 10) return c;
      if (res.status === 401) break; // کلید API نامعتبر — ادامه بی‌فایده است
    } catch { /* timeout or network → try next model */ }
  }
  return null;
}

function extractJson(text) {
  const c = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const s = c.search(/[\{\[]/);
  if (s === -1) throw new Error('No JSON');
  const opener = c[s], closer = opener === '[' ? ']' : '}';
  const e = c.lastIndexOf(closer);
  return JSON.parse(c.substring(s, e + 1));
}

const FALLBACK_DATA = {
  domestic_news: [], international_news: [], trending_topics: [],
  research_articles: [], key_statistics: [], expert_opinions: [],
  sentiment_analysis: { overall_sentiment: 'neutral', confidence: 0.5, key_themes: [] },
  key_points: [], suggested_questions: [],
};

// ─── Route ────────────────────────────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
  const result = schema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten().fieldErrors });

  const { meetingTitle, meetingDescription } = result.data;
  const LOVABLE_API_KEY = process.env.OPENROUTER_API_KEY || process.env.LOVABLE_API_KEY;
  if (!LOVABLE_API_KEY) return res.status(500).json({ error: 'AI service is not configured' });

  // ── Step 1: دریافت موازی RSS (max 8 sec total) ────────────────────────────
  let iranRawResults = [], intlRawResults = [];
  try {
    [iranRawResults, intlRawResults] = await withTimeout(
      Promise.all([
        Promise.allSettled(IRAN_FEEDS.map(f => fetchRSS(f, 5000))),
        Promise.allSettled(INTL_FEEDS.map(f => fetchRSS(f, 5000))),
      ]),
      8000
    );
  } catch { /* RSS phase timed out — continue without news */ }

  const allIranNews = (iranRawResults || [])
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value);

  const allIntlNews = (intlRawResults || [])
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value);

  // ── Step 2: ترکیب همه اخبار ─────────────────────────────────────────────────
  const allNews = [...allIranNews, ...allIntlNews].slice(0, 30);

  // ── Step 3: AI برای دسته‌بندی و تحلیل ──────────────────────────────────────
  const newsList = allNews.map((r, i) =>
    `${i + 1}. [${r.source}] ${r.title} | URL: ${r.url || 'ندارد'}`
  ).join('\n');

  const hasNews = allNews.length > 0;

  const newsSection = hasNews
    ? `\n\nاخبار امروز از خبرگزاری‌های ایران (${allNews.length} خبر):\n${newsList}\n\nوظیفه:\n- اخبار را به داخلی (ایران) و بین‌المللی دسته‌بندی کن\n- از هر دسته حداکثر ۵ خبر مرتبط با موضوع انتخاب کن\n- URL واقعی هر خبر را از لیست بالا حفظ کن`
    : '\n\n(اخبار زنده در دسترس نیست — بر اساس دانش خود عمل کن)';

  const aiPrompt = `موضوع جلسه: "${meetingTitle}"
${meetingDescription ? `توضیحات: ${meetingDescription}` : ''}${newsSection}

خروجی فقط JSON معتبر (بدون توضیح اضافه):
{
  "domestic_news": [{"title":"عنوان خبر فارسی","summary":"خلاصه ۲ جمله‌ای فارسی","source":"نام رسانه","url":"آدرس از لیست یا خالی","date":"","relevance_score":0.8}],
  "international_news": [{"title":"عنوان خبر","summary":"خلاصه فارسی","source":"نام رسانه","url":"آدرس","date":"","relevance_score":0.7}],
  "research_articles": [{"title":"عنوان مقاله یا گزارش مرتبط","summary":"خلاصه فارسی","authors":"نویسنده/سازمان","source":"منبع","url":"","relevance_score":0.75}],
  "trending_topics": [{"topic":"موضوع ترند","description":"توضیح کوتاه فارسی","trend_score":0.8,"hashtags":["#هشتگ"]}],
  "key_statistics": [{"statistic":"نام آمار","value":"عدد یا درصد","source":"منبع","context":"توضیح"}],
  "expert_opinions": [{"expert":"نام متخصص/سازمان","opinion":"نظر مرتبط با موضوع جلسه","credibility":"high","source":"منبع"}],
  "sentiment_analysis": {"overall_sentiment":"neutral","confidence":0.7,"key_themes":["تم اصلی","تم فرعی"]},
  "key_points": ["نکته کلیدی ۱ برای آماده شدن","نکته ۲","نکته ۳","نکته ۴","نکته ۵"],
  "suggested_questions": ["سوال مهم ۱ برای طرح در جلسه","سوال ۲","سوال ۳","سوال ۴","سوال ۵"]
}`;

  const aiContent = await callAI(LOVABLE_API_KEY, [
    {
      role: 'system',
      content: 'شما دستیار تخصصی آماده‌سازی جلسه به زبان فارسی هستید. وظیفه شما تولید تحلیل جامع برای آماده شدن قبل از جلسه است. فقط JSON معتبر بدون هیچ توضیح یا متن اضافه خروجی بده.',
    },
    { role: 'user', content: aiPrompt },
  ], 3000);

  // اگر AI جواب داد، JSON را parse کن
  if (aiContent) {
    try {
      const parsed = extractJson(aiContent);
      return res.json({ ...parsed, generated_at: new Date().toISOString() });
    } catch { /* fallback */ }
  }

  // Fallback: بدون AI نمی‌توان خبر مرتبط تشخیص داد — آرایه‌های خالی برمی‌گرداند
  return res.json({ ...FALLBACK_DATA, generated_at: new Date().toISOString() });

  } catch (err) {
    console.error('[meeting-prep] unhandled error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'خطای داخلی سرور', detail: err.message });
  }
});

function buildNewsContext(topic, iranNews, intlNews) {
  let ctx = `\n## اخبار داخلی ایران (${iranNews.length} خبر از RSS خبرگزاری‌ها):\n`;
  iranNews.forEach((r, i) => {
    ctx += `${i + 1}. [${r.source}] ${r.title}\n   URL: ${r.url || 'ندارد'}\n   ${r.snippet ? r.snippet.slice(0, 100) : ''}\n`;
  });

  ctx += `\n## اخبار بین‌المللی (${intlNews.length} خبر):\n`;
  intlNews.forEach((r, i) => {
    ctx += `${i + 1}. [${r.source}] ${r.title}\n   URL: ${r.url || 'ندارد'}\n   ${r.snippet ? r.snippet.slice(0, 100) : ''}\n`;
  });

  return ctx;
}

export default router;
