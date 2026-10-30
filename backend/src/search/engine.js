import { query } from '../db/index.js';
import { escapeLike, normalizeFa, searchWords, snippetAround, sqlNormalize } from './normalize.js';
import { COLLECTION_SOURCES, PALETTE_TYPES, SOURCE_TYPES, TABLE_SOURCES } from './sources.js';

export const DEFAULT_LIMIT = 5;
export const MAX_LIMIT = 20;
const ANY_FETCH = 15; // rows per source when any word may match; they are re-ranked here

const textOf = (v) => (v === null || v === undefined ? '' : String(v));
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function toIso(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const s = String(value).trim().replace(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/, '$1-$2-$3');
  const year = Number(s.slice(0, 4));
  if (!/^\d{4}-\d{1,2}-\d{1,2}/.test(s) || year < 1700) return null; // not ISO, or a Jalali date
  const d = new Date(/^\d{4}-\d{1,2}-\d{1,2}$/.test(s) ? `${s}T12:00:00Z` : s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** All words (or, with match 'any', some) in the text; the score ranks title hits above body hits. */
function scoreOf(title, body, words, match) {
  const t = normalizeFa(title);
  const b = normalizeFa(body);
  const inTitle = words.filter((w) => t.includes(w)).length;
  const inAny = words.filter((w) => t.includes(w) || b.includes(w)).length;
  const matches = match === 'all' ? inAny === words.length : inAny > 0;
  const titleHit = match === 'all' ? inTitle === words.length : inTitle > 0;
  return { matches, titleHit, score: inTitle * 3 + (inAny - inTitle) };
}

function makeItem(source, { id, title, body, at, status, extra }, words, match) {
  const rawTitle = textOf(title).trim();
  const text = textOf(body);
  const { titleHit, score } = scoreOf(rawTitle, text, words, match);
  const item = {
    id: String(id),
    type: source.type,
    title: rawTitle || clip(text.replace(/\s+/g, ' ').trim(), 60),
    snippet: snippetAround(text, words),
    date: toIso(at),
    path: source.path({ id: String(id), ...extra }),
    titleHit,
    score,
  };
  if (status) item.status = String(status);
  return item;
}

const byRank = (a, b) => (b.titleHit - a.titleHit) || (b.score - a.score) || ((b.date || '').localeCompare(a.date || ''));

async function searchTable(source, userId, words, { limit, match }) {
  const hay = sqlNormalize(`concat_ws(' ', ${[source.title, ...source.body].join(', ')})`);
  const titleNorm = sqlNormalize(`COALESCE(${source.title}, '')`);
  const quantifier = match === 'all' ? 'ALL' : 'ANY';
  const extra = Object.entries(source.extra || {}).map(([k, expr]) => `, ${expr} AS ${k}`).join('');
  const sql = `
    SELECT t.id::text AS id, ${source.title} AS title, concat_ws(' ', ${source.body.join(', ')}) AS body,
           ${source.date} AS at, ${source.status || 'NULL'} AS status${extra},
           (${titleNorm} LIKE ${quantifier}($2)) AS title_hit, count(*) OVER () AS total
      FROM ${source.table} t
     WHERE ${source.owner}${source.where ? ` AND ${source.where}` : ''} AND ${hay} LIKE ${quantifier}($2)
     ORDER BY title_hit DESC, at DESC NULLS LAST
     LIMIT $3`;
  const patterns = words.map((w) => `%${escapeLike(w)}%`);
  const { rows } = await query(sql, [userId, patterns, match === 'all' ? limit : Math.max(limit, ANY_FETCH)]);
  const items = rows.map((r) => makeItem(source, {
    id: r.id, title: r.title, body: r.body, at: r.at, status: r.status,
    extra: Object.fromEntries(Object.keys(source.extra || {}).map((k) => [k, r[k]])),
  }, words, match));
  return { total: rows.length ? Number(rows[0].total) : 0, items };
}

const collectionKey = (source, userId) => (typeof source.collection === 'function' ? source.collection(userId) : source.collection);
const fieldText = (item, f) => textOf(typeof f === 'function' ? f(item) : item?.[f]);

async function searchCollections(sources, userId, words, { match }) {
  if (!sources.length) return new Map();
  const keys = sources.map((s) => collectionKey(s, userId));
  const { rows } = await query('SELECT collection, data FROM user_collections WHERE user_id = $1 AND collection = ANY($2)', [userId, keys]);
  const docs = new Map(rows.map((r) => [r.collection, r.data]));
  const found = new Map();
  await Promise.all(sources.map(async (source) => {
    try {
      let list = source.items(docs.get(collectionKey(source, userId))).filter((it) => it && it.id !== undefined && it.id !== null);
      if (source.sameAs && list.length) {
        // the server table is the record; its rows are searched there
        const ids = list.map((it) => String(it.id));
        const { rows: inTable } = await query(
          `SELECT id::text AS id FROM ${source.sameAs.table} WHERE ${source.sameAs.owner} = $1 AND id::text = ANY($2)`, [userId, ids]);
        const known = new Set(inTable.map((r) => r.id));
        list = list.filter((it) => !known.has(String(it.id)));
      }
      const items = [];
      for (const it of list) {
        const title = source.title ? fieldText(it, source.title) : '';
        const body = source.body.map((f) => fieldText(it, f)).filter(Boolean).join(' ');
        if (!scoreOf(title, body, words, match).matches) continue;
        const at = source.date.map((f) => it[f]).find((v) => toIso(v));
        items.push(makeItem(source, { id: it.id, title, body, at, status: source.status ? it[source.status] : null, extra: it }, words, match));
      }
      found.set(source, items);
    } catch (err) {
      console.warn(`[search] ${source.type} skipped:`, err.message);
    }
  }));
  return found;
}

/**
 * The signed-in person's records matching `text` (contracts/search-api.md).
 * `types` limits the sources; `palette: false` adds the sources only the assistant uses.
 */
export async function searchAll(userId, text, { types, limit = DEFAULT_LIMIT, match = 'all', palette = true, stopwords } = {}) {
  const words = searchWords(text, { stopwords });
  const result = { query: String(text ?? '').trim().slice(0, 200), words, total: 0, groups: [] };
  if (!words.length) return result;
  const n = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const allowed = new Set((types?.length ? types : palette ? PALETTE_TYPES : SOURCE_TYPES)
    .filter((t) => (palette ? PALETTE_TYPES : SOURCE_TYPES).includes(t)));

  const tables = TABLE_SOURCES.filter((s) => allowed.has(s.type));
  const collections = COLLECTION_SOURCES.filter((s) => allowed.has(s.type));
  const [tableResults, collectionResults] = await Promise.all([
    Promise.all(tables.map((s) => searchTable(s, userId, words, { limit: n, match }).catch((err) => {
      console.warn(`[search] ${s.type} skipped:`, err.message);
      return { total: 0, items: [] };
    }))),
    searchCollections(collections, userId, words, { match }).catch((err) => {
      console.warn('[search] lists skipped:', err.message);
      return new Map();
    }),
  ]);

  const groups = new Map();
  const add = (type, label, total, items) => {
    const g = groups.get(type) ?? { type, label, total: 0, items: [] };
    g.total += total;
    g.items.push(...items);
    groups.set(type, g);
  };
  tables.forEach((s, i) => add(s.type, s.label, tableResults[i].total, tableResults[i].items));
  for (const [s, items] of collectionResults) add(s.type, s.label, items.length, items);

  result.groups = [...groups.values()]
    .filter((g) => g.total > 0)
    .map((g) => ({ ...g, items: g.items.sort(byRank).slice(0, n) }))
    // the best result decides (all words in the title, then more words in it); then the fixed type order
    .sort((a, b) => (b.items[0].titleHit - a.items[0].titleHit) || (b.items[0].score - a.items[0].score)
      || (SOURCE_TYPES.indexOf(a.type) - SOURCE_TYPES.indexOf(b.type)));
  result.total = result.groups.reduce((sum, g) => sum + g.total, 0);
  return result;
}

export { SOURCE_TYPES, PALETTE_TYPES };
