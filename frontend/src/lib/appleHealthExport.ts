import { Unzip, UnzipInflate } from 'fflate';
import type { HealthMetric, SampleInput } from '@/services/healthDataService';

/**
 * Reads the file the iPhone Health app exports (Profile → Export All Health Data → export.zip,
 * or the export.xml inside it) and turns its records into one value per day and metric.
 * The XML is streamed, so exports of a gigabyte or more do not have to fit in memory.
 */

type Kind = 'sum' | 'avg' | 'last';
interface RecordRule {
  metric: HealthMetric;
  kind: Kind;
  /** Converts the record's value in its unit to the metric's stored unit */
  convert: (value: number, unit: string) => number | null;
}

const same = (v: number) => v;
const RULES: Record<string, RecordRule> = {
  HKQuantityTypeIdentifierStepCount: { metric: 'steps', kind: 'sum', convert: same },
  HKQuantityTypeIdentifierDistanceWalkingRunning: {
    metric: 'distance', kind: 'sum',
    convert: (v, u) => (u === 'km' ? v * 1000 : u === 'mi' ? v * 1609.344 : u === 'm' ? v : null),
  },
  HKQuantityTypeIdentifierActiveEnergyBurned: {
    metric: 'active_energy', kind: 'sum',
    convert: (v, u) => (u === 'kcal' || u === 'Cal' ? v : u === 'kJ' ? v / 4.184 : null),
  },
  HKQuantityTypeIdentifierAppleExerciseTime: { metric: 'exercise_minutes', kind: 'sum', convert: same },
  HKQuantityTypeIdentifierRestingHeartRate: { metric: 'resting_heart_rate', kind: 'avg', convert: same },
  HKQuantityTypeIdentifierHeartRate: { metric: 'heart_rate', kind: 'avg', convert: same },
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: { metric: 'hrv', kind: 'avg', convert: same },
  HKQuantityTypeIdentifierOxygenSaturation: { metric: 'blood_oxygen', kind: 'avg', convert: (v) => (v <= 1 ? v * 100 : v) },
  HKQuantityTypeIdentifierRespiratoryRate: { metric: 'respiratory_rate', kind: 'avg', convert: same },
  HKQuantityTypeIdentifierBodyMass: {
    metric: 'weight', kind: 'last',
    convert: (v, u) => (u === 'kg' ? v : u === 'lb' ? v * 0.45359237 : u === 'g' ? v / 1000 : null),
  },
  HKQuantityTypeIdentifierBodyFatPercentage: { metric: 'body_fat', kind: 'last', convert: (v) => (v <= 1 ? v * 100 : v) },
  HKQuantityTypeIdentifierBloodPressureSystolic: { metric: 'systolic', kind: 'last', convert: same },
  HKQuantityTypeIdentifierBloodPressureDiastolic: { metric: 'diastolic', kind: 'last', convert: same },
  HKQuantityTypeIdentifierBloodGlucose: {
    metric: 'blood_glucose', kind: 'last',
    convert: (v, u) => (u === 'mg/dL' ? v : u.startsWith('mmol') ? v * 18.016 : null),
  },
  HKQuantityTypeIdentifierDietaryWater: {
    metric: 'water', kind: 'sum',
    convert: (v, u) => (u === 'mL' ? v : u === 'L' ? v * 1000 : u === 'fl_oz_us' ? v * 29.5735 : null),
  },
};
const SLEEP = 'HKCategoryTypeIdentifierSleepAnalysis';
// "Asleep", and since iOS 16 the stages; "InBed" and "Awake" are not sleep
const ASLEEP = /^HKCategoryValueSleepAnalysisAsleep/;

const RECORD = /<Record\s([^>]*?)\/?>/g;
const attr = (tag: string, name: string): string | null => {
  const key = `${name}="`;
  const at = tag.startsWith(key) ? 0 : tag.indexOf(` ${key}`) + 1;
  if (at === 0 && !tag.startsWith(key)) return null;
  const start = at + key.length;
  const end = tag.indexOf('"', start);
  return end < 0 ? null : tag.slice(start, end);
};
/** "2026-10-27 23:40:00 +0330" → epoch ms */
const appleTime = (s: string) => Date.parse(s.replace(' ', 'T').replace(/ ([+-]\d{2})(\d{2})$/, '$1:$2'));

interface Bucket { bySource: Map<string, number>; sum: number; n: number; lastAt: string; last: number }

