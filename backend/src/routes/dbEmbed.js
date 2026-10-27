/**
 * Supabase-style embedded relations for the /db proxy:
 *   select('*, idea_risks(id), stage:sales_funnel_stages(*), idea:ideas!inner(title)')
 *
 * Relationships come from the database's foreign keys (with a `<table>_id` naming
 * fallback for the few tables created without one). An embedded table follows the
 * same rule as a direct query: it must be a per-user table, and only the caller's
 * rows are returned, so embedding never reveals more than /db/<table> would.
 */

import { query } from '../db/index.js';

export class BadRequest extends Error {}
export class Forbidden extends Error {}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
// [alias:]target[!hint][!inner](inner select)
const EMBED = /^(?:([A-Za-z_]\w*)\s*:\s*)?([A-Za-z_]\w*)((?:\s*!\s*[A-Za-z_]\w*)*)\s*\(([\s\S]*)\)$/;
const MAX_DEPTH = 3;
const MAX_SELECT_LENGTH = 2000;

export function ident(name) {
  if (typeof name !== 'string' || !IDENTIFIER.test(name)) {
    throw new BadRequest(`Invalid column name: ${String(name).slice(0, 64)}`);
  }
  return `"${name}"`;
}

/** Split on commas that are not inside parentheses. */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth < 0) throw new BadRequest('Unbalanced parentheses in select');
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (depth !== 0) throw new BadRequest('Unbalanced parentheses in select');
  if (current.trim()) parts.push(current.trim());
  return parts.filter(Boolean);
}

/**
 * Parse a select string into plain columns and embeds.
 * `columns` is ['*'], a list of names, or [] when only embeds were asked for.
 */
export function parseSelect(select, depth = 0) {
  if (select === undefined || select === null || select === '*' || select === '') {
    return { columns: ['*'], embeds: [] };
  }
  if (typeof select !== 'string') throw new BadRequest('Invalid select');
  if (select.length > MAX_SELECT_LENGTH) throw new BadRequest('Select is too long');
  if (depth > MAX_DEPTH) throw new BadRequest('Embedded relations are nested too deeply');

  const columns = [];
  const embeds = [];
  for (const part of splitTopLevel(select)) {
    const m = part.match(EMBED);
    if (m) {
      const [, alias, target, hintText, inner] = m;
      const hints = hintText.split('!').map((h) => h.trim()).filter(Boolean);
      hints.forEach((h) => ident(h));
      embeds.push({
        alias: alias || target,
        target,
        inner: hints.includes('inner'),
        hint: hints.find((h) => h !== 'inner' && h !== 'left') || null,
        select: parseSelect(inner.trim() || '*', depth + 1),
      });
    } else if (part === '*') {
      columns.push('*');
    } else {
      ident(part);
      columns.push(part);
    }
  }
  if (!columns.length && !embeds.length) columns.push('*');
  return { columns: columns.includes('*') ? ['*'] : columns, embeds };
}

// ── Schema metadata (cached) ──────────────────────────────────────────────────

const CACHE_MS = 5 * 60 * 1000;
let fkCache = { at: 0, rows: [] };
const columnCache = new Map();

async function foreignKeys() {
  if (Date.now() - fkCache.at < CACHE_MS) return fkCache.rows;
  const { rows } = await query(`
    SELECT con.conname AS name, src.relname AS src_table, sa.attname AS src_col,
           ref.relname AS ref_table, ra.attname AS ref_col
      FROM pg_constraint con
      JOIN pg_class src ON src.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = src.relnamespace AND ns.nspname = 'public'
      JOIN pg_class ref ON ref.oid = con.confrelid
      JOIN pg_attribute sa ON sa.attrelid = con.conrelid AND sa.attnum = con.conkey[1]
      JOIN pg_attribute ra ON ra.attrelid = con.confrelid AND ra.attnum = con.confkey[1]
     WHERE con.contype = 'f' AND cardinality(con.conkey) = 1`);
  fkCache = { at: Date.now(), rows };
  return rows;
}

export async function columnsOf(table) {
  const cached = columnCache.get(table);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.cols;
  const { rows } = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  const cols = new Set(rows.map((r) => r.column_name));
  columnCache.set(table, { at: Date.now(), cols });
  return cols;
}

const singular = (table) => table.replace(/ies$/, 'y').replace(/s$/, '');

/**
 * How `embed` hangs off `parent`:
 *   kind 'one'  → parent.localCol references table.remoteCol (returns an object)
 *   kind 'many' → table.remoteCol references parent.localCol (returns an array)
 */
