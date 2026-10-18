import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ErrorState } from '../StateViews';
import { Skeleton } from '../ui/Skeleton';
import { taxLabel, useSalesFilters } from './salesFilters';
import { formatInr } from './formatters';
import { Link } from 'react-router-dom';
import { salesReportLink } from '../../data/salesReports';
import { RANK_COLORS, SectionHeading, compactInr, inr, num, useChartTheme, useSalesOverview } from './salesShared';

/** Monthly sales, sales-person split, customer-wise and item-wise sales. */
export default function SalesChartsSection({ reportTo }: { reportTo?: string }) {
  const { axisColor, gridColor, cur, prev, tooltipStyle } = useChartTheme();
  const { data, loading, error, reload } = useSalesOverview();
  const { applied } = useSalesFilters();
  const [metric, setMetric] = useState<'value' | 'quantity'>('value');

  const monthly = useMemo(
    () =>
      (data?.monthly ?? []).map((m) => ({
        label: m.label,
        current: metric === 'value' ? m.value : m.quantity,
        previous: metric === 'value' ? m.previousValue : m.previousQuantity
      })),
    [data, metric]
  );
  const personTotal = useMemo(() => (data?.salesPersons ?? []).reduce((s, x) => s + x.value, 0), [data]);

  if (error) return <div className="panel p-4"><ErrorState message={error} onRetry={reload} /></div>;
  return (
  <section aria-labelledby="ov-h" className="space-y-2">
    <SectionHeading id="ov-h" title="Sales Overview" note={<>All values in ₹ · {taxLabel(applied.includeTax)}</>} reportTo={reportTo} />
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
      <div className="panel p-4 xl:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <div>
            <h3 className="text-sm font-semibold text-ink-primary">Monthly Sales</h3>
            <p className="text-xs text-ink-tertiary">Invoiced {metric} for the selected period vs the same dates last year</p>
            <Link to={salesReportLink('sales-by-month')} className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">View report →</Link>
          </div>
          <div className="inline-flex rounded-lg border border-border-strong overflow-hidden text-xs" role="group" aria-label="Monthly metric">
            {(['quantity', 'value'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                aria-pressed={metric === m}
                className={`px-3 py-1.5 capitalize ${metric === m ? 'bg-brand-600 text-white' : 'bg-surface text-ink-secondary hover:bg-surface-tertiary'}`}
              >
                {m === 'quantity' ? 'Qty' : 'Value'}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <Skeleton className="h-[240px] w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisColor }} />
              <YAxis tick={{ fontSize: 11, fill: axisColor }} tickFormatter={(v) => (metric === 'value' ? compactInr(v) : num.format(v))} width={70} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={{ color: axisColor }}
                formatter={(v: number) => (metric === 'value' ? inr.format(v) : num.format(v))}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="previous" name="Same period last year" fill={prev} radius={[4, 4, 0, 0]} maxBarSize={18} />
              <Bar dataKey="current" name={data?.fyLabel ?? 'Selected period'} fill={cur} radius={[4, 4, 0, 0]} maxBarSize={18} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="panel p-4">
        <h3 className="text-sm font-semibold text-ink-primary">Sales Person-wise</h3>
        <p className="text-xs text-ink-tertiary mb-2">Invoiced value, selected period · <Link to={salesReportLink('sales-by-salesperson')} className="font-medium text-brand-600 dark:text-brand-400 hover:underline">View report →</Link></p>
        {loading || !data ? (
          <Skeleton className="h-[240px] w-full" />
        ) : data.salesPersons.length === 0 ? (
          <p className="text-sm text-ink-tertiary py-10 text-center">No invoices in the selected period.</p>
        ) : (
          <>
            <div className="relative">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={data.salesPersons}
                    dataKey="value"
                    nameKey="salesEmployeeName"
                    innerRadius={52}
                    outerRadius={78}
                    stroke="none"
                  >
                    {data.salesPersons.map((_, i) => (
                      <Cell key={i} fill={RANK_COLORS[i % RANK_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => inr.format(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[10px] uppercase text-ink-tertiary">Total</span>
                <span className="text-base font-semibold text-ink-primary">{compactInr(personTotal)}</span>
              </div>
            </div>
            <ul className="mt-2 space-y-1.5">
              {data.salesPersons.map((p, i) => (
                <li key={p.salesEmployeeCode} className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: RANK_COLORS[i % RANK_COLORS.length] }} />
                  <span className="truncate text-ink-primary">{p.salesEmployeeName ?? `#${p.salesEmployeeCode}`}</span>
                  <span className="ml-auto tabular-nums text-ink-secondary">{formatInr(p.value)}</span>
                  <span className="w-12 text-right tabular-nums text-ink-tertiary">
                    {personTotal ? ((p.value / personTotal) * 100).toFixed(1) : '0.0'}%
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>

    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
      <div className="panel p-4">
        <h3 className="text-sm font-semibold text-ink-primary">Item-wise Sales</h3>
        <p className="text-xs text-ink-tertiary mb-2">By product · selected period · <Link to={salesReportLink('sales-by-item')} className="font-medium text-brand-600 dark:text-brand-400 hover:underline">View report →</Link></p>
        {loading || !data ? (
          <Skeleton className="h-[240px] w-full" />
        ) : data.topItems.length === 0 ? (
          <p className="text-sm text-ink-tertiary py-10 text-center">No invoices in the selected period.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.topItems.map((i) => ({ name: i.itemName ?? i.itemCode, value: i.value, qty: i.quantity }))}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: axisColor }} interval={0} tickFormatter={(n: string) => (n.length > 14 ? `${n.slice(0, 13)}…` : n)} />
              <YAxis tick={{ fontSize: 11, fill: axisColor }} tickFormatter={compactInr} width={70} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: axisColor }} formatter={(v: number) => inr.format(v)} />
              <Bar dataKey="value" name="Sales value" radius={[6, 6, 0, 0]} maxBarSize={44}>
                {data.topItems.map((_, i) => (
                  <Cell key={i} fill={RANK_COLORS[Math.min(i, 4)]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  </section>
  );
}
