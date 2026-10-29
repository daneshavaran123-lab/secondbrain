/**
 * People in an organization. /db only shows a person their own rows, so members could not see
 * each other, an owner could not change another member's role, and an invitee could not open the
 * invitation they were sent. These routes do that, with the organization's own rules:
 *
 *   GET    /org-members/:orgId/members              anyone in the organization (or its owner)
 *   PATCH  /org-members/:orgId/members/:userId      owner or admin: { role?, position_title? }
 *   DELETE /org-members/:orgId/members/:userId      owner or admin (the owner can't be removed);
 *                                                   anyone may remove themselves (leave)
 *   GET    /org-members/invitations/:token          the invitation, for the signed-in person
 *   POST   /org-members/invitations/:token/accept   only by the invited email, before it expires
 *   POST   /org-members/invitations/:token/reject
 */
import { Router } from 'express';
import { query, getClient } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);
// Express 4 does not pass a rejected handler to the error handler by itself
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const ROLES = ['owner', 'admin', 'manager', 'member', 'viewer'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The caller's standing in an organization: 'owner', a member role, or null. */
async function standing(orgId, userId) {
  if (!UUID.test(orgId)) return null;
  const { rows } = await query(
    `SELECT CASE WHEN o.user_id = $2 THEN 'owner' ELSE m.role END AS role
       FROM organizations o
       LEFT JOIN user_organizations m ON m.organization_id = o.id AND m.user_id = $2 AND COALESCE(m.is_active, true)
      WHERE o.id = $1 AND (o.user_id = $2 OR m.id IS NOT NULL)`,
    [orgId, userId],
  );
  return rows[0]?.role ?? null;
}
const canManage = (role) => role === 'owner' || role === 'admin';

const MEMBER_FIELDS = `
  m.id, m.user_id, m.organization_id, m.role, m.position_title, m.is_active,
  COALESCE(m.joined_at, m.created_at) AS joined_at,
  json_build_object(
    'display_name', COALESCE(NULLIF(p.full_name, ''), NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''), NULLIF(p.display_name, ''), u.email),
    'email', u.email,
    'avatar_url', p.avatar_url
  ) AS profiles`;

router.get('/:orgId/members', wrap(async (req, res) => {
  if (!(await standing(req.params.orgId, req.user.id))) return res.status(404).json({ error: 'سازمان پیدا نشد' });
  const { rows } = await query(
    `SELECT ${MEMBER_FIELDS}
       FROM user_organizations m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN LATERAL (SELECT * FROM user_profiles WHERE user_id = m.user_id ORDER BY created_at LIMIT 1) p ON true
      WHERE m.organization_id = $1
      ORDER BY (m.role = 'owner') DESC, COALESCE(m.joined_at, m.created_at)`,
    [req.params.orgId],
  );
  res.json({ data: rows });
}));

router.patch('/:orgId/members/:userId', wrap(async (req, res) => {
  const mine = await standing(req.params.orgId, req.user.id);
  if (!mine) return res.status(404).json({ error: 'سازمان پیدا نشد' });
  if (!canManage(mine)) return res.status(403).json({ error: 'فقط مالک یا مدیر سازمان می‌تواند نقش‌ها را تغییر دهد' });
  const { role, position_title: title } = req.body ?? {};
  if (role !== undefined && (!ROLES.includes(role) || role === 'owner')) return res.status(400).json({ error: 'نقش معتبر نیست' });
  if (mine === 'admin' && role === 'admin') return res.status(403).json({ error: 'فقط مالک می‌تواند مدیر تعیین کند' });
  const { rows } = await query(
    `UPDATE user_organizations SET
        role = COALESCE($3, role),
        position_title = CASE WHEN $4::boolean THEN $5 ELSE position_title END,
        updated_at = NOW()
      WHERE organization_id = $1 AND user_id::text = $2 AND role <> 'owner'
      RETURNING id, role, position_title`,
    [req.params.orgId, req.params.userId, role ?? null, title !== undefined, title ?? null],
  );
  if (!rows[0]) return res.status(404).json({ error: 'این عضو پیدا نشد یا نقشش قابل تغییر نیست' });
  res.json({ data: rows[0] });
}));

router.delete('/:orgId/members/:userId', wrap(async (req, res) => {
  const mine = await standing(req.params.orgId, req.user.id);
  if (!mine) return res.status(404).json({ error: 'سازمان پیدا نشد' });
  const self = req.params.userId === req.user.id;
  if (!self && !canManage(mine)) return res.status(403).json({ error: 'فقط مالک یا مدیر سازمان می‌تواند عضو را حذف کند' });
  const { rows } = await query(
    `DELETE FROM user_organizations
      WHERE organization_id = $1 AND user_id::text = $2 AND role <> 'owner'
        AND ($3 OR role <> 'admin' OR $4)
      RETURNING id`,
    [req.params.orgId, req.params.userId, self, mine === 'owner'],
  );
  if (!rows[0]) return res.status(404).json({ error: 'این عضو پیدا نشد یا قابل حذف نیست' });
  res.json({ data: rows[0] });
}));

async function invitationFor(token) {
  if (!/^[0-9a-f]{16,128}$/i.test(token || '')) return null;
  const { rows } = await query(
    `SELECT i.id, i.organization_id, i.email, i.role, i.status, i.expires_at, i.invited_by,
            o.name AS organization_name, o.description AS organization_description, o.logo_url,
            COALESCE(NULLIF(p.full_name, ''), NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''), u.email) AS inviter_name
       FROM organization_invitations i
       JOIN organizations o ON o.id = i.organization_id
       LEFT JOIN users u ON u.id = i.invited_by
       LEFT JOIN LATERAL (SELECT * FROM user_profiles WHERE user_id = i.invited_by ORDER BY created_at LIMIT 1) p ON true
      WHERE i.token = $1`,
    [token],
  );
  return rows[0] ?? null;
}
const emailOf = async (userId) => (await query('SELECT email FROM users WHERE id = $1', [userId])).rows[0]?.email ?? '';
const sameEmail = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

router.get('/invitations/:token', wrap(async (req, res) => {
  const inv = await invitationFor(req.params.token);
  if (!inv) return res.status(404).json({ error: 'دعوتنامه پیدا نشد' });
  const forMe = sameEmail(inv.email, await emailOf(req.user.id));
  const expired = inv.status === 'pending' && new Date(inv.expires_at) < new Date();
  res.json({
    data: {
      organization_id: inv.organization_id,
      role: inv.role,
      status: expired ? 'expired' : inv.status,
      expires_at: inv.expires_at,
      for_me: forMe,
      // the address is shown only to the person it was sent to
      email: forMe ? inv.email : null,
      organizations: { name: inv.organization_name, description: inv.organization_description, logo_url: inv.logo_url },
      inviter: { display_name: inv.inviter_name },
    },
  });
}));

router.post('/invitations/:token/accept', wrap(async (req, res) => {
  const inv = await invitationFor(req.params.token);
  if (!inv) return res.status(404).json({ error: 'دعوتنامه پیدا نشد' });
  if (!sameEmail(inv.email, await emailOf(req.user.id))) return res.status(403).json({ error: 'این دعوتنامه برای نشانی ایمیل دیگری فرستاده شده است' });
  if (inv.status !== 'pending') return res.status(409).json({ error: 'این دعوتنامه قبلاً پاسخ داده شده است' });
  if (new Date(inv.expires_at) < new Date()) {
    await query(`UPDATE organization_invitations SET status = 'expired' WHERE id = $1`, [inv.id]);
    return res.status(410).json({ error: 'مهلت این دعوتنامه تمام شده است' });
  }
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const exists = await client.query(
      'SELECT id FROM user_organizations WHERE organization_id = $1 AND user_id = $2', [inv.organization_id, req.user.id]);
    if (!exists.rows[0]) {
      await client.query(
        `INSERT INTO user_organizations (user_id, organization_id, role, invited_by, joined_at, is_active)
         VALUES ($1, $2, $3, $4, NOW(), true)`,
        [req.user.id, inv.organization_id, ROLES.includes(inv.role) && inv.role !== 'owner' ? inv.role : 'member', inv.invited_by],
      );
    }
    await client.query(
      `UPDATE organization_invitations SET status = 'accepted', accepted_at = NOW(), accepted_by = $2 WHERE id = $1`,
      [inv.id, req.user.id]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  res.json({ data: { organization_id: inv.organization_id } });
}));

router.post('/invitations/:token/reject', wrap(async (req, res) => {
  const inv = await invitationFor(req.params.token);
  if (!inv) return res.status(404).json({ error: 'دعوتنامه پیدا نشد' });
  if (!sameEmail(inv.email, await emailOf(req.user.id))) return res.status(403).json({ error: 'این دعوتنامه برای نشانی ایمیل دیگری فرستاده شده است' });
  if (inv.status !== 'pending') return res.status(409).json({ error: 'این دعوتنامه قبلاً پاسخ داده شده است' });
  await query(`UPDATE organization_invitations SET status = 'rejected' WHERE id = $1`, [inv.id]);
  res.json({ data: { ok: true } });
}));

router.use((err, _req, res, next) => {
  if (res.headersSent) return next(err);
  console.error('[org-members]', err);
  res.status(500).json({ error: 'خطای سرور' });
});

export default router;
