import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, parseItems, parseTag } from '../src/news/feeds.js';

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>خبرگزاری نمونه</title>
<item>
  <title><![CDATA[ افزایش قیمت دلار در بازار ارز ]]></title>
  <link>https://example.ir/news/1</link>
  <description><![CDATA[<p>بانک مرکزی &#8204;گزارش داد که &amp; ...</p>]]></description>
  <pubDate>Tue, 27 Oct 2026 08:30:00 GMT</pubDate>
</item>
<item>
  <title>تیم&#8204;ملی فوتبال به جام رسید</title>
  <guid>https://example.ir/news/2</guid>
  <pubDate>not a date</pubDate>
</item>
<item><title></title><link>https://example.ir/empty</link></item>
</channel></rss>`;

test('reads headlines, links, dates and entities from RSS', () => {
  const items = parseItems(RSS, 'نمونه');
  assert.equal(items.length, 2, 'an item without a title is skipped');
  assert.equal(items[0].title, 'افزایش قیمت دلار در بازار ارز');
  assert.equal(items[0].url, 'https://example.ir/news/1');
  assert.equal(items[0].date, '2026-10-27T08:30:00.000Z');
  assert.match(items[0].snippet, /^بانک مرکزی ‌گزارش داد که & \.\.\.$/);
  assert.equal(items[0].source, 'نمونه');
  assert.equal(items[1].title, 'تیم‌ملی فوتبال به جام رسید', 'the &#8204; half-space is kept');
  assert.equal(items[1].url, 'https://example.ir/news/2', 'guid stands in for a missing link');
  assert.equal(items[1].date, null, 'an unreadable date is left out');
});

test('puts a headline in the fields its keywords belong to', () => {
  const [dollar, football] = parseItems(RSS, 'نمونه').map(classify);
  assert.deepEqual(dollar.domains, ['اقتصاد']);
  assert.deepEqual(dollar.keywords.sort(), ['ارز', 'بانک', 'دلار', 'قیمت'].sort());
  assert.deepEqual(football.domains, ['ورزش']);
  assert.ok(football.keywords.includes('فوتبال'));
  assert.deepEqual(classify({ title: 'خبری بی‌ربط', snippet: '' }).domains, []);
});

test('parseTag returns empty text for a missing tag', () => {
  assert.equal(parseTag('<item></item>', 'title'), '');
});
