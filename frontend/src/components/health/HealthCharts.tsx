import { useId, useState, type ReactNode } from 'react';
import { format } from 'date-fns-jalali';
import { parseISO } from 'date-fns';
import { Table2, BarChart3 } from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { cn } from '@/lib/utils';

/**
 * Health charts: one series each, so no legend (the title names it). Turquoise marks,
 * hairline grid, time running right to left as the page reads, a hover tooltip and a
 * table view for every chart.
 */

export interface Point {
  day: string; // YYYY-MM-DD
  value: number | null;
}

const fa = (n: number, digits = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: digits });
const compact = new Intl.NumberFormat('fa-IR', { notation: 'compact', maximumFractionDigits: 1 });
export const dayLabel = (day: string, pattern = 'd MMMM') => format(parseISO(day), pattern);

const SIGNAL = 'hsl(var(--signal))';
const GRID = 'hsl(var(--border))';
const AXIS_TEXT = { fill: 'hsl(var(--muted-foreground))', fontSize: 11 };

function ChartTooltip({ active, payload, unit, digits }: { active?: boolean; payload?: { payload: Point }[]; unit: string; digits: number }) {
  const p = payload?.[0]?.payload;
  if (!active || !p || p.value == null) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-floating">
      <div className="text-sm font-semibold text-foreground">{fa(p.value, digits)} <span className="font-normal text-muted-foreground">{unit}</span></div>
      <div className="mt-0.5 text-muted-foreground">{dayLabel(p.day, 'EEEE d MMMM')}</div>
    </div>
  );
}

interface FrameProps {
  title: string;
  /** The headline: the latest value or the period average */
  figure?: ReactNode;
  note?: string;
  points: Point[];
  unit: string;
  digits: number;
  children: ReactNode;
  className?: string;
}

