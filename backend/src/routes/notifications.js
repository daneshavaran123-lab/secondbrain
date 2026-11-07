import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../db/index.js';
import { quietUntil } from '../notifications/schedule.js';
import { mergeSettings, validateSettings, TYPES, TYPE_LABELS } from '../notifications/settings.js';
import { vapidPublicKey } from '../notifications/delivery.js';
import { createNotification } from '../notifications/producers.js';
import { findTeammates, shareOrganization } from '../notifications/teammates.js';
import { pathFor } from '../search/sources.js';
import crypto from 'node:crypto';

// The signed-in person's notifications, settings and devices (contracts/notifications-api.md).
// Identity always comes from the session; nothing here takes a user id from the request.
const router = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DISPLAY_NAME = `COALESCE(NULLIF(p.full_name, ''), NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''), NULLIF(p.display_name, ''), su.email)`;

async function settingsOf(userId) {
  const { rows } = await query('SELECT * FROM notification_settings WHERE user_id = $1', [userId]);
  return mergeSettings(rows[0]);
}

const unreadOf = async (userId) =>
  Number((await query('SELECT count(*) FROM notifications WHERE user_id = $1 AND read_at IS NULL', [userId])).rows[0].count);

// GET /notifications?before=<iso>&limit=<n>
router.get('/', requireAuth, wrap(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  const before = req.query.before && !Number.isNaN(Date.parse(req.query.before)) ? new Date(req.query.before) : null;
  const { rows } = await query(
    `SELECT n.id, n.type, n.title, n.body, n.due_at, n.created_at, n.read_at, n.path,
            CASE WHEN n.sender_id IS NULL THEN NULL ELSE json_build_object('id', n.sender_id, 'display_name', ${DISPLAY_NAME}) END AS sender
       FROM notifications n
       LEFT JOIN users su ON su.id = n.sender_id
       LEFT JOIN user_profiles p ON p.user_id = n.sender_id
      WHERE n.user_id = $1 ${before ? 'AND n.created_at < $3' : ''}
      ORDER BY n.created_at DESC LIMIT $2`,
    before ? [req.user.id, limit, before] : [req.user.id, limit]);
  res.json({ unread: await unreadOf(req.user.id), items: rows });
}));

// GET /notifications/unread-count — light, polled every 20 s; quiet_until lets the app hold its
// own system notification during the person's quiet hours (FR-013)
router.get('/unread-count', requireAuth, wrap(async (req, res) => {
  const [unread, settings] = await Promise.all([unreadOf(req.user.id), settingsOf(req.user.id)]);
  const latest = (await query('SELECT max(created_at) AS at FROM notifications WHERE user_id = $1', [req.user.id])).rows[0].at;
  res.json({ unread, latest, quiet_until: quietUntil(new Date(), settings) });
}));

// POST /notifications/read  { ids: [...] } | { all: true }
router.post('/read', requireAuth, wrap(async (req, res) => {
  const { ids, all } = req.body || {};
  let result;
  if (all === true) {
    result = await query('UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL', [req.user.id]);
  } else if (Array.isArray(ids) && ids.length) {
    const valid = ids.filter((id) => UUID.test(String(id))).slice(0, 200);
    result = await query('UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND id = ANY($2::uuid[]) AND read_at IS NULL', [req.user.id, valid]);
  } else {
    return res.status(400).json({ error: 'اعلانی برای خوانده‌شدن مشخص نشده است' });
  }
  res.json({ updated: result.rowCount, unread: await unreadOf(req.user.id) });
}));

// DELETE /notifications/:id
router.delete('/:id', requireAuth, wrap(async (req, res, next) => {
  if (['settings', 'devices', 'recipients', 'unread-count', 'read', 'send'].includes(req.params.id)) return next();
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'اعلان پیدا نشد' });
  const { rowCount } = await query('DELETE FROM notifications WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!rowCount) return res.status(404).json({ error: 'اعلان پیدا نشد' });
  res.status(204).end();
}));

// GET /notifications/settings
router.get('/settings', requireAuth, wrap(async (req, res) => {
  const [settings, profile, errors] = await Promise.all([
    settingsOf(req.user.id),
    query(`SELECT COALESCE(NULLIF(p.mobile_phone, ''), NULLIF(p.phone, '')) AS phone, u.email
             FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id WHERE u.id = $1`, [req.user.id]),
    query(`SELECT DISTINCT ON (d.channel) d.channel, d.error, d.updated_at AS at
             FROM notification_deliveries d JOIN notifications n ON n.id = d.notification_id
            WHERE n.user_id = $1 AND d.status = 'failed' AND d.updated_at > NOW() - interval '7 days'
            ORDER BY d.channel, d.updated_at DESC`, [req.user.id]),
  ]);
  res.json({
    ...settings,
    types: TYPES.map((t) => ({ type: t, label: TYPE_LABELS[t] })),
    has_phone: !!profile.rows[0]?.phone,
    has_email: !!profile.rows[0]?.email,
    last_errors: errors.rows,
    vapid_public_key: vapidPublicKey(),
  });
}));

