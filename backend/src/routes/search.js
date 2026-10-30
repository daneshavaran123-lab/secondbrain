import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { PALETTE_TYPES, searchAll } from '../search/engine.js';

const router = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// GET /search?q=…&type=…&limit=… — the signed-in person's records (contracts/search-api.md)
router.get('/', requireAuth, wrap(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const type = typeof req.query.type === 'string' && req.query.type ? req.query.type : null;
  if (type && !PALETTE_TYPES.includes(type)) return res.status(400).json({ error: 'نوع جستجو شناخته نشد' });
  const result = await searchAll(req.user.id, q, { types: type ? [type] : undefined, limit: req.query.limit });
  res.json(result);
}));

export default router;
