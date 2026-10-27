/**
 * نامه‌ها و بخشنامه‌های سازمانی — client for the backend /org-letters API.
 */

import { apiFetch } from '@/lib/api';

export type LetterKind = 'letter' | 'circular';
export type LetterStatus = 'new' | 'in_progress' | 'replied' | 'archived';
export type LetterUrgency = 'normal' | 'urgent' | 'very_urgent';
export type ReplyTone = 'agree' | 'decline' | 'extension' | 'info' | 'ack';

export interface LetterActionItem {
  task: string;
  deadline?: string | null;
  deadline_iso?: string | null;
  owner?: string | null;
}

export interface OrgLetter {
  id: string;
  kind: LetterKind;
  direction: 'incoming' | 'outgoing';
  organization_name: string | null;
  subject: string | null;
  sender: string | null;
  recipient: string | null;
  letter_number: string | null;
  letter_date: string | null;
  deadline: string | null;
  urgency: LetterUrgency | null;
  classification: string | null;
  summary: string | null;
  key_points: string[];
  action_items: LetterActionItem[];
  needs_reply: boolean | null;
  ocr_text?: string | null;
  clean_text?: string | null;
  ocr_confidence: number | null;
  reply_draft?: string | null;
  status: LetterStatus;
  file_name: string | null;
  file_type: string | null;
  has_file: boolean;
  analyzed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewLetter {
  kind: LetterKind;
  organization_name?: string;
  ocr_text: string;
  ocr_confidence?: number;
  file?: { name: string; type: string; data: string };
}

export type LetterPatch = Partial<Pick<OrgLetter,
  'kind' | 'status' | 'urgency' | 'organization_name' | 'subject' | 'sender' | 'recipient' |
  'letter_number' | 'letter_date' | 'deadline' | 'summary' | 'clean_text' | 'reply_draft'>>;

interface ApiResult<T> {
  data: T;
  warning?: string | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const res = await apiFetch(`/org-letters${path}`, init);
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('نشست شما منقضی شده؛ لطفاً دوباره وارد شوید.');
  if (!res.ok) throw new Error(body.error || 'ارتباط با سرور برقرار نشد. دوباره امتحان کنید.');
  return body;
}

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export const orgLettersService = {
  list(filters: { q?: string; kind?: LetterKind; status?: LetterStatus } = {}) {
    const params = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => v) as Array<[string, string]>
    ).toString();
    return request<OrgLetter[]>(params ? `?${params}` : '');
  },
  get: (id: string) => request<OrgLetter>(`/${id}`),
  create: (letter: NewLetter) => request<OrgLetter>('', json('POST', letter)),
  update: (id: string, patch: LetterPatch) => request<OrgLetter>(`/${id}`, json('PATCH', patch)),
  remove: (id: string) => request<{ id: string }>(`/${id}`, json('DELETE')),
  analyze: (id: string) => request<OrgLetter>(`/${id}/analyze`, json('POST')),
  draftReply: (id: string, options: { tone?: ReplyTone; instructions?: string }) =>
    request<OrgLetter>(`/${id}/reply`, json('POST', options)),

  /** Object URL for the stored scan; revoke it when done. */
  async fileUrl(id: string): Promise<string> {
    const res = await apiFetch(`/org-letters/${id}/file`);
    if (!res.ok) throw new Error('فایل اصلی در دسترس نیست');
    return URL.createObjectURL(await res.blob());
  },
};

/** Images are stored as a compressed JPEG; PDFs as-is. Returns base64 without the data: prefix. */
export async function prepareLetterFile(file: File): Promise<NewLetter['file'] | null> {
  let blob: Blob = file;
  let type = file.type;
  let name = file.name;

  if (file.type.startsWith('image/')) {
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('compress failed'))), 'image/jpeg', 0.85)
      );
      type = 'image/jpeg';
      name = name.replace(/\.[^.]+$/, '') + '.jpg';
    } catch {
      // keep the original image
    }
  } else if (file.type !== 'application/pdf') {
    return null;
  }

  if (blob.size > 7 * 1024 * 1024) return null;

  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return { name, type, data };
}

export const KIND_LABEL: Record<LetterKind, string> = { letter: 'نامه', circular: 'بخشنامه' };

export const STATUS_LABEL: Record<LetterStatus, string> = {
  new: 'در انتظار پاسخ',
  in_progress: 'در حال پیگیری',
  replied: 'پاسخ داده شد',
  archived: 'بایگانی',
};

export const URGENCY_LABEL: Record<LetterUrgency, string> = { normal: 'عادی', urgent: 'فوری', very_urgent: 'خیلی فوری' };
