import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeLike, normalizeFa, normalizeWithMap, searchWords, snippetAround, sqlNormalize } from '../src/search/normalize.js';
import { COLLECTION_SOURCES, PALETTE_TYPES, SOURCE_TYPES, TABLE_SOURCES } from '../src/search/sources.js';

test('Arabic letters, digits, ZWNJ and diacritics are unified', () => {
  assert.equal(normalizeFa('كيوسك'), 'کیوسک');
  assert.equal(normalizeFa('می‌خواهم'), 'میخواهم');
  assert.equal(normalizeFa('ميخواهم'), 'میخواهم');
  assert.equal(normalizeFa('۱۴۰۵ و ١٤٠٥'), '1405 و 1405');
  assert.equal(normalizeFa('مدرسة'), 'مدرسه');
  assert.equal(normalizeFa('أحمد إمام'), 'احمد امام');
  assert.equal(normalizeFa('مُحَمَّد'), 'محمد');
  assert.equal(normalizeFa('کـــلاته'), 'کلاته');
  assert.equal(normalizeFa('Kiosk ABC'), 'kiosk abc');
  // «آ» stays: «آب» and «اب» are different words
  assert.equal(normalizeFa('آب'), 'آب');
});

test('the character map points back into the original text', () => {
  const { norm, map } = normalizeWithMap('می‌خواهم');
  assert.equal(norm, 'میخواهم');
  assert.equal(map[2], 3); // «خ» is after the ZWNJ in the input
});

test('query words: normalized, distinct, at least 2 characters, at most 6', () => {
  assert.deepEqual(searchWords('  كلاته، آب  '), ['کلاته', 'آب']);
  assert.deepEqual(searchWords('می خواهم'), ['می', 'خواهم']);
  assert.deepEqual(searchWords('آب و برق'), ['آب', 'برق']);
  assert.deepEqual(searchWords('ی'), []);
  assert.deepEqual(searchWords('   '), []);
  assert.deepEqual(searchWords('کلاته کلاته'), ['کلاته']);
  assert.equal(searchWords('یک دو سه چهار پنج شش هفت هشت').length, 6);
  assert.deepEqual(searchWords('100% سود_خالص'), ['100%', 'سود_خالص']);
  assert.deepEqual(searchWords('درباره کلاته', { stopwords: new Set(['درباره']) }), ['کلاته']);
  assert.ok(searchWords('ب'.repeat(300)).every((w) => w.length <= 200));
});

test('LIKE wildcards in a word match only themselves', () => {
  assert.equal(escapeLike('100%_a\\b'), '100\\%\\_a\\\\b');
});

test('snippet: around the first word found, from the start when the word is only in the title', () => {
  const long = `${'متن مقدمه '.repeat(30)}روستای کلاته ۱۲۰ خانوار آب شرب ندارد ${'ادامه '.repeat(40)}`;
  const s = snippetAround(long, ['کلاته']);
  assert.ok(s.startsWith('…'));
  assert.ok(s.includes('کلاته'));
  assert.ok(s.length <= 160);
  assert.equal(snippetAround('کوتاه', ['کلاته']), 'کوتاه');
  assert.equal(snippetAround('', ['کلاته']), '');
  assert.ok(snippetAround('می‌خواهم بروم', ['خواهم']).includes('می‌خواهم'));
});

test('the SQL normalizer maps the same characters', () => {
  const sql = sqlNormalize('x');
  assert.match(sql, /^translate\(lower\(x\), /);
  assert.ok(sql.includes('chr(8204)'));
  assert.ok(sql.includes("'ییکهاا01234567890123456789'"));
});

test('every source has an owner condition on the signed-in person and a page', () => {
  for (const s of TABLE_SOURCES) {
    assert.match(s.owner, /\$1/, s.type);
    assert.equal(typeof s.path({ id: 'x', company_id: 'c' }), 'string', s.type);
    assert.ok(s.path({ id: 'x', company_id: 'c' }).startsWith('/'), s.type);
  }
  for (const s of COLLECTION_SOURCES) assert.ok(s.path({ id: 'x' }).startsWith('/'), s.type);
  assert.ok(!PALETTE_TYPES.includes('saved') && SOURCE_TYPES.includes('saved'));
  for (const t of ['task', 'event', 'minutes', 'note', 'idea', 'contact', 'project', 'legal', 'letter', 'cultural',
    'gratitude', 'journal', 'need', 'partner', 'service', 'program', 'risk', 'csr', 'company', 'organization']) {
    assert.ok(PALETTE_TYPES.includes(t), t);
  }
});

test('risks are read from their per-organization lists, with the page of that organization', () => {
  const risk = COLLECTION_SOURCES.find((s) => s.type === 'risk');
  const items = risk.items({ 'ورید هلث': [{ id: 1, title: 'قطع برق' }], 'فرانگران': [{ id: 2, title: 'نوسان ارز' }] });
  assert.equal(items.length, 2);
  assert.equal(risk.path(items[0]), '/organizations/varid/risk-assessment');
  assert.equal(risk.path(items[1]), '/organizations/frangaran/risk-assessment');
  assert.deepEqual(risk.items(null), []);
  assert.deepEqual(risk.items([1, 2]), []);
});

test('meetings open on the minutes page of their organization', () => {
  const minutes = COLLECTION_SOURCES.find((s) => s.type === 'minutes');
  assert.equal(minutes.path({ organization: 'KhadimEKhalgh' }), '/organizational/khadim-e-khalgh/meeting-minutes');
  assert.equal(minutes.path({ organization: 'Professional' }), '/meetings');
  assert.equal(minutes.path({}), '/meetings');
  const need = COLLECTION_SOURCES.find((s) => s.type === 'need');
  assert.equal(need.path({ id: 'a b' }), '/organizational/khadim-e-khalgh/needs?highlight=a%20b');
});
