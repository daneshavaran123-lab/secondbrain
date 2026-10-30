// Persian text normalization shared by the search box and the assistant (research R2).
// The JS side and the SQL side apply the same mapping, so a word normalized here matches a
// column normalized by Postgres.

const MAP = new Map([
  ['ي', 'ی'], ['ى', 'ی'], ['ك', 'ک'], ['ة', 'ه'], ['أ', 'ا'], ['إ', 'ا'],
  ...[...'۰۱۲۳۴۵۶۷۸۹'].map((d, i) => [d, String(i)]),
  ...[...'٠١٢٣٤٥٦٧٨٩'].map((d, i) => [d, String(i)]),
]);

// ZWNJ and other zero-width marks, tatweel, Arabic diacritics: removed, so «می‌خواهم» = «میخواهم»
const DROP_CODES = [
  0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0xfeff, 0x0640, 0x0670,
  ...Array.from({ length: 0x065f - 0x064b + 1 }, (_, i) => 0x064b + i),
];
const DROP = new Set(DROP_CODES.map((c) => String.fromCharCode(c)));

/** Normalized text plus, for each of its characters, the index it came from in the input. */
export function normalizeWithMap(text) {
  const src = String(text ?? '');
  let norm = '';
  const map = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (DROP.has(c)) continue;
    const out = MAP.get(c) ?? c.toLowerCase();
    for (const ch of out) {
      norm += ch;
      map.push(i);
    }
  }
  return { norm, map };
}

export const normalizeFa = (text) => normalizeWithMap(text).norm;

const sqlLiteral = (s) => `'${s.replace(/'/g, "''")}'`;
const FROM_SQL = `${sqlLiteral([...MAP.keys()].join(''))} || ${DROP_CODES.map((c) => `chr(${c})`).join(' || ')}`;
const TO_SQL = sqlLiteral([...MAP.values()].join(''));

/** SQL expression applying normalizeFa to `expr` (characters without a counterpart are dropped). */
export const sqlNormalize = (expr) => `translate(lower(${expr}), ${FROM_SQL}, ${TO_SQL})`;

export const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export const MAX_QUERY = 200;
const MAX_WORDS = 6;
const SEPARATORS = /[\s,.;:!?؟،؛«»"'()[\]{}\-/\\|…*+=<>~^`]+/;

/** Distinct normalized words of a query, at least 2 characters each, at most 6. */
export function searchWords(query, { stopwords } = {}) {
  const words = normalizeFa(String(query ?? '').slice(0, MAX_QUERY))
    .split(SEPARATORS)
    .filter((w) => w.length >= 2 && !stopwords?.has(w));
  return [...new Set(words)].slice(0, MAX_WORDS);
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
 * Up to `max` characters of `text` around the first word found in it; the start of the text
 * when none of the words is in it (the match was in the title).
 */
export function snippetAround(text, words, max = 160) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  const { norm, map } = normalizeWithMap(flat);
  const hits = words.map((w) => norm.indexOf(w)).filter((i) => i >= 0);
  if (!hits.length) return clip(flat, max);
  const at = map[Math.min(...hits)];
  if (at < max / 3) return clip(flat, max);
  // start a little before the word, at a word boundary
  let start = flat.lastIndexOf(' ', at - Math.floor(max / 4));
  if (start < 0) start = 0;
  return `…${clip(flat.slice(start).trimStart(), max - 1)}`;
}
