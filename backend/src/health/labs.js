/**
 * Lab reports: a catalogue of the tests Iranian labs print most often, a line parser
 * for OCR text, and the range check that marks a value low or high.
 *
 * The parser is the fallback when the language model is unavailable, and the catalogue
 * also normalises what the model returns (one key per test, so trends line up across
 * labs that spell names differently).
 */

import { toLatinDigits, normalizeDate, DEFAULT_TZ } from '../agent/time.js';

// key, Persian label, aliases (as printed), usual unit, adult reference range.
// Ranges that depend on sex or age (Hb, ferritin…) are left out; the report's own range wins anyway.
export const LAB_TESTS = [
  // Specific names first: "HDL Cholesterol" must not be read as total cholesterol
  { key: 'hdl', label: 'کلسترول خوب (HDL)', aliases: ['HDL-Cholesterol', 'HDL Cholesterol', 'HDL-C', 'HDL', 'اچ دی ال'], unit: 'mg/dL', low: 40 },
  { key: 'ldl', label: 'کلسترول بد (LDL)', aliases: ['LDL-Cholesterol', 'LDL Cholesterol', 'LDL-C', 'LDL', 'ال دی ال'], unit: 'mg/dL', high: 100 },
  { key: 'vldl', label: 'VLDL', aliases: ['VLDL'], unit: 'mg/dL', high: 30 },
  { key: 'bs2hpp', label: 'قند دو ساعت پس از غذا', aliases: ['2hpp', '2 hpp', 'BS 2hpp', 'Blood Sugar 2hpp', 'Glucose 2hpp', 'قند دو ساعت بعد از غذا', 'قند ۲ ساعت بعد از غذا'], unit: 'mg/dL', high: 140 },
  { key: 'hba1c', label: 'هموگلوبین A1c', aliases: ['Hemoglobin A1c', 'Glycated Hemoglobin', 'HbA1c', 'Hb A1c', 'HbA1C', 'A1C', 'هموگلوبین گلیکوزیله'], unit: '%', low: 4, high: 5.7 },
  { key: 'fbs', label: 'قند خون ناشتا', aliases: ['Fasting Blood Sugar', 'Fasting Blood Glucose', 'Glucose (Fasting)', 'Glucose Fasting', 'Blood Sugar', 'FBS', 'Glucose', 'قند خون ناشتا', 'قند ناشتا', 'قند خون'], unit: 'mg/dL', low: 70, high: 100 },
  { key: 'chol', label: 'کلسترول کل', aliases: ['Total Cholesterol', 'Cholesterol Total', 'Cholesterol', 'Chol', 'کلسترول'], unit: 'mg/dL', high: 200 },
  { key: 'tg', label: 'تری‌گلیسیرید', aliases: ['Triglycerides', 'Triglyceride', 'TG', 'تری گلیسیرید', 'تری‌گلیسیرید'], unit: 'mg/dL', high: 150 },
  { key: 'bun', label: 'نیتروژن اوره خون (BUN)', aliases: ['BUN', 'Blood Urea Nitrogen'], unit: 'mg/dL', low: 7, high: 20 },
  { key: 'urea', label: 'اوره', aliases: ['Blood Urea', 'Urea', 'اوره'], unit: 'mg/dL', low: 15, high: 45 },
  { key: 'creatinine', label: 'کراتینین', aliases: ['Creatinine', 'Creat', 'Cr', 'کراتینین'], unit: 'mg/dL', low: 0.6, high: 1.3 },
  { key: 'uric_acid', label: 'اسید اوریک', aliases: ['Uric Acid', 'U.A', 'اسید اوریک'], unit: 'mg/dL', low: 3.5, high: 7.2 },
  { key: 'ast', label: 'آنزیم کبدی AST', aliases: ['AST (SGOT)', 'SGOT (AST)', 'SGOT', 'AST'], unit: 'U/L', high: 40 },
  { key: 'alt', label: 'آنزیم کبدی ALT', aliases: ['ALT (SGPT)', 'SGPT (ALT)', 'SGPT', 'ALT'], unit: 'U/L', high: 41 },
  { key: 'alp', label: 'آلکالین فسفاتاز', aliases: ['Alkaline Phosphatase', 'Alk.Phosphatase', 'Alk Phos', 'ALP'], unit: 'U/L' },
  { key: 'ft4', label: 'T4 آزاد', aliases: ['Free T4', 'FT4', 'F.T4'], unit: 'ng/dL', low: 0.8, high: 1.8 },
  { key: 'ft3', label: 'T3 آزاد', aliases: ['Free T3', 'FT3', 'F.T3'], unit: 'pg/mL', low: 2.3, high: 4.2 },
  { key: 'tsh', label: 'هورمون محرک تیروئید (TSH)', aliases: ['TSH'], unit: 'mIU/L', low: 0.4, high: 4.5 },
  { key: 't4', label: 'T4', aliases: ['Total T4', 'T4'], unit: 'µg/dL', low: 4.5, high: 12 },
  { key: 't3', label: 'T3', aliases: ['Total T3', 'T3'], unit: 'ng/dL', low: 80, high: 200 },
  { key: 'vitd', label: 'ویتامین D', aliases: ['25-Hydroxy Vitamin D', '25(OH) Vitamin D', '25-OH Vitamin D', '25-OH Vit D', 'Vitamin D3', 'Vitamin D', 'Vit D3', 'Vit D', 'ویتامین دی', 'ویتامین د'], unit: 'ng/mL', low: 30, high: 100 },
  { key: 'b12', label: 'ویتامین B12', aliases: ['Vitamin B12', 'Vit B12', 'B12', 'ویتامین ب۱۲', 'ویتامین ب 12'], unit: 'pg/mL', low: 200, high: 900 },
  { key: 'ferritin', label: 'فریتین', aliases: ['Ferritin', 'فریتین'], unit: 'ng/mL' },
  { key: 'tibc', label: 'ظرفیت اتصال آهن (TIBC)', aliases: ['TIBC'], unit: 'µg/dL', low: 250, high: 450 },
  { key: 'iron', label: 'آهن سرم', aliases: ['Serum Iron', 'Iron', 'Fe', 'آهن سرم', 'آهن'], unit: 'µg/dL', low: 60, high: 170 },
  { key: 'hb', label: 'هموگلوبین', aliases: ['Hemoglobin', 'Haemoglobin', 'HGB', 'Hb', 'هموگلوبین'], unit: 'g/dL' },
  { key: 'hct', label: 'هماتوکریت', aliases: ['Hematocrit', 'HCT', 'هماتوکریت'], unit: '%' },
  { key: 'wbc', label: 'گلبول سفید', aliases: ['White Blood Cells', 'W.B.C', 'WBC', 'گلبول سفید'], unit: '×10³/µL' },
  { key: 'rbc', label: 'گلبول قرمز', aliases: ['Red Blood Cells', 'R.B.C', 'RBC', 'گلبول قرمز'], unit: '×10⁶/µL' },
  { key: 'plt', label: 'پلاکت', aliases: ['Platelets', 'Platelet', 'PLT', 'پلاکت'], unit: '×10³/µL', low: 150, high: 450 },
  { key: 'mcv', label: 'MCV', aliases: ['MCV'], unit: 'fL', low: 80, high: 100 },
  { key: 'mch', label: 'MCH', aliases: ['MCH'], unit: 'pg', low: 27, high: 33 },
  { key: 'sodium', label: 'سدیم', aliases: ['Sodium', 'Na', 'سدیم'], unit: 'mEq/L', low: 135, high: 145 },
  { key: 'potassium', label: 'پتاسیم', aliases: ['Potassium', 'K', 'پتاسیم'], unit: 'mEq/L', low: 3.5, high: 5.1 },
  { key: 'calcium', label: 'کلسیم', aliases: ['Calcium', 'Ca', 'کلسیم'], unit: 'mg/dL', low: 8.5, high: 10.5 },
  { key: 'phosphorus', label: 'فسفر', aliases: ['Phosphorus', 'P', 'فسفر'], unit: 'mg/dL', low: 2.5, high: 4.5 },
  { key: 'crp', label: 'CRP', aliases: ['hs-CRP', 'hsCRP', 'C-Reactive Protein', 'CRP'], unit: 'mg/L' },
  { key: 'esr', label: 'سرعت سدیمانتاسیون (ESR)', aliases: ['ESR'], unit: 'mm/hr' },
  { key: 'psa', label: 'PSA', aliases: ['Total PSA', 'PSA'], unit: 'ng/mL', high: 4 },
];

