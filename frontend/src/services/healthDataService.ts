import { apiFetch, BACKEND_URL } from '@/lib/api';

/** Daily health values and lab reports kept by the backend (/health-data). */

export type HealthSource = 'apple_health' | 'health_connect' | 'shortcut' | 'import' | 'manual';
export type HealthMetric =
  | 'steps' | 'distance' | 'active_energy' | 'exercise_minutes' | 'heart_rate' | 'resting_heart_rate'
  | 'hrv' | 'blood_oxygen' | 'respiratory_rate' | 'sleep_hours' | 'weight' | 'body_fat'
  | 'systolic' | 'diastolic' | 'blood_glucose' | 'water';

export interface DailyValue {
  day: string;
  metric: HealthMetric;
  value: number;
  unit: string | null;
  source: HealthSource;
}

export interface HealthSummary {
  days: number;
  daily: DailyValue[];
  latest: Partial<Record<HealthMetric, DailyValue>>;
  sources: { source: HealthSource; last_sync: string; values: number }[];
}

export interface SampleInput {
  metric: HealthMetric;
  value: number;
  day: string;
}

export type LabFlag = 'low' | 'high' | 'normal' | null;

export interface LabResult {
  id?: string;
  test_key: string;
  test_name: string;
  value: number | null;
  value_text: string | null;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  ref_text: string | null;
  flag: LabFlag;
}

export interface LabReportSummary {
  id: string;
  title: string | null;
  lab_name: string | null;
  report_date: string | null;
  summary: string | null;
  extracted_by: 'ai' | 'parser' | null;
  created_at: string;
  result_count: number;
  flagged_count: number;
}

export interface LabReport extends Omit<LabReportSummary, 'result_count' | 'flagged_count'> {
  ocr_text: string | null;
  file_name: string | null;
  file_type: string | null;
  has_file: boolean;
  results: LabResult[];
}

export interface LabTrendPoint {
  day: string;
  value: number;
  unit: string | null;
  flag: LabFlag;
  ref_low: number | null;
  ref_high: number | null;
  report_id: string;
}

export interface LabTestInfo {
  key: string;
  label: string;
  unit: string;
  low: number | null;
  high: number | null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<{ data: T; notice?: string | null }> {
  const res = await apiFetch(`/health-data${path}`, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

const post = (body: unknown, method = 'POST'): RequestInit => ({ method, body: JSON.stringify(body) });

export const healthDataService = {
  summary: (days = 30) => request<HealthSummary>(`/summary?days=${days}`).then((r) => r.data),

  /** Daily values; a source's value for a day replaces its earlier one. */
  async saveSamples(source: HealthSource, samples: SampleInput[], onProgress?: (done: number) => void) {
    let stored = 0;
    for (let i = 0; i < samples.length; i += 2000) {
      const r = await request<{ stored: number }>('/samples', post({ source, samples: samples.slice(i, i + 2000) }));
      stored += r.data.stored;
      onProgress?.(Math.min(samples.length, i + 2000));
    }
    return stored;
  },

  clearSource: (source: HealthSource) => request<{ deleted: number }>(`/samples?source=${source}`, { method: 'DELETE' }).then((r) => r.data),

  tokenStatus: () => request<{ exists: boolean; created_at?: string; last_used_at?: string | null }>('/token').then((r) => r.data),
  createToken: () => request<{ token: string }>('/token', { method: 'POST' }).then((r) => r.data.token),
  revokeToken: () => request('/token', { method: 'DELETE' }),
  ingestUrl: () => `${BACKEND_URL}/health-data/ingest`,

  labs: () => request<LabReportSummary[]>('/labs').then((r) => r.data),
  lab: (id: string) => request<LabReport>(`/labs/${id}`).then((r) => r.data),
  labTests: () => request<LabTestInfo[]>('/lab-tests').then((r) => r.data),
  trend: (key: string) => request<LabTrendPoint[]>(`/labs/trend/${encodeURIComponent(key)}`).then((r) => r.data),

  createLab: (input: { ocr_text: string; ocr_confidence?: number; file?: { name: string; type: string; data: string } | null }) =>
    request<LabReport>('/labs', post(input)),

  updateLab: (id: string, patch: { title?: string | null; lab_name?: string | null; report_date?: string | null; results?: LabResult[] }) =>
    request<LabReport>(`/labs/${id}`, post(patch, 'PATCH')).then((r) => r.data),

  reanalyze: (id: string) => request<LabReport>(`/labs/${id}/analyze`, { method: 'POST' }).then((r) => r.data),
  deleteLab: (id: string) => request(`/labs/${id}`, { method: 'DELETE' }),

  async fileUrl(id: string) {
    const res = await apiFetch(`/health-data/labs/${id}/file`);
    if (!res.ok) throw new Error('فایل پیدا نشد');
    return URL.createObjectURL(await res.blob());
  },
};

export const METRIC_INFO: Record<HealthMetric, { label: string; unit: string; digits: number }> = {
  steps: { label: 'قدم', unit: 'قدم', digits: 0 },
  distance: { label: 'مسافت', unit: 'کیلومتر', digits: 1 },
  active_energy: { label: 'کالری فعال', unit: 'کیلوکالری', digits: 0 },
  exercise_minutes: { label: 'ورزش', unit: 'دقیقه', digits: 0 },
  heart_rate: { label: 'ضربان میانگین', unit: 'ضربه در دقیقه', digits: 0 },
  resting_heart_rate: { label: 'ضربان استراحت', unit: 'ضربه در دقیقه', digits: 0 },
  hrv: { label: 'تغییرپذیری ضربان', unit: 'میلی‌ثانیه', digits: 0 },
  blood_oxygen: { label: 'اکسیژن خون', unit: '٪', digits: 0 },
  respiratory_rate: { label: 'تنفس', unit: 'در دقیقه', digits: 0 },
  sleep_hours: { label: 'خواب', unit: 'ساعت', digits: 1 },
  weight: { label: 'وزن', unit: 'کیلوگرم', digits: 1 },
  body_fat: { label: 'چربی بدن', unit: '٪', digits: 1 },
  systolic: { label: 'فشار بالا', unit: 'mmHg', digits: 0 },
  diastolic: { label: 'فشار پایین', unit: 'mmHg', digits: 0 },
  blood_glucose: { label: 'قند خون', unit: 'mg/dL', digits: 0 },
  water: { label: 'آب', unit: 'لیوان', digits: 0 },
};

/** A stored value in the unit the page shows (metres → km, ml of water → glasses). */
export function displayValue(metric: HealthMetric, value: number): number {
  if (metric === 'distance') return value / 1000;
  if (metric === 'water') return value / 250;
  return value;
}

export function formatMetric(metric: HealthMetric, value: number): string {
  const { digits } = METRIC_INFO[metric];
  return displayValue(metric, value).toLocaleString('fa-IR', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export const SOURCE_LABEL: Record<HealthSource, string> = {
  apple_health: 'Apple Health (آیفون و اپل واچ)',
  health_connect: 'Health Connect (اندروید)',
  shortcut: 'میان‌بر آیفون',
  import: 'فایل خروجی برنامه سلامت',
  manual: 'ثبت دستی',
};