async function relationFor(parent, embed, tables) {
  const fks = await foreignKeys();
  const parentCols = await columnsOf(parent);

  // Through a foreign-key column of the parent: `organizations:organization_id(name)`
  if (!Object.hasOwn(tables, embed.target) && parentCols.has(embed.target)) {
    const fk = fks.find((f) => f.src_table === parent && f.src_col === embed.target);
    if (!fk) throw new BadRequest(`No relationship through ${parent}.${embed.target}`);
    return { table: fk.ref_table, kind: 'one', localCol: fk.src_col, remoteCol: fk.ref_col };
  }

  const table = embed.target;
  let candidates = [
    ...fks.filter((f) => f.src_table === parent && f.ref_table === table)
      .map((f) => ({ name: f.name, table, kind: 'one', localCol: f.src_col, remoteCol: f.ref_col })),
    ...fks.filter((f) => f.src_table === table && f.ref_table === parent)
      .map((f) => ({ name: f.name, table, kind: 'many', localCol: f.ref_col, remoteCol: f.src_col })),
  ];
  if (embed.hint) {
    candidates = candidates.filter((c) => c.name === embed.hint || c.localCol === embed.hint || c.remoteCol === embed.hint);
  }

  if (!candidates.length) {
    const tableCols = await columnsOf(table);
    const parentKey = `${singular(parent)}_id`;
    const tableKey = `${singular(table)}_id`;
    if (tableCols.has(parentKey) && parentCols.has('id')) {
      candidates.push({ table, kind: 'many', localCol: 'id', remoteCol: parentKey });
    } else if (parentCols.has(tableKey) && tableCols.has('id')) {
      candidates.push({ table, kind: 'one', localCol: tableKey, remoteCol: 'id' });
    }
  }

  if (!candidates.length) throw new BadRequest(`No relationship between ${parent} and ${table}`);
  if (candidates.length > 1) {
    throw new BadRequest(`More than one relationship between ${parent} and ${table}; name one, e.g. ${table}!${candidates[0].name}`);
  }
  return candidates[0];
}

function embeddedTableConfig(tables, table) {
  const conf = Object.hasOwn(tables, table) ? tables[table] : null;
  if (!conf) throw new BadRequest(`Table '${table}' not in backend`);
  if (!isScoped(conf)) throw new Forbidden(`Table '${table}' has no per-user scope and cannot be embedded`);
  return conf;
}

// ── Ownership ────────────────────────────────────────────────────────────────

/** A table is reachable when it is owned by a column of its own or through its parent row. */
export function isScoped(conf) {
  return !!(conf && (conf.userCol || conf.via));
}

/**
 * SQL that limits `table` (optionally aliased) to the caller's rows; `param` holds the
 * user id. Tables owned through a parent (`via`) follow the chain of parents:
 *   idea_risks.idea_id IN (SELECT id FROM ideas WHERE user_id = $1)
 */
export function ownerCondition(tables, table, alias, param, depth = 0) {
  const conf = Object.hasOwn(tables, table) ? tables[table] : null;
  const col = (name) => (alias ? `${alias}.${ident(name)}` : ident(name));
  if (conf?.userCol) return `${col(conf.userCol)} = ${param}`;
  if (conf?.via && depth < 4) {
    const p = `p${depth}`;
    const { col: fk, parent, parentCol = 'id' } = conf.via;
    return `${col(fk)} IN (SELECT ${p}.${ident(parentCol)} FROM ${ident(parent)} ${p} WHERE ${ownerCondition(tables, parent, p, param, depth + 1)})`;
  }
  throw new Forbidden(`Table '${table}' has no per-user scope`);
}

// ── Filters ──────────────────────────────────────────────────────────────────