const BY_KEY = new Map(LAB_TESTS.map((t) => [t.key, t]));
export const labTest = (key) => (key && BY_KEY.get(key)) || null;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// An alias counts only as a whole word; short ones (K, Na, Cr…) must also start the line
const ALIAS_PATTERNS = LAB_TESTS.map((test) => ({
  test,
  patterns: test.aliases.map((alias) => {
    const short = alias.length <= 2;
    const body = escapeRe(alias).replace(/\\?\s+/g, '\\s*');
    return new RegExp(`${short ? '^\\s*' : '(?:^|[^A-Za-z\\u0600-\\u06FF])'}(${body})(?=$|[^A-Za-z\\u0600-\\u06FF])`, short ? '' : 'i');
  }),
}));

/** Which catalogue test a printed name refers to, or null. */
export function matchTest(name) {
  const s = normalizeText(name);
  for (const { test, patterns } of ALIAS_PATTERNS) {
    if (patterns.some((re) => re.test(s))) return test;
  }
  return null;
}

/** Persian digits → ASCII, Persian decimal separator → '.', tidy spaces. */
export function normalizeText(s) {
  return toLatinDigits(String(s ?? ''))
    .replace(/[٫]/g, '.')
    .replace(/[،]/g, ',')
    .replace(/[–—−]/g, '-')
    .replace(/‏|‎/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

const UNIT_RE = /^(mg\/dl|g\/dl|mg\/l|g\/l|ng\/ml|ng\/dl|pg\/ml|µg\/dl|ug\/dl|mcg\/dl|mmol\/l|µmol\/l|umol\/l|meq\/l|m?iu\/l|µiu\/ml|uiu\/ml|miu\/ml|u\/l|iu\/ml|mm\/hr?|fl|pg|%|10\^?3\/µl|10\^?3\/ul|×10[³⁶]\/µl|\/µl|\/ul|\/cumm|cells\/µl)/i;

function parseRange(rest) {
  let m = rest.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  if (m) return { low: Number(m[1]), high: Number(m[2]), text: `${m[1]} - ${m[2]}` };
  m = rest.match(/(?:<|≤|up\s*to|تا|کمتر\s*از)\s*(\d+(?:\.\d+)?)/i);
  if (m) return { low: null, high: Number(m[1]), text: `< ${m[1]}` };
  m = rest.match(/(?:>|≥|بیشتر\s*از|more\s*than)\s*(\d+(?:\.\d+)?)/i);
  if (m) return { low: Number(m[1]), high: null, text: `> ${m[1]}` };
  return null;
}

/** low / high / normal, or null when there is no range to compare with. */
export function flagFor(value, low, high) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const v = Number(value);
  if (low != null && Number.isFinite(Number(low)) && v < Number(low)) return 'low';
  if (high != null && Number.isFinite(Number(high)) && v > Number(high)) return 'high';
  if (low == null && high == null) return null;
  return 'normal';
}

/** One result line → { key, test_name, value, unit, ref_low, ref_high, ref_text } or null. */
export function parseLine(rawLine) {
  const line = normalizeText(rawLine);
  if (!line || line.length > 160) return null;
  for (const { test, patterns } of ALIAS_PATTERNS) {
    for (const re of patterns) {
      const m = line.match(re);
      if (!m) continue;
      const end = m.index + m[0].length;
      // The value follows the name in LTR tables; OCR of RTL layouts may put it before
      // A qualifier right after the name, as in "Vit D (25-OH)", is not the value
      let rest = line.slice(end).replace(/^\s*\([^)]*\)/, '');
      let num = rest.match(/(?:^|[^\d.])(\d+(?:\.\d+)?)/);
      if (!num) {
        rest = line.slice(0, m.index);
        num = rest.match(/(\d+(?:\.\d+)?)(?!.*\d)/);
        if (!num) continue;
      }
      const value = Number(num[1]);
      if (!Number.isFinite(value)) continue;
      const after = rest.slice(rest.indexOf(num[1]) + num[1].length).trim();
      const unit = after.match(UNIT_RE)?.[1] || null;
      const range = parseRange(after.slice(unit ? unit.length : 0));
      return {
        key: test.key,
        test_name: m[1].trim(),
        value,
        unit,
        ref_low: range?.low ?? null,
        ref_high: range?.high ?? null,
        ref_text: range?.text ?? null,
      };
    }
  }
  return null;
}

