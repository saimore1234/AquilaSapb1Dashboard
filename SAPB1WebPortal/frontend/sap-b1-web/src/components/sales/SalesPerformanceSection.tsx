import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ShoppingCart, Users, Wallet, FileText } from 'lucide-react';
import { getCustomersReport, getSalesPerformance } from '../../api/sales';
import type { SalesPerformance, UnitPerformance } from '../../types';
import { ErrorState } from '../StateViews';
import { Skeleton } from '../ui/Skeleton';
import StatCard from '../StatCard';
import { formatCount, formatInr, formatLongDate, formatPct, formatPeriod, amountTone } from './formatters';
import { taxLabel, useSalesFilters } from './salesFilters';
import { useSalesRefresh } from './salesRefresh';
import { useChartTheme, useSalesOverview } from './salesShared';
import { salesReportLink } from '../../data/salesReports';

const statusClass: Record<SalesPerformance['status'], string> = {
  Achieved: 'badge-success',
  'In progress': 'badge-warning',
  'No target configured': 'badge-neutral'
};

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2.5 min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums truncate ${tone ?? 'text-ink-primary'}`} title={value}>{value}</p>
      {sub && <p className="text-xs text-ink-tertiary leading-snug">{sub}</p>}
    </div>
  );
}

/**
 * Sales Dashboard head: Sales Turnover vs Target (with a doughnut), the five named units, and the key position metrics — all from ONE
 * backend call that follows the shared filters. Targets come only from approved target records; nothing here is estimated.
 */
export default function SalesPerformanceSection() {
  const { applied, applyNow } = useSalesFilters();
  const { tick, markUpdated } = useSalesRefresh();
  const seenTick = useRef(tick);
  const [data, setData] = useState<SalesPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const { cur, prev, tooltipStyle } = useChartTheme();
  const { data: overview } = useSalesOverview();
  // With a unit selected, 'customers' means customers with A/R invoices in that unit during the period (not the master count).
  const [unitCustomers, setUnitCustomers] = useState<number | null>(null);
  useEffect(() => {
    setUnitCustomers(null);
    if (!applied.unit) return;
    getCustomersReport({ dateFrom: applied.from, dateTo: applied.to, unit: Number(applied.unit), page: 1, pageSize: 1 }).then((r) => setUnitCustomers(r.totals.customers)).catch(() => setUnitCustomers(null));
  }, [applied.unit, applied.from, applied.to]);

  useEffect(() => {
    const silent = seenTick.current !== tick;
    seenTick.current = tick;
    if (!silent) { setLoading(true); setData(null); } // never leave the previous selection's numbers on screen
    setError(null);
    getSalesPerformance({
      dateFrom: applied.from,
      dateTo: applied.to,
      unit: applied.unit ? Number(applied.unit) : undefined,
      includeTax: applied.includeTax,
      netOfCreditNotes: applied.netOfCreditNotes,
      customerGroup: applied.customerGroup ? Number(applied.customerGroup) : undefined,
      salesperson: applied.salesperson ? Number(applied.salesperson) : undefined,
      productCategory: applied.category || undefined
    })
      .then((d) => { setData(d); markUpdated(); })
      .catch((err) => setError(err?.response?.data?.message || err.message || 'Unable to load sales performance.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied, reload, tick]);

  if (error) return <div className="panel p-4"><ErrorState message={error} onRetry={() => setReload((n) => n + 1)} /></div>;

  const t = data?.target ?? 0;
  const achieved = data ? (data.targetConfigured ? Math.min(Math.max(data.actual, 0), t) : Math.max(data.actual, 0)) : 0;
  const remaining = data && data.targetConfigured ? Math.max(t - data.actual, 0) : 0;
  const over = !!data && data.targetConfigured && data.actual > t;
  const pie = data?.targetConfigured
    ? [{ name: 'Achieved sales', value: achieved }, { name: 'Remaining target', value: remaining }]
    : [{ name: 'Actual sales (no target configured)', value: achieved }];
  const pieColors = data?.targetConfigured ? [cur, prev] : [prev];
  const unitSel = data?.selectedUnit ?? null;

  return (
    <section aria-label="Sales performance" className="space-y-3">
      {/* ---- Sales Turnover vs Target ---- */}
      <div className="panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <div>
            <h2 className="text-sm font-semibold text-ink-primary">Sales Turnover vs Target</h2>
            <p className="text-xs text-ink-secondary mt-0.5">
              {formatPeriod(applied.from, applied.to)} · {data?.selectedUnitLabel ?? 'All units'} · {taxLabel(applied.includeTax)}
              {applied.netOfCreditNotes ? ' · net of credit notes' : ' · invoices only'}
            </p>
          </div>
          {data && <span className={statusClass[data.status]}>{data.status}</span>}
        </div>

        <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,19rem)] items-start">
          <div className="space-y-3 min-w-0">
            {loading || !data ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2"><Skeleton className="h-[68px]" /><Skeleton className="h-[68px]" /><Skeleton className="h-[68px]" /><Skeleton className="h-[68px]" /><Skeleton className="h-[68px]" /></div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">
                <Metric label="Actual turnover" value={formatInr(data.actual)} sub={`${formatLongDate(data.dateFrom.slice(0, 10))} – ${formatLongDate(data.dateTo.slice(0, 10))}`} />
                <Metric label="Target" value={data.targetConfigured ? formatInr(data.target) : 'Not configured'} sub={data.targetConfigured ? `${formatCount(data.targetCount)} approved target(s)` : 'No approved target for this selection'} tone={data.targetConfigured ? undefined : 'text-ink-tertiary'} />
                <Metric label="Achievement" value={data.targetConfigured ? formatPct(data.achievementPct) : '–'} tone={data.targetConfigured ? (over ? 'text-success' : undefined) : 'text-ink-tertiary'} sub="Actual ÷ target" />
                <Metric label={over ? 'Over target by' : 'Remaining target'} value={data.targetConfigured ? formatInr(over ? data.actual - t : data.remaining) : '–'} tone={data.targetConfigured ? undefined : 'text-ink-tertiary'} sub={data.targetConfigured ? (over ? 'Target exceeded' : 'Target − actual') : undefined} />
                <Metric label="Variance" value={data.targetConfigured ? formatInr(data.variance) : '–'} tone={data.targetConfigured ? amountTone(data.variance, { zero: true }) : 'text-ink-tertiary'} sub="Actual − target" />
              </div>
            )}

            {data && data.targetConfigured && (
              <div>
                <div className="h-2.5 rounded-sm bg-surface-tertiary overflow-hidden" role="progressbar" aria-label="Achievement" aria-valuenow={Math.round(Math.min(data.achievementPct ?? 0, 100))} aria-valuemin={0} aria-valuemax={100}>
                  <div className={`h-full ${over ? 'bg-success' : 'bg-brand-600'}`} style={{ width: `${Math.min(data.achievementPct ?? 0, 100)}%` }} />
                </div>
              </div>
            )}

            {data && (
              <div className="text-xs text-ink-secondary space-y-1">
                <p><span className="font-medium text-ink-primary">What is compared:</span> {data.targetBasis}</p>
                <p className="flex flex-wrap gap-x-4">
                  <Link className="font-medium text-brand-600 dark:text-brand-400 hover:underline" to={salesReportLink('sales-register', { unit: applied.unit || undefined })}>Actual: Sales Register →</Link>
                  <Link className="font-medium text-brand-600 dark:text-brand-400 hover:underline" to="/sales/targets">Targets: Salesperson Targets →</Link>
                </p>
              </div>
            )}
          </div>

          {/* Doughnut */}
          <div className="min-w-0">
            {loading || !data ? (
              <Skeleton className="h-[220px] w-full" />
            ) : (
              <>
                <div className="relative">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={pie} dataKey="value" nameKey="name" innerRadius={56} outerRadius={82} stroke="none" startAngle={90} endAngle={-270} isAnimationActive={false}>
                        {pie.map((_, i) => <Cell key={i} fill={pieColors[i]} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatInr(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] uppercase tracking-wide text-ink-tertiary">{data.targetConfigured ? 'Achievement' : 'Target'}</span>
                    <span className="text-xl font-semibold tabular-nums text-ink-primary">{data.targetConfigured ? formatPct(data.achievementPct) : 'Not set'}</span>
                  </div>
                </div>
                <ul className="mt-1 space-y-1 text-xs">
                  {pie.map((p, i) => (
                    <li key={p.name} className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: pieColors[i] }} />
                      <span className="text-ink-secondary truncate">{p.name}</span>
                      <span className="ml-auto tabular-nums text-ink-primary">{formatInr(p.value)}</span>
                    </li>
                  ))}
                </ul>
                {over && <p className="mt-1 text-[11px] text-ink-tertiary">The ring is capped at 100% so the segments stay meaningful; the true achievement ({formatPct(data.achievementPct)}) is shown in the centre and above.</p>}
                {!data.targetConfigured && <p className="mt-1 text-[11px] text-ink-tertiary">The chart shows actual sales only — no approved target exists for this selection.</p>}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ---- Named units ---- */}
      <div className="panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 className="text-sm font-semibold text-ink-primary">Units <span className="font-normal text-ink-tertiary text-xs">select one to filter the whole dashboard</span></h2>
          <button
            type="button"
            className={`btn-compact inline-flex items-center rounded-md border px-3 text-sm font-medium ${unitSel === null ? 'bg-brand-600 text-white border-brand-600' : 'bg-surface text-ink-primary border-border-strong hover:bg-surface-tertiary'}`}
            aria-pressed={unitSel === null}
            onClick={() => applyNow({ unit: '' })}
          >
            All units
          </button>
        </div>
        {loading || !data ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[150px]" />)}</div>
        ) : data.units.length === 0 ? (
          <p className="text-sm text-ink-tertiary py-6 text-center">No units are configured or found in SAP.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2">
            {data.units.map((u) => <UnitCard key={u.label} u={u} selected={u.locationCode !== null && u.locationCode === unitSel} onSelect={() => u.locationCode !== null && applyNow({ unit: String(u.locationCode) })} />)}
          </div>
        )}
      </div>

      {/* ---- Key position metrics ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 items-stretch">
        <StatCard
          variant="compact"
          label={applied.unit ? 'Customers in this unit' : 'Total Customers'}
          value={applied.unit ? (unitCustomers === null ? '…' : formatCount(unitCustomers)) : overview ? formatCount(overview.totalCustomers) : '…'}
          hint={applied.unit ? `With A/R invoices in ${data?.selectedUnitLabel ?? 'the unit'} during the period` : overview ? `+${formatCount(overview.newCustomersThisQuarter)} new this quarter` : 'Loading…'}
          icon={Users}
          basis={applied.unit ? `Selected period · ${formatPeriod(applied.from, applied.to)}` : 'Current position'}
          definition={applied.unit ? 'Customers that have A/R invoices at the selected unit in the selected period — transactions, not the customer master.' : 'Active customer accounts in SAP right now. Not affected by the selected period.'}
          to={salesReportLink('customers', applied.unit ? { unit: applied.unit } : {})}
        />
        <StatCard
          variant="compact"
          label="Open Sales Orders"
          value={data ? `${formatCount(data.openOrders.openLines)} lines` : '…'}
          hint={data ? `${formatInr(data.openOrders.lineTotal)} full line value · ${data.selectedUnitLabel}` : 'Loading…'}
          icon={ShoppingCart}
          basis={`Selected period · ${formatPeriod(applied.from, applied.to)}`}
          definition="Open order lines (line status Open, order not cancelled) for orders dated in the selected period. Value is the full line total."
          to={salesReportLink('open-sales-order-lines', { unit: applied.unit || undefined })}
        />
        <StatCard
          variant="compact"
          label="Pending Billing (open deliveries)"
          value={overview ? formatCount(overview.pendingInvoices) : '…'}
          hint={overview ? `${formatInr(overview.pendingInvoiceValue)} dispatched, yet to be invoiced` : 'Loading…'}
          icon={FileText}
          basis="Current position"
          definition="Deliveries dispatched but not yet invoiced. This is pending billing, not pending payment."
          to={salesReportLink('pending-deliveries')}
        />
        <StatCard
          variant="compact"
          label="Total Outstanding"
          value={data ? (data.outstandingAvailable ? formatInr(data.totalOutstanding) : 'Not available') : '…'}
          hint={data ? (data.outstandingAvailable ? (data.outstandingNote ?? 'Journal-based ageing, all branches') : (data.outstandingNote ?? 'Not available for this selection')) : 'Loading…'}
          icon={Wallet}
          basis={`As of ${formatLongDate(applied.to)}`}
          definition="Customer balances from journal entries, netting credit memos and payments on account, as of the selected To Date. Shown by SAP branch, so a unit appears only where a branch is mapped to it."
          to={salesReportLink('total-outstanding', { branch: undefined })}
        />
      </div>
    </section>
  );
}

function UnitCard({ u, selected, onSelect }: { u: UnitPerformance; selected: boolean; onSelect: () => void }) {
  const disabled = u.locationCode === null;
  const pct = u.achievementPct ?? 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      title={u.note ?? undefined}
      className={`text-left rounded-md border p-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
        selected ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/30 ring-1 ring-brand-600' : 'border-border bg-surface hover:border-brand-400'
      } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink-primary leading-tight">{u.label}</span>
        {selected && <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">Selected</span>}
      </div>
      <dl className="mt-2 space-y-1.5 text-xs">
        <div>
          <dt className="text-ink-tertiary">Actual turnover</dt>
          <dd className="text-base font-semibold tabular-nums text-ink-primary">{formatInr(u.actual)}</dd>
        </div>
        <div>
          <dt className="text-ink-tertiary">Target</dt>
          {u.targetConfigured ? (
            <dd>
              <span className="tabular-nums text-ink-primary">{formatInr(u.target)}</span> · <span className="tabular-nums font-medium">{formatPct(u.achievementPct)}</span>
              <div className="mt-1 h-1.5 rounded-sm bg-surface-tertiary overflow-hidden"><div className={`h-full ${pct >= 100 ? 'bg-success' : 'bg-brand-600'}`} style={{ width: `${Math.min(pct, 100)}%` }} /></div>
            </dd>
          ) : (
            <dd className="text-ink-tertiary">Target not configured</dd>
          )}
        </div>
        <div>
          <dt className="text-ink-tertiary">Open sales orders</dt>
          <dd className="tabular-nums text-ink-primary">{formatCount(u.openOrderLines)} lines · {formatInr(u.openOrderValue)}</dd>
        </div>
        <div>
          <dt className="text-ink-tertiary">Outstanding{u.branchName ? ` (${u.branchName})` : ''}</dt>
          <dd className="tabular-nums text-ink-primary">{u.outstanding === null ? <span className="text-ink-tertiary">Not available</span> : formatInr(u.outstanding)}</dd>
        </div>
      </dl>
      {u.note && <p className="mt-1.5 text-[10px] leading-snug text-ink-tertiary">{u.note}</p>}
    </button>
  );
}
