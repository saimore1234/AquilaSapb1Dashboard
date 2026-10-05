import { useEffect, useMemo, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { getTurnoverBreakup } from '../../api/sales';
import type { TurnoverBreakup } from '../../types';
import { ErrorState } from '../StateViews';
import { Skeleton } from '../ui/Skeleton';
import { RANK_COLORS, SectionHeading, formatDate } from './salesShared';
import { downloadCsv } from './salesUtils';
import { useSalesRefresh } from './salesRefresh';
import { taxLabel, useSalesFilters } from './salesFilters';
import { usePermissions } from '../../permissions/usePermissions';

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Total Turnover + Customer Group-wise sales + Customer Group / Location / Branch
 * breakup for a chosen period. Everything (including the filter options) comes
 * from one aggregated API call; nothing is hardcoded.
 */
export default function TurnoverSection({ reportTo }: { reportTo?: string }) {
  const { canExport } = usePermissions();
  const { applied } = useSalesFilters();
  const { from, to, includeTax } = applied;
  const [group, setGroup] = useState('');
  // null = the company's default selection (all locations except default-excluded ones); an array = the user's own choice.
  const [locations, setLocations] = useState<number[] | null>(null);
  // Default on: invoice lines minus credit memos, header discount deducted (the client's turnover report basis).
  const [clientBasis, setClientBasis] = useState(true);
  const [branch, setBranch] = useState('');
  const [showDetail, setShowDetail] = useState(false);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<TurnoverBreakup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { tick, markUpdated } = useSalesRefresh();
  const seenTick = useRef(tick);

  useEffect(() => {
    const silent = seenTick.current !== tick;
    seenTick.current = tick;
    if (!silent) setLoading(true);
    setError(null);
    getTurnoverBreakup({
      dateFrom: from,
      dateTo: to,
      includeTax,
      customerGroup: group ? Number(group) : undefined,
      locations: locations ?? undefined,
      netOfCreditNotes: clientBasis || undefined,
      branch: branch ? Number(branch) : undefined
    })
      .then((d) => {
        setData(d);
        markUpdated();
      })
      .catch((err) => setError(err?.response?.data?.message || err.message || 'Unable to load turnover.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, includeTax, group, locations, clientBasis, branch, reload, tick]);

  const maxGroup = useMemo(() => Math.max(1, ...(data?.customerGroupSales ?? []).map((g) => g.salesValue)), [data]);
  const allLocationCodes = (data?.locations ?? []).map((o) => o.code);
  const effectiveLocations = locations ?? (data?.locations ?? []).filter((o) => !o.isDefaultExcluded).map((o) => o.code);
  const locationLabel =
    !data || effectiveLocations.length === allLocationCodes.length
      ? 'Location: All'
      : `Location: ${effectiveLocations.length} of ${allLocationCodes.length}`;

  // Unit (location) x customer-group matrix, summed from the already-aggregated breakup rows.
  const unitMatrix = useMemo(() => {
    const groups = (data?.customerGroupSales ?? []).map((g) => g.customerGroup);
    const byUnit = new Map<string, Record<string, number>>();
    const groupTotals: Record<string, number> = {};
    for (const r of data?.groupLocationBranchSales ?? []) {
      const cell = byUnit.get(r.location) ?? {};
      cell[r.customerGroup] = (cell[r.customerGroup] ?? 0) + r.salesValue;
      byUnit.set(r.location, cell);
      groupTotals[r.customerGroup] = (groupTotals[r.customerGroup] ?? 0) + r.salesValue;
    }
    const rows = [...byUnit.entries()]
      .map(([unit, byGroup]) => ({ unit, byGroup, total: Object.values(byGroup).reduce((a, b) => a + b, 0) }))
      .sort((a, b) => b.total - a.total);
    return { groups, rows, groupTotals };
  }, [data]);
  const input = 'px-3 py-2 text-sm rounded-lg border border-border-strong bg-surface text-ink-primary';
  const empty = !loading && !error && data && data.groupLocationBranchSales.length === 0;

  function exportCsv() {
    if (!data) return;
    downloadCsv(
      `turnover-breakup-${from}-to-${to}-${includeTax ? 'incl' : 'excl'}-tax${clientBasis ? '-net-of-credit-notes' : ''}.csv`,
      ['Customer Group', 'Location', 'Branch', 'Sales Value', 'Percentage'],
      data.groupLocationBranchSales.map((r) => [r.customerGroup, r.location, r.branch, r.salesValue, r.percentage])
    );
  }

  return (
    <section aria-labelledby="to-h" className="space-y-3">
      <SectionHeading id="to-h" title="Total Turnover" note={data ? <>{formatDate(data.dateFrom)} – {formatDate(data.dateTo)}</> : undefined} reportTo={reportTo} />

      <div className="card flex flex-wrap items-center gap-2">
        <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Customer group" className={input}>
          <option value="">Customer Group: All</option>
          {data?.customerGroups.map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}
        </select>
        <details className="relative">
          <summary className={`${input} cursor-pointer select-none list-none`} aria-label="Locations (units)">
            {locationLabel}
          </summary>
          <div className="absolute z-20 mt-1 min-w-[12rem] max-h-64 overflow-auto rounded-lg border border-border-strong bg-surface shadow-elevated p-2 space-y-1">
            {data?.locations.map((o) => (
              <label key={o.code} className="flex items-center gap-2 px-1 py-0.5 text-sm text-ink-primary cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand-600"
                  checked={effectiveLocations.includes(o.code)}
                  onChange={(e) => setLocations(e.target.checked ? [...effectiveLocations, o.code] : effectiveLocations.filter((c) => c !== o.code))}
                />
                {o.name}
              </label>
            ))}
            <div className="flex gap-3 px-1 pt-1">
              <button type="button" className="text-xs text-brand-600 dark:text-brand-400" onClick={() => setLocations(allLocationCodes)}>Select all</button>
              <button type="button" className="text-xs text-brand-600 dark:text-brand-400" onClick={() => setLocations(null)}>Default</button>
            </div>
          </div>
        </details>
        <label className="inline-flex items-center gap-2 text-sm text-ink-primary cursor-pointer select-none" title="Invoice lines minus credit memos, header discount deducted, no freight or rounding">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={clientBasis} onChange={(e) => setClientBasis(e.target.checked)} />
          Net of credit notes
        </label>
        <select value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Branch" className={input}>
          <option value="">Branch: All</option>
          {data?.branches.map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}
        </select>
        {canExport && (
          <button className="btn-secondary ml-auto" onClick={exportCsv} disabled={!data || data.groupLocationBranchSales.length === 0}>
            <Download className="h-4 w-4" /> Download CSV
          </button>
        )}
      </div>

      {error ? (
        <div className="card"><ErrorState message={error} onRetry={() => setReload((n) => n + 1)} /></div>
      ) : (
        <>
          <div className="card">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Total Turnover</p>
            {loading || !data ? (
              <Skeleton className="h-10 w-72 mt-2" />
            ) : (
              <p className="text-3xl sm:text-4xl font-semibold text-ink-primary tabular-nums mt-1">{money.format(data.totalTurnover)}</p>
            )}
            <p className="text-sm text-ink-secondary mt-1">{clientBasis
                ? `Net sales for the selected period: invoice lines minus credit memos, header discount deducted, no freight/rounding (${taxLabel(includeTax)})`
                : `Sales for the selected period (A/R invoices ${taxLabel(includeTax)}, excluding cancelled)`}</p>
          </div>

          <div className="card">
            <h3 className="font-semibold text-ink-primary mb-3">Customer Group-wise Sales</h3>
            {loading || !data ? (
              <Skeleton className="h-[200px] w-full" />
            ) : empty ? (
              <p className="text-sm text-ink-tertiary py-8 text-center">No sales data available for the selected filters.</p>
            ) : (
              <>
                <ul className="space-y-2.5 mb-4">
                  {data.customerGroupSales.map((g, i) => (
                    <li key={g.customerGroup} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm">
                      <span className="truncate text-ink-primary" title={g.customerGroup}>{g.customerGroup}</span>
                      <div className="h-3 rounded bg-surface-tertiary overflow-hidden">
                        <div className="h-full rounded" style={{ width: `${(g.salesValue / maxGroup) * 100}%`, background: RANK_COLORS[Math.min(i, 4)] }} />
                      </div>
                      <span className="tabular-nums text-ink-secondary w-32 text-right">{money.format(g.salesValue)}</span>
                    </li>
                  ))}
                </ul>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-ink-tertiary border-b border-border">
                        <th className="px-4 py-2.5 font-medium">Customer Group</th>
                        <th className="px-4 py-2.5 font-medium text-right">Sales Value</th>
                        <th className="px-4 py-2.5 font-medium text-right">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.customerGroupSales.map((g) => (
                        <tr key={g.customerGroup} className="border-b border-border last:border-0">
                          <td className="px-4 py-2.5">{g.customerGroup}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{money.format(g.salesValue)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{g.percentage.toFixed(1)}%</td>
                        </tr>
                      ))}
                      <tr className="border-t border-border-strong font-semibold">
                        <td className="px-4 py-2.5">Total</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{money.format(data.totalTurnover)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">100.0%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {!loading && data && !empty && (
            <div className="card">
              <h3 className="font-semibold text-ink-primary mb-3">Unit-wise Sales <span className="text-ink-tertiary font-normal text-xs">(by invoice line location)</span></h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-ink-tertiary border-b border-border">
                      <th className="px-4 py-2.5 font-medium">Unit</th>
                      {unitMatrix.groups.map((g) => <th key={g} className="px-4 py-2.5 font-medium text-right">{g}</th>)}
                      <th className="px-4 py-2.5 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unitMatrix.rows.map((r) => (
                      <tr key={r.unit} className="border-b border-border last:border-0">
                        <td className="px-4 py-2.5">{r.unit}</td>
                        {unitMatrix.groups.map((g) => <td key={g} className="px-4 py-2.5 text-right tabular-nums">{r.byGroup[g] ? money.format(r.byGroup[g]) : '—'}</td>)}
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium">{money.format(r.total)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-border-strong font-semibold">
                      <td className="px-4 py-2.5">Total</td>
                      {unitMatrix.groups.map((g) => <td key={g} className="px-4 py-2.5 text-right tabular-nums">{money.format(unitMatrix.groupTotals[g] ?? 0)}</td>)}
                      <td className="px-4 py-2.5 text-right tabular-nums">{money.format(data.totalTurnover)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card p-0 overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3 text-left"
              onClick={() => setShowDetail((s) => !s)}
              aria-expanded={showDetail}
            >
              <h3 className="font-semibold text-ink-primary">Customer Group / Location / Branch Sales</h3>
              <span className="text-xs text-brand-600 dark:text-brand-400">{showDetail ? 'Hide' : 'Show'}</span>
            </button>
            {showDetail && (
              <div className="overflow-x-auto border-t border-border">
                {loading || !data ? (
                  <Skeleton className="h-[160px] w-full" />
                ) : empty ? (
                  <p className="text-sm text-ink-tertiary py-8 text-center">No sales data available for the selected filters.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-ink-tertiary border-b border-border">
                        <th className="px-4 py-2.5 font-medium">Customer Group</th>
                        <th className="px-4 py-2.5 font-medium">Location</th>
                        <th className="px-4 py-2.5 font-medium">Branch</th>
                        <th className="px-4 py-2.5 font-medium text-right">Sales Value</th>
                        <th className="px-4 py-2.5 font-medium text-right">% of Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.groupLocationBranchSales.map((r) => (
                        <tr key={`${r.customerGroup}|${r.location}|${r.branch}`} className="border-b border-border last:border-0 hover:bg-surface-tertiary/60">
                          <td className="px-4 py-2.5">{r.customerGroup}</td>
                          <td className="px-4 py-2.5">{r.location}</td>
                          <td className="px-4 py-2.5">{r.branch}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{money.format(r.salesValue)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{r.percentage.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
