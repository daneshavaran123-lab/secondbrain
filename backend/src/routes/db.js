/**
 * Generic backend data proxy
 * Handles CRUD for tables stored in backend PostgreSQL.
 * All queries are automatically scoped to the authenticated user.
 */

import { Router } from 'express';
import { query, getClient } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import {
  BadRequest, Forbidden, ident, filterConditions, parseSelect, routeFilters,
  innerJoinConditions, joinColumns, columnSql, attachEmbeds, trimRow,
  isScoped, ownerCondition, columnsOf,
} from './dbEmbed.js';

const router = Router();

// Tables available in backend DB and how a row belongs to a user:
//   { userCol }  the row has its own owner column
//   { via }      the row belongs to a parent row the user owns (idea_risks → ideas)
//   userCol null tables cannot be reached through this proxy
const BACKEND_TABLES = {
  ideas:                  { userCol: 'user_id' },
  calendar_events:        { userCol: 'user_id' },
  knowledge_base:         { userCol: 'author_id' },
  business_companies:     { userCol: 'user_id' },
  meetings:               { userCol: 'user_id' },
  gratitude_entries:      { userCol: 'user_id' },
  health_metrics:         { userCol: 'user_id' },
  delegation_tasks:       { userCol: 'delegator_id' },
  csr_projects:           { userCol: 'user_id' },
  correspondence:         { userCol: 'user_id' },
  social_media_posts:     { userCol: 'user_id' },
  hi_dock_recordings:     { userCol: 'user_id' },
  legal_cases:            { userCol: 'user_id' },
  user_profiles:          { userCol: 'user_id' },
  // Habit Tracker
  habits:                      { userCol: 'user_id' },
  habit_completions:           { userCol: 'user_id' },
  habit_streaks:               { userCol: 'user_id' },
  habit_settings:              { userCol: 'user_id', conflictCol: 'user_id' },
  // Contacts & Networking
  personal_contacts:           { userCol: 'user_id' },
  networking_contacts:         { userCol: 'user_id' },
  networking_interactions:     { userCol: 'user_id' },
  networking_goals:            { userCol: 'user_id' },
  networking_events:           { userCol: 'user_id' },
  // Cultural Content
  cultural_content:            { userCol: 'user_id' },
  // AI Chat
  ai_chat_sessions:            { userCol: 'user_id' },
  ai_chat_messages:            { userCol: 'user_id' },
  // Delegation sub-tables
  delegation_subtasks:         { userCol: 'user_id' },
  delegation_notifications:    { userCol: 'user_id' },
  delegation_attachments:      { userCol: 'user_id' },
  delegation_task_events:      { userCol: 'user_id' },
  // Organizations
  organizations:               { userCol: null },
  organization_members:        { userCol: 'user_id' },
  organization_invitations:    { userCol: null },
  organization_departments:    { userCol: null },
  organization_employees:      { userCol: null },
  organization_missions:       { userCol: 'user_id' },
  organization_policies:       { userCol: 'created_by' },
  organization_finance:        { userCol: 'user_id' },
  organization_hr:             { userCol: 'user_id' },
  organization_operations:     { userCol: 'user_id' },
  organization_strategies:     { userCol: 'user_id' },
  organization_okr_key_results:{ via: { col: 'strategy_id', parent: 'organization_strategies' } },
  organization_roadmap_milestones: { via: { col: 'strategy_id', parent: 'organization_strategies' } },
  organization_notifications:  { userCol: 'user_id' },
  organization_chart_nodes:    { via: { col: 'hr_id', parent: 'organization_hr' } },
  organization_checklist_items:{ via: { col: 'operations_id', parent: 'organization_operations' } },
  organization_decision_options:{ via: { col: 'strategy_id', parent: 'organization_strategies' } },
  organization_sop_steps:      { via: { col: 'operations_id', parent: 'organization_operations' } },
  organization_succession_plans:{ via: { col: 'hr_id', parent: 'organization_hr' } },
  organization_succession_successors:{ via: { col: 'succession_plan_id', parent: 'organization_succession_plans' } },
  organization_performance_evaluations:{ userCol: null },
  organizational_claims:       { userCol: 'user_id' },
  organizational_policy_attachments:{ userCol: null },
  // Planning & Projects
  personal_planning:           { userCol: 'user_id' },
  projects:                    { userCol: 'user_id' },
  project_tasks:               { via: { col: 'project_id', parent: 'projects' } },
  profiles:                    { userCol: 'user_id' },
  // Resume
  resume_personal_info:        { userCol: 'user_id' },
  resume_work_experience:      { userCol: 'user_id' },
  resume_education:            { userCol: 'user_id' },
  resume_skills:               { userCol: 'user_id' },
  resume_certificates:         { userCol: 'user_id' },
  resume_awards:               { userCol: 'user_id' },
  resume_publications:         { userCol: 'user_id' },
  resume_affiliations:         { userCol: 'user_id' },
  resume_interests:            { userCol: 'user_id' },
  resume_media_interviews:     { userCol: 'user_id' },
  resume_templates:            { userCol: 'user_id' },
  resume_template_customizations:{ via: { col: 'template_id', parent: 'resume_templates' } },
  resume_exports:              { userCol: 'user_id' },
  // Sales & Marketing
  sales_leads:                 { userCol: 'user_id' },
  sales_icp_profiles:          { userCol: 'user_id' },
  sales_funnel_stages:         { userCol: 'user_id' },
  marketing_campaigns:         { userCol: 'user_id' },
  // Ideas sub-tables
  idea_business_model_canvas:  { via: { col: 'idea_id', parent: 'ideas' } },
  idea_swot_analysis:          { via: { col: 'idea_id', parent: 'ideas' } },
  idea_strategy:               { via: { col: 'idea_id', parent: 'ideas' } },
  idea_financial_analysis:     { via: { col: 'idea_id', parent: 'ideas' } },
  idea_milestones:             { via: { col: 'idea_id', parent: 'ideas' } },
  idea_risks:                  { via: { col: 'idea_id', parent: 'ideas' } },
  idea_inspirations:           { via: { col: 'idea_id', parent: 'ideas' } },
  idea_revenue_opportunities:  { via: { col: 'idea_id', parent: 'ideas' } },
  idea_suggested_actions:      { via: { col: 'idea_id', parent: 'ideas' } },
  idea_analysis_queue:         { userCol: 'user_id' },
  // Knowledge
  knowledge_folders:           { userCol: 'user_id' },
  knowledge_items:             { userCol: 'user_id' },
  // CSR sub-tables
  csr_project_milestones:      { via: { col: 'project_id', parent: 'csr_projects' } },
  csr_project_documents:       { via: { col: 'project_id', parent: 'csr_projects' } },
  csr_project_team:            { via: { col: 'project_id', parent: 'csr_projects' } },
  csr_impact_assessments:      { via: { col: 'project_id', parent: 'csr_projects' } },
  // Company sub-tables
  company_contacts:            { via: { col: 'company_id', parent: 'business_companies' } },
  company_notes:               { via: { col: 'company_id', parent: 'business_companies' } },
  company_profiles:            { via: { col: 'company_id', parent: 'business_companies' } },
  company_tasks:               { via: { col: 'company_id', parent: 'business_companies' } },
  company_calls:               { userCol: 'user_id' },
  // Messaging
  messages:                    { userCol: 'sender_id' },
  channel_members:             { userCol: 'user_id' },
  polls:                       { userCol: 'created_by' },
  poll_options:                { via: { col: 'poll_id', parent: 'polls' } },
  poll_votes:                  { userCol: 'user_id' },
  // Devices
  plaud_connections:           { userCol: 'user_id' },
  plaud_recordings:            { userCol: 'user_id' },
  hi_dock_connections:         { userCol: 'user_id' },
  // System
  user_organizations:          { userCol: 'user_id' },
  user_permissions:            { userCol: 'user_id' },
  user_audit_log:              { userCol: 'user_id' },
  system_permissions:          { userCol: null },
  assistant_action_logs:       { userCol: 'user_id' },
  auth_audit:                  { userCol: null },
  succession_positions:        { userCol: null },
  documents:                   { userCol: 'user_id' },
  attachments:                 { userCol: 'user_id' },
  recordings:                  { userCol: 'user_id' },
  avatars:                     { userCol: 'user_id' },
};

