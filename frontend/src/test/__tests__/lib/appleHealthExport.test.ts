import { describe, it, expect } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { zipSync, strToU8 } from 'fflate';
import { createExportAggregator, readAppleHealthExport } from '@/lib/appleHealthExport';
import { dailyFromSamples } from '@/services/nativeHealth';

const rec = (type: string, value: string | number, start: string, extra = '', source = 'iPhone') =>
  `<Record type="${type}" sourceName="${source}" sourceVersion="17.1" unit="${extra}" creationDate="${start}" startDate="${start}" endDate="${start}" value="${value}"/>`;

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<HealthData locale="fa_IR">
 <Me HKCharacteristicTypeIdentifierDateOfBirth="1990-01-01"/>
 ${rec('HKQuantityTypeIdentifierStepCount', 3000, '2026-10-27 09:00:00 +0330', 'count', 'iPhone')}
 ${rec('HKQuantityTypeIdentifierStepCount', 2500, '2026-10-27 18:00:00 +0330', 'count', 'iPhone')}
 ${rec('HKQuantityTypeIdentifierStepCount', 5200, '2026-10-27 09:00:00 +0330', 'count', 'Apple Watch')}
 ${rec('HKQuantityTypeIdentifierStepCount', 100, '2025-01-01 09:00:00 +0330', 'count')}
 ${rec('HKQuantityTypeIdentifierDistanceWalkingRunning', 2.5, '2026-10-27 09:00:00 +0330', 'km')}
 ${rec('HKQuantityTypeIdentifierBodyMass', 170, '2026-10-27 07:00:00 +0330', 'lb')}
 ${rec('HKQuantityTypeIdentifierBodyMass', 77.4, '2026-10-27 21:00:00 +0330', 'kg')}
 ${rec('HKQuantityTypeIdentifierRestingHeartRate', 56, '2026-10-27 08:00:00 +0330', 'count/min')}
 ${rec('HKQuantityTypeIdentifierRestingHeartRate', 60, '2026-10-27 20:00:00 +0330', 'count/min')}
 ${rec('HKQuantityTypeIdentifierOxygenSaturation', 0.97, '2026-10-27 03:00:00 +0330', '%')}
 <Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Apple Watch" unit="count/min" startDate="2026-10-27 10:00:00 +0330" endDate="2026-10-27 10:00:00 +0330" value="72">
  <MetadataEntry key="HKMetadataKeyHeartRateMotionContext" value="0"/>
 </Record>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Apple Watch" startDate="2026-10-26 23:30:00 +0330" endDate="2026-10-27 03:30:00 +0330" value="HKCategoryValueSleepAnalysisAsleepCore"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Apple Watch" startDate="2026-10-27 03:30:00 +0330" endDate="2026-10-27 06:30:00 +0330" value="HKCategoryValueSleepAnalysisAsleepDeep"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="iPhone" startDate="2026-10-26 23:00:00 +0330" endDate="2026-10-27 07:00:00 +0330" value="HKCategoryValueSleepAnalysisInBed"/>
</HealthData>`;

const byMetric = (rows: { metric: string; value: number; day: string }[]) =>
  Object.fromEntries(rows.filter((r) => r.day === '2026-10-27').map((r) => [r.metric, r.value]));

describe('Apple Health export import', () => {
  it('turns records into one value per day and metric', () => {
    const agg = createExportAggregator('2026-01-01');
    // Feed in awkward chunk sizes so tags are split across pushes
    for (let i = 0; i < XML.length; i += 37) agg.push(XML.slice(i, i + 37));
    const day = byMetric(agg.result());
    expect(day.steps).toBe(5500); // iPhone 5500 vs watch 5200: the busier source, not the sum
    expect(day.distance).toBe(2500);
    expect(day.weight).toBe(77.4); // the day's last reading, pounds converted
    expect(day.resting_heart_rate).toBe(58);
    expect(day.blood_oxygen).toBe(97);
    expect(day.heart_rate).toBe(72);
    expect(day.sleep_hours).toBe(7); // core + deep; time in bed is not sleep
    expect(agg.result().some((r) => r.day < '2026-01-01')).toBe(false);
  });

  it('reads export.xml out of the zip the Health app shares', async () => {
    const zip = zipSync({
      'apple_health_export/export.xml': strToU8(XML),
      'apple_health_export/export_cda.xml': strToU8('<ClinicalDocument/>'),
    });
    const file = Object.assign(new NodeBlob([zip], { type: 'application/zip' }), { name: 'export.zip' });
    const shares: number[] = [];
    const rows = await readAppleHealthExport(file as unknown as Blob, '2026-01-01', (s) => shares.push(s));
    expect(byMetric(rows).steps).toBe(5500);
    expect(shares.at(-1)).toBe(1);
  });

  it('says so when the zip has no export.xml', async () => {
    const zip = zipSync({ 'other.txt': strToU8('x') });
    const file = Object.assign(new NodeBlob([zip]), { name: 'export.zip' });
    await expect(readAppleHealthExport(file as unknown as Blob, '2026-01-01')).rejects.toThrow('NO_EXPORT_XML');
  });
});

describe('native health samples', () => {
  it('keeps the busiest device for steps and averages heart rate', () => {
    const at = (h: number) => new Date(2026, 9, 27, h).toISOString();
    const steps = dailyFromSamples('steps', [
      { dataType: 'steps', value: 4000, unit: 'count', startDate: at(9), endDate: at(10), sourceId: 'phone' },
      { dataType: 'steps', value: 3000, unit: 'count', startDate: at(9), endDate: at(10), sourceId: 'watch' },
      { dataType: 'steps', value: 1500, unit: 'count', startDate: at(18), endDate: at(19), sourceId: 'watch' },
    ]);
    expect(steps).toEqual([{ metric: 'steps', day: '2026-10-27', value: 4500 }]);
    const hr = dailyFromSamples('heartRate', [
      { dataType: 'heartRate', value: 60, unit: 'bpm', startDate: at(9), endDate: at(9) },
      { dataType: 'heartRate', value: 80, unit: 'bpm', startDate: at(10), endDate: at(10) },
    ]);
    expect(hr[0]).toMatchObject({ metric: 'heart_rate', value: 70 });
  });
});
