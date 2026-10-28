import { useMemo } from 'react';
import { BarChart3, Printer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { CSRProject } from '@/services/socialResponsibilityService';

// The CSR report: what the projects add up to, by field and by stage, ready to print.

const TYPES: Record<string, string> = { charity: 'خیریه', environment: 'محیط زیست', education: 'آموزش جامعه', other: 'سایر' };
const STATUSES: Record<string, string> = { planning: 'در برنامه', active: 'در حال اجرا', completed: 'تکمیل‌شده', on_hold: 'متوقف' };
const CURRENCY: Record<string, string> = { IRR: 'ریال', IRT: 'تومان', USD: 'دلار', EUR: 'یورو' };
const fa = (n: number) => n.toLocaleString('fa-IR');

function Bars({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-3 text-sm">
          <span className="text-muted-foreground">{r.label}</span>
          <span className="h-2 rounded-full bg-muted" aria-hidden>
            <span className="block h-2 rounded-full bg-primary" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="text-left font-medium">{fa(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}

export function CSRReport({ projects }: { projects: CSRProject[] }) {
  const report = useMemo(() => {
    const count = (key: 'type' | 'status', value: string) => projects.filter((p) => (p[key] || 'other') === value).length;
    const budgets = new Map<string, number>();
    for (const p of projects) {
      const cur = (p as { currency?: string | null }).currency || 'IRR';
      budgets.set(cur, (budgets.get(cur) || 0) + (Number(p.budget) || 0));
    }
    const groups = new Set(projects.flatMap((p) => ((p as { beneficiaries?: string[] | null }).beneficiaries ?? []).map((b) => b.trim()).filter(Boolean)));
    const partners = new Set(projects.flatMap((p) => ((p as { partners?: string[] | null }).partners ?? []).map((b) => b.trim()).filter(Boolean)));
    return {
      byType: Object.entries(TYPES).map(([k, label]) => ({ label, value: count('type', k) })),
      byStatus: Object.entries(STATUSES).map(([k, label]) => ({ label, value: count('status', k) })),
      budgets: [...budgets].filter(([, v]) => v > 0),
      groups: groups.size,
      partners: partners.size,
      top: [...projects].sort((a, b) => (Number(b.budget) || 0) - (Number(a.budget) || 0)).slice(0, 5),
    };
  }, [projects]);

  if (!projects.length) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <BarChart3 className="mx-auto mb-4 h-12 w-12" aria-hidden />
        <p>با ثبت اولین پروژه، گزارش اینجا ساخته می‌شود.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">گزارش مسئولیت اجتماعی</h2>
        <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-2 print:hidden">
          <Printer className="h-4 w-4" aria-hidden />
          چاپ یا ذخیره PDF
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'همه پروژه‌ها', value: fa(projects.length) },
          { label: 'در حال اجرا', value: fa(report.byStatus.find((s) => s.label === STATUSES.active)?.value ?? 0) },
          { label: 'گروه‌های بهره‌مند', value: fa(report.groups) },
          { label: 'شرکا', value: fa(report.partners) },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">{s.label}</div>
              <div className="mt-1 text-2xl font-bold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">بر اساس حوزه</CardTitle></CardHeader>
          <CardContent><Bars rows={report.byType} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">بر اساس مرحله</CardTitle></CardHeader>
          <CardContent><Bars rows={report.byStatus} /></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">بودجه</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {report.budgets.length ? (
            <p className="text-sm">
              جمع بودجه: {report.budgets.map(([cur, v]) => `${fa(v)} ${CURRENCY[cur] ?? cur}`).join(' و ')}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">برای پروژه‌ها بودجه‌ای ثبت نشده است.</p>
          )}
          <table className="w-full text-sm">
            <caption className="sr-only">پروژه‌ها به ترتیب بودجه</caption>
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 text-start font-normal">پروژه</th>
                <th className="py-2 text-start font-normal">حوزه</th>
                <th className="py-2 text-start font-normal">مرحله</th>
                <th className="py-2 text-end font-normal">بودجه</th>
              </tr>
            </thead>
            <tbody>
              {report.top.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="py-2 font-medium">{p.title}</td>
                  <td className="py-2">{TYPES[p.type || 'other'] ?? p.type}</td>
                  <td className="py-2">{STATUSES[p.status || ''] ?? p.status}</td>
                  <td className="py-2 text-end">{Number(p.budget) ? `${fa(Number(p.budget))} ${CURRENCY[(p as { currency?: string }).currency || 'IRR'] ?? ''}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