// Whether a table keeps updated_at is read from the schema (several child tables don't)
const hasUpdatedAt = async (table) => (await columnsOf(table)).has('updated_at');

// Column and key names reach SQL as quoted identifiers, so only plain identifiers
// are accepted (a `"` would otherwise break out of the quotes and bypass the
// per-user scope). Values always go through bind parameters. Embedded relations
// (`*, idea_risks(id)`) are resolved in dbEmbed.js under the same per-user rules.

function rowCount(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) throw new BadRequest('Invalid limit/offset');
  return n;
}

async function inTransaction(fn) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

function buildWhere(filters, userId, table) {
  if (!Array.isArray(filters)) throw new BadRequest('filters must be an array');
  const { conditions, values, nextIdx } = filterConditions(filters, 2, BACKEND_TABLES[table].userCol);
  const owner = ownerCondition(BACKEND_TABLES, table, null, '$1');
  return { where: [owner, ...conditions].join(' AND '), values: [userId, ...values], nextIdx };
}

/** Rows owned through a parent may only point at parents the user owns. */
async function assertParentsOwned(client, table, rows, userId) {
  const { via } = BACKEND_TABLES[table];
  if (!via) return;
  const ids = [...new Set(rows.map((r) => r[via.col]))];
  if (ids.some((id) => id === undefined || id === null)) throw new BadRequest(`${via.col} is required`);
  const { rows: [{ count }] } = await client.query(
    `SELECT COUNT(*)::int AS count FROM ${ident(via.parent)} p WHERE p.${ident(via.parentCol || 'id')} = ANY($2) AND ${ownerCondition(BACKEND_TABLES, via.parent, 'p', '$1')}`,
    [userId, ids]
  );
  if (count !== ids.length) throw new Forbidden(`${via.parent} row not found`);
}

