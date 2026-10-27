import type { LetterStatus } from '@/services/orgLettersService';

const fa = (n: number) => n.toLocaleString('fa-IR');

/** «۱۵ آبان ۱۴۰۵» from an ISO date (YYYY-MM-DD or timestamp). */
export function persianDate(iso: string | null | undefined, withYear = true): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    day: 'numeric', month: 'long', ...(withYear ? { year: 'numeric' } : {}),
  }).format(d);
}

/** Deadline wording plus whether it needs attention (overdue or within 3 days). */
export function deadlineInfo(iso: string | null | undefined): { label: string; urgent: boolean } | null {
  if (!iso) return null;
  const due = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86400000);
  const date = persianDate(iso, false);
  if (days < 0) return { label: `مهلت گذشته (${date})`, urgent: true };
  if (days === 0) return { label: 'مهلت: امروز', urgent: true };
  if (days === 1) return { label: 'مهلت: فردا', urgent: true };
  return { label: `مهلت: ${date} (${fa(days)} روز)`, urgent: days <= 3 };
}

export const STATUS_DOT: Record<LetterStatus, string> = {
  new: 'bg-warning',
  in_progress: 'bg-primary',
  replied: 'bg-success',
  archived: 'bg-muted-foreground/50',
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Save text as a right-to-left Word document that opens in MS Word. */
export function downloadAsWord(fileName: string, text: string) {
  const html = `<html dir="rtl"><head><meta charset="utf-8"><style>
    body { font-family: "B Nazanin", "Vazirmatn", Tahoma, sans-serif; font-size: 14pt; line-height: 2; direction: rtl; text-align: right; }
  </style></head><body>${escapeHtml(text).replace(/\n/g, '<br>')}</body></html>`;
  const url = URL.createObjectURL(new Blob(['\ufeff', html], { type: 'application/msword' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'جوابیه'}.doc`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
