import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { DOMAINS, latestNews } from '../news/feeds.js';

const router = Router();

// GET /news?fresh=1 — latest headlines with their fields and the most mentioned keywords
router.get('/', requireAuth, async (req, res) => {
  try {
    const news = await latestNews({ fresh: req.query.fresh === '1' });
    const counts = new Map();
    for (const item of news.items) for (const k of item.keywords) counts.set(k, (counts.get(k) || 0) + 1);
    const keywords = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([word, count]) => ({ word, count }));
    res.json({ ...news, keywords, domains: Object.keys(DOMAINS) });
  } catch (e) {
    console.error('[news]', e);
    res.status(500).json({ error: 'اخبار دریافت نشد' });
  }
});

export default router;
