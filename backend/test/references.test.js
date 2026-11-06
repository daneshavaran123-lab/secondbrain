import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReferenceBook, isAppPath } from '../src/agent/references.js';

const need = { type: 'need', id: 'n1', title: 'آب شرب روستای کلاته', path: '/organizational/khadim-e-khalgh/needs?highlight=n1' };
const task = { type: 'task', id: 't1', title: 'پیگیری لوله‌کشی', path: '/tasks?highlight=t1' };

test('keys are short, unique per answer, and stable for the same record', () => {
  const book = createReferenceBook();
  assert.equal(book.add(need), 'r1');
  assert.equal(book.add(task), 'r2');
  assert.equal(book.add({ ...need }), 'r1');
  assert.equal(book.list().length, 2);
});

test('a record without an in-app page gets no key', () => {
  const book = createReferenceBook();
  assert.equal(book.add({ ...need, path: null }), null);
  assert.equal(book.add({ ...need, path: 'https://evil.example/x' }), null);
  assert.equal(book.add({ ...need, path: '//evil.example/x' }), null);
  assert.equal(book.add({ ...need, path: 'javascript:alert(1)' }), null);
  assert.equal(book.list().length, 0);
});

test('ref links of this answer stay; any other link becomes its words', () => {
  const book = createReferenceBook();
  book.add(need);
  const out = book.linkify('نیاز [آب کلاته](ref:r1) و [سایت](https://evil.example) و [ساختگی](ref:r9) و ![تصویر](https://x/y.png)');
  assert.equal(out, 'نیاز [آب کلاته](ref:r1) و سایت و ساختگی و تصویر');
});

test('a title the model left plain is linked once, longest title first, never inside a link', () => {
  const book = createReferenceBook();
  book.add(need);
  book.add({ type: 'note', id: 'x', title: 'کلاته', path: '/knowledge' });
  const out = book.linkify('وضعیت آب شرب روستای کلاته «در حال اجرا» است. آب شرب روستای کلاته مهم است. یادداشت کلاته هم هست.');
  assert.equal(out, 'وضعیت [آب شرب روستای کلاته](ref:r1) «در حال اجرا» است. آب شرب روستای کلاته مهم است. یادداشت [کلاته](ref:r2) هم هست.');
});

test('a record already linked by the model is not linked again', () => {
  const book = createReferenceBook();
  book.add(task);
  const out = book.linkify('کار [این کار](ref:r1) یعنی پیگیری لوله‌کشی فرداست.');
  assert.equal(out, 'کار [این کار](ref:r1) یعنی پیگیری لوله‌کشی فرداست.');
});

test('very short titles are not linked by guess, and brackets in titles do not break the link', () => {
  const book = createReferenceBook();
  book.add({ type: 'idea', id: 'a', title: 'آب', path: '/ideas' });
  book.add({ type: 'idea', id: 'b', title: 'طرح [نهایی]', path: '/ideas' });
  assert.equal(book.linkify('آب و طرح [نهایی] آماده است'), 'آب و [طرح (نهایی)](ref:r2) آماده است');
});

test('in-app paths', () => {
  assert.ok(isAppPath('/tasks?highlight=1'));
  for (const p of ['', 'tasks', '//x.com', 'http://x', '/a b', null]) assert.ok(!isAppPath(p), String(p));
});

test('a title is linked only as a whole word', () => {
  const book = createReferenceBook();
  book.add({ type: 'note', id: 'x', title: 'کلاته', path: '/knowledge' });
  assert.equal(book.linkify('محمود کلاته‌ای و کلاتهها و کلاته.'), 'محمود کلاته‌ای و کلاتهها و [کلاته](ref:r1).');
});