/** Lab name and report date from the header lines, when printed. */
export function parseHeader(text, now = new Date()) {
  const lines = normalizeText(text).split(/\n/).map((l) => l.trim()).filter(Boolean).slice(0, 25);
  const lab = lines.find((l) => /آزمایشگاه|laboratory|\blab\b/i.test(l)) || null;
  let reportDate = null;
  for (const l of lines) {
    if (!/تاریخ|date/i.test(l)) continue;
    reportDate = normalizeDate(l, now, DEFAULT_TZ);
    if (reportDate) break;
  }
  return { lab_name: lab ? lab.slice(0, 120) : null, report_date: reportDate };
}

/** Results found line by line; the first reading of each test wins. */
export function parseLabText(text) {
  const seen = new Set();
  const results = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const r = parseLine(line);
    if (r && !seen.has(r.key)) {
      seen.add(r.key);
      results.push(r);
    }
  }
  return results;
}

/**
 * Make one result safe to store: known key, numbers as numbers, the catalogue's range
 * when the report printed none, and its flag.
 */
export function finishResult(r) {
  // The parser sets key, the model and the edit form send test_key; otherwise match the printed name
  const known = labTest(r.key) || labTest(r.test_key) || matchTest(r.test_name || '');
  const num = (v) => {
    if (v == null || v === '') return null;
    const n = Number(normalizeText(String(v)).replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  const value = num(r.value);
  let low = num(r.ref_low);
  let high = num(r.ref_high);
  let refText = typeof r.ref_text === 'string' ? r.ref_text.slice(0, 80) : null;
  if (low == null && high == null && known && (known.low != null || known.high != null)) {
    low = known.low ?? null;
    high = known.high ?? null;
    refText = null;
  }
  const flag = ['low', 'high', 'normal'].includes(r.flag) && value == null ? r.flag : flagFor(value, low, high);
  return {
    test_key: known?.key || 'other',
    test_name: String(r.test_name || known?.label || '').slice(0, 120),
    value,
    // Qualitative results ("Negative", "Trace") keep their wording
    value_text: value == null && (r.value_text || r.value) ? String(r.value_text || r.value).slice(0, 120) : null,
    unit: (r.unit && String(r.unit).slice(0, 30)) || known?.unit || null,
    ref_low: low,
    ref_high: high,
    ref_text: refText,
    flag,
  };
}

/** Persian summary when no model is available: which results are out of range. */
export function ruleSummary(results) {
  const out = results.filter((r) => r.flag === 'high' || r.flag === 'low');
  if (!results.length) return null;
  if (!out.length) return `${results.length} نتیجه خوانده شد و همه در محدوده مرجع هستند.`;
  const names = out.map((r) => `${labTest(r.test_key)?.label || r.test_name} (${r.flag === 'high' ? 'بالا' : 'پایین'})`);
  return `${results.length} نتیجه خوانده شد؛ ${out.length} مورد خارج از محدوده: ${names.join('، ')}. برای تفسیر با پزشک خود مشورت کنید.`;
}