// PUT /notifications/settings
router.put('/settings', requireAuth, wrap(async (req, res) => {
  const current = await settingsOf(req.user.id);
  const checked = validateSettings(req.body || {}, current);
  if (checked.error) return res.status(400).json({ error: checked.error, field: checked.field });
  const next = checked.value;
  const wantsSms = TYPES.some((t) => next.channels[t]?.sms && !next.channels[t]?.off);
  if (wantsSms) {
    const { rows } = await query(`SELECT COALESCE(NULLIF(mobile_phone, ''), NULLIF(phone, '')) AS phone FROM user_profiles WHERE user_id = $1`, [req.user.id]);
    if (!rows[0]?.phone) return res.status(422).json({ error: 'برای پیامک، شماره همراه را در پروفایل ثبت کنید', field: 'phone' });
  }
  await query(
    `INSERT INTO notification_settings (user_id, channels, quiet_start, quiet_end, accept_from_others, tz, permission_explained, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (user_id) DO UPDATE SET channels = $2, quiet_start = $3, quiet_end = $4, accept_from_others = $5,
       tz = $6, permission_explained = $7, updated_at = NOW()`,
    [req.user.id, JSON.stringify(next.channels), next.quiet_start, next.quiet_end, next.accept_from_others, next.tz, next.permission_explained]);
  res.json(next);
}));

// POST /notifications/devices  { kind, endpoint, p256dh?, auth?, label? }
router.post('/devices', requireAuth, wrap(async (req, res) => {
  const { kind, endpoint, p256dh, auth, label } = req.body || {};
  if (!['webpush', 'fcm'].includes(kind) || typeof endpoint !== 'string' || !endpoint || endpoint.length > 2000) {
    return res.status(400).json({ error: 'اطلاعات دستگاه نامعتبر است' });
  }
  if (kind === 'webpush' && (!/^https:\/\//.test(endpoint) || !p256dh || !auth)) {
    return res.status(400).json({ error: 'اطلاعات اعلان مرورگر کامل نیست' });
  }
  // the same browser or phone signed in by someone else now belongs to them (research R9)
  const { rows } = await query(
    `INSERT INTO notification_devices (user_id, kind, endpoint, p256dh, auth, label)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = $1, kind = $2, p256dh = $4, auth = $5, label = $6, disabled_at = NULL
     RETURNING id`,
    [req.user.id, kind, endpoint, p256dh || null, auth || null, typeof label === 'string' ? label.slice(0, 80) : null]);
  res.status(201).json({ id: rows[0].id });
}));

// DELETE /notifications/devices/:id (signing out)
router.delete('/devices/:id', requireAuth, wrap(async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'دستگاه پیدا نشد' });
  const { rowCount } = await query('DELETE FROM notification_devices WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!rowCount) return res.status(404).json({ error: 'دستگاه پیدا نشد' });
  res.status(204).end();
}));

// GET /notifications/recipients?q= — people the signed-in person may notify (shared organizations)
router.get('/recipients', requireAuth, wrap(async (req, res) => {
  const found = await findTeammates(req.user.id, typeof req.query.q === 'string' ? req.query.q : '');
  res.json(found.slice(0, 20).map((t) => ({ id: t.id, display_name: t.display_name, organizations: t.organizations })));
}));

const HOURLY_LIMIT = 20;

// POST /notifications/send { recipient_id, message, ref? } — a notification to a teammate (FR-016–FR-020)
router.post('/send', requireAuth, wrap(async (req, res) => {
  const { recipient_id: to, message, ref } = req.body || {};
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text || text.length > 500) return res.status(400).json({ error: 'متن اعلان باید بین ۱ تا ۵۰۰ نویسه باشد', field: 'message' });
  if (!UUID.test(String(to || ''))) return res.status(400).json({ error: 'گیرنده مشخص نیست', field: 'recipient_id' });
  if (to === req.user.id) return res.status(400).json({ error: 'برای خودتان یادآور بسازید', field: 'recipient_id' });
  if (!(await shareOrganization(req.user.id, to))) {
    return res.status(403).json({ error: 'این کاربر با شما در هیچ سازمانی عضو نیست' });
  }
  const recipient = await settingsOf(to);
  if (!recipient.accept_from_others || recipient.channels.message?.off) {
    return res.status(403).json({ error: 'این کاربر اعلان از دیگران را نمی‌پذیرد' });
  }
  const sentLastHour = Number((await query(
    `SELECT count(*) FROM notifications WHERE sender_id = $1 AND created_at > NOW() - interval '1 hour'`, [req.user.id])).rows[0].count);
  if (sentLastHour >= HOURLY_LIMIT) {
    return res.status(429).json({ error: 'بیش از ۲۰ اعلان در یک ساعت؛ کمی بعد دوباره امتحان کنید' });
  }
  // a link only to an organization the recipient is in (FR-018)
  let path = null;
  if (ref?.type === 'organization' && UUID.test(String(ref.id || '')) && (await shareOrganization(req.user.id, to, ref.id))) {
    path = pathFor('organization', { id: ref.id });
  }
  const { rows } = await query(
    `SELECT COALESCE(NULLIF(p.full_name, ''), NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''), NULLIF(p.display_name, ''), u.email) AS name
       FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id WHERE u.id = $1`, [req.user.id]);
  const id = await createNotification({
    user_id: to, type: 'message', title: rows[0]?.name || 'یکی از همکاران', body: text, sender_id: req.user.id,
    ref_type: path ? 'organization' : null, ref_id: path ? ref.id : null, path, due_at: new Date(),
    dedupe_key: `message:${crypto.randomUUID()}`,
  }, recipient);
  res.status(201).json({ id });
}));

export default router;