/** The values a new row gets from its owner: the owner column, or user_id when a child table keeps one. */
async function withOwner(table, row, userId) {
  const conf = BACKEND_TABLES[table];
  if (conf.userCol) return { ...row, [conf.userCol]: userId };
  if (row.user_id === undefined && (await columnsOf(table)).has('user_id')) return { ...row, user_id: userId };
  return { ...row };
}

router.use(requireAuth);

router.post('/:table', async (req, res) => {
  const { table } = req.params;
  // Own keys only: `constructor`, `__proto__` etc. must not resolve to a config.
  const conf = Object.hasOwn(BACKEND_TABLES, table) ? BACKEND_TABLES[table] : null;
  if (!conf) {
    return res.status(404).json({ data: null, error: { message: `Table '${table}' not in backend` } });
  }
  if (!isScoped(conf)) {
    return res.status(403).json({ data: null, error: { message: `Table '${table}' has no per-user scope and cannot be accessed directly` } });
  }

  const userId = req.user.id;
  const { userCol } = conf;
  const {
    operation = 'select',
    select: selectCols = '*',
    filters = [],
    order,
    limit,
    offset,
    data: rowData,
    single,
  } = req.body;

  try {
    // ── SELECT ────────────────────────────────────────────────────────────────
    if (operation === 'select') {
      const parsed = parseSelect(selectCols);
      const { own, byAlias } = routeFilters(filters);
      const { where, values, nextIdx } = buildWhere(own, userId, table);
      const inner = await innerJoinConditions({ table, parsed, byAlias, userId, startIdx: nextIdx, tables: BACKEND_TABLES });
      const extra = await joinColumns(table, parsed, BACKEND_TABLES);

      let sql = `SELECT ${columnSql(parsed, extra)} FROM ${table} WHERE ${[where, ...inner.conditions].join(' AND ')}`;

      if (order) {
        const col = order.col || order.column;
        const asc = order.asc !== false && order.ascending !== false;
        if (col) sql += ` ORDER BY ${ident(col)} ${asc ? 'ASC' : 'DESC'}`;
      }
      if (limit)  sql += ` LIMIT ${rowCount(limit)}`;
      if (offset) sql += ` OFFSET ${rowCount(offset)}`;

      let rows = (await query(sql, [...values, ...inner.values])).rows;
      if (parsed.embeds.length) {
        rows = (await attachEmbeds({ table, rows, parsed, byAlias, userId, tables: BACKEND_TABLES }))
          .map((row) => trimRow(row, parsed));
      }
      if (single) return res.json({ data: rows[0] || null, error: null });
      return res.json({ data: rows, error: null });

    // ── INSERT ────────────────────────────────────────────────────────────────
    } else if (operation === 'insert') {
      const rows = Array.isArray(rowData) ? rowData : [rowData];

      const inserted = await inTransaction(async (client) => {
        await assertParentsOwned(client, table, rows, userId);
        const out = [];
        for (const row of rows) {
          const r = await withOwner(table, row, userId);
          const keys = Object.keys(r).filter(k => r[k] !== undefined);
          const cols = keys.map(ident).join(', ');
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
          const vals = keys.map(k => r[k]);
          const sql = `INSERT INTO ${table} (${cols}) VALUES (${placeholders}) RETURNING *`;
          const result = await client.query(sql, vals);
          out.push(result.rows[0]);
        }
        return out;
      });

      return res.json({ data: inserted.length === 1 ? inserted[0] : inserted, error: null });

    // ── UPDATE ────────────────────────────────────────────────────────────────
    } else if (operation === 'update') {
      const { where, values } = buildWhere(filters, userId, table);
      const updateData = { ...rowData };
      if (userCol) delete updateData[userCol];
      delete updateData.id;
      delete updateData.created_at;
      if (conf.via && updateData[conf.via.col] !== undefined) {
        await assertParentsOwned({ query }, table, [updateData], userId);
      }

      const keys = Object.keys(updateData).filter(k => updateData[k] !== undefined);
      if (!keys.length) return res.json({ data: [], error: null });

      let idx = values.length + 1;
      const sets = keys.map(k => { const s = `${ident(k)} = $${idx}`; idx++; return s; }).join(', ');
      const updateVals = [...values, ...keys.map(k => updateData[k])];

      const touch = (await hasUpdatedAt(table)) && !keys.includes('updated_at');
      const sql = `UPDATE ${table} SET ${sets}${touch ? ', updated_at = NOW()' : ''} WHERE ${where} RETURNING *`;
      const result = await query(sql, updateVals);
      return res.json({ data: result.rows, error: null });

    // ── DELETE ────────────────────────────────────────────────────────────────
    } else if (operation === 'delete') {
      const { where, values } = buildWhere(filters, userId, table);
      const sql = `DELETE FROM ${table} WHERE ${where} RETURNING id`;
      const result = await query(sql, values);
      return res.json({ data: result.rows, error: null });

    // ── UPSERT ────────────────────────────────────────────────────────────────
    } else if (operation === 'upsert') {
      const rows = Array.isArray(rowData) ? rowData : [rowData];
      // برخی جداول بر اساس ستونی غیر از id تضاد دارند (مثلاً habit_settings بر user_id)
      const conflictCol = ident(conf.conflictCol || 'id');
      const hasUpdatedAtUpsert = await hasUpdatedAt(table);
      // A conflicting row is only updated when it already belongs to the user
      const ownsExisting = userCol
        ? `${table}.${ident(userCol)} = EXCLUDED.${ident(userCol)}`
        : ownerCondition(BACKEND_TABLES, table, table, '$OWNER');

      const upserted = await inTransaction(async (client) => {
        await assertParentsOwned(client, table, rows, userId);
        const out = [];
        for (const row of rows) {
          const r = await withOwner(table, row, userId);
          const keys = Object.keys(r).filter(k => r[k] !== undefined);
          const cols = keys.map(ident).join(', ');
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
          const vals = keys.map(k => r[k]);
          const updates = keys
            .filter(k => ident(k) !== conflictCol && k !== userCol && k !== 'created_at')
            .map(k => `${ident(k)} = EXCLUDED.${ident(k)}`).join(', ');

          const updatedAtClause = (hasUpdatedAtUpsert && updates && !keys.includes('updated_at')) ? ', updated_at = NOW()' : '';
          // The WHERE keeps a conflicting row that belongs to another user untouched.
          const ownerParam = `$${vals.length + 1}`;
          const sql = `INSERT INTO ${table} (${cols}) VALUES (${placeholders})
            ON CONFLICT (${conflictCol}) DO UPDATE SET ${updates || `${conflictCol} = EXCLUDED.${conflictCol}`}${updatedAtClause}
            WHERE ${ownsExisting.replaceAll('$OWNER', ownerParam)}
            RETURNING *`;
          const result = await client.query(sql, userCol ? vals : [...vals, userId]);
          if (!result.rows.length) throw new Forbidden('Row belongs to another user');
          out.push(result.rows[0]);
        }
        return out;
      });

      return res.json({ data: upserted.length === 1 ? upserted[0] : upserted, error: null });

    // ── COUNT ─────────────────────────────────────────────────────────────────
    } else if (operation === 'count') {
      const parsed = parseSelect(selectCols);
      const { own, byAlias } = routeFilters(filters);
      const { where, values, nextIdx } = buildWhere(own, userId, table);
      const inner = await innerJoinConditions({ table, parsed, byAlias, userId, startIdx: nextIdx, tables: BACKEND_TABLES });
      const sql = `SELECT COUNT(*) FROM ${table} WHERE ${[where, ...inner.conditions].join(' AND ')}`;
      const result = await query(sql, [...values, ...inner.values]);
      return res.json({ count: parseInt(result.rows[0].count), data: null, error: null });

    } else {
      return res.status(400).json({ data: null, error: { message: `Unknown operation: ${operation}` } });
    }

  } catch (err) {
    if (err instanceof BadRequest) return res.status(400).json({ data: null, error: { message: err.message } });
    if (err instanceof Forbidden) return res.status(403).json({ data: null, error: { message: err.message } });
    console.error(`[db/${table}] error:`, err.message);
    return res.status(500).json({ data: null, error: { message: err.message } });
  }
});

export default router;