const OP_MAP = { eq: '=', neq: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=' };

/**
 * SQL conditions for plain filters. `alias` qualifies columns (used inside EXISTS);
 * values continue from `startIdx`. Filters on the owner column are skipped because
 * the owner scope is always added by the caller.
 */
export function filterConditions(filters, startIdx, ownerCol, alias = null) {
  const conditions = [];
  const values = [];
  let idx = startIdx;
  for (const f of filters) {
    if (!f || typeof f !== 'object') continue;
    const col = f.col || f.column;
    const op = f.op || 'eq';
    const val = f.val !== undefined ? f.val : f.value;
    if (!col) continue;
    if (col === ownerCol || col === 'user_id' || col === 'author_id') continue;
    const column = alias ? `${alias}.${ident(col)}` : ident(col);

    if (OP_MAP[op]) {
      conditions.push(`${column} ${OP_MAP[op]} $${idx}`);
      values.push(val); idx++;
    } else if (op === 'like') {
      conditions.push(`${column} LIKE $${idx}`);
      values.push(val); idx++;
    } else if (op === 'ilike') {
      conditions.push(`${column} ILIKE $${idx}`);
      values.push(val); idx++;
    } else if (op === 'in') {
      conditions.push(`${column} = ANY($${idx})`);
      values.push(val); idx++;
    } else if (op === 'is') {
      conditions.push(val === null ? `${column} IS NULL` : `${column} IS NOT NULL`);
    }
  }
  return { conditions, values, nextIdx: idx };
}

/** Split `alias.col` filters off to the embed they name; the rest stay on the table. */
export function routeFilters(filters) {
  if (!Array.isArray(filters)) throw new BadRequest('filters must be an array');
  const own = [];
  const byAlias = {};
  for (const f of filters) {
    const col = f && (f.col || f.column);
    if (typeof col === 'string' && col.includes('.')) {
      const [alias, ...rest] = col.split('.');
      ident(alias);
      (byAlias[alias] ||= []).push({ ...f, col: rest.join('.'), column: undefined });
    } else {
      own.push(f);
    }
  }
  return { own, byAlias };
}

// ── Query building ───────────────────────────────────────────────────────────

/**
 * EXISTS conditions for top-level `!inner` embeds, so filtering on the related row
 * happens in SQL (limits, offsets and counts stay right).
 */
export async function innerJoinConditions({ table, parsed, byAlias, userId, startIdx, tables }) {
  const conditions = [];
  const values = [];
  let idx = startIdx;
  for (const embed of parsed.embeds.filter((e) => e.inner)) {
    const rel = await relationFor(table, embed, tables);
    const conf = embeddedTableConfig(tables, rel.table);
    const own = (byAlias[embed.alias] || []).filter((f) => !String(f.col).includes('.'));
    const sub = filterConditions(own, idx + 1, conf.userCol, 'e');
    const clauses = [
      `e.${ident(rel.remoteCol)} = ${ident(table)}.${ident(rel.localCol)}`,
      ownerCondition(tables, rel.table, 'e', `$${idx}`),
      ...sub.conditions,
    ];
    conditions.push(`EXISTS (SELECT 1 FROM ${ident(rel.table)} e WHERE ${clauses.join(' AND ')})`);
    values.push(userId, ...sub.values);
    idx = sub.nextIdx;
  }
  return { conditions, values, nextIdx: idx };
}

/** Columns the parent query must return so its embeds can be joined. */
export async function joinColumns(table, parsed, tables) {
  const cols = new Set();
  for (const embed of parsed.embeds) cols.add((await relationFor(table, embed, tables)).localCol);
  return cols;
}

export function columnSql(parsed, extra) {
  if (parsed.columns.includes('*')) return '*';
  const cols = new Set([...parsed.columns, ...extra]);
  return cols.size ? [...cols].map(ident).join(', ') : '*';
}

/** Drop the helper columns that were fetched only to join embeds. */
export function trimRow(row, parsed) {
  if (parsed.columns.includes('*')) return row;
  const keep = new Set([...parsed.columns, ...parsed.embeds.map((e) => e.alias)]);
  return Object.fromEntries(Object.entries(row).filter(([k]) => keep.has(k)));
}

/**
 * Fetch and attach every embed of `parsed` to `rows` (recursively), scoped to the user.
 * Inner embeds drop parent rows without a match (top-level ones are already
 * filtered in SQL; this covers nested ones). Rows come back untrimmed so callers can
 * still read their join columns; trim with `trimRow`.
 */
export async function attachEmbeds({ table, rows, parsed, byAlias = {}, userId, tables }) {
  let out = rows;
  for (const embed of parsed.embeds) {
    const rel = await relationFor(table, embed, tables);
    const conf = embeddedTableConfig(tables, rel.table);
    const { own, byAlias: nested } = routeFilters(byAlias[embed.alias] || []);

    const keys = [...new Set(out.map((r) => r[rel.localCol]).filter((v) => v !== null && v !== undefined))];
    let children = [];
    if (keys.length) {
      const extra = new Set([rel.remoteCol, ...(await joinColumns(rel.table, embed.select, tables))]);
      const sub = filterConditions(own, 3, conf.userCol);
      const sql = `SELECT ${columnSql(embed.select, extra)} FROM ${ident(rel.table)}
        WHERE ${ownerCondition(tables, rel.table, null, '$1')} AND ${ident(rel.remoteCol)} = ANY($2)${sub.conditions.map((c) => ` AND ${c}`).join('')}`;
      children = (await query(sql, [userId, keys, ...sub.values])).rows;
      if (embed.select.embeds.length) {
        children = await attachEmbeds({ table: rel.table, rows: children, parsed: embed.select, byAlias: nested, userId, tables });
      }
    }

    const groups = new Map();
    for (const child of children) {
      const key = String(child[rel.remoteCol]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(trimRow(child, embed.select));
    }
    out = out.map((row) => {
      const matches = groups.get(String(row[rel.localCol])) || [];
      return { ...row, [embed.alias]: rel.kind === 'one' ? matches[0] ?? null : matches };
    });
    if (embed.inner) {
      out = out.filter((row) => (rel.kind === 'one' ? row[embed.alias] !== null : row[embed.alias].length > 0));
    }
  }
  return out;
}
