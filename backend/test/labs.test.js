import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLabText, parseLine, parseHeader, finishResult, matchTest, flagFor, ruleSummary } from '../src/health/labs.js';

const REPORT = `آزمایشگاه پاتوبیولوژی مهر
نام بیمار: سارا کرباسی        تاریخ پذیرش: ۱۴۰۵/۰۸/۰۲
Test            Result     Unit      Normal Range
FBS             108        mg/dl     70 - 100
Cholesterol     185        mg/dl     < 200
Triglyceride    210        mg/dl     Up to 150
HDL Cholesterol 38         mg/dl     > 40
LDL Cholesterol 112        mg/dl     < 130
HbA1c           5.4        %         4 - 5.7
TSH             2.1        mIU/L     0.4 - 4.5
Vit D (25-OH)   ۱۸٫۵       ng/ml     30 - 100
K               4.4        mEq/L     3.5 - 5.1`;

test('reads every result line of a typical report', () => {
  const rows = parseLabText(REPORT);
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.deepEqual(Object.keys(byKey).sort(), ['chol', 'fbs', 'hba1c', 'hdl', 'ldl', 'potassium', 'tg', 'tsh', 'vitd'].sort());
  assert.equal(byKey.fbs.value, 108);
  assert.equal(byKey.fbs.unit, 'mg/dl');
  assert.deepEqual([byKey.fbs.ref_low, byKey.fbs.ref_high], [70, 100]);
  assert.deepEqual([byKey.chol.ref_low, byKey.chol.ref_high], [null, 200]);
  assert.deepEqual([byKey.tg.ref_low, byKey.tg.ref_high], [null, 150]);
  assert.deepEqual([byKey.hdl.ref_low, byKey.hdl.ref_high], [40, null]);
  assert.equal(byKey.vitd.value, 18.5, 'Persian digits and decimal separator');
  assert.equal(byKey.hba1c.value, 5.4);
});

test('HDL and LDL lines are not taken for total cholesterol', () => {
  assert.equal(parseLine('HDL Cholesterol 45 mg/dl')?.key, 'hdl');
  assert.equal(parseLine('LDL-C 99')?.key, 'ldl');
  assert.equal(parseLine('Total Cholesterol 199')?.key, 'chol');
  assert.equal(parseLine('Glucose 2hpp 130')?.key, 'bs2hpp');
});

test('short names only count at the start of a line', () => {
  assert.equal(parseLine('K 4.1')?.key, 'potassium');
  assert.equal(parseLine('Bank account 1234'), null);
  assert.equal(parseLine('PLT 250 x10^3/µL 150-450')?.key, 'plt');
});

test('a value printed before a Persian name is still read', () => {
  const r = parseLine('۹۵ قند ناشتا');
  assert.equal(r?.key, 'fbs');
  assert.equal(r?.value, 95);
});

test('header gives the lab and the Jalali report date', () => {
  const h = parseHeader(REPORT);
  assert.match(h.lab_name, /آزمایشگاه/);
  assert.equal(h.report_date, '2026-10-24');
});

test('results are flagged against the report range, else the catalogue range', () => {
  const [fbs] = parseLabText('FBS 108 mg/dl 70-100').map(finishResult);
  assert.equal(fbs.flag, 'high');
  const noRange = finishResult({ test_name: 'Vitamin D', value: '22' });
  assert.equal(noRange.test_key, 'vitd');
  assert.deepEqual([noRange.ref_low, noRange.ref_high, noRange.flag], [30, 100, 'low']);
  const qualitative = finishResult({ test_name: 'HBs Ag', value: 'Negative' });
  assert.deepEqual([qualitative.test_key, qualitative.value, qualitative.value_text, qualitative.flag], ['other', null, 'Negative', null]);
});

test('model output is normalised to catalogue keys', () => {
  assert.equal(matchTest('Fasting Blood Sugar')?.key, 'fbs');
  assert.equal(matchTest('تری گلیسیرید')?.key, 'tg');
  assert.equal(matchTest('SGPT (ALT)')?.key, 'alt');
  assert.equal(matchTest('Something else'), null);
  assert.equal(flagFor(5, null, null), null);
});

test('the fallback summary names what is out of range', () => {
  const s = ruleSummary(parseLabText(REPORT).map(finishResult));
  assert.match(s, /۹|9/);
  assert.match(s, /قند خون ناشتا \(بالا\)/);
  assert.match(s, /ویتامین D \(پایین\)/);
});

test('a known test_key wins over the printed name', () => {
  assert.equal(finishResult({ test_key: 'ft4', test_name: 'T4 آزاد', value: 1.2 }).test_key, 'ft4');
  assert.equal(finishResult({ test_key: 'other', test_name: 'تری گلیسیرید', value: 120 }).test_key, 'tg');
  assert.equal(finishResult({ test_key: 'made_up', test_name: 'LDL', value: 90 }).test_key, 'ldl');
});
