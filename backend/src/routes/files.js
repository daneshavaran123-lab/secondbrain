/**
 * File storage for the app's uploads (attachments, logos, avatars, documents…), in Postgres.
 * The frontend's `supabase.storage` calls land here (see frontend/src/lib/fileStorage.ts).
 *
 *   GET    /files/key                    the caller's link key (made on first use)
 *   POST   /files/o/:bucket/*path        upload one file (raw body; X-File-Type, X-Upsert)
 *   GET    /files/o/:bucket/*path        download, signed in
 *   GET    /files/o/:bucket?prefix=      list
 *   DELETE /files/o/:bucket              remove { paths: [...] }
 *   GET    /files/k/:key/:bucket/*path   read through a link (for <img src>, links in records)
 *
 * A link carries the owner's key instead of a login, like a "public" storage bucket does,
 * but it only opens that owner's files and stops working when the key is changed.
 */
import crypto from 'node:crypto';
import express, { Router } from 'express';
import { query } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
// Express 4 does not pass a rejected handler to the error handler by itself
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const MAX_BYTES = 25 * 1024 * 1024;
const NAME = /^[\w.@()\- \u0600-\u06FF\u200c]+$/;

let ready;
const ensureTable = () => (ready ??= query(`
  CREATE TABLE IF NOT EXISTS user_files (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bucket       TEXT NOT NULL,
    path         TEXT NOT NULL,
    content_type TEXT,
    size         INTEGER NOT NULL,
    data         BYTEA NOT NULL,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, bucket, path)
  );
  ALTER TABLE users ADD COLUMN IF NOT EXISTS file_key TEXT UNIQUE;
`).catch((e) => { ready = undefined; throw e; }));

router.use(async (_req, _res, next) => {
  try { await ensureTable(); next(); } catch (e) { next(e); }
});

/** A bucket name and a path of plain segments: no "..", no empty parts, no odd characters. */
function cleanTarget(bucket, rawPath) {
  const path = String(rawPath || '').replace(/^\/+/, '');
  const parts = path.split('/');
  if (!NAME.test(bucket) || bucket.length > 100) return null;
  if (!path || path.length > 500 || parts.some((p) => !p || p === '.' || p === '..' || !NAME.test(p))) return null;
  return { bucket, path };
}

const target = (req) => cleanTarget(req.params.bucket, req.params[0]);

function sendFile(res, row, download) {
  res.setHeader('Content-Type', row.content_type || 'application/octet-stream');
  res.setHeader('Content-Length', row.data.length);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // uploaded HTML or SVG must never run as a page of this site
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
  const name = row.path.split('/').pop();
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.send(row.data);
}

router.get('/key', requireAuth, wrap(async (req, res) => {
  const { rows } = await query(
    `UPDATE users SET file_key = COALESCE(file_key, $2) WHERE id = $1 RETURNING file_key`,
    [req.user.id, crypto.randomBytes(18).toString('base64url')],
  );
  if (!rows[0]) return res.status(404).json({ error: 'کاربر پیدا نشد' });
  res.json({ key: rows[0].file_key });
}));

router.post('/o/:bucket/*', requireAuth, express.raw({ type: () => true, limit: MAX_BYTES }), wrap(async (req, res) => {
  const t = target(req);
  if (!t) return res.status(400).json({ error: 'نام یا مسیر فایل معتبر نیست' });
  const data = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!data.length) return res.status(400).json({ error: 'فایل خالی است' });
  const type = String(req.headers['x-file-type'] || 'application/octet-stream').slice(0, 200);
  const upsert = req.headers['x-upsert'] === 'true';
  const { rows } = await query(
    `INSERT INTO user_files (user_id, bucket, path, content_type, size, data)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, bucket, path) DO ${upsert
       ? 'UPDATE SET content_type = EXCLUDED.content_type, size = EXCLUDED.size, data = EXCLUDED.data, updated_at = NOW()'
       : 'NOTHING'}
     RETURNING id`,
    [req.user.id, t.bucket, t.path, type, data.length, data],
  );
  if (!rows[0]) return res.status(409).json({ error: 'فایلی با همین نام از قبل هست' });
  res.json({ id: rows[0].id, path: t.path, fullPath: `${t.bucket}/${t.path}` });
}));

router.get('/o/:bucket', requireAuth, wrap(async (req, res) => {
  if (!cleanTarget(req.params.bucket, 'x')) return res.status(400).json({ error: 'نام پوشه معتبر نیست' });
  const prefix = String(req.query.prefix || '').replace(/^\/+|\/+$/g, '');
  const { rows } = await query(
    `SELECT id, path, content_type, size, created_at, updated_at FROM user_files
     WHERE user_id = $1 AND bucket = $2 AND ($3 = '' OR path LIKE $4)
     ORDER BY path LIMIT 1000`,
    [req.user.id, req.params.bucket, prefix, `${prefix.replace(/[\\%_]/g, '\\$&')}/%`],
  );
  // like storage listings: the names directly under the prefix
  const depth = prefix ? prefix.split('/').length : 0;
  res.json(rows
    .filter((r) => r.path.split('/').length === depth + 1)
    .map((r) => ({ id: r.id, name: r.path.split('/').pop(), created_at: r.created_at, updated_at: r.updated_at, metadata: { size: r.size, mimetype: r.content_type } })));
}));

router.get('/o/:bucket/*', requireAuth, wrap(async (req, res) => {
  const t = target(req);
  if (!t) return res.status(400).json({ error: 'مسیر فایل معتبر نیست' });
  const { rows } = await query(
    `SELECT path, content_type, data FROM user_files WHERE user_id = $1 AND bucket = $2 AND path = $3`,
    [req.user.id, t.bucket, t.path],
  );
  if (!rows[0]) return res.status(404).json({ error: 'فایل پیدا نشد' });
  sendFile(res, rows[0], req.query.download === '1');
}));

router.delete('/o/:bucket', requireAuth, wrap(async (req, res) => {
  const paths = (Array.isArray(req.body?.paths) ? req.body.paths : []).map(String).slice(0, 500);
  if (!cleanTarget(req.params.bucket, 'x')) return res.status(400).json({ error: 'نام پوشه معتبر نیست' });
  const { rows } = await query(
    `DELETE FROM user_files WHERE user_id = $1 AND bucket = $2 AND path = ANY($3::text[]) RETURNING path`,
    [req.user.id, req.params.bucket, paths.map((p) => p.replace(/^\/+/, ''))],
  );
  res.json(rows.map((r) => ({ name: r.path })));
}));

router.get('/k/:key/:bucket/*', wrap(async (req, res) => {
  const t = target(req);
  if (!t || !/^[\w-]{16,64}$/.test(req.params.key)) return res.status(404).end();
  const { rows } = await query(
    `SELECT f.path, f.content_type, f.data FROM user_files f JOIN users u ON u.id = f.user_id
     WHERE u.file_key = $1 AND f.bucket = $2 AND f.path = $3`,
    [req.params.key, t.bucket, t.path],
  );
  if (!rows[0]) return res.status(404).end();
  res.setHeader('Cache-Control', 'private, max-age=3600');
  sendFile(res, rows[0], req.query.download === '1');
}));

router.use((err, _req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'حجم فایل بیش از ۲۵ مگابایت است' });
  console.error('[files]', err);
  res.status(500).json({ error: 'خطای ذخیره فایل' });
});

export { cleanTarget };
export default router;