export function createExportAggregator(sinceDay: string) {
  const buckets = new Map<string, Bucket>();
  let carry = '';
  let records = 0;

  const add = (metric: HealthMetric, day: string, source: string, value: number, at: string) => {
    const key = `${day}|${metric}`;
    const b = buckets.get(key) ?? { bySource: new Map(), sum: 0, n: 0, lastAt: '', last: 0 };
    b.bySource.set(source, (b.bySource.get(source) ?? 0) + value);
    b.sum += value;
    b.n += 1;
    if (at >= b.lastAt) {
      b.lastAt = at;
      b.last = value;
    }
    buckets.set(key, b);
  };

  const handle = (tag: string) => {
    const type = attr(tag, 'type');
    if (!type) return;
    const start = attr(tag, 'startDate') || '';
    const source = attr(tag, 'sourceName') || 'device';
    if (type === SLEEP) {
      if (!ASLEEP.test(attr(tag, 'value') || '')) return;
      const end = attr(tag, 'endDate') || '';
      const day = end.slice(0, 10);
      if (day < sinceDay) return;
      const hours = (appleTime(end) - appleTime(start)) / 3600000;
      if (hours > 0 && hours < 24) {
        add('sleep_hours', day, source, hours, end);
        records += 1;
      }
      return;
    }
    const rule = RULES[type];
    if (!rule) return;
    const day = start.slice(0, 10);
    if (day < sinceDay) return;
    const raw = Number(attr(tag, 'value'));
    const value = Number.isFinite(raw) ? rule.convert(raw, attr(tag, 'unit') || '') : null;
    if (value == null || !Number.isFinite(value)) return;
    add(rule.metric, day, source, value, start);
    records += 1;
  };

  return {
    /** Feed decoded XML text in any chunk size. */
    push(text: string) {
      const s = carry + text;
      const cut = s.lastIndexOf('>') + 1;
      carry = s.slice(cut);
      // A record tag never spans more than this; drop runaway text that has no tags
      if (carry.length > 100000) carry = carry.slice(-2000);
      RECORD.lastIndex = 0;
      const head = s.slice(0, cut);
      for (let m = RECORD.exec(head); m; m = RECORD.exec(head)) handle(m[1]);
    },
    get records() {
      return records;
    },
    /**
     * Sums keep the busiest source per day: the phone and the watch both log the same
     * steps and sleep, and adding them would double the day.
     */
    result(): SampleInput[] {
      const out: SampleInput[] = [];
      for (const [key, b] of buckets) {
        const [day, metric] = key.split('|') as [string, HealthMetric];
        const kind = metric === 'sleep_hours' ? 'sum' : Object.values(RULES).find((r) => r.metric === metric)!.kind;
        const value = kind === 'sum' ? Math.max(...b.bySource.values()) : kind === 'avg' ? b.sum / b.n : b.last;
        out.push({ day, metric, value: Math.round(value * 100) / 100 });
      }
      return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
    },
  };
}

type Readable = Blob & { name?: string };
const CHUNK = 4 * 1024 * 1024;

async function* chunksOf(file: Readable): AsyncGenerator<Uint8Array> {
  for (let offset = 0; offset < file.size; offset += CHUNK) {
    yield new Uint8Array(await file.slice(offset, offset + CHUNK).arrayBuffer());
  }
}

/**
 * Parses export.zip (or export.xml) and returns daily values from `sinceDay` on.
 * `onProgress` gets the share of the file read so far (0..1).
 */
export async function readAppleHealthExport(
  file: Readable,
  sinceDay: string,
  onProgress?: (share: number, records: number) => void,
): Promise<SampleInput[]> {
  const aggregator = createExportAggregator(sinceDay);
  const decoder = new TextDecoder('utf-8');
  let read = 0;
  const isXml = /\.xml$/i.test(file.name || '') || file.type === 'text/xml' || file.type === 'application/xml';

  if (isXml) {
    for await (const chunk of chunksOf(file)) {
      aggregator.push(decoder.decode(chunk, { stream: true }));
      read += chunk.length;
      onProgress?.(read / file.size, aggregator.records);
    }
    aggregator.push(decoder.decode());
    return aggregator.result();
  }

  let found = false;
  let failure: Error | null = null;
  const unzip = new Unzip((entry) => {
    // export_cda.xml holds the same data in another format; only export.xml is read
    if (!/(^|\/)export\.xml$/.test(entry.name)) return;
    found = true;
    entry.ondata = (err, data, final) => {
      if (err) {
        failure = err;
        return;
      }
      aggregator.push(decoder.decode(data, { stream: !final }));
    };
    entry.start();
  });
  unzip.register(UnzipInflate);
  for await (const chunk of chunksOf(file)) {
    unzip.push(chunk, false);
    if (failure) throw failure;
    read += chunk.length;
    onProgress?.(read / file.size, aggregator.records);
  }
  unzip.push(new Uint8Array(0), true);
  if (failure) throw failure;
  if (!found) throw new Error('NO_EXPORT_XML');
  return aggregator.result();
}
