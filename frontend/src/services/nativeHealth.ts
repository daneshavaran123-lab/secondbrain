import { Capacitor } from '@capacitor/core';
import { format } from 'date-fns';
import type { HealthDataType, HealthSample } from '@capgo/capacitor-health';
import { healthDataService, type HealthMetric, type HealthSource, type SampleInput } from '@/services/healthDataService';

/**
 * Apple Health (iPhone, including what the Apple Watch records) and Android Health Connect,
 * read through @capgo/capacitor-health inside the native app. In a browser none of this is
 * available; the page offers the iOS Shortcut and the export import instead.
 */

const TYPES: HealthDataType[] = ['steps', 'distance', 'calories', 'heartRate', 'weight'];
const METRIC: Record<HealthDataType, HealthMetric> = {
  steps: 'steps',
  distance: 'distance',
  calories: 'active_energy',
  heartRate: 'heart_rate',
  weight: 'weight',
};
const ADDITIVE = new Set<HealthDataType>(['steps', 'distance', 'calories']);
const LAST_SYNC_KEY = 'health:native:last-sync';

export const isNativeApp = () => Capacitor.isNativePlatform();
export const nativeSource = (): HealthSource | null =>
  Capacitor.getPlatform() === 'ios' ? 'apple_health' : Capacitor.getPlatform() === 'android' ? 'health_connect' : null;

const plugin = async () => (await import('@capgo/capacitor-health')).Health;

export async function nativeAvailability(): Promise<{ available: boolean; reason?: string }> {
  if (!isNativeApp()) return { available: false, reason: 'web' };
  try {
    return await (await plugin()).isAvailable();
  } catch (error) {
    return { available: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Asks for read access; returns the types the person allowed. */
export async function connectNativeHealth(): Promise<HealthDataType[]> {
  const status = await (await plugin()).requestAuthorization({ read: TYPES, write: [] });
  return status.readAuthorized;
}

/**
 * Daily values from raw samples. Additive types (steps, distance, calories) are summed per
 * day for each recording device and the busiest device is kept, because the phone and the
 * watch both count the same walk; heart rate is averaged; weight is the day's last reading.
 */
export function dailyFromSamples(type: HealthDataType, samples: HealthSample[]): SampleInput[] {
  const days = new Map<string, { bySource: Map<string, number>; sum: number; n: number; last: { at: string; value: number } | null }>();
  for (const s of samples) {
    if (!Number.isFinite(s.value)) continue;
    const day = format(new Date(s.startDate), 'yyyy-MM-dd');
    const entry = days.get(day) ?? { bySource: new Map(), sum: 0, n: 0, last: null };
    const source = s.sourceId || s.sourceName || 'device';
    entry.bySource.set(source, (entry.bySource.get(source) ?? 0) + s.value);
    entry.sum += s.value;
    entry.n += 1;
    if (!entry.last || s.startDate > entry.last.at) entry.last = { at: s.startDate, value: s.value };
    days.set(day, entry);
  }
  const metric = METRIC[type];
  return [...days.entries()].map(([day, e]) => ({
    metric,
    day,
    value: ADDITIVE.has(type) ? Math.max(...e.bySource.values()) : type === 'weight' ? e.last!.value : e.sum / e.n,
  }));
}

/** Reads the last `days` days and stores them; returns how many daily values were saved. */
export async function syncNativeHealth(days = 30): Promise<number> {
  const source = nativeSource();
  if (!source) throw new Error('این کار فقط در برنامه موبایل ممکن است');
  const health = await plugin();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const samples: SampleInput[] = [];
  for (const type of TYPES) {
    try {
      const { samples: raw } = await health.readSamples({
        dataType: type,
        startDate: start.toISOString(),
        endDate: new Date().toISOString(),
        limit: 20000,
        ascending: true,
      });
      samples.push(...dailyFromSamples(type, raw));
    } catch (error) {
      // A type the person did not allow is skipped; the others still sync
      console.warn(`[health] ${type} not read:`, error);
    }
  }
  const stored = await healthDataService.saveSamples(source, samples);
  try { localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString()); } catch { /* private mode */ }
  return stored;
}

export function lastNativeSync(): Date | null {
  try {
    const v = localStorage.getItem(LAST_SYNC_KEY);
    return v ? new Date(v) : null;
  } catch {
    return null;
  }
}