/** Title, headline figure, the chart, and a switch to the same numbers as a table. */
export function ChartFrame({ title, figure, note, points, unit, digits, children, className }: FrameProps) {
  const [asTable, setAsTable] = useState(false);
  const id = useId();
  const withValues = points.filter((p) => p.value != null);
  return (
    <section className={cn('rounded-lg border border-border bg-card p-4', className)} aria-labelledby={id}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={id} className="text-sm font-medium text-muted-foreground">{title}</h3>
          {figure && <div className="mt-1 text-2xl font-semibold leading-8">{figure}</div>}
          {note && <p className="text-xs text-muted-foreground">{note}</p>}
        </div>
        {withValues.length > 0 && (
          <button
            type="button"
            onClick={() => setAsTable((v) => !v)}
            className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-pressed={asTable}
          >
            {asTable ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
            {asTable ? 'نمودار' : 'جدول'}
          </button>
        )}
      </div>
      {!withValues.length ? (
        <p className="mt-6 pb-4 text-center text-sm text-muted-foreground">برای این بازه داده‌ای ثبت نشده است.</p>
      ) : asTable ? (
        <div className="mt-3 max-h-56 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
              <tr><th className="py-1 text-start font-normal">روز</th><th className="py-1 text-end font-normal">{unit}</th></tr>
            </thead>
            <tbody>
              {[...withValues].reverse().map((p) => (
                <tr key={p.day} className="border-t border-border">
                  <td className="py-1.5">{dayLabel(p.day, 'EEEE d MMMM')}</td>
                  <td className="py-1.5 text-end">{fa(p.value!, digits)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-3 h-40" dir="ltr">{children}</div>
      )}
    </section>
  );
}

const xTicks = (points: Point[]) => {
  // About five labels across the period, always including the last day
  const step = Math.max(1, Math.ceil(points.length / 5));
  return points.filter((_, i) => (points.length - 1 - i) % step === 0).map((p) => p.day);
};

export function DailyBars({ points, unit, digits = 0 }: { points: Point[]; unit: string; digits?: number }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} barCategoryGap={2}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="day" reversed ticks={xTicks(points)} tickFormatter={(d) => dayLabel(d)} tick={AXIS_TEXT} tickLine={false} axisLine={{ stroke: GRID }} interval={0} />
        <YAxis orientation="right" width={60} tick={AXIS_TEXT} tickLine={false} axisLine={false} tickFormatter={(v) => (v >= 1000 ? compact.format(v) : fa(v, digits))} allowDecimals={digits > 0} />
        <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltip unit={unit} digits={digits} />} />
        <Bar dataKey="value" fill={SIGNAL} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DailyLine({ points, unit, digits = 0, band, allDots = false, tickPattern = 'd MMMM' }: {
  points: Point[];
  unit: string;
  digits?: number;
  /** Reference range, drawn as a grey band */
  band?: { low: number | null; high: number | null };
  /** Mark every reading (few, separate measurements such as lab results) */
  allDots?: boolean;
  tickPattern?: string;
}) {
  const last = [...points].reverse().find((p) => p.value != null);
  const domain = bandDomain(points, band);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        {band && (band.low != null || band.high != null) && (
          <ReferenceArea y1={band.low ?? undefined} y2={band.high ?? undefined} fill="hsl(var(--muted-foreground))" fillOpacity={0.1} stroke="none" ifOverflow="hidden" />
        )}
        <XAxis dataKey="day" reversed ticks={xTicks(points)} tickFormatter={(d) => dayLabel(d, tickPattern)} tick={AXIS_TEXT} tickLine={false} axisLine={{ stroke: GRID }} interval={0} />
        <YAxis orientation="right" width={44} tick={AXIS_TEXT} tickLine={false} axisLine={false} domain={domain ?? ['auto', 'auto']} ticks={domain ? ticksOf(domain) : undefined} tickFormatter={(v) => fa(v, digits)} />
        <Tooltip cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1 }} content={<ChartTooltip unit={unit} digits={digits} />} />
        <Line
          type="monotone"
          dataKey="value"
          stroke={SIGNAL}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          connectNulls
          isAnimationActive={false}
          // The latest reading gets a marker (every reading, for separate measurements)
          dot={(props: { cx?: number; cy?: number; payload?: Point; index?: number }) =>
            (allDots ? props.payload?.value != null : props.payload?.day === last?.day) && props.cx != null && props.cy != null
              ? <circle key={props.index} cx={props.cx} cy={props.cy} r={4} fill={SIGNAL} stroke="hsl(var(--card))" strokeWidth={2} />
              : <g key={props.index} />}
          activeDot={{ r: 5, fill: SIGNAL, stroke: 'hsl(var(--card))', strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/**
 * Y range that shows the readings and where the reference range starts, without letting a
 * wide range (vitamin D 30–100) flatten readings that sit far below it.
 */
function bandDomain(points: Point[], band?: { low: number | null; high: number | null }): [number, number] | null {
  if (!band || (band.low == null && band.high == null)) return null;
  const values = points.map((p) => p.value).filter((v): v is number => v != null);
  if (!values.length) return null;
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  for (const edge of [band.low, band.high]) {
    if (edge == null) continue;
    // Bring an edge into view when it is close to the readings
    if (edge < lo && edge >= lo - (hi - lo + Math.abs(hi)) * 0.6) lo = edge;
    if (edge > hi && edge <= hi + (hi - lo + Math.abs(hi)) * 0.6) hi = edge;
  }
  // Round outward to a tidy step so the ticks are readable numbers
  const span = hi - lo || Math.abs(hi) || 1;
  const step = 10 ** Math.floor(Math.log10(span)) / 2;
  return [Math.max(0, Math.floor((lo - span * 0.1) / step) * step), Math.ceil((hi + span * 0.1) / step) * step];
}

const ticksOf = ([lo, hi]: [number, number]) => {
  const step = (hi - lo) / 4;
  return Array.from({ length: 5 }, (_, i) => Math.round((lo + step * i) * 100) / 100);
};

/** Fill the gaps so every day of the period has a slot (bars keep their spacing). */
export function lastDays(days: number, values: Map<string, number>, today = new Date()): Point[] {
  const out: Point[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push({ day: key, value: values.get(key) ?? null });
  }
  return out;
}
