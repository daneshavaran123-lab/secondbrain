// Who a person may notify (FR-016): people who share at least one organization with them, as
// owner or member. Nobody else is ever listed or reachable.
import { query } from '../db/index.js';
import { normalizeFa } from '../search/normalize.js';

const ORGS_OF = (param) => `(SELECT organization_id FROM user_organizations WHERE user_id = ${param}
                             UNION SELECT id FROM organizations WHERE user_id = ${param})`;

/** Teammates with their display name and the organizations shared with `userId`. */
export async function teammates(userId) {
  const { rows } = await query(
    `WITH mine AS ${ORGS_OF('$1')},
          members AS (SELECT user_id, organization_id FROM user_organizations
                      UNION SELECT user_id, id FROM organizations WHERE user_id IS NOT NULL)
     SELECT u.id, u.email,
            COALESCE(NULLIF(p.full_name, ''), NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''), NULLIF(p.display_name, ''), u.email) AS display_name,
            array_agg(DISTINCT o.name) AS organizations
       FROM members m
       JOIN mine ON mine.organization_id = m.organization_id
       JOIN organizations o ON o.id = m.organization_id
       JOIN users u ON u.id = m.user_id
       LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE m.user_id <> $1
      GROUP BY u.id, u.email, p.full_name, p.first_name, p.last_name, p.display_name`, [userId]);
  return rows;
}

/** Teammates whose name (or email) contains the text, however it is written. */
export async function findTeammates(userId, text) {
  const q = normalizeFa(String(text ?? '').trim());
  const all = await teammates(userId);
  if (!q) return all;
  const exact = all.filter((t) => normalizeFa(t.display_name) === q);
  if (exact.length) return exact;
  return all.filter((t) => normalizeFa(t.display_name).includes(q) || normalizeFa(t.email).includes(q));
}

export async function shareOrganization(a, b, organizationId = null) {
  const { rows } = await query(
    `SELECT EXISTS (SELECT 1 FROM ${ORGS_OF('$1')} x JOIN ${ORGS_OF('$2')} y USING (organization_id)
                    WHERE $3::uuid IS NULL OR x.organization_id = $3::uuid) AS ok`, [a, b, organizationId]);
  return rows[0].ok;
}
